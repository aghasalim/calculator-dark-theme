# Ruby's own arithmetic against the shared corpus.
#
# Like the R and Python verifiers, this hands each expression to the
# language's own parser and compares the result with the expected column in
# cases.tsv.  Percent expressions are skipped because Ruby's % is modulo.
#
#   ruby verify/verify.rb <root>

root = ARGV[0] || "."
path = File.join(root, "verify", "cases.tsv")

lines = File.read(path, encoding: "utf-8").split("\n").reject(&:empty?)
if lines.empty?
  puts "Ruby read no expressions from #{path}"
  exit 1
end

def to_ascii(text)
  text = text.gsub("×", "*")
  text = text.gsub("÷", "/")
  text = text.gsub("−", "-")
  text = text.gsub(",", "")
  text
end

# Match complete numeric literals (floats, scientific, leading/trailing dot)
# and convert bare integers to floats so Ruby division produces doubles.
# Ruby rejects leading-dot literals (.5), so those get a zero prefix.
def ensure_floats(source)
  source.gsub(/(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/) do |m|
    if m.start_with?(".")
      "0#{m}"            # leading dot: .5 -> 0.5
    elsif m.end_with?(".")
      "#{m}0"            # trailing dot: 7. -> 7.0
    elsif m.include?(".") || m =~ /[eE]/
      m                  # already a float or scientific
    else
      "#{m}.0"           # bare integer: 3 -> 3.0
    end
  end
end

def rb_eval(source)
  value = eval(source, TOPLEVEL_BINDING.dup)
  value = value.to_f
  return nil unless value.finite?
  value
rescue StandardError, SyntaxError
  nil
end

def canon(text)
  text.gsub(/e([+-])0*([0-9])/, 'e\1\2')
end

checked = 0
skipped = 0
bad = 0

lines.each_with_index do |line, i|
  parts = line.split("\t", -1)
  unless parts.length == 2
    puts "  malformed line #{i + 1}"
    bad += 1
    next
  end
  expr, want = parts

  if expr.include?("%")
    skipped += 1
    next
  end

  floated = ensure_floats(to_ascii(expr))
  got = rb_eval(floated)
  checked += 1

  if want == "ERROR"
    unless got.nil?
      puts "  #{expr}: corpus refuses it, Ruby returned #{format('%.16e', got)}"
      bad += 1
    end
    next
  end

  if got.nil?
    puts "  #{expr}: Ruby errors, corpus says #{want}"
    bad += 1
    next
  end

  unless canon(format("%.16e", got)) == canon(want)
    puts "  #{expr}: Ruby #{format('%.16e', got)}, corpus #{want}"
    bad += 1
  end
end

if bad > 0
  puts "Ruby disagrees with #{path} on #{bad} of #{checked} expressions"
  exit 1
end
if checked == 0
  puts "Ruby checked nothing in #{path}"
  exit 1
end
puts "Ruby reproduces all #{checked} non-percent expressions in #{path}" \
     ", exact, 0.0e+00 (#{skipped} percent expressions skipped)"
