export function noteStack(note){const result=[];for(let current=note;current;current=current.previousNote)result.unshift(current);return result;}
export function noteById(note,id){return noteStack(note).find(entry=>String(entry.id)===String(id))||null;}
// Place a child sheet below the clicked reference, keeping it on screen.
export function childNotePosition(parent,viewport,anchor){
 const width=Math.min(440,viewport.width-24);
 const left=Math.max(12,Math.min(anchor?.left??parent.left,viewport.width-width-12));
 const top=Math.max(12,Math.min((anchor?.bottom??parent.top+20)+8,viewport.height-100));
 return {left,top,width,maxHeight:viewport.height-top-12};
}
