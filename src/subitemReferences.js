import {EL} from 'lawtext/dist/src/node/el/index.js';

const label=text=>(text||'').normalize('NFKC').replace(/[\s（）()]/g,'');
const subitem=el=>/^Subitem(?:[1-9]|10)$/.test(el?.tag||'');
// Resolve each named subdivision under its immediate parent, not the first
// descendant with the same numeric Num (e.g. ヌ(11) versus ル).
export function repairSubitemReferences(root,analysis){
 const parents=new Map();
 function visit(el){for(const c of el.children||[])if(typeof c!=='string'){parents.set(c,el);visit(c);}}visit(root);
 for(const env of analysis.pointerEnvByEL.values()){
  if(env.located?.type!=='internal')continue;
  let previous=null;
  for(const fragment of env.located.fragments){
   const f=fragment.fragment;
   if(f.attr.targetType==='SUBITEM'&&f.attr.relPos==='NAMED'&&previous?.length===1){
    const found=previous[0].el.children.filter(subitem).find(el=>label(el.children.find(c=>c.tag===`${el.tag}Title`)?.text())===label(f.attr.name));
    const container=found&&analysis.containersByEL.get(found);
    // Never retain a known incorrect match from a deeper subdivision.
    fragment.containers=container?[container]:[];
   }
   previous=fragment.containers;
  }
  const last=env.located.fragments.at(-1);
  if(last?.fragment.attr.targetType!=='SUBITEM'||last.containers.length!==1)continue;
  const parent=parents.get(env.pointer);if(!parent)continue;
  let index=parent.children.indexOf(env.pointer)+1,container=last.containers[0];
  while(parent.children[index]?.tag==='__Parentheses'){
   const suffix=parent.children[index],text=suffix.text();
   if(!/^[（(][０-９0-9]+[）)]$/.test(text))break;
   const found=container.el.children.filter(subitem).find(el=>label(el.children.find(c=>c.tag===`${el.tag}Title`)?.text())===label(text));
   const next=found&&analysis.containersByEL.get(found);if(!next)break;
   const f=new EL('____PF',{relPos:'NAMED',targetType:'SUBITEM',name:text,num:found.attr.Num},[text]);
   env.pointer.children.push(f);parent.children.splice(index,1);
   env.located.fragments.push({fragment:f,containers:[next]});container=next;
  }
 }
 return analysis;
}
