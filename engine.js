/*
 * Calculator engine: tokenizer, recursive-descent evaluator, display formatting.
 * Pure logic, no DOM — so it runs in the browser and under node (see test.js).
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := ('-' | '+') unary | postfix
 *   postfix := primary '%'*
 *   primary := number | '(' expr ')'
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalcEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Significant digits kept before display. Trims binary float noise:
  // 0.1 + 0.2 -> 0.30000000000000004 -> 0.3
  var PRECISION = 12;

  var NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

  // The keypad shows ×, ÷ and U+2212 MINUS SIGN; the parser wants ASCII.
  function normalize(text) {
    return String(text)
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/,/g, '');
  }

  function tokenize(source) {
    var src = normalize(source);
    var tokens = [];
    var i = 0;

    while (i < src.length) {
      var c = src[i];

      if (c === ' ') {
        i++;
        continue;
      }

      var num = src.slice(i).match(NUMBER);
      if (num) {
        tokens.push({ type: 'num', value: parseFloat(num[0]) });
        i += num[0].length;
        continue;
      }

      if ('+-*/%()'.indexOf(c) !== -1) {
        tokens.push({ type: c });
        i++;
        continue;
      }

      throw new SyntaxError('Unexpected character: ' + c);
    }

    return tokens;
  }

  function parse(tokens) {
    var pos = 0;

    function peek() {
      return pos < tokens.length ? tokens[pos].type : null;
    }

    function eat(type) {
      if (peek() !== type) return false;
      pos++;
      return true;
    }

    function expr() {
      var left = term();
      for (;;) {
        if (eat('+')) left = left + term();
        else if (eat('-')) left = left - term();
        else return left;
      }
    }

    function term() {
      var left = unary();
      for (;;) {
        if (eat('*')) {
          left = left * unary();
        } else if (eat('/')) {
          var divisor = unary();
          if (divisor === 0) throw new RangeError('Cannot divide by zero');
          left = left / divisor;
        } else {
          return left;
        }
      }
    }

    function unary() {
      if (eat('-')) return -unary();
      if (eat('+')) return unary();
      return postfix();
    }

    function postfix() {
      var value = primary();
      while (eat('%')) value = value / 100;
      return value;
    }

    function primary() {
      if (eat('(')) {
        var value = expr();
        if (!eat(')')) throw new SyntaxError('Missing closing parenthesis');
        return value;
      }
      if (peek() === 'num') return tokens[pos++].value;
      throw new SyntaxError('Unexpected ' + (peek() || 'end of expression'));
    }

    var result = expr();
    if (pos !== tokens.length) throw new SyntaxError('Unexpected trailing input');
    return result;
  }

  function evaluate(source) {
    var value = parse(tokenize(source));
    if (!isFinite(value)) throw new RangeError('Result is out of range');
    return value;
  }

  function group(text) {
    return text.replace(/\d+(?:\.\d*)?/g, function (match) {
      var parts = match.split('.');
      var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.length > 1 ? int + '.' + parts[1] : int;
    });
  }

  // Round away float noise, then let String() pick fixed vs exponential
  // notation (it switches at 1e21 / 1e-7, same as the raw values we store).
  function formatNumber(value) {
    if (typeof value !== 'number' || !isFinite(value)) return 'Error';
    var n = parseFloat(value.toPrecision(PRECISION));
    if (n === 0) n = 0; // collapse -0
    var text = String(n).replace(/^-/, '−'); // display glyph, not ASCII hyphen
    return text.indexOf('e') === -1 ? group(text) : text;
  }

  // Space binary operators, leave unary signs tight, group thousands.
  function formatExpression(source) {
    var out = '';
    for (var i = 0; i < source.length; i++) {
      var c = source[i];
      var isOperator = '+−×÷'.indexOf(c) !== -1;
      var binary = isOperator && /[\d)%.]/.test(source[i - 1] || '');
      out += binary ? ' ' + c + ' ' : c;
    }
    return group(out);
  }

  return {
    evaluate: evaluate,
    formatNumber: formatNumber,
    formatExpression: formatExpression,
    tokenize: tokenize
  };
});
