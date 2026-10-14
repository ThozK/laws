import {parseNamedNum} from 'lawtext/dist/src/law/num.js';

export function externalTargets(env){
 const loc=env.located;if(loc?.type!=='external')return [];
 const lawNum=loc.lawRef.attr.lawNum;if(!lawNum)return [];
 const state={lawNum,title:loc.lawRef.attr.suggestedLawTitle};let supported=true;
 function apply(f){const type=f.attr.targetType;if(!['Law','Article','Paragraph','Item'].includes(type)){supported=false;return;}if(type==='Article'){state.article=f.attr.num||parseNamedNum(f.attr.name);delete state.paragraph;delete state.item;}if(type==='Paragraph'){state.paragraph=f.attr.num||parseNamedNum(f.attr.name);delete state.item;}if(type==='Item')state.item=f.attr.num||parseNamedNum(f.attr.name);}
 for(const f of loc.fqPrefixFragments.slice(0,loc.fqPrefixFragments.length-loc.skipSameCount))apply(f);
 let index=-1;
 return env.pointer.children.map(f=>{
  if(f.tag!=='____PF')return {text:f.text?.()||String(f)};
  index++;const actual=index<loc.skipSameCount?loc.fqPrefixFragments.find(p=>p.attr.targetType===f.attr.targetType)||f:f;
  apply(actual);return {text:f.text(),target:supported?{...state}:null};
 });
}
export function internalTargets(env){
 if(env.located?.type!=='internal')return [];
 return env.pointer.children.map(f=>{
  const containers=env.located.fragments.find(x=>x.fragment===f)?.containers||[];
  return {text:f.text?.()||String(f),target:containers.length?{node:containers[0].el.readerNode,nodes:containers.map(c=>c.el.readerNode),article:containers[0].thisOrClosest(c=>c.el.tag==='Article')?.el.readerKey,count:containers.length}:null};
 });
}
export function findTarget(law,target){
 if(!target.article)return {el:law.el};
 const main=law.el.children.find(e=>e.tag==='LawBody')?.children.find(e=>e.tag==='MainProvision');
 function find(el,tag,num){if(!el)return null;if(el.tag===tag&&el.attr.Num===num)return el;for(const c of el.children||[]){if(typeof c!=='string'){const r=find(c,tag,num);if(r)return r;}}return null;}
 const article=find(main,'Article',target.article);if(!article)return null;
 const paragraph=target.paragraph?find(article,'Paragraph',target.paragraph):null;
 if(target.paragraph&&!paragraph)return null;
 const item=target.item?find(paragraph||article,'Item',target.item):null;
 if(target.item&&!item)return null;
 return {el:item||paragraph||article,articleKey:article.readerKey,article};
}
export function buildBacklinks(laws){
 const maps=laws.map(()=>new Map());
 laws.forEach((source,sourceIndex)=>{
  if(!source?.analysis)return;
  for(const env of source.analysis.pointerEnvByEL.values()){
   const sourceArticle=env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el;
   if(!sourceArticle)continue;
   for(const {target} of externalTargets(env).filter(t=>t.target).slice(-1)){
    if(!target?.article)continue;
    const targetIndex=laws.findIndex(l=>l?.num===target.lawNum);if(targetIndex<0||targetIndex===sourceIndex)continue;
    const located=findTarget(laws[targetIndex],{article:target.article});if(!located)continue;
    const list=maps[targetIndex].get(located.articleKey)||[];
    let entry=list.find(x=>x.sourceIndex===sourceIndex&&x.key===sourceArticle.readerKey);if(!entry){entry={sourceIndex,key:sourceArticle.readerKey,label:source.articles.find(a=>a.key===sourceArticle.readerKey)?.label,upperTargets:[],relations:[]};list.push(entry);}entry.upperTargets.push(target);
    const sourceContainer=env.sentenceEnv.container.thisOrClosest(c=>['Item','Paragraph'].includes(c.el.tag));
    const sentence=env.sentenceEnv.text,tail=sentence.slice(sentence.indexOf(env.pointer.text())+env.pointer.text().length);
    const defining=/^の(?:[^。]{0,55})(?:で定める|に規定する|の規定による)/.test(tail);
    entry.relations.push({target,node:sourceContainer?.el.readerNode,defining});
    maps[targetIndex].set(located.articleKey,list);
   }
  }
 });return maps;
}

export function delegationCandidates(backlinks,context,word){
 const wanted=word==='政令'?1:2;
 const ranked=(backlinks.get(context.article)||[]).filter(r=>r.sourceIndex===wanted&&r.sourceIndex>context.index).flatMap(r=>{
  const relations=r.relations||r.upperTargets.map(target=>({target}));
  const matches=relations.flatMap(relation=>{
   const t=relation.target;
   if(context.paragraph&&t.paragraph&&t.paragraph!==context.paragraph)return [];
   if(context.item&&t.item&&t.item!==context.item)return [];
   // A delegation outside an item must not resolve to a different item's reference.
   if(!context.item&&t.item)return [];
   const score=(context.paragraph&&t.paragraph===context.paragraph?4:0)+(context.item&&t.item===context.item?8:0)+(relation.defining?2:0);
   return [{...relation,score}];
  });
  if(!matches.length)return [];
  const best=Math.max(...matches.map(m=>m.score));const exact=matches.filter(m=>m.score===best);
  return [{...r,score:best,destinationNode:exact.length===1?exact[0].node:undefined}];
 });
 const best=Math.max(-1,...ranked.map(r=>r.score));
 return ranked.filter(r=>r.score===best);
}
export const delegationWords=/(政令|(?:[一-龥]{0,16})省令|(?:[一-龥]{0,16})規則)(?=で(?:定め|示|規定))/g;
