import {resolveLawReferences} from './resolveReferences.js';
import {parseNamedNum} from 'lawtext/dist/src/law/num.js';

export function subitemLevel(tag){const match=/^Subitem([1-9]|10)$/.exec(tag||'');return match?Number(match[1]):0;}

export function externalTargets(env){
 if(env.readerTargets)return env.readerTargets;
 const loc=env.located;if(loc?.type!=='external')return [];
 const lawNum=loc.lawRef.attr.lawNum;if(!lawNum)return [];
 const state={lawNum,title:loc.lawRef.attr.suggestedLawTitle};let supported=true;
 function apply(f){
  const type=f.attr.targetType,level=subitemLevel(type);
  if(!['Law','Article','Paragraph','Item','SUBITEM'].includes(type)&&!level){supported=false;return;}
  const num=f.attr.num||parseNamedNum(f.attr.name);
  if(type==='Article'){state.article=num;delete state.paragraph;delete state.item;delete state.subitems;}
  if(type==='Paragraph'){state.paragraph=num;delete state.item;delete state.subitems;}
  if(type==='Item'){state.item=num;delete state.subitems;}
  if(type==='SUBITEM'||level){const depth=level||(state.subitems?.length||0)+1;state.subitems=[...(state.subitems||[]).slice(0,depth-1),num];}
 }

 for(const f of loc.fqPrefixFragments.slice(0,loc.fqPrefixFragments.length-loc.skipSameCount))apply(f);
 let index=-1;
 return env.pointer.children.map(f=>{
  if(f.tag!=='____PF')return {text:f.text?.()||String(f)};
  index++;const actual=index<loc.skipSameCount?loc.fqPrefixFragments.filter(p=>p.attr.targetType===f.attr.targetType)[env.pointer.children.slice(0,index).filter(p=>p.attr?.targetType===f.attr.targetType).length]||f:f;
  apply(actual);return {text:f.text(),target:supported?{...state,...(state.subitems?{subitems:[...state.subitems]}:{})}:null};
 });
}
export function internalTargets(env){
 if(env.readerTargets||env.located?.type!=='internal')return [];
 return env.pointer.children.map(f=>{
  const containers=env.located.fragments.find(x=>x.fragment===f)?.containers||[];
  return {text:f.text?.()||String(f),target:containers.length?{node:containers[0].el.readerNode,nodes:containers.map(c=>c.el.readerNode),article:containers[0].thisOrClosest(c=>c.el.tag==='Article')?.el.readerKey,count:containers.length}:null};
 });
}
export function findTarget(law,target,indexedArticle){
 if(!target.article)return {el:law.el};
 const main=law.el.children.find(e=>e.tag==='LawBody')?.children.find(e=>e.tag==='MainProvision');
 function find(el,tag,num){if(!el)return null;if(el.tag===tag&&el.attr.Num===num)return el;for(const c of el.children||[]){if(typeof c!=='string'){const r=find(c,tag,num);if(r)return r;}}return null;}
 const article=indexedArticle||find(main,'Article',target.article);if(!article)return null;
 const paragraph=target.paragraph?find(article,'Paragraph',target.paragraph):null;
 if(target.paragraph&&!paragraph)return null;
 const item=target.item?find(paragraph||article,'Item',target.item):null;
 if(target.item&&!item)return null;
 let content=item||paragraph||article;
 if(target.subitems?.length&&!item)return null;
 for(let i=0;i<(target.subitems?.length||0);i++){content=find(content,`Subitem${i+1}`,target.subitems[i]);if(!content)return null;}
 return {el:content,articleKey:article.readerKey,article};
}
export function buildBacklinks(laws){
 laws.forEach(law=>{if(law)resolveLawReferences(law,laws);});
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
    const sourceContainer=env.sentenceEnv.container.thisOrClosest(c=>['Item','Paragraph'].includes(c.el.tag)||subitemLevel(c.el.tag)>0);
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
   for(let i=0;i<(t.subitems?.length||0);i++)if(!context.subitems?.[i]||t.subitems[i]!==context.subitems[i])return [];
   const detailScore=(t.subitems||[]).reduce((score,num,i)=>score+(num===context.subitems?.[i]?16*(i+1):0),0);
   const score=detailScore+(context.paragraph&&t.paragraph===context.paragraph?4:0)+(context.item&&t.item===context.item?8:0)+(relation.defining?2:0);
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
