import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const commands=JSON.parse(fs.readFileSync(new URL('./commands.json',import.meta.url)));
let failures=0;
for(const command of commands){
 const [exe,...args]=command.split(' ');
 const r=spawnSync(exe==='node'?process.execPath:exe,args,{encoding:'utf8'});
 if(r.status!==0){failures++;console.error(`FAIL ${command}\n${r.stdout}${r.stderr}${r.error||''}`)}
 else console.log(`PASS ${command}${r.stdout.trim()?'\n'+r.stdout.trim():''}`);
}
console.log(`${commands.length-failures}/${commands.length} commands passed`);
if(failures)process.exitCode=1;
