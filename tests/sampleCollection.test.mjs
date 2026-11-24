import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const configs=JSON.parse(await readFile(new URL('../scripts/sample-configs.json',import.meta.url),'utf8'));
test('指定16法令の各サンプルに本文・上部の注意書き・最新版リンクが揃う',async()=>{
 assert.equal(Object.keys(configs).length,16);
 for(const c of Object.values(configs)){
  const html=await readFile(new URL(`../${c.path}/index.html`,import.meta.url),'utf8');
  assert.ok(html.includes(`<h1>${c.name}の三段表・三段対照表</h1>`),c.name);
  assert.ok(html.includes('lawrow-snapshot'),c.name);
  assert.ok(html.indexOf('保存版サンプル：最新の法令ではない場合があります。')<html.indexOf('<table>'),c.name);
  assert.ok(html.includes('background:#f1f8f2'),c.name);
  assert.ok(html.includes('最新の法令をLawRowで開く'),c.name);
  assert.doesNotMatch(html,/>e-Govで現行条文を確認<\/a>/);
  assert.ok(html.includes(`https://laws.e-gov.go.jp/law/${c.ids[0]}`),c.name);
  const units=[...html.matchAll(/id="(snapshot-\d-\d+)"/g)].map(m=>m[1]);assert.ok(units.length>10,c.name);assert.equal(new Set(units).size,units.length,c.name);
  for(let i=0;i<3;i++){assert.ok(units.some(u=>u.startsWith(`snapshot-${i}-`)),c.name);const data=JSON.parse(await readFile(new URL(`../public/samples/data/${c.ids[i]}.json`,import.meta.url),'utf8'));assert.equal(data.law_info.law_id,c.ids[i]);assert.ok(html.includes(data.revision_info.law_revision_id),c.name);}
 }
});
test('サンプル一覧は独立ページを作らず選択ウィンドウから全16法令を開ける',async()=>{
 const picker=await readFile(new URL('../src/SamplePicker.jsx',import.meta.url),'utf8');
 for(const slug of Object.keys(configs))assert.ok(picker.includes("'"+slug+"'"),slug);
 assert.match(picker,/aria-modal="true"/);
 assert.match(picker,/改正は自動反映されません/);
 const app=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(app,/<SamplePicker/);
 assert.doesNotMatch(app,/BASE_URL}samples\/`/);
 const sitemap=await readFile(new URL('../public/sitemap.xml',import.meta.url),'utf8');
 assert.ok(!sitemap.includes('<loc>https://thozk.github.io/laws/samples/</loc>'));
});
