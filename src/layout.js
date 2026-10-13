export function validWeights(weights){return Array.isArray(weights)&&weights.length===3&&weights.every(v=>v===1||v===2)&&weights.filter(v=>v===2).length<=1;}
export function toggleColumnWidth(weights,index){return [0,1,2].map(i=>i===index&&weights[index]!==2?2:1);}
export function captureReadingAnchor(panel){
 if(!panel?.clientHeight)return null;
 const top=panel.getBoundingClientRect().top,line=top+20;
 const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT);
 let node;while((node=walker.nextNode())){
  if(!node.textContent.trim())continue;
  const range=document.createRange();range.selectNodeContents(node);
  if(![...range.getClientRects()].some(r=>r.height>0&&r.bottom>line&&r.top<top+panel.clientHeight))continue;
  let low=0,high=node.length-1;
  while(low<high){const middle=Math.floor((low+high)/2);range.setStart(node,middle);range.setEnd(node,middle+1);if(range.getBoundingClientRect().bottom>line)high=middle;else low=middle+1;}
  range.setStart(node,low);range.setEnd(node,Math.min(low+1,node.length));
  return {node,offset:low,pixelOffset:range.getBoundingClientRect().top-top,scrollTop:panel.scrollTop};
 }
 return {scrollTop:panel.scrollTop};
}
export function restoreReadingAnchor(panel,anchor){
 if(!panel||!anchor)return;
 if(!anchor.node?.isConnected){panel.scrollTop=anchor.scrollTop;return;}
 const range=document.createRange();range.setStart(anchor.node,anchor.offset);range.setEnd(anchor.node,Math.min(anchor.offset+1,anchor.node.length));
 panel.scrollTop+=range.getBoundingClientRect().top-panel.getBoundingClientRect().top-anchor.pixelOffset;
}
