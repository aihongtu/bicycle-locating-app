/* test/harness.js — 极简测试运行器与断言 */
'use strict';
let total = 0, passed = 0; const failures = [];
const results = [];

function test(name, fn) {
  total++;
  try { fn(); passed++; results.push({ name, ok: true }); }
  catch (e) { failures.push({ name, error: e }); results.push({ name, ok: false, error: e.message }); }
}
function eq(actual, expected, msg) { if (actual !== expected) throw new Error((msg || '') + ' 期望=' + expected + ' 实际=' + actual); }
function ok(v, msg) { if (!v) throw new Error(msg || '期望为真'); }
function closeTo(a, b, tol) {
  const eps = typeof tol === 'number' ? tol : 1e-9;
  const msg = typeof tol === 'string' ? tol : '';
  if (Math.abs(a - b) > eps) throw new Error(msg + ' 期望≈' + b + ' 实际=' + a);
}
function throws(fn, msg) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) throw new Error(msg || '期望抛出异常'); }
function summary() {
  console.log('----------------------------');
  console.log('通过 ' + passed + ' / ' + total);
  if (failures.length) {
    failures.forEach(function (f) { console.log('FAIL: ' + f.name + ' -> ' + f.error.message); });
    process.exitCode = 1;
  }
  return { total, passed, failures: failures.length };
}
module.exports = { test, eq, ok, closeTo, throws, summary };
