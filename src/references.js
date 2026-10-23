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
// Inspect only this delegation, never a later delegation in the same sentence.
export function delegationClause(text){const value=text||'';const first=value.search(/で(?:定め|示|規定)/);if(first<0)return value.split('。')[0];const tail=value.slice(first+2),next=tail.search(/(?:政令|省令|規則)で(?:定め|示|規定)/);return (next<0?value:value.slice(0,first+2+next)).split('。')[0];}
export function delegationSubject(text){const clause=delegationClause(text),head=clause.split(/[、。]/)[0];if(/で定めるところ/.test(head)||/^(?:本文|ただし書)?の規定による(?:届出|申請|報告|通知)/.test(head))return 'procedure';return head.match(/で定める(?:べき)?(事項|基準|業務|方法|数値|種類|要件|期間|措置|もの)/)?.[1]||null;}
export function delegationPurpose(text){const clause=delegationClause(text);return clause.match(/(?:による|に関する)(報告|通知|届出|申請)/)?.[1]||clause.match(/(報告|通知|届出|申請)(?:し|した|する|を)/)?.[1]||null;}
export function delegationScope(text){return /^(?:ただし[、，]?|ただし書)/.test(text||'')?'proviso':/^本文/.test(text||'')?'main':null;}
export function buildBacklinks(laws){
 laws.forEach(law=>{if(law)resolveLawReferences(law,laws);});
 const maps=laws.map(()=>new Map());
 laws.forEach((source,sourceIndex)=>{
  if(!source?.analysis)return;
  const main=source.el.children.find(c=>c.tag==='LawBody')?.children.find(c=>c.tag==='MainProvision'),mainArticles=new Set();function collect(el){if(el.tag==='Article')mainArticles.add(el);for(const c of el.children||[])if(typeof c!=='string')collect(c);}if(main)collect(main);
  for(const env of source.analysis.pointerEnvByEL.values()){
   const sourceArticle=env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el;
   if(!sourceArticle)continue;
   for(const {target} of externalTargets(env).filter(t=>t.target).slice(-1)){
    if(!target?.article)continue;
    const targetIndex=laws.findIndex(l=>l?.num===target.lawNum);if(targetIndex<0||targetIndex===sourceIndex)continue;
    const located=findTarget(laws[targetIndex],{article:target.article});if(!located)continue;
    const list=maps[targetIndex].get(located.articleKey)||[];
    let entry=list.find(x=>x.sourceIndex===sourceIndex&&x.key===sourceArticle.readerKey);if(!entry){entry={sourceIndex,key:sourceArticle.readerKey,label:source.articles.find(a=>a.key===sourceArticle.readerKey)?.label,mainProvision:mainArticles.has(sourceArticle),upperTargets:[],relations:[]};list.push(entry);}entry.upperTargets.push(target);
    const sourceContainer=env.sentenceEnv.container.thisOrClosest(c=>['Item','Paragraph'].includes(c.el.tag)||subitemLevel(c.el.tag)>0);
    const sentence=env.sentenceEnv.text,tail=sentence.slice(sentence.indexOf(env.pointer.text())+env.pointer.text().length);
    const defining=/^の(?:[^。]{0,55})(?:で定める|に規定する|の規定による)/.test(tail);
    entry.relations.push({target,node:sourceContainer?.el.readerNode,defining,subject:delegationSubject(tail),purpose:delegationPurpose(tail),scope:delegationScope(tail)});
    maps[targetIndex].set(located.articleKey,list);
   }
  }
 });return maps;
}

export function delegationCandidates(backlinks,context,word){
 const wanted=word==='政令'?1:2;
 const ranked=(backlinks.get(context.article)||[]).filter(r=>r.sourceIndex===wanted&&r.sourceIndex>context.index&&r.mainProvision!==false).flatMap(r=>{
  const relations=r.relations||r.upperTargets.map(target=>({target}));
  const matches=relations.flatMap(relation=>{
   const t=relation.target,subject=context.structuralOnly?null:delegationSubject(context.delegationText),purpose=context.structuralOnly?null:delegationPurpose(context.delegationText),scope=context.structuralOnly?null:delegationScope(context.delegationBefore);
   if(subject&&relation.subject&&subject!==relation.subject)return [];
   if(purpose&&relation.purpose&&purpose!==relation.purpose)return [];
   if(scope&&relation.scope&&scope!==relation.scope)return [];
   if(context.paragraph&&t.paragraph&&t.paragraph!==context.paragraph)return [];
   if(context.item&&t.item&&t.item!==context.item)return [];
   // A delegation outside an item must not resolve to a different item's reference.
   if(!context.item&&t.item)return [];
   for(let i=0;i<(t.subitems?.length||0);i++)if(!context.subitems?.[i]||t.subitems[i]!==context.subitems[i])return [];
   const detailScore=(t.subitems||[]).reduce((score,num,i)=>score+(num===context.subitems?.[i]?16*(i+1):0),0);
   const score=(purpose&&relation.purpose===purpose?64:0)+(scope&&relation.scope===scope?16:0)+(subject&&relation.subject===subject?32:0)+detailScore+(context.paragraph&&t.paragraph===context.paragraph?4:0)+(context.item&&t.item===context.item?8:0)+(!context.structuralOnly&&!context.delegationText&&relation.defining?2:0);
   return [{...relation,score}];
  });
  if(!matches.length)return [];
  const best=Math.max(...matches.map(m=>m.score));const exact=matches.filter(m=>m.score===best);
  return [{...r,score:best,destinationNode:exact.length===1?exact[0].node:undefined}];
 });
 const best=Math.max(-1,...ranked.map(r=>r.score));
 const winners=ranked.filter(r=>r.score===best);
 if(!context.structuralOnly&&context.delegationText&&winners.length>1&&!delegationPurpose(context.delegationText))return delegationCandidates(backlinks,{...context,structuralOnly:true},word);
 return winners;
}
export const delegationWords=/(政令|(?:[一-龥]{0,16})省令|(?:[一-龥]{0,16})規則)(?=で(?:定め|示|規定))/g;
