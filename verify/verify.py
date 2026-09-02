"""
Python's own arithmetic against the shared corpus.

Like the R verifier, this hands each expression to the language's own parser
and compares the result with the expected column in cases.tsv. Percent
expressions are skipped because Python's % is modulo, not "divide by 100".

    python3 verify/verify.py <root>
"""
import math
import re
import sys
import os

root = sys.argv[1] if len(sys.argv) > 1 else "."
path = os.path.join(root, "verify", "cases.tsv")

with open(path, encoding="utf-8") as f:
    lines = [l for l in f.read().splitlines() if l]

if not lines:
    print("Python read no expressions from", path)
    sys.exit(1)


def to_ascii(text):
    text = text.replace("×", "*")
    text = text.replace("÷", "/")
    text = text.replace("−", "-")
    text = text.replace(",", "")
    return text


def py_eval(source):
    try:
        value = eval(compile(source, "<expr>", "eval"), {"__builtins__": {}})
        if not isinstance(value, (int, float)):
            return None
        value = float(value)
        if not math.isfinite(value):
            return None
        return value
    except Exception:
        return None


def canon(text):
    return re.sub(r"e([+-])0*([0-9])", r"e\1\2", text)


checked = 0
skipped = 0
bad = 0

for i, line in enumerate(lines, 1):
    parts = line.split("\t")
    if len(parts) != 2:
        print(f"  malformed line {i}")
        bad += 1
        continue
    expr, want = parts

    if "%" in expr:
        skipped += 1
        continue

    got = py_eval(to_ascii(expr))
    checked += 1

    if want == "ERROR":
        if got is not None:
            print(f"  {expr}: corpus refuses it, Python returned {got:.16e}")
            bad += 1
        continue

    if got is None:
        print(f"  {expr}: Python errors, corpus says {want}")
        bad += 1
        continue

    if canon(f"{got:.16e}") != canon(want):
        print(f"  {expr}: Python {got:.16e}, corpus {want}")
        bad += 1

if bad > 0:
    print(f"Python disagrees with {path} on {bad} of {checked} expressions")
    sys.exit(1)
if checked == 0:
    print(f"Python checked nothing in {path}")
    sys.exit(1)
print(f"Python reproduces all {checked} non-percent expressions in {path}"
      f", exact, 0.0e+00 ({skipped} percent expressions skipped)")
