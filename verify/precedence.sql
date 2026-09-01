-- SQLite has its own expression parser, written by someone else, years before
-- this calculator. That makes it a free fourth opinion on the only thing the
-- grammar in engine.js is really claiming: which operator binds tighter, and
-- which way a chain of them associates.
--
-- Each row below is one expression from verify/cases.tsv rewritten as SQL. The
-- expected value is not typed here, it is joined out of the corpus, so this
-- fails if the corpus changes underneath it.
--
-- Two limits, both deliberate. Percent is left out because % is modulo in SQL,
-- not "divide by a hundred". Integer literals are written with a decimal point
-- because SQL integer division truncates, which is a difference in the literal
-- type rather than in the precedence being checked.
--
--   sqlite3 -init verify/precedence.sql :memory: "" < /dev/null

.bail on
.mode tabs
CREATE TABLE cases(expr TEXT, want TEXT);
.import verify/cases.tsv cases

CREATE TABLE sql_side(expr TEXT, value REAL);
INSERT INTO sql_side VALUES
  ('2+3×4',                2.0+3.0*4.0),
  ('(2+3)×4',              (2.0+3.0)*4.0),
  ('2×3+4',                2.0*3.0+4.0),
  ('1−2−3',                1.0-2.0-3.0),
  ('100÷10÷2',             100.0/10.0/2.0),
  ('12÷4−1',               12.0/4.0-1.0),
  ('2×(3+(4−1))',          2.0*(3.0+(4.0-1.0))),
  ('−5+2',                 -5.0+2.0),
  ('(−5)×2',               (-5.0)*2.0),
  ('2×−3',                 2.0*-3.0),
  ('+7',                   +7.0),
  ('1÷3',                  1.0/3.0),
  ('2÷3',                  2.0/3.0),
  ('.5+.5',                0.5+0.5),
  ('1234567×1000',         1234567.0*1000.0),
  ('123456789×987654321',  123456789.0*987654321.0),
  ('1000000×1000000',      1000000.0*1000000.0),
  ('0.1+0.2',              0.1+0.2),
  ('0.1×3',                0.1*3.0),
  ('1.5×2.5',              1.5*2.5),
  ('(1+2)×(3+4)−5÷5',      (1.0+2.0)*(3.0+4.0)-5.0/5.0),
  ('2−3×(4−5)',            2.0-3.0*(4.0-5.0)),
  ('(((1)))',              (((1.0)))),
  ('−(3+4)',               -(3.0+4.0)),
  ('3−−4',                 3.0- -4.0),
  ('3+−4',                 3.0+ -4.0);

.mode list
.separator |

-- One line per disagreement. A row missing from the corpus is a disagreement
-- too, which is why this is a LEFT JOIN.
SELECT 'mismatch', s.expr, s.value, COALESCE(c.want, 'absent')
FROM sql_side s
LEFT JOIN cases c ON c.expr = s.expr
WHERE c.want IS NULL
   OR c.want = 'ERROR'
   OR CAST(c.want AS REAL) <> s.value;

SELECT 'matched', COUNT(*)
FROM sql_side s
JOIN cases c ON c.expr = s.expr
WHERE c.want <> 'ERROR' AND CAST(c.want AS REAL) = s.value;
