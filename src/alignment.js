import {externalTargets} from './references.js';
export function mainArticles(law){
 const main=law?.el.children.find(e=>e.tag==='LawBody')?.children.find(e=>e.tag==='MainProvision');
 const result=[];function visit(el){if(el.tag==='Article')result.push(el);for(const c of el.children||[])if(typeof c!=='string')visit(c);}if(main)visit(main);return result;
}
export function isFirstParagraphReference(env,article){
 const paragraph=env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Paragraph')?.el;
 const first=article.children.find(c=>c.tag==='Paragraph');
 return !!paragraph&&paragraph===first;
}
export function buildAlignment(laws){
 const articles=laws.map(mainArticles),assignments=articles.map(()=>new Map());
 articles[0].forEach((el,row)=>assignments[0].set(el.readerKey,{row,status:'root'}));
 for(let level=1;level<3;level++){
  let previous=0;
  for(const article of articles[level]){
   const candidates=[];
   for(const env of laws[level].analysis.pointerEnvByEL.values()){
    if(env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el!==article||!isFirstParagraphReference(env,article))continue;
    if(env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Item'))continue;
    const target=externalTargets(env).filter(t=>t.target).at(-1)?.target;if(!target?.article)continue;
    const parentLevel=laws.findIndex(l=>l?.num===target.lawNum);if(parentLevel<0||parentLevel>=level)continue;
    const parent=articles[parentLevel].find(a=>a.attr.Num===target.article),assignment=assignments[parentLevel].get(parent?.readerKey);
    if(assignment)candidates.push({row:assignment.row,parentLevel,article:target.article});
   }
   // First resolvable reference is the initial candidate; keep all alternatives for inspection.
   const candidate=candidates[0];const row=Math.max(previous,candidate?.row??previous);
   assignments[level].set(article.readerKey,{row,status:!candidate?'unmatched':candidate.row<previous?'order-preserved':'linked',candidates});previous=row;
  }
 }
 return {articles,assignments};
}
export function clearAlignment(panes){for(const pane of panes)if(pane)pane.style.paddingBottom='';for(const pane of panes)for(const section of pane?.querySelectorAll('[data-alignment-row]')||[]){section.style.marginTop='';delete section.dataset.alignmentRow;delete section.dataset.alignmentStatus;}}
export function alignArticleRows(panes,model){
 clearAlignment(panes);
 const rowColumns=new Map();model.assignments.forEach((map,i)=>{for(const placement of map.values()){const columns=rowColumns.get(placement.row)||new Set();columns.add(i);rowColumns.set(placement.row,columns);}});
 // Set every structural attribute before measuring: no layout reads inside the write pass.
 const groups=panes.map((pane,i)=>{
  const rows=new Map();if(!pane||!pane.clientHeight)return rows;let previousRow=null;
  const nodes=new Map([...pane.querySelectorAll(model.unitMode?'[data-node]':'section[data-article]')].map(node=>[model.unitMode?node.dataset.node:node.dataset.article,node]));
  for(const unit of model.articles[i]){
   const key=model.unitMode?unit.readerNode:unit.readerKey,node=nodes.get(key),assignment=model.assignments[i].get(key);if(!node||!assignment)continue;
   const continued=model.unitMode&&['unmatched','order-preserved'].includes(assignment.status)&&rowColumns.get(assignment.row)?.size===1&&previousRow!==null;
   const row=continued?previousRow:assignment.row;node.dataset.alignmentRow=String(row);node.dataset.alignmentStatus=assignment.status;
   const list=rows.get(row)||[];list.push(node);rows.set(row,list);previousRow=row;
  }
  return rows;
 });
 // One measurement pass, then calculate all whitespace in memory and write it together.
 const measured=groups.map((rows,i)=>{
  const pane=panes[i];if(!pane||!rows.size)return new Map();
  const origin=pane.getBoundingClientRect().top-pane.scrollTop;
  const entries=[...rows].map(([row,nodes])=>{const node=nodes[0],baseline=model.unitMode?(node.querySelector('.paragraph-item-main')||node):node;return {row,node,start:baseline.getBoundingClientRect().top-origin,last:nodes.at(-1)};});
  entries.forEach((entry,j)=>{entry.height=Math.max(0,(entries[j+1]?.start??entry.last.getBoundingClientRect().bottom-origin)-entry.start);});return new Map(entries.map(e=>[e.row,e]));
 });
 const rowIds=[...new Set(measured.flatMap(g=>[...g.keys()]))].sort((a,b)=>a-b),added=[0,0,0],writes=[];
 let cursor=0;
 for(const row of rowIds){const entries=measured.map(g=>g.get(row)),top=Math.max(cursor,...entries.map((e,i)=>e?e.start+added[i]:0));
  entries.forEach((entry,i)=>{if(!entry)return;const gap=Math.max(0,top-entry.start-added[i]);writes.push([entry.node,gap]);added[i]+=gap;});cursor=top+Math.max(0,...entries.map(e=>e?.height||0));
 }
 for(const [node,gap] of writes)if(gap>.1)node.style.marginTop=`${gap}px`;
 const sizes=panes.map(pane=>pane?.clientHeight?{pane,height:pane.scrollHeight,padding:parseFloat(getComputedStyle(pane).paddingBottom)}:null),end=Math.max(0,...sizes.map(s=>s?.height||0));
 for(const size of sizes)if(size)size.pane.style.paddingBottom=`${size.padding+end-size.height}px`;
}

export function detailedUnits(law){
 const units=[];function visit(el,article){if(el.tag==='Article')article=el; if(['Article','Paragraph','Item'].includes(el.tag))units.push({el,article});for(const c of el.children||[])if(typeof c!=='string')visit(c,article);}for(const article of mainArticles(law))visit(article,article);return units;
}
// Keep the largest order-consistent set of article anchors. An isolated future
// cross-reference cannot advance the placement cursor for every following article.
export function monotoneAnchorIndices(values){
 const tails=[],tailIndices=[],parents=new Map();
 values.forEach((value,index)=>{if(value===null||value===undefined)return;let lo=0,hi=tails.length;while(lo<hi){const mid=(lo+hi)>>1;if(tails[mid]<=value)lo=mid+1;else hi=mid;}parents.set(index,lo?tailIndices[lo-1]:-1);tails[lo]=value;tailIndices[lo]=index;});
 const selected=new Set();let index=tailIndices.at(-1);while(index!==undefined&&index!==-1){selected.add(index);index=parents.get(index);}return selected;
}
export function buildDetailedAlignment(laws){
 const units=laws.map(detailedUnits),maps=units.map(()=>new Map()),rows=[];
 const articleLists=laws.map(mainArticles),articleNumbers=articleLists.map(list=>new Map(list.map(a=>[a.attr.Num,a])));
 const addAfter=previous=>{const row={};rows.splice(previous?rows.indexOf(previous)+1:0,0,row);return row;};
 for(const unit of units[0]){const heading=unit.el.tag==='Paragraph'&&unit.el===unit.article.children.find(c=>c.tag==='Paragraph')?maps[0].get(unit.article.readerNode)?.row:null;const row=heading||{};if(!heading)rows.push(row);maps[0].set(unit.el.readerNode,{row,status:'root'});}
 for(let level=1;level<3;level++){
  const refsByUnit=new Map();
  function add(el,row){if(!el||!row)return;const refs=refsByUnit.get(el)||[];if(!refs.includes(row))refs.push(row);refsByUnit.set(el,refs);}
  for(const env of laws[level]?.analysis.pointerEnvByEL.values()||[]){
   const container=env.sentenceEnv.container,article=container.thisOrClosest(c=>c.el.tag==='Article')?.el;if(!article)continue;
   const paragraph=container.thisOrClosest(c=>c.el.tag==='Paragraph')?.el,item=container.thisOrClosest(c=>c.el.tag==='Item')?.el;
   const target=externalTargets(env).filter(t=>t.target).at(-1)?.target;if(!target?.article)continue;
   const parentLevel=laws.findIndex(l=>l?.num===target.lawNum);if(parentLevel<0||parentLevel>=level)continue;
   const parentArticle=articleNumbers[parentLevel].get(target.article);if(!parentArticle)continue;
   function find(node,tag,num){if(node.tag===tag&&node.attr.Num===num)return node;for(const c of node.children||[])if(typeof c!=='string'){const found=find(c,tag,num);if(found)return found;}return null;}
   const parentParagraph=target.paragraph?find(parentArticle,'Paragraph',target.paragraph):null;
   const parentItem=target.item?find(parentParagraph||parentArticle,'Item',target.item):null;
   if(target.paragraph&&!parentParagraph||target.item&&!parentItem)continue;
   const row=maps[parentLevel].get((parentItem||parentParagraph||parentArticle).readerNode)?.row;
   if(isFirstParagraphReference(env,article)&&!item)add(article,row);
   if(item)add(item,row);else add(paragraph,row);
  }
  const articles=articleLists[level],ranks=new Map(rows.map((row,i)=>[row,i]));
  const proposals=articles.map(a=>refsByUnit.get(a)?.[0]||null),accepted=monotoneAnchorIndices(proposals.map(row=>row?ranks.get(row):null));
  const bounds=new Map();let before=null;
  articles.forEach((article,index)=>{let after=null;for(let j=index+1;j<articles.length;j++)if(accepted.has(j)){after=proposals[j];break;}bounds.set(article,{before,after,accepted:accepted.has(index)});if(accepted.has(index))before=proposals[index];});
  let previous=null;
  for(const {el,article} of units[level]){
   const bound=bounds.get(article),candidates=refsByUnit.get(el)||[];
   const minimum=Math.max(previous?rows.indexOf(previous):-1,bound.before?rows.indexOf(bound.before):-1),maximum=bound.after?rows.indexOf(bound.after):Infinity;
   const targetRow=(el.tag!=='Article'||bound.accepted)?candidates.find(row=>rows.indexOf(row)>=minimum&&rows.indexOf(row)<=maximum):null;
   let row=el.tag==='Paragraph'&&el===article.children.find(c=>c.tag==='Paragraph')?maps[level].get(article.readerNode)?.row:targetRow;
   if(!row)row=addAfter(previous);
   maps[level].set(el.readerNode,{row,status:targetRow?'linked':candidates.length?'order-preserved':'unmatched'});previous=row;
  }
 }
 const ranks=new Map(rows.map((row,i)=>[row,i]));
 const assignments=maps.map(map=>new Map([...map].map(([key,value])=>[key,{...value,row:ranks.get(value.row)}])));
 return {unitMode:true,articles:units.map(list=>list.map(u=>u.el)),assignments};
}
