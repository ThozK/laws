// Only these structural nodes receive data-node wrappers in the reader.
const renderedTags=new Set(['Article','Paragraph','Item','Law','Part','Chapter','Section','Subsection','Division','Appdx','AppdxTable','AppdxNote','AppdxStyle','AppdxFig','AppdxFormat','Table','TableStruct']);
export function jumpNodeCandidates(law,target){
 if(target.node===undefined||target.node===null)return [];
 let found;
 function visit(el,path=[]){
  if(!el||typeof el==='string')return;
  const next=[...path,el];
  if(String(el.readerNode)===String(target.node)){found=next;return;}
  for(const child of el.children||[]){visit(child,next);if(found)return;}
 }
 visit(law?.el);
 return (found||[]).reverse().filter(el=>renderedTags.has(el.tag)||/^Subitem\d+$/.test(el.tag)).filter(el=>el.tag!=='Law').map(el=>String(el.readerNode));
}
export function jumpElement(panel,law,target){
 const hasNode=target.node!==undefined&&target.node!==null;
 if(hasNode){
  for(const node of jumpNodeCandidates(law,target)){const element=panel.querySelector(`[data-node="${node}"]`);if(element)return element;}
 }
 if(target.articleKey!==undefined&&target.articleKey!=='')return panel.querySelector(`[data-article="${target.articleKey}"]`);
 // A missing reference must never silently navigate to the beginning of a law.
 return hasNode?null:panel.querySelector('.law');
}
