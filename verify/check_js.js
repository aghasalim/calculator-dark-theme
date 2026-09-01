/*
 * The JavaScript side of the differential check: node verify/check_js.js <corpus.tsv>
 *
 * verify/cases.tsv is the shared corpus every other language reads. Its
 * expected column was written by engine.js, so this re-runs the engine over it
 * and requires bit-exact agreement. That keeps the corpus honest: if someone
 * edits engine.js and the corpus stops matching, this fails first, and if
 * someone edits the corpus instead, every other language fails.
 *
 * With --write it regenerates the expected column from the engine, which is
 * how the file was made in the first place.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var engine = require(path.join(__dirname, '..', 'engine.js'));

var file = process.argv[2];
var write = process.argv.indexOf('--write') !== -1;
if (!file) {
  console.error('usage: node check_js.js <corpus.tsv> [--write]');
  process.exit(2);
}

// 17 significant digits round-trips a double exactly, so every language can
// read the column back as the same number it was written from.
function encode(expr) {
  try {
    return engine.evaluate(expr).toExponential(16);
  } catch (e) {
    return 'ERROR';
  }
}

var lines = fs.readFileSync(file, 'utf8').split('\n').filter(function (l) {
  return l.length > 0;
});

if (write) {
  var out = lines.map(function (line) {
    var expr = line.split('\t')[0];
    return expr + '\t' + encode(expr);
  });
  fs.writeFileSync(file, out.join('\n') + '\n');
  console.log('wrote ' + out.length + ' expressions to ' + file);
  process.exit(0);
}

var bad = 0;
lines.forEach(function (line, i) {
  var parts = line.split('\t');
  if (parts.length !== 2) {
    console.log('  malformed line ' + (i + 1) + ': expected one tab');
    bad++;
    return;
  }
  var expr = parts[0];
  var want = parts[1];
  var got = encode(expr);
  if (got === want) return;
  // Compare as numbers too, so a differently formatted but identical double
  // is not reported as a disagreement.
  if (want !== 'ERROR' && got !== 'ERROR' && Number(got) === Number(want)) return;
  console.log('  ' + expr + ': engine gives ' + got + ', corpus says ' + want);
  bad++;
});

if (bad) {
  console.log('engine.js disagrees with ' + file + ' on ' + bad + ' of ' + lines.length);
  process.exit(1);
}
if (lines.length === 0) {
  console.log('no expressions in ' + file);
  process.exit(1);
}
console.log('JavaScript reproduces all ' + lines.length + ' expressions in ' + file +
            ', exact, 0.0e+00');
