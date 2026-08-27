import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../hanahana-ui.js', import.meta.url),'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(html.includes('body.page-rev .beginlive-top,body.page-hana-rev .beginlive-top{display:block}'),'HANA reverse must expose top 判別開始');
const liveMatch=ui.match(/function renderLive\(root\)\{[\s\S]*?root\.innerHTML=`([\s\S]*?)`;bindMachineTabs/);
ok(liveMatch,'renderLive template not found');
ok(!liveMatch[1].includes('${machineTabs()}'),'HANA live must not render top machine tabs');
ok(liveMatch[1].includes('${contextCard(cv)}'),'HANA live must retain shared 実戦台 context card');
ok(ui.includes('data-context-machine'),'HANA live must retain machine selector in 実戦台 card');
const revMatch=ui.match(/function renderRev\(root\)\{[\s\S]*?root\.innerHTML=`([\s\S]*?)`;bindMachineTabs/);
ok(revMatch && revMatch[1].includes('${machineTabs()}'),'HANA reverse should keep machine tabs like Juggler reverse');
ok(ui.includes("bridge()?.setPage?.('hana-live')"),'判別開始 must route HANA reverse -> live');
console.log('v4.5.3 legacy UI regression: PASS');
