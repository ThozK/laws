export function noteStack(note){const result=[];for(let current=note;current;current=current.previousNote)result.unshift(current);return result;}
export function noteById(note,id){return noteStack(note).find(entry=>String(entry.id)===String(id))||null;}
// Keep each new sheet inside the viewport while exposing the parent sheet's edge.
export function childNotePosition(parent,viewport){
 const width=Math.min(440,viewport.width-24),right=parent.left+parent.width+12;
 const left=right+width<=viewport.width-12?right:Math.max(12,Math.min(parent.left+28,viewport.width-width-12));
 const top=Math.max(12,Math.min(parent.top+28,viewport.height-210));
 return {left,top,width,maxHeight:viewport.height-top-12};
}
