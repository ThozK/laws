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
    let entry=list.find(x=>x.sourceIndex===sourceIndex&&x.key===sourceArticle.readerKey);if(!entry){entry={sourceIndex,key:sourceArticle.readerKey,label:source.articles.find(a=>a.key===sourceArticle.readerKey)?.label,upperTargets:[]};list.push(entry);}entry.upperTargets.push(target);
    maps[targetIndex].set(located.articleKey,list);
   }
  }
 });return maps;
}

export function delegationCandidates(backlinks,context,word){
 const wanted=word==='政令'?1:2;
 return (backlinks.get(context.article)||[]).filter(r=>r.sourceIndex===wanted&&r.sourceIndex>context.index&&r.upperTargets.some(t=>(!context.paragraph||t.paragraph===context.paragraph)&&(!t.item||t.item===context.item)));
}
export const delegationWords=/(政令|(?:[一-龥]{0,16})省令|(?:[一-龥]{0,16})規則)(?=で(?:定め|示|規定))/g;
