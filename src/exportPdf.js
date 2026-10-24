import {buildDetailedAlignment} from './alignment.js';
import {unitText} from './exportText.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['法律','施行令','施行規則'];
export const PDF_TYPE={fontPt:9,linePt:12.6,letterPt:.15,columns:40,bandMm:90,textMm:87.5};
// Keep a structural paragraph for each number, with a full-width separator.
export function pdfUnit(el){
 const depth=el.tag==='Item'?1:/^Subitem(\d+)$/.test(el.tag)?Number(el.tag.slice(7))+1:0;
 const title=el.children?.find(c=>/^(?:ArticleTitle|ParagraphNum|ItemTitle|Subitem\d+Title)$/.test(c.tag));
 const caption=el.children?.find(c=>c.tag==='ArticleCaption');
 const own=unitText(el),prefix=(caption?.text()||'')+(title?.text()||'');
 const body=own.slice(prefix.length);
 return {text:(caption?.text()||'')+(title?.text()||'')+(title?.text()&&body?'　':'')+body,depth,bold:el.tag==='Article'};
}
export function pdfRows(laws){
 const model=buildDetailedAlignment(laws),rows=new Map(),headings=new Map();
 function first(el){if(el.tag==='Article')return el;for(const c of el.children||[])if(typeof c!=='string'){const a=first(c);if(a)return a;}}
 function groups(el){const heading=el.children?.find(c=>/^(Part|Chapter|Section|Subsection|Division)Title$/.test(c.tag));if(heading){const article=first(el);if(article)headings.set(article,[...(headings.get(article)||[]),{text:heading.text(),depth:0,bold:true}]);}for(const c of el.children||[])if(typeof c!=='string')groups(c);}
 for(const law of laws.filter(Boolean))groups(law.el);
 const firstTitles=new Map(),captionedParagraphs=new Set();
 model.articles.forEach((units,i)=>{for(const el of units){const row=model.assignments[i].get(el.readerNode)?.row;if(row===undefined)continue;const cells=rows.get(row)||[[],[],[]];if(headings.has(el))cells[i].push(...headings.get(el).map(p=>({...p,depth:1,bold:false,heading:true,gapBefore:true})));
  if(el.tag==='Article'){
   const caption=el.children.find(c=>c.tag==='ArticleCaption')?.text();if(caption)cells[i].push({text:caption,depth:1,bold:false,caption:true,gapBefore:true});
   const paragraph=el.children.find(c=>c.tag==='Paragraph'),title=el.children.find(c=>c.tag==='ArticleTitle')?.text()||'';
   if(paragraph){firstTitles.set(paragraph,title);if(caption)captionedParagraphs.add(paragraph);}else {const own=pdfUnit(el);cells[i].push({...own,text:own.text.slice(caption?.length||0),bold:false,hanging:true,gapBefore:!caption});}
  }else {const p=pdfUnit(el),title=firstTitles.get(el);if(p.text||title)cells[i].push({...p,text:title?title+'　'+p.text:p.text,hanging:true,gapBefore:el.tag==='Paragraph'&&!captionedParagraphs.has(el)});}
  rows.set(row,cells);
 }});

 function outside(law,tags){
  const out=[];
  function paragraphs(node,prefix='',hasCaption=false){
   if(node.tag==='Article'){
    const caption=node.children.find(c=>c.tag==='ArticleCaption')?.text();if(caption)out.push({text:caption,depth:1,bold:false,caption:true,gapBefore:true});
    const title=node.children.find(c=>c.tag==='ArticleTitle')?.text()||'',children=node.children.filter(c=>c.tag==='Paragraph');
    if(children.length)children.forEach((c,i)=>paragraphs(c,i===0?title:'',i===0&&!!caption));else {const p=pdfUnit(node);out.push({...p,text:p.text.slice(caption?.length||0),bold:false,hanging:true,gapBefore:!caption});}return;
   }
   if(['Paragraph','Item'].includes(node.tag)||/^Subitem\d+$/.test(node.tag)){
    const p=pdfUnit(node);if(p.text||prefix)out.push({...p,text:prefix?prefix+'　'+p.text:p.text,hanging:true,gapBefore:node.tag==='Paragraph'&&!hasCaption});
    for(const c of node.children||[])if(typeof c!=='string'&&(['Paragraph','Item'].includes(c.tag)||/^Subitem\d+$/.test(c.tag)))paragraphs(c);return;
   }
   if(node.children?.some(c=>typeof c!=='string')){for(const c of node.children)if(typeof c!=='string')paragraphs(c);}else if(node.text())out.push({text:node.text(),depth:0,bold:false});
  }
  function visit(el){if(el.tag==='MainProvision')return;if(tags.includes(el.tag)){if(['Preamble','EnactStatement'].includes(el.tag))out.push({text:el.text(),depth:0,bold:false});else if(el.tag==='TOC'){function toc(node,depth=0){const title=node.children?.filter(c=>typeof c!=='string'&&(/Title$/.test(c.tag)||c.tag==='TOCLabel'||c.tag==='ArticleRange')).map(c=>c.text()).join('　');if(title)out.push({text:title,depth,bold:false});for(const c of node.children||[])if(typeof c!=='string'&&/^TOC(?:Part|Chapter|Section|Subsection|Division|Article|SupplProvision)$/.test(c.tag))toc(c,node.tag==='TOC'?0:depth+1);}toc(el);}else paragraphs(el);return;}for(const c of el.children||[])if(typeof c!=='string')visit(c);}
  if(law)visit(law.el);return out;
 }

 const titles=laws.map((l,i)=>[{text:l?l.title+'（'+l.num+'）':labels[i]+'（未選択）',depth:0,bold:false},...(l?.date?[{text:'施行日　'+l.date,depth:0,bold:false}]:[])]);
 const prefaces=laws.map(l=>outside(l,['EnactStatement','TOC','Preamble'])),extras=laws.map(l=>outside(l,['SupplProvision','Appdx','AppdxTable','AppdxStyle','AppdxFig','AppdxFormat','AppdxNote']));
 return [titles,...(prefaces.some(c=>c.length)?[prefaces]:[]),...[...rows].sort((a,b)=>a[0]-b[0]).map(([,cells])=>cells),...(extras.some(c=>c.length)?[extras]:[])];
}
// Align the body anchor, not the start of headings or each law's local blank line.
export function pdfBodyPadding(offsets){
 const edge=Math.max(0,...offsets.filter(n=>n!==null));
 return offsets.map(n=>n===null?0:Math.max(0,edge-n));
}
export function pdfHTML(laws){
 if(!laws.some(Boolean))throw Error('法令を先に選択してください。');
 const rows=pdfRows(laws);return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><title>${esc(laws.find(Boolean).title)} 三段表</title><style>
 @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8ebed;color:#111;font-family:"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif}.toolbar{padding:12px;font-family:sans-serif;position:sticky;top:0;background:white;z-index:5}.toolbar button{padding:8px 18px}.page{width:210mm;height:297mm;padding:11mm 15mm 10mm 17mm;background:white;margin:10px auto;break-after:page;overflow:hidden}.band{height:90mm;border-top:.3pt solid #222;position:relative;padding-top:1.5mm}.band:last-of-type{border-bottom:.3pt solid #222}.label{display:none}.viewport{position:relative;width:177.8mm;height:87.5mm;overflow:hidden}.track{position:absolute;top:0;right:0;height:87.5mm;display:flex;flex-direction:row-reverse;align-items:stretch}.cell{writing-mode:vertical-rl;text-orientation:mixed;height:87.5mm;flex-shrink:0;font-size:9pt;line-height:12.6pt;letter-spacing:.15pt;line-break:strict;overflow:hidden}.cell p{margin:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;text-indent:0}.cell p.heading{font-weight:400}.folio{text-align:center;font:8pt sans-serif;margin-top:3mm}.measure{position:absolute;visibility:hidden;left:-100000px;top:0;display:flex}.measure .cell{width:max-content;min-width:12.6pt} @media print{body{background:white}.toolbar,.measure{display:none}.page{margin:0;break-inside:avoid}.page:last-child{break-after:auto}}
 </style></head><body><div class="toolbar"><button onclick="window.print()">PDFとして保存・印刷</button> A4縦 / 上・中・下3段 / 縦書き <span id="status">組版中…</span></div><div id="pages"></div><script>
 const rows=${JSON.stringify(rows).replace(/</g,'\\u003c')},labels=${JSON.stringify(laws.map((law,i)=>`${labels[i]}　${law?.title||'未選択'}`)).replace(/</g,'\\u003c')};
 function cell(parts){const el=document.createElement('div');el.className='cell';for(const p of parts){const node=document.createElement('p');node.textContent=p.text;node.className=p.heading?'heading':p.caption?'caption':p.hanging?'pdf-body':'';node.style.paddingTop=((p.depth||0)+(p.hanging?1:0))+'em';node.style.textIndent=p.hanging?'-1em':'0';if(p.gapBefore)node.style.marginBlockStart='12.6pt';el.append(node);}return el;}
 const pdfBodyPadding=${pdfBodyPadding.toString()};
 function alignBodies(cells){const anchors=cells.map(c=>c.querySelector('.pdf-body')),offsets=anchors.map((p,i)=>p?cells[i].getBoundingClientRect().right-p.getBoundingClientRect().right:null),padding=pdfBodyPadding(offsets);anchors.forEach((p,i)=>{if(p&&padding[i]>.01)p.style.marginBlockStart=(parseFloat(getComputedStyle(p).marginBlockStart)||0)+padding[i]+'px';});}
 async function layout(){await document.fonts.ready;const measure=document.createElement('div');measure.className='measure';document.body.append(measure);const ruler=document.createElement('div');ruler.style.width='12.6pt';measure.append(ruler);const pitch=ruler.getBoundingClientRect().width;ruler.remove();const tracks=[[],[],[]];let total=0;for(const row of rows){const cells=row.map(cell);measure.replaceChildren(...cells);alignBodies(cells);const cols=Math.max(1,...cells.map(c=>Math.ceil((c.scrollWidth-.5)/pitch)));for(let i=0;i<3;i++){cells[i].style.width=cols*pitch+'px';tracks[i].push({node:cells[i],start:total,cols});}total+=cols;}
 measure.remove();const count=Math.max(1,Math.ceil(total/40));for(let n=0;n<count;n++){const page=document.createElement('section');page.className='page';for(let i=0;i<3;i++){const band=document.createElement('div');band.className='band';const label=document.createElement('div');label.className='label';label.textContent=labels[i];const view=document.createElement('div');view.className='viewport';const track=document.createElement('div');track.className='track';const visible=tracks[i].filter(c=>c.start<n*40+40&&c.start+c.cols>n*40);track.style.right=((visible[0]?.start??n*40)-n*40)*pitch+'px';for(const c of visible)track.append(c.node.cloneNode(true));view.append(track);band.append(label,view);page.append(band);}const folio=document.createElement('div');folio.className='folio';folio.textContent=(n+1)+' / '+count;page.append(folio);document.getElementById('pages').append(page);}document.getElementById('status').textContent=count+'ページ';window.pdfReady=true;}
 layout().catch(e=>document.getElementById('status').textContent=e.message);
 </script></body></html>`;
}
export function openPdf(laws,{baseURL=import.meta.env?.BASE_URL||'/',storage=globalThis.sessionStorage,openWindow=(...args)=>window.open(...args),schedule=setTimeout}={}){
 const html=pdfHTML(laws),key='sandan-pdf-document';storage.setItem(key,html);
 const popup=openWindow(`${baseURL}pdf-preview.html`,'_blank','popup,width=1000,height=900,scrollbars=yes,resizable=yes');
 if(!popup){storage.removeItem(key);throw Error('PDFのウィンドウを開くため、ポップアップを許可してください。');}
 schedule(()=>{if(storage.getItem(key)===html)storage.removeItem(key);},30000);
}
