/*
 * Keypad wiring and input rules. The engine (engine.js) evaluates; this file
 * only decides what a keypress does to the expression string, and renders it.
 *
 * The expression is kept raw (display glyphs × ÷ −, no thousands separators)
 * so it always round-trips back through the engine; formatting is display-only.
 */
(function () {
  'use strict';

  var E = window.CalcEngine;

  var calcEl = document.querySelector('.calculator');
  var historyEl = document.getElementById('history');
  var exprEl = document.getElementById('expr');
  var previewEl = document.getElementById('preview');
  var messageEl = document.getElementById('message');
  var announceEl = document.getElementById('announce');

  var OPERATORS = '+−×÷';
  var PRECISION = 12;

  var expr = '';
  var history = '';
  var evaluated = false; // last action was '=', so the display holds a result
  var pendingError = null;

  // Error text is rendered into #strings in the HTML, so whatever translated it
  // on page load has already run. Falls back to the English argument when the
  // element is missing (or nothing translated it), so this is safe on its own.
  function localize(text) {
    var node = document.querySelector('#strings [data-string="' + text + '"]');
    return node && node.textContent ? node.textContent : text;
  }

  function last() {
    return expr.slice(-1);
  }

  function unclosed() {
    var open = (expr.match(/\(/g) || []).length;
    var close = (expr.match(/\)/g) || []).length;
    return Math.max(0, open - close);
  }

  function closeParens(text) {
    return text + new Array(unclosed() + 1).join(')');
  }

  // A digit after '=' starts a new calculation...
  function startFresh() {
    if (!evaluated) return;
    expr = '';
    history = '';
    evaluated = false;
  }

  // ...but an operator after '=' keeps operating on the result.
  function continueFromResult() {
    if (!evaluated) return;
    history = '';
    evaluated = false;
  }

  // "(1+2)3" is a typo for "(1+2)×3"
  function implicitTimes() {
    if (/[)%]$/.test(expr)) expr += '×';
  }

  var actions = {
    digit: function (value) {
      startFresh();
      implicitTimes();
      if (/(?:^|[+−×÷(])0$/.test(expr)) expr = expr.slice(0, -1); // no leading zeros
      expr += value;
    },

    dot: function () {
      startFresh();
      var tail = (expr.match(/[\d.]*$/) || [''])[0];
      if (tail.indexOf('.') !== -1) return; // one decimal point per number
      if (tail !== '') expr += '.';
      else expr += /[)%]$/.test(expr) ? '×0.' : '0.';
    },

    op: function (value) {
      continueFromResult();
      if (expr === '') {
        if (value === '−') expr = '−';
        return;
      }
      if (OPERATORS.indexOf(last()) !== -1) {
        expr = expr.slice(0, -1) + value; // swap the pending operator
        return;
      }
      if (last() === '(') {
        if (value === '−') expr += value;
        return;
      }
      expr += value;
    },

    percent: function () {
      continueFromResult();
      if (/[\d)%]$/.test(expr)) expr += '%';
    },

    paren: function () {
      startFresh();
      if (expr === '' || /[+−×÷(]$/.test(expr)) expr += '(';
      else if (unclosed() > 0 && /[\d)%]$/.test(expr)) expr += ')';
      else expr += '×(';
    },

    sign: function () {
      // A result may be in exponential notation, so negate it numerically.
      if (evaluated) {
        var n = Number(expr);
        continueFromResult();
        if (isFinite(n)) {
          expr = String(-n).replace('-', '−');
          return;
        }
      }
      var wrapped = expr.match(/\(−(\d+(?:\.\d*)?)\)$/);
      if (wrapped) {
        expr = expr.slice(0, expr.length - wrapped[0].length) + wrapped[1];
        return;
      }
      var plain = expr.match(/\d+(?:\.\d*)?$/);
      if (plain) {
        expr = expr.slice(0, expr.length - plain[0].length) + '(−' + plain[0] + ')';
        return;
      }
      if (expr === '') expr = '(−';
    },

    back: function () {
      continueFromResult();
      expr = expr.slice(0, -1);
    },

    clear: function () {
      expr = '';
      history = '';
      evaluated = false;
    },

    equals: function () {
      if (expr === '' || evaluated) return;
      var source = closeParens(expr);
      var value;
      try {
        value = E.evaluate(source);
      } catch (err) {
        pendingError = err instanceof RangeError ? err.message : 'Invalid expression';
        return;
      }
      history = E.formatExpression(source) + ' =';
      expr = String(parseFloat(value.toPrecision(PRECISION)));
      evaluated = true;
      announceEl.textContent = localize('Result') + ' ' + E.formatNumber(value);
    }
  };

  function preview() {
    if (evaluated || expr === '') return '';
    if (!/[+−×÷%()]/.test(expr)) return ''; // nothing to compute yet
    var value;
    try {
      value = E.evaluate(closeParens(expr));
    } catch (err) {
      return ''; // incomplete expression — stay quiet until it parses
    }
    var text = E.formatNumber(value);
    // Don't echo a preview that just repeats the expression, e.g. "(−5)" -> "−5".
    var bare = function (s) { return s.replace(/[(),\s]/g, ''); };
    return bare(text) === bare(E.formatExpression(expr)) ? '' : '= ' + text;
  }

  // Shrink the display font until a long expression fits on one line.
  function fit(el) {
    el.style.fontSize = '';
    // Zero width means we aren't laid out yet (hidden tab, pane still opening).
    // Measuring now would shrink to the floor and stick, so leave the CSS size.
    if (!el.clientWidth) return;
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 18) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  }

  function render() {
    historyEl.textContent = history;
    exprEl.textContent = evaluated
      ? E.formatNumber(Number(expr))
      : expr === '' ? '0' : E.formatExpression(expr);
    previewEl.textContent = preview();
    messageEl.textContent = '';
    fit(exprEl);
  }

  function showError(message) {
    var text = localize(message);
    previewEl.textContent = '';
    messageEl.textContent = text;
    announceEl.textContent = text;
    calcEl.classList.remove('is-error');
    void calcEl.offsetWidth; // restart the shake
    calcEl.classList.add('is-error');
    setTimeout(function () {
      calcEl.classList.remove('is-error');
    }, 400);
  }

  function run(button) {
    var action = actions[button.dataset.action];
    if (!action) return;
    action(button.dataset.value);
    render();
    if (pendingError) {
      showError(pendingError);
      pendingError = null;
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.key, .backspace');
    if (button) run(button);
  });

  var keymap = {};
  document.querySelectorAll('[data-keys]').forEach(function (button) {
    button.dataset.keys.split(' ').forEach(function (key) {
      if (key) keymap[key] = button;
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var button = keymap[event.key] || keymap[event.key.toLowerCase()];
    if (!button) return;
    event.preventDefault(); // also stops Enter re-clicking a focused key
    run(button);
    button.classList.add('is-active');
    setTimeout(function () {
      button.classList.remove('is-active');
    }, 110);
  });

  window.addEventListener('resize', function () {
    fit(exprEl);
  });

  render();
})();
