# R has its own arithmetic parser, and it is not the one in engine.js. Handing
# the same expressions to it is a fifth reading of the grammar: same operator
# precedence, same left associativity, same IEEE doubles, written by people who
# had never seen this repository.
#
# Percent expressions are left out because %...% is R's operator syntax, not
# "divide by a hundred". Everything else in the corpus goes through.
#
#   Rscript verify/verify.R <root>

args <- commandArgs(trailingOnly = TRUE)
root <- if (length(args) >= 1) args[1] else "."
path <- file.path(root, "verify", "cases.tsv")

lines <- readLines(path, warn = FALSE, encoding = "UTF-8")
lines <- lines[nchar(lines) > 0]
if (length(lines) == 0) {
  cat("R read no expressions from", path, "\n")
  quit(status = 1)
}

# The display glyphs the keypad produces, rewritten to ASCII.
to_ascii <- function(text) {
  text <- gsub("\u00d7", "*", text)
  text <- gsub("\u00f7", "/", text)
  text <- gsub("\u2212", "-", text)
  gsub(",", "", text, fixed = TRUE)
}

# R's own parser and arithmetic. baseenv() is the parent so that + and * exist
# and nothing else does: a bare word such as "abc" is an error here, exactly as
# it is a syntax error in the calculator.
r_eval <- function(source) {
  tryCatch({
    value <- eval(parse(text = source), envir = new.env(parent = baseenv()))
    if (!is.numeric(value) || length(value) != 1 || !is.finite(value)) NA_real_ else value
  }, error = function(e) NA_real_, warning = function(w) NA_real_)
}

# JavaScript writes e+1 and e-7, C printf writes e+01 and e-07. Same number.
canon <- function(text) sub("e([+-])0*([0-9])", "e\\1\\2", text)

checked <- 0
skipped <- 0
bad <- 0

for (i in seq_along(lines)) {
  parts <- strsplit(lines[i], "\t", fixed = TRUE)[[1]]
  if (length(parts) != 2) {
    cat("  malformed line ", i, "\n", sep = "")
    bad <- bad + 1
    next
  }
  expr <- parts[1]
  want <- parts[2]

  if (grepl("%", expr, fixed = TRUE)) {
    skipped <- skipped + 1
    next
  }

  got <- r_eval(to_ascii(expr))
  checked <- checked + 1

  if (want == "ERROR") {
    if (!is.na(got)) {
      cat("  ", expr, ": corpus refuses it, R returned ", format(got, digits = 17), "\n", sep = "")
      bad <- bad + 1
    }
    next
  }

  # Not as.numeric(want): R's own string to double conversion is a unit in
  # the last place off on a 17 digit decimal (as.numeric("9.9999999999999995e-7")
  # differs from 1e-6, where C strtod and JavaScript agree), which would show up
  # here as a calculator disagreement it is not. Comparing the printed forms
  # instead goes through C printf, and 17 significant digits identify a double
  # uniquely, so this is still an exact comparison.
  if (canon(sprintf("%.16e", got)) != canon(want)) {
    cat("  ", expr, ": R ", sprintf("%.16e", got), ", corpus ", want, "\n", sep = "")
    bad <- bad + 1
  }
}

if (bad > 0) {
  cat("R disagrees with", path, "on", bad, "of", checked, "expressions\n")
  quit(status = 1)
}
if (checked == 0) {
  cat("R checked nothing in", path, "\n")
  quit(status = 1)
}
cat("R reproduces all ", checked, " non percent expressions in ", path,
    ", exact, 0.0e+00 (", skipped, " percent expressions skipped)\n", sep = "")
