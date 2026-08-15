# Calculator — Dark Theme

A dark-theme calculator that runs in the browser. No dependencies, no build step —
three static files and a `<script>` tag.

**Live demo: https://aghasalim.github.io/Calculator_Dark_Theme/**

## Features

- **Operator precedence and parentheses** — `2 + 3 × 4` is `14`, not `20`. Unclosed
  parentheses are closed for you when you press `=`.
- **Live result preview** under the expression as you type.
- **Full keyboard support** — digits, `+` `-` `*` `/` `%` `(` `)` `.`, `Enter` to
  evaluate, `Backspace` to delete, `Esc` to clear, `n` to flip the sign.
- **Readable output** — thousands separators, tabular figures, and a display font
  that shrinks to keep long expressions on one line.
- **Accessible** — real buttons, labelled operators, visible focus rings, results
  announced to screen readers, and animations disabled under
  `prefers-reduced-motion`.
- **Sensible errors** — dividing by zero says so instead of showing `Infinity`.

## Behaviour worth knowing

**Percent is postfix "divide by 100".** `50%` is `0.5`, and `200 × 10%` is `20`.
So `200 + 10%` is `200.1`, *not* `220` — this calculator does not re-interpret `%`
as "percent of the left operand" the way some phone calculators do. The rule here
is the same everywhere it appears, which is the point.

**Results carry 12 significant digits.** That is what hides binary float noise —
`0.1 + 0.2` displays as `0.3` rather than `0.30000000000000004`. The cost is that
results beyond 12 digits are rounded: `123456789 × 987654321` shows as
`121,932,631,113,000,000`. This is a double-precision calculator, not a
bignum one.

## Layout

| | | | |
|---|---|---|---|
| `AC` | `()` | `%` | `÷` |
| `7` | `8` | `9` | `×` |
| `4` | `5` | `6` | `−` |
| `1` | `2` | `3` | `+` |
| `±` | `0` | `.` | `=` |

`()` is one key: it inserts whichever parenthesis makes sense where you are.

## Files

| File | What it does |
|---|---|
| `engine.js` | Tokenizer, recursive-descent evaluator, number formatting. No DOM. |
| `app.js` | Keypad wiring and input rules — what each key does to the expression. |
| `index.html` / `style.css` | Markup and the dark theme. |
| `test.js` | Self-check for the engine. |

Expressions are parsed by a hand-written recursive-descent parser, so user input
is never handed to the JavaScript interpreter.

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tests

```bash
node test.js
```

Covers precedence, associativity, parentheses, unary signs, percent, division by
zero, malformed input, and number formatting. No test framework.

## Licence

MIT
