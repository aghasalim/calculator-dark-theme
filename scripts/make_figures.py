"""Draw the README behaviour figure by running the real engine.

Every row is produced by calling ``engine.evaluate`` through node, so the figure
cannot claim behaviour the parser does not have.

    python3 scripts/make_figures.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

CASES = [
    ("2+3×4", "precedence: × binds tighter than +"),
    ("(2+3)×4", "parentheses override it"),
    ("1−2−3", "subtraction is left-associative"),
    ("100÷10÷2", "so is division"),
    ("−3+10", "unary minus"),
    ("50%", "percent is postfix"),
    ("200×10%", "percent of a value"),
    ("0.1+0.2", "float display, 12 significant figures"),
    ("1÷0", "division by zero is refused, not NaN"),
    ("(2+3", "unclosed parenthesis is named"),
]

# node -e does not expose a script path in process.argv, so the inputs come
# through the environment rather than as positional arguments.
RUNNER = """
const engine = require(process.env.ENGINE_PATH);
const cases = JSON.parse(process.env.CASES_JSON);
console.log(JSON.stringify(cases.map(([expr, note]) => {
  try { return {expr, note, out: engine.formatNumber(engine.evaluate(expr)), ok: true}; }
  catch (e) { return {expr, note, out: e.message || String(e), ok: false}; }
})));
"""


def evaluate() -> list[dict]:
    """Run every case through the real engine and return its actual output."""
    import os

    environment = {
        **os.environ,
        "ENGINE_PATH": str(ROOT / "engine.js"),
        "CASES_JSON": json.dumps(CASES),
    }
    result = subprocess.run(
        ["node", "-e", RUNNER], capture_output=True, text=True, check=True,
        env=environment,
    )
    return json.loads(result.stdout)


def behaviour(out: Path) -> Path:
    """What the parser actually does, expression by expression."""
    rows = evaluate()

    figure, ax = plt.subplots(figsize=(11, 0.56 * len(rows) + 1.4))
    ax.axis("off")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, len(rows) + 0.8)

    for index, row in enumerate(reversed(rows)):
        y = index + 0.4
        colour = "#1a9850" if row["ok"] else "#b2182b"
        ax.text(0.02, y, row["expr"], va="center", fontsize=13,
                family="monospace", color="0.1")
        ax.text(0.26, y, "=", va="center", fontsize=12, color="0.55")
        ax.text(0.30, y, row["out"], va="center", fontsize=13,
                family="monospace", color=colour, fontweight="bold")
        ax.text(0.62, y, row["note"], va="center", fontsize=9, color="0.45")

    ax.set_title(
        "Every value is the real engine's output, not a worked example.\n"
        "Red rows are refusals the parser names rather than returning NaN.",
        fontsize=10, pad=12,
    )
    figure.tight_layout()
    figure.savefig(out, dpi=110, bbox_inches="tight")
    plt.close(figure)
    return out


def main() -> int:
    DOCS.mkdir(exist_ok=True)
    print(f"-> {behaviour(DOCS / 'behaviour.png').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
