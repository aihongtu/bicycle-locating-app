/* test/run.js — 运行 test/ 下所有 .test.js */
'use strict';
const fs = require('fs'), path = require('path');
const dir = __dirname;
fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().forEach(f => {
  console.log('\n[ ' + f + ' ]');
  require(path.join(dir, f));
});
require('./harness').summary();
