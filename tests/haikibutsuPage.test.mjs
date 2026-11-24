import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../haikibutsu/index.html',import.meta.url),'utf8');
test('専用ページはJavaScript実行前のHTMLに三段対照表の本文と版情報を含む',()=>{
 assert.match(html,/<h1>廃棄物処理法の三段表・三段対照表<\/h1>/);
 assert.match(html,/rel="canonical" href="https:\/\/thozk.github.io\/laws\/haikibutsu\/"/);
 assert.match(html,/meta name="lawrow-laws" content="345AC0000000137,346CO0000000300,346M50000100035"/);
 assert.match(html,/この法律は、廃棄物の排出を抑制し/);
 assert.match(html,/第二条の四/);assert.match(html,/施行日/);assert.match(html,/取得日/);
 const units=[...html.matchAll(/id="(snapshot-\d-\d+)"/g)].map(m=>m[1]);assert.ok(units.length>6000);assert.equal(new Set(units).size,units.length);
 for(const col of [0,1,2])assert.ok(units.some(id=>id.startsWith(`snapshot-${col}-`)));
 assert.match(html,/<script type="module" src="\/src\/main.jsx"><\/script>/);
 assert.doesNotMatch(html,/src="\.\/pict/);
});

test('会社法サンプルには保存版の警告と最新版リンクがありトップは一覧だけへ誘導する',async()=>{
 const company=await readFile(new URL('../samples/kaishaho/index.html',import.meta.url),'utf8');
 assert.match(company,/<h1>会社法の三段表・三段対照表<\/h1>/);
 assert.match(company,/lawrow-snapshot/);assert.match(company,/取得後の改正は自動反映されません/);assert.match(company,/最新の法令をLawRowで開く/);
 assert.match(company,/会社計算規則などの関連法令は含みません/);
 assert.match(company,/この法律において/);assert.match(company,/会社法施行令/);assert.match(company,/会社法施行規則/);
 assert.match(company,/href="\.\.\/\.\.\/\?laws=417AC0000000086/);
 const app=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(app,/setSamplesOpen\(true\)/);assert.doesNotMatch(app,/haikibutsu\/`}>/);
 for(const id of ['417AC0000000086','417CO0000000364','418M60000010012']){
  const data=JSON.parse(await readFile(new URL(`../public/samples/data/${id}.json`,import.meta.url)));assert.equal(data.law_info.law_id,id);
 }
});
