import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getHanaState','setHanaMachine','setHanaField','setHanaCount','resetHanaState'])assert.match(html,new RegExp(`${method}\\s*:`),`core bridge missing ${method}`);
for(const fn of ['renderHanaJudgeScreen','renderHanaReverseScreen'])assert.match(app,new RegExp(`${fn}\\s*\\(`),`new UI missing ${fn}`);
for(const token of ['data-hana-machine','data-hana-field','data-hana-count','data-hana-reset'])assert.ok(app.includes(token),`HANA UI missing ${token}`);
assert.match(app,/ハナハナ判別/);assert.match(app,/ハナハナ後ヅモ/);assert.doesNotMatch(app,/HanaJudgeUI|screen==='hana-live'|screen==='hana-rev'/);
console.log('v5.1.0 native HANA UI static PASS');
