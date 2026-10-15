import {externalTargets} from './references.js';
// Combine only one unambiguous adjacent citation; lists/ranges retain their individual targets.
export function citationRuns(els,law){
 const result=[];
 for(let i=0;i<els.length;i++){
  const name=els[i],range=els[i+1];
  if(name&&typeof name!=='string'&&['____LawRef','____VarRef','____LawNum'].includes(name.tag)&&range?.tag==='____PointerRanges'){
   const pointers=[];function visit(el){if(el.tag==='____Pointer')pointers.push(el);for(const c of el.children||[])if(typeof c!=='string')visit(c);}visit(range);
   if(pointers.length===1){const env=law?.analysis.pointerEnvByEL.get(pointers[0]),target=externalTargets(env||{}).filter(t=>t.target).at(-1)?.target;
    if(target?.article&&(!name.attr.lawNum||name.attr.lawNum===target.lawNum)){result.push({citation:true,text:name.text()+range.text(),target});i++;continue;}
   }
  }
  result.push(name);
 }
 return result;
}
