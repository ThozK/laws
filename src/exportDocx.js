import {zipSync,strToU8} from 'fflate';
import {buildDetailedAlignment} from './alignment.js';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const p=(text,bold=false)=>`<w:p><w:pPr><w:spacing w:after="100"/><w:keepNext w:val="${bold?1:0}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Arial Unicode MS"/><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/>${bold?'<w:b/>':''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const unit=tag=>['Article','Paragraph','Item'].includes(tag)||/^Subitem\d+$/.test(tag);
export function unitText(el){function text(node){if(typeof node==='string')return node;if(node!==el&&unit(node.tag))return '';return (node.children||[]).map(text).join('');}return text(el);}
function preface(law){const body=law.el.children.find(c=>c.tag==='LawBody');return (body?.children||[]).filter(c=>['EnactStatement','Preamble'].includes(c.tag)).map(c=>c.text());}
function extraText(law){const out=[];function visit(el,inMain=false){if(el.tag==='MainProvision')return;if(['SupplProvision','AppdxTable','AppdxStyle','Appdx','AppdxFig','AppdxFormat','AppdxNote'].includes(el.tag)){out.push(el.text());return;}for(const c of el.children||[])if(typeof c!=='string')visit(c,inMain);}visit(law.el);return out;}
export function makeDocx(laws,mode='table'){
 const present=laws.filter(Boolean);if(!present.length)throw Error('法令を先に選択してください。');
 let content='';
 if(mode==='vertical'){
  for(const law of present){content+=p(law.title,true)+p(law.num)+preface(law).map(t=>p(t)).join('');const main=law.el.children.find(c=>c.tag==='LawBody')?.children.find(c=>c.tag==='MainProvision');
   function visit(el){if(unit(el.tag)){const t=unitText(el);if(t)content+=p(t,el.tag==='Article');}else if(/^(Part|Chapter|Section|Subsection|Division)Title$/.test(el.tag))content+=p(el.text(),true);for(const c of el.children||[])if(typeof c!=='string')visit(c);}
   if(main)visit(main);for(const text of extraText(law))content+=p(text);
  }
 }else{
  const model=buildDetailedAlignment(laws),rows=new Map(),headings=new Map();
  for(const law of laws.filter(Boolean)){function firstArticle(el){if(el.tag==='Article')return el;for(const c of el.children||[])if(typeof c!=='string'){const found=firstArticle(c);if(found)return found;}}function groups(el){const heading=el.children?.find(c=>/^(Part|Chapter|Section|Subsection|Division)Title$/.test(c.tag));if(heading){const first=firstArticle(el);if(first)headings.set(first,[...(headings.get(first)||[]),heading.text()]);}for(const c of el.children||[])if(typeof c!=='string')groups(c);}groups(law.el);}

  model.articles.forEach((units,i)=>{for(const el of units){const row=model.assignments[i].get(el.readerNode)?.row;if(row===undefined)continue;const cells=rows.get(row)||[[],[],[]];const t=unitText(el);if(headings.has(el))cells[i].push(...headings.get(el));if(t)cells[i].push(t);rows.set(row,cells);}});
  const width=5132,cell=text=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${text.length?text.map(t=>p(t,/^(?:（[^）]+）)?第[^。]*条(?:の[一二三四五六七八九十]+)?$/.test(t))).join(''):p('')}</w:tc>`;
  content=p(present[0].title+' 三段表',true)+`<w:tbl><w:tblPr><w:tblW w:w="15396" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(s=>`<w:${s} w:val="single" w:sz="4" w:color="AAAAAA"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${[0,1,2].map(()=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${laws.map((l,i)=>cell([['法律','施行令','施行規則'][i],l?.title||'未選択',l?.num||''])).join('')}</w:tr>`;
  const prefaces=laws.map(l=>l?preface(l):[]);if(prefaces.some(e=>e.length))content+=`<w:tr>${prefaces.map(cell).join('')}</w:tr>`;
  for(const [,cells] of [...rows].sort((a,b)=>a[0]-b[0]))content+=`<w:tr>${cells.map(cell).join('')}</w:tr>`;
  const extras=laws.map(l=>l?extraText(l):[]);if(extras.some(e=>e.length))content+=`<w:tr>${extras.map(cell).join('')}</w:tr>`;
  content+='</w:tbl>'+p('');
 }
 const section=mode==='vertical'?'<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/><w:textDirection w:val="tbRl"/>':'<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>';
 const files={'[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', 'word/document.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr>${section}</w:sectPr></w:body></w:document>`};
 return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(value)])));
}
export function downloadDocx(laws,mode){const data=makeDocx(laws,mode),url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})),a=document.createElement('a');a.href=url;a.download=`${laws.find(Boolean).title}_${mode==='vertical'?'A4縦書き':'A4三段表'}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
