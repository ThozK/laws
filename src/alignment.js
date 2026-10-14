import {externalTargets} from './references.js';
export function mainArticles(law){
 const main=law?.el.children.find(e=>e.tag==='LawBody')?.children.find(e=>e.tag==='MainProvision');
 const result=[];function visit(el){if(el.tag==='Article')result.push(el);for(const c of el.children||[])if(typeof c!=='string')visit(c);}if(main)visit(main);return result;
}
export function buildAlignment(laws){
 const articles=laws.map(mainArticles),assignments=articles.map(()=>new Map());
 articles[0].forEach((el,row)=>assignments[0].set(el.readerKey,{row,status:'root'}));
 for(let level=1;level<3;level++){
  let previous=0;
  for(const article of articles[level]){
   const candidates=[];
   for(const env of laws[level].analysis.pointerEnvByEL.values()){
    if(env.sentenceEnv.container.thisOrClosest(c=>c.el.tag==='Article')?.el!==article)continue;
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
 const groups=panes.map((pane,i)=>{
  const rows=new Map();if(!pane)return rows;let previousRow=null;
  for(const article of model.articles[i]){
   const section=model.unitMode?pane.querySelector(`[data-node="${article.readerNode}"]`):pane.querySelector(`section[data-article="${article.readerKey}"]`),assignment=model.assignments[i].get(model.unitMode?article.readerNode:article.readerKey);if(!section||!assignment)continue;
   // A unit without a cross-column match flows directly after the preceding text.
   const continued=model.unitMode&&['unmatched','order-preserved'].includes(assignment.status)&&rowColumns.get(assignment.row)?.size===1&&previousRow!==null;
   const row=continued?previousRow:assignment.row;
   section.dataset.alignmentRow=String(row);section.dataset.alignmentStatus=assignment.status;
   const list=rows.get(row)||[];list.push(section);rows.set(row,list);previousRow=row;
  }
  const entries=[...rows].map(([row,nodes])=>({row,nodes,start:nodes[0].getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop}));
  entries.forEach((entry,j)=>{const last=entry.nodes.at(-1);entry.height=(entries[j+1]?.start??(last.getBoundingClientRect().bottom-pane.getBoundingClientRect().top+pane.scrollTop))-entry.start;});return new Map(entries.map(e=>[e.row,e]));
 });
 const rowIds=[...new Set(groups.flatMap(g=>[...g.keys()]))].sort((a,b)=>a-b);
 let cursor=Math.max(0,...groups.map(g=>g.values().next().value?.start||0));const added=[0,0,0];
 for(const row of rowIds){const entries=groups.map(g=>g.get(row));for(let i=0;i<3;i++){const entry=entries[i];if(!entry)continue;const gap=Math.max(0,cursor-entry.start-added[i]);entry.nodes[0].style.marginTop=`${gap}px`;added[i]+=gap;}cursor+=Math.max(0,...entries.map(e=>e?.height||0))+24;}
 // Nested paragraph/item boxes can introduce local offsets; reconcile their actual starts.
 if(model.unitMode)for(const row of rowIds){
  const entries=groups.map((group,i)=>{const node=group.get(row)?.nodes[0];const baseline=node?.querySelector('.paragraph-item-main')||node;return node?{node,top:baseline.getBoundingClientRect().top-panes[i].getBoundingClientRect().top+panes[i].scrollTop}:null;}).filter(Boolean);
  const top=Math.max(...entries.map(e=>e.top));for(const entry of entries)if(top-entry.top>.5)entry.node.style.marginTop=`${parseFloat(entry.node.style.marginTop||0)+top-entry.top}px`;
 }
 const end=Math.max(...panes.filter(Boolean).map(p=>p.scrollHeight));for(const pane of panes)if(pane){const padding=parseFloat(getComputedStyle(pane).paddingBottom);pane.style.paddingBottom=`${padding+end-pane.scrollHeight}px`;}
}

export function detailedUnits(law){
 const units=[];function visit(el,article){if(el.tag==='Article')article=el; if(['Article','Paragraph','Item'].includes(el.tag))units.push({el,article});for(const c of el.children||[])if(typeof c!=='string')visit(c,article);}for(const article of mainArticles(law))visit(article,article);return units;
}
export function buildDetailedAlignment(laws){
 const units=laws.map(detailedUnits),maps=units.map(()=>new Map()),rows=[];
 const addAfter=previous=>{const row={};rows.splice(previous?rows.indexOf(previous)+1:0,0,row);return row;};
 for(const unit of units[0]){const row={};rows.push(row);maps[0].set(unit.el.readerNode,{row,status:'root'});}
 for(let level=1;level<3;level++){
  let previous=null;
  for(const {el,article} of units[level]){
   let targetRow=null;
   for(const env of laws[level].analysis.pointerEnvByEL.values()){
    const container=env.sentenceEnv.container;
    if(container.thisOrClosest(c=>c.el.tag==='Article')?.el!==article)continue;
    if(el.tag!=='Article'&&container.thisOrClosest(c=>c.el.tag===el.tag)?.el!==el)continue;
    if(el.tag==='Paragraph'&&container.thisOrClosest(c=>c.el.tag==='Item'))continue;
    const target=externalTargets(env).filter(t=>t.target).at(-1)?.target;if(!target?.article)continue;
    const parentLevel=laws.findIndex(l=>l?.num===target.lawNum);if(parentLevel<0||parentLevel>=level)continue;
    const parentArticle=mainArticles(laws[parentLevel]).find(a=>a.attr.Num===target.article);if(!parentArticle)continue;
    function find(node,tag,num){if(node.tag===tag&&node.attr.Num===num)return node;for(const c of node.children||[])if(typeof c!=='string'){const found=find(c,tag,num);if(found)return found;}return null;}
    const paragraph=target.paragraph?find(parentArticle,'Paragraph',target.paragraph):null;
    const item=target.item?find(paragraph||parentArticle,'Item',target.item):null;
    const parent=item||paragraph||parentArticle;
    targetRow=maps[parentLevel].get(parent.readerNode)?.row;if(targetRow)break;
   }
   const backwards=targetRow&&previous&&rows.indexOf(targetRow)<rows.indexOf(previous);
   let row=backwards?null:targetRow;
   // Keep the first paragraph beside its article heading when no separate relation exists.
   if(!row&&!backwards&&el.tag==='Paragraph'&&el.attr.Num==='1')row=maps[level].get(article.readerNode)?.row;
   if(!row)row=addAfter(previous);
   maps[level].set(el.readerNode,{row,status:backwards?'order-preserved':targetRow?'linked':'unmatched'});previous=row;
  }
 }
 const assignments=maps.map(map=>new Map([...map].map(([key,value])=>[key,{...value,row:rows.indexOf(value.row)}])));
 return {unitMode:true,articles:units.map(list=>list.map(u=>u.el)),assignments};
}
