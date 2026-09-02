#!/usr/bin/env bash
# Differential verification of the calculator engine.
#
# engine.js is the only thing in this repository that knows what an expression
# means. test.js checks it against values I typed in myself, and the README
# figure is drawn by running it, so if the engine were wrong about precedence
# every one of those would agree with it and say so confidently.
#
# So the same grammar is implemented again in C, in Rust, and in Go for the
# display path, and the expressions are also handed to two parsers written by
# other people entirely, SQLite's and R's. They all read one shared corpus,
# verify/cases.tsv. Then Rust generates two hundred thousand random expressions
# and JavaScript, C and Rust all have to agree on every one.
#
# Anything missing from the machine is skipped with a message rather than
# failing. CI has all of it.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pass=0 fail=0 skip=0

run () {
    local name="$1" tool="$2"; shift 2
    printf '\n=== %s ===\n' "$name"
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf 'skipped: %s is not installed\n' "$tool"
        skip=$((skip + 1)); return
    fi
    if "$@"; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
}

build_c () {
    [ -x "$work/eval" ] && return 0
    cc -std=c99 -O2 -Wall -Wextra -Wpedantic -Werror -o "$work/eval" verify/eval.c -lm
}

build_rust () {
    [ -x "$work/calcfuzz" ] && return 0
    ( cd verify/fuzz && cargo build --release --quiet ) || return 1
    cp verify/fuzz/target/release/calcfuzz "$work/calcfuzz"
}

check_js ()   { node verify/check_js.js verify/cases.tsv; }
check_c ()    { build_c && "$work/eval" verify/cases.tsv; }
check_rust () { build_rust && "$work/calcfuzz" check verify/cases.tsv; }
check_go ()   { ( cd verify/gocheck && go run . -root "$root" ); }

# SQLite does not assert, so its output is judged here. Two things have to be
# true: no mismatch line, and the matched count is the number of rows the query
# actually joined, so a corpus that lost rows is caught rather than ignored.
# The redirect from /dev/null matters: sqlite3 otherwise reads this script.
check_sql () {
    local out matched
    out=$(sqlite3 -init verify/precedence.sql :memory: "" < /dev/null 2>&1 | tr -d '\r')
    if printf '%s\n' "$out" | grep -q '^mismatch|'; then
        echo "SQLite disagrees with the corpus:"
        printf '%s\n' "$out" | grep '^mismatch|'
        return 1
    fi
    matched=$(printf '%s\n' "$out" | sed -n 's/^matched|//p')
    if [ "${matched:-0}" -lt 26 ]; then
        echo "SQLite matched only ${matched:-0} of the 26 expressions it holds:"
        printf '%s\n' "$out"
        return 1
    fi
    echo "SQLite reproduces $matched precedence and associativity cases, exact, 0.0e+00"
}

# The one check that is not a fixed list. Rust writes the corpus, all three
# implementations then have to agree on every line of it.
check_fuzz () {
    local n=200000 seed=20240901
    command -v cargo >/dev/null 2>&1 || { echo "skipping: cargo missing"; return 1; }
    build_rust || return 1
    build_c || return 1
    "$work/calcfuzz" fuzz "$n" "$seed" "$work/fuzz.tsv" || return 1
    node verify/check_js.js "$work/fuzz.tsv" || return 1
    "$work/eval" "$work/fuzz.tsv" || return 1
    echo "three implementations agree on all $n random expressions"
}

run "JavaScript, the engine against the corpus"  node    check_js
run "C, the grammar written again"               cc      check_c
run "Rust, the grammar written a third time"     cargo   check_rust
run "Go, corpus structure and the display path"  go      check_go
run "SQL, SQLite's own precedence"               sqlite3 check_sql
run "R, R's own parser"                          Rscript Rscript verify/verify.R "$root"
run "Python, Python's own parser"                python3 python3 verify/verify.py "$root"
run "Ruby, Ruby's own parser"                    ruby    ruby verify/verify.rb "$root"
run "Fuzz, JavaScript against C against Rust"    node    check_fuzz

printf '\n%s\n' "----------------------------------------"
printf '%d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ] || exit 1
[ "$pass" -gt 0 ] || { echo "nothing ran"; exit 1; }
