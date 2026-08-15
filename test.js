/* Self-check for the calculator engine: node test.js */
'use strict';

var assert = require('assert');
var engine = require('./engine.js');

var evaluate = engine.evaluate;
var formatNumber = engine.formatNumber;
var formatExpression = engine.formatExpression;

// --- arithmetic and precedence -------------------------------------------
assert.strictEqual(evaluate('1+2'), 3);
assert.strictEqual(evaluate('2+3×4'), 14, 'multiplication binds tighter than +');
assert.strictEqual(evaluate('2×3+4'), 10);
assert.strictEqual(evaluate('12÷4−1'), 2);
assert.strictEqual(evaluate('1−2−3'), -4, 'subtraction is left-associative');
assert.strictEqual(evaluate('100÷10÷2'), 5, 'division is left-associative');

// --- parentheses ----------------------------------------------------------
assert.strictEqual(evaluate('(2+3)×4'), 20);
assert.strictEqual(evaluate('2×(3+(4−1))'), 12);

// --- unary sign -----------------------------------------------------------
assert.strictEqual(evaluate('−5+2'), -3);
assert.strictEqual(evaluate('(−5)×2'), -10);
assert.strictEqual(evaluate('2×−3'), -6);

// --- percent is postfix "divide by 100" -----------------------------------
assert.strictEqual(evaluate('50%'), 0.5);
assert.strictEqual(evaluate('200×10%'), 20);

// --- exponential input round-trips (results feed back into the expression) -
assert.strictEqual(evaluate('1e+21×1'), 1e21);

// --- errors ---------------------------------------------------------------
assert.throws(function () { evaluate('1÷0'); }, /divide by zero/);
assert.throws(function () { evaluate('1+'); }, SyntaxError);
assert.throws(function () { evaluate('('); }, SyntaxError);
assert.throws(function () { evaluate('(1+2'); }, /closing parenthesis/);
assert.throws(function () { evaluate(''); }, SyntaxError);

// --- number formatting ----------------------------------------------------
assert.strictEqual(formatNumber(evaluate('0.1+0.2')), '0.3', 'float noise is trimmed');
assert.strictEqual(formatNumber(evaluate('1÷3')), '0.333333333333');
assert.strictEqual(formatNumber(evaluate('1234567×1000')), '1,234,567,000');
assert.strictEqual(formatNumber(evaluate('0−0')), '0', 'no negative zero');
assert.strictEqual(formatNumber(-5), '−5', 'minus glyph, not ASCII hyphen');
assert.strictEqual(formatNumber(-1234.5), '−1,234.5');
assert.strictEqual(formatNumber(NaN), 'Error');

// --- expression formatting ------------------------------------------------
assert.strictEqual(formatExpression('1234+5'), '1,234 + 5');
assert.strictEqual(formatExpression('(−12)'), '(−12)', 'unary sign stays tight');
assert.strictEqual(formatExpression('2×(3+4)'), '2 × (3 + 4)');

console.log('all engine checks passed');
