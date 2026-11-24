import {parseNamedNum} from 'lawtext/dist/src/law/num.js';
import {EL} from 'lawtext/dist/src/node/el/index.js';

const label=text=>(text||'').normalize('NFKC').replace(/[\s（）()]/g,'');
const subitem=el=>/^Subitem(?:[1-9]|10)$/.test(el?.tag||'');
// Resolve each named subdivision under its immediate parent, not the first
// descendant with the same numeric Num (e.g. ヌ(11) versus ル).
export function repairSubitemReferences(root,analysis){
 const parents=new Map();
 function visit(el){for(const c of el.children||[])if(typeof c!=='string'){parents.set(c,el);visit(c);}}visit(root);
 for(const env of analysis.pointerEnvByEL.values()){
  if(!['internal','external'].includes(env.located?.type))continue;
  let previous=null;
  for(const fragment of env.located.fragments||[]){
   const f=fragment.fragment;
   if(f.attr.targetType==='SUBITEM'&&f.attr.relPos==='NAMED'&&previous?.length===1){
    const found=previous[0].el.children.filter(subitem).find(el=>label(el.children.find(c=>c.tag===`${el.tag}Title`)?.text())===label(f.attr.name));
    const container=found&&analysis.containersByEL.get(found);
    // Never retain a known incorrect match from a deeper subdivision.
    fragment.containers=container?[container]:[];
   }
   previous=fragment.containers;
  }
  const last=env.located.fragments?.at(-1);
  const external=env.located.type==='external';
  if(external?!env.pointer.children.some(c=>c.attr?.targetType==='SUBITEM'):last?.fragment.attr.targetType!=='SUBITEM'||last.containers.length!==1)continue;
  let container=last?.containers[0];
  function nextSuffix(){
   let node=env.pointer;
   for(let parent=parents.get(node);parent;parent=parents.get(node)){
    const index=parent.children.indexOf(node);
    if(parent.children[index+1]?.tag==='__Parentheses')return {parent,index:index+1,suffix:parent.children[index+1]};
    if(index!==parent.children.length-1||!['____PointerRange','____PointerRanges'].includes(parent.tag))return null;
    node=parent;
   }
   return null;
  }
  for(let candidate=nextSuffix();candidate;candidate=nextSuffix()){
   const {parent,index,suffix}=candidate,text=suffix.text();
   if(!/^[（(](?:[０-９0-9]+|[ァ-ヶ])[）)]$/.test(text))break;
   const found=container?.el.children.filter(subitem).find(el=>label(el.children.find(c=>c.tag===`${el.tag}Title`)?.text())===label(text));
   const next=found&&analysis.containersByEL.get(found);
   if(!external&&!next)break;
   const num=found?.attr.Num||parseNamedNum(label(text));if(!num)break;
   const f=new EL('____PF',{relPos:'NAMED',targetType:'SUBITEM',name:text,num},[text]);
   env.pointer.children.push(f);parent.children.splice(index,1);
   // A kana suffix may already contain its own pointer; it is now part of
   // the complete citation, so it must not create a second unrelated target.
   function removePointers(el){if(el.tag==='____Pointer')analysis.pointerEnvByEL.delete(el);for(const c of el.children||[])if(typeof c!=='string')removePointers(c);}removePointers(suffix);
   if(!external)env.located.fragments.push({fragment:f,containers:[next]});container=next;
  }
 }
 return analysis;
}
