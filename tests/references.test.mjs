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

import {buildAlignment,mainArticles} from '../src/alignment.js';
test('三段表は本則の全条文を一度ずつ配置し、各列の順序を保つ',()=>{
 const model=buildAlignment(laws);
 assert.deepEqual(model.articles.map(a=>a.length),[185,40,71]);
 model.articles.forEach((articles,i)=>{assert.equal(model.assignments[i].size,articles.length);let previous=0;for(const article of articles){const placement=model.assignments[i].get(article.readerKey);assert.ok(placement.row>=previous);if(placement.status==='unmatched')assert.equal(placement.row,previous);previous=placement.row;}});
 const order1=mainArticles(laws[1])[0],rule2=mainArticles(laws[2])[1];
 assert.equal(model.assignments[1].get(order1.readerKey).row,1);
 assert.equal(model.assignments[2].get(rule2.readerKey).row,1);
});

import {buildDetailedAlignment,detailedUnits} from '../src/alignment.js';
test('項・号の三段表は全単位を保持し順序を逆転させない',()=>{
 const model=buildDetailedAlignment(laws);
 model.articles.forEach((units,i)=>{assert.equal(model.assignments[i].size,units.length);let previous=-1;for(const el of units){const placement=model.assignments[i].get(el.readerNode);assert.ok(placement.row>=previous);previous=placement.row;}});
 const lawP2=detailedUnits(laws[0]).find(u=>u.article.attr.Num==='2'&&u.el.tag==='Paragraph'&&u.el.attr.Num==='2').el;
 const order1=mainArticles(laws[1])[0];
 assert.equal(model.assignments[0].get(lawP2.readerNode).row,model.assignments[1].get(order1.readerNode).row);
 const orderItem=detailedUnits(laws[1]).find(u=>u.article.attr.Num==='1'&&u.el.tag==='Item'&&u.el.attr.Num==='1').el;
 const rule2=mainArticles(laws[2])[1];
 assert.equal(model.assignments[1].get(orderItem.readerNode).row,model.assignments[2].get(rule2.readerNode).row);
});

test('同じ条の委任先は項・号の一致と直接の委任参照を優先する',()=>{
 const entry=(key,paragraph,item,defining,node)=>({key,sourceIndex:2,upperTargets:[{paragraph,item}],relations:[{target:{paragraph,item},defining,node}]});
 const backlinks=new Map([['a',[entry('broad','2',undefined,false,'b'),entry('item1','2','1',true,'n1'),entry('item2','2','2',true,'n2'),entry('other','3','1',true,'n3')]]]);
 const exact=delegationCandidates(backlinks,{article:'a',paragraph:'2',item:'2',index:0},'環境省令');
 assert.deepEqual(exact.map(e=>e.key),['item2']);assert.equal(exact[0].destinationNode,'n2');
 assert.deepEqual(delegationCandidates(backlinks,{article:'a',paragraph:'2',index:0},'環境省令').map(e=>e.key),['broad']);
 const ambiguous=new Map([['a',[entry('one','2','2',true,'n1'),entry('two','2','2',true,'n2')]]]);
 assert.equal(delegationCandidates(ambiguous,{article:'a',paragraph:'2',item:'2',index:0},'環境省令').length,2);
});

import {citationRuns} from '../src/citations.js';
test('法令名と直後の条項を一つの参照にまとめ、末端の項まで指定する',()=>{
 const sentence=laws[2].analysis.sentenceEnvs.find(e=>e.text.includes('健康保険法（'));
 const runs=citationRuns(sentence.el.children,laws[2]);
 assert.equal(runs[0].citation,true);assert.match(runs[0].text,/健康保険法.*第三条第十一項/);
 assert.equal(runs[0].target.article,'3');assert.equal(runs[0].target.paragraph,'11');
 assert.equal(runs.map(r=>r.citation?r.text:typeof r==='string'?r:r.text()).join(''),sentence.el.text());
});

import {isFirstParagraphReference} from '../src/alignment.js';
test('条の上位対応の基準は第1項の参照とする',()=>{
 for(const law of laws.slice(1)){
  let later=0;
  for(const env of law.analysis.pointerEnvByEL.values()){
   const article=env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el;
   const paragraph=env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Paragraph')?.el;
   if(!article||!paragraph)continue;
   if(paragraph!==article.children.find(c=>c.tag==='Paragraph')){assert.equal(isFirstParagraphReference(env,article),false);later++;}
  }
  assert.ok(later>0);
 }

});

import {monotoneAnchorIndices} from '../src/alignment.js';
test('孤立した先方参照は後続の配置を引きずらない',()=>{
 assert.deepEqual([...monotoneAnchorIndices([1,2,900,3,4,5])].sort((a,b)=>a-b),[0,1,3,4,5]);
 assert.deepEqual([...monotoneAnchorIndices([1,2,900,900,3,4,5,6])].sort((a,b)=>a-b),[0,1,4,5,6,7]);
 assert.deepEqual([...monotoneAnchorIndices([1,null,100,101])].sort((a,b)=>a-b),[0,2,3]);
 assert.equal(monotoneAnchorIndices([null,null]).size,0);
});

test('条の見出しと第1項は同じ行に固定して余白の二重計上を防ぐ',()=>{
 const model=buildDetailedAlignment(laws);
 laws.forEach((law,i)=>{for(const article of mainArticles(law)){const first=article.children.find(c=>c.tag==='Paragraph');if(first)assert.equal(model.assignments[i].get(article.readerNode).row,model.assignments[i].get(first.readerNode).row);}});
});
test('飛び参照の後も通常の上位参照へ復帰でき、全条文を保持する',()=>{
 const node=(tag,num,id,children=[])=>({tag,attr:{Num:String(num)},readerNode:id,readerKey:id,children});
 const make=(num,count)=>{const articles=Array.from({length:count},(_,i)=>node('Article',i+1,`${num}a${i+1}`,[node('Paragraph',1,`${num}p${i+1}`)]));return {num,el:{children:[{tag:'LawBody',children:[{tag:'MainProvision',children:articles}]}]},analysis:{pointerEnvByEL:new Map()},articles};};
 const upper=make('law',10),lower=make('order',5);
 [1,2,10,3,4].forEach((target,i)=>{const article=lower.articles[i],paragraph=article.children[0],fragment={tag:'____PF',attr:{targetType:'Article',num:String(target)},text:()=>`第${target}条`};const container={thisOrClosest:fn=>[paragraph,article].map(el=>({el})).find(fn)};lower.analysis.pointerEnvByEL.set(i,{sentenceEnv:{container},pointer:{children:[fragment]},located:{type:'external',lawRef:{attr:{lawNum:'law'}},fqPrefixFragments:[],skipSameCount:0}});});
 const model=buildDetailedAlignment([upper,lower,null]);
 assert.equal(model.assignments[1].get(lower.articles[2].readerNode).status,'order-preserved');
 for(const [low,up]of [[3,2],[4,3]])assert.equal(model.assignments[1].get(lower.articles[low].readerNode).row,model.assignments[0].get(upper.articles[up].readerNode).row);
 assert.equal(model.assignments[1].size,10);
});


test('条番号の距離では制限せず、単調に続く大きな跳びは採用する',()=>{
 assert.deepEqual([...monotoneAnchorIndices([2,80,81,150])].sort((a,b)=>a-b),[0,1,2,3]);
 assert.deepEqual([...monotoneAnchorIndices([2,150,80,81,200])].sort((a,b)=>a-b),[0,2,3,4]);
 assert.deepEqual([...monotoneAnchorIndices([2,2,80,80,150])].sort((a,b)=>a-b),[0,1,2,3,4]);
});


test('号の細分まで外部参照を解析し、別の号の同名細分と混同しない',()=>{
 const fragment=(targetType,num,name)=>({tag:'____PF',attr:{targetType,num,name},text:()=>name});
 const env={located:{type:'external',lawRef:{attr:{lawNum:laws[0].num}},fqPrefixFragments:[],skipSameCount:0},pointer:{children:[fragment('Article','78','第七十八条'),fragment('Paragraph','1','第一項'),fragment('Item','7','第七号'),fragment('SUBITEM','1','イ')]}};
 const targets=externalTargets(env),target=targets.at(-1).target;
 assert.deepEqual(target.subitems,['1']);assert.equal(targets[2].target.subitems,undefined);
 const found=findTarget(laws[0],target);assert.equal(found.el.tag,'Subitem1');assert.match(found.el.text(),/^イ独立行政法人等/);
 assert.match(noteContext(laws[0],found.el),/第七十八条.*第1項.*第7号.*イ/);
 assert.equal(findTarget(laws[0],{...target,subitems:['99']}),null);
});
test('細分の多階層を保持し、三段表でも全細分を一度ずつ順番に配置する',()=>{
 const fragment=(targetType,num)=>({tag:'____PF',attr:{targetType,num},text:()=>num});
 const env={located:{type:'external',lawRef:{attr:{lawNum:laws[0].num}},fqPrefixFragments:[],skipSameCount:0},pointer:{children:[fragment('Article','2'),fragment('Paragraph','1'),fragment('Item','1'),fragment('SUBITEM','1'),fragment('SUBITEM','2')]}};
 const targets=externalTargets(env);assert.deepEqual(targets.at(-1).target.subitems,['1','2']);assert.deepEqual(targets.at(-2).target.subitems,['1']);
 const model=buildDetailedAlignment(laws);
 model.articles.forEach((units,i)=>{assert.ok(units.some(el=>el.tag==='Subitem1'));assert.equal(model.assignments[i].size,units.length);let previous=-1;for(const unit of units){const row=model.assignments[i].get(unit.readerNode).row;assert.ok(row>=previous);previous=row;}});
});
test('委任先の細分イ・ロは区別し、該当細分の参照を優先する',()=>{
 const entry=(key,subitems)=>({key,sourceIndex:2,relations:[{target:{paragraph:'1',item:'1',subitems},node:key,defining:true}]});
 const map=new Map([['a',[entry('i',['1']),entry('ro',['2'])]]]);
 assert.deepEqual(delegationCandidates(map,{article:'a',paragraph:'1',item:'1',subitems:['2'],index:0},'環境省令').map(r=>r.key),['ro']);
 assert.equal(delegationCandidates(map,{article:'a',paragraph:'1',item:'1',index:0},'環境省令').length,0);
});

test('下位条文の参照先が細分イなら号全体ではなくイの行に対応づける',()=>{
 const paragraph={tag:'Paragraph',attr:{Num:'1'},readerNode:'source-p',children:[]};
 const article={tag:'Article',attr:{Num:'1'},readerKey:'source-a',readerNode:'source-a',children:[paragraph]};
 const fragment=(targetType,num)=>({tag:'____PF',attr:{targetType,num},text:()=>num});
 const env={sentenceEnv:{container:{thisOrClosest:fn=>[paragraph,article].map(el=>({el})).find(fn)}},pointer:{children:[fragment('Article','78'),fragment('Paragraph','1'),fragment('Item','7'),fragment('SUBITEM','1')]},located:{type:'external',lawRef:{attr:{lawNum:laws[0].num}},fqPrefixFragments:[],skipSameCount:0}};
 const source={num:'test-order',el:{children:[{tag:'LawBody',children:[{tag:'MainProvision',children:[article]}]}]},analysis:{pointerEnvByEL:new Map([[1,env]])}};
 const model=buildDetailedAlignment([laws[0],source,null]);
 const target=findTarget(laws[0],{article:'78',paragraph:'1',item:'7',subitems:['1']}).el;
 assert.equal(model.assignments[0].get(target.readerNode).row,model.assignments[1].get(article.readerNode).row);
});
