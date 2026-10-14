import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {analyze} from 'lawtext/dist/src/analyzer/index.js';
import {externalTargets,internalTargets,findTarget,buildBacklinks,delegationCandidates} from '../src/references.js';
const laws=await Promise.all(['415AC0000000057','415CO0000000507','428M60020000003'].map(async id=>{
 const d=JSON.parse(await readFile(new URL(`../public/data/${id}.json`,import.meta.url)));const el=xmlToEL(Buffer.from(d.law_full_text,'base64').toString());const analysis=await analyze({elToBeModified:el});let n=0;const articles=[];function visit(e){e.readerNode=String(n++);if(e.tag==='Article'){e.readerKey=String(articles.length);articles.push({key:e.readerKey,label:e.children.find(c=>c.tag==='ArticleTitle')?.text()});}for(const c of e.children)if(typeof c!=='string')visit(c);}visit(el);return {num:d.law_info.law_num,el,analysis,articles};
}));
test('施行令第一条の第二条第二項は法律へ解決される',()=>{
 const env=[...laws[1].analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='第二条第二項'&&e.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el.attr.Num==='1');
 const target=externalTargets(env).at(-1).target;
 assert.equal(target.lawNum,laws[0].num);assert.equal(target.article,'2');assert.equal(target.paragraph,'2');
 const found=findTarget(laws[0],target);assert.equal(found.el.tag,'Paragraph');assert.equal(found.el.attr.Num,'2');assert.equal(found.article.attr.Num,'2');
});
test('本則の検索は同番号の附則に移動しない',()=>{
 const found=findTarget(laws[0],{article:'1'});assert.match(found.el.text(),/デジタル社会/);assert.equal(findTarget(laws[0],{article:'9999'}),null);assert.equal(findTarget(laws[0],{article:'1',paragraph:'99'}),null);
});
test('法律第二条から施行令第一条へ逆参照できる',()=>{
 const maps=buildBacklinks(laws),article=findTarget(laws[0],{article:'2'});assert.ok(maps[0].get(article.articleKey).some(r=>r.sourceIndex===1&&r.key==='0'));
});
test('旅券法第六条第一項第一号は表示中の法律と混同しない',()=>{
 const env=[...laws[1].analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='第六条第一項第一号'&&e.located?.lawRef?.attr.suggestedLawTitle==='旅券法');
 const target=externalTargets(env).at(-1).target;assert.equal(target.lawNum,'昭和二十六年法律第二百六十七号');assert.equal(target.article,'6');assert.equal(target.paragraph,'1');assert.equal(target.item,'1');
});
test('前項の参照はLawtextが解決した同法令の項を維持する',()=>{
 const env=[...laws[0].analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='前項'&&e.located?.type==='internal');
 const expected=env.located.fragments.at(-1).containers[0];assert.equal(internalTargets(env).at(-1).target.node,expected.el.readerNode);
});

test('政令リンクは参照している項ごとに候補を区別する',()=>{
 const maps=buildBacklinks(laws),article=findTarget(laws[0],{article:'2'});
 const p2=delegationCandidates(maps[0],{article:article.articleKey,paragraph:'2',index:0},'政令');
 const p3=delegationCandidates(maps[0],{article:article.articleKey,paragraph:'3',index:0},'政令');
 assert.deepEqual(p2.map(r=>r.key),['0']);assert.deepEqual(p3.map(r=>r.key),['1']);
 assert.deepEqual(delegationCandidates(maps[0],{article:article.articleKey,paragraph:'999',index:0},'政令'),[]);
 assert.deepEqual(delegationCandidates(maps[0],{article:article.articleKey,paragraph:'2',index:0},'省令'),[]);
});

import {definitionFor} from '../src/definitions.js';
test('定義語と略称から同法令の定義文を取得する',()=>{
 for(const [name,pattern] of [['個人情報',/生存する個人/],['基本方針',/以下「基本方針」という/],['利用目的',/以下「利用目的」という/]]){
  const ref=laws[0].analysis.variableReferences.find(r=>r.text()===name);
  assert.ok(ref,name);assert.match(definitionFor(laws[0],ref).content.text(),pattern);
 }
});
test('定義参照は別法令の宣言を探さず、この法律は対象外にする',()=>{
 const ref=laws[0].analysis.variableReferences.find(r=>r.text()==='基本方針');
 assert.equal(definitionFor(laws[1],ref),null);
 assert.equal(definitionFor(laws[0],{text:()=> 'この法律'}),null);
});

import {noteContext} from '../src/noteContext.js';
test('付箋は定義文と号の所属する条・項を表示する',()=>{
 const ref=laws[0].analysis.variableReferences.find(r=>r.text()==='利用目的');
 assert.equal(noteContext(laws[0],definitionFor(laws[0],ref).content),'第十七条　第1項');
 const found=findTarget(laws[0],{article:'2',paragraph:'1',item:'1'});
 assert.equal(noteContext(laws[0],found.el),'第二条　第1項　第1号');
});
