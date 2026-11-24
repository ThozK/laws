import fs from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {EL} from 'lawtext/dist/src/node/el/index.js';
import {HTMLAnyELs} from 'lawtext/dist/src/renderer/rules/any.js';
import {htmlCSS} from 'lawtext/dist/src/renderer/rules/htmlCSS.js';
import {analyzeLaw} from '../src/analyzeLaw.js';
import {buildDetailedAlignment} from '../src/alignment.js';
import {resolveLawReferences} from '../src/resolveReferences.js';
const configs=JSON.parse(await fs.readFile(new URL('./sample-configs.json',import.meta.url),'utf8'));
const config=configs[process.argv[2]||'haikibutsu'];if(!config)throw Error('Unknown sample');
const {ids,name}=config;
const back=config.path.split('/').map(()=>'..').join('/')+'/';
const latest=back+'?laws='+encodeURIComponent(ids.join(','));
const acquiredDates=[];
await fs.mkdir('public/samples/data',{recursive:true});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const laws=[];
for(const id of ids){
 const path=`.cache/static-laws/${id}.json`;
 let data,unavailable=false;
 if(process.argv.includes('--refresh')){
  const r=await fetch(`https://laws.e-gov.go.jp/api/2/law_data/${id}?law_full_text_format=xml&response_format=json`,{signal:AbortSignal.timeout(60000)});
  if(!r.ok){
   unavailable=true;
   const error=await r.json();
   if(r.status!==404||error.code!=='404004')throw Error(`${id}: e-Gov ${r.status}`);
   // e-Gov sometimes lists a revision whose XML is unavailable. Retain the
   // dated existing snapshot rather than falsely marking it as newly fetched.
   try{data=JSON.parse(await fs.readFile(path,'utf8'));console.warn(`${name} ${id}: XML unavailable; retaining dated cached revision ${data.revision_info.law_revision_id}`);}
   catch(error){
    if(error.code!=='ENOENT')throw error;
    const revisionsResponse=await fetch(`https://laws.e-gov.go.jp/api/2/law_revisions/${id}`,{signal:AbortSignal.timeout(60000)});if(!revisionsResponse.ok)throw Error(`${id}: revisions unavailable`);
    const revisions=await revisionsResponse.json();
    const candidates=revisions.revisions.filter(v=>v.current_revision_status==='PreviousEnforced'||v.current_revision_status==='PastEnforced');
    for(const revision of candidates){
     const prior=await fetch(`https://laws.e-gov.go.jp/api/2/law_data/${revision.law_revision_id}?law_full_text_format=xml&response_format=json`,{signal:AbortSignal.timeout(60000)});
     if(!prior.ok)continue;data=await prior.json();console.warn(`${name}: using available historical snapshot ${revision.law_revision_id}`);await fs.mkdir('.cache/static-laws',{recursive:true});await fs.writeFile(path,JSON.stringify(data));break;
    }
    if(!data)throw Error(`${id}: no available historical XML`);
   }
  }else{data=await r.json();await fs.mkdir('.cache/static-laws',{recursive:true});await fs.writeFile(path,JSON.stringify(data));}
 }
 else data=JSON.parse(await fs.readFile(path,'utf8'));
 await fs.writeFile(`public/samples/data/${id}.json`,JSON.stringify(data));
 const acquired=new Date((await fs.stat(path)).mtime).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 acquiredDates.push(acquired);
 const el=xmlToEL(Buffer.from(data.law_full_text,'base64').toString()),analysis=await analyzeLaw(el);
 let n=0,a=0;function visit(e){e.readerNode=String(n++);if(e.tag==='Article')e.readerKey=String(a++);for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);
 laws.push({id,title:data.revision_info.law_title,num:data.law_info.law_num,date:data.revision_info.amendment_enforcement_date,revision:data.revision_info.law_revision_id,acquired,el,analysis,note:unavailable?`${data.revision_info.law_title}は最新掲載版のXMLを取得できなかったため、${data.revision_info.amendment_enforcement_date}施行版を収録しています。`:null});
}
laws.forEach(l=>resolveLawReferences(l,laws));
const model=buildDetailedAlignment(laws),rows=[];
const groupHeadings=laws.map(law=>{const map=new Map();let pending=[];function visit(el){if(/^(Part|Chapter|Section|Subsection|Division)Title$/.test(el.tag))pending.push(el);if(el.tag==='Article'){map.set(el,pending);pending=[];return;}for(const c of el.children||[])if(typeof c!=='string')visit(c);}const main=law.el.children.find(c=>c.tag==='LawBody').children.find(c=>c.tag==='MainProvision');visit(main);return map;});
function render(els,law){return renderToStaticMarkup(React.createElement(HTMLAnyELs,{els,htmlOptions:{WrapComponent:({htmlComponentID,childProps,ChildComponent})=>htmlComponentID==='HTMLFigRun'?React.createElement('a',{href:`https://laws.e-gov.go.jp/law/${law.id}`,target:'_blank',rel:'noreferrer'},'図・様式をe-Govで確認'):React.createElement(ChildComponent,childProps)}}));}
const unitTag=tag=>['Article','Paragraph','Item'].includes(tag)||/^Subitem(?:[1-9]|10)$/.test(tag);
model.articles.forEach((units,col)=>units.forEach(el=>{
 const row=model.assignments[col].get(el.readerNode).row;rows[row]??=[[],[],[]];
 const own=new EL(el.tag,el.attr,el.children.filter(c=>typeof c==='string'||!unitTag(c.tag)));
 const content=el.tag==='Article'?[...(groupHeadings[col].get(el)||[]),...el.children.filter(c=>['ArticleCaption','ArticleTitle'].includes(c.tag))].map(c=>`<h2>${esc(c.text())}</h2>`).join(''):render([own],laws[col]);
 rows[row][col].push(`<section id="snapshot-${col}-${el.readerNode}">${content}</section>`);
}));
const body=rows.map(cells=>`<tr>${cells.map(cell=>`<td>${cell.join('')}</td>`).join('')}</tr>`).join('');
const canonical=`https://thozk.github.io/laws/${config.path}/`;
const snapshot={name,path:config.path,ids,dates:acquiredDates,notes:laws.map(l=>l.note).filter(Boolean)};
const title=`${name}の三段表・三段対照表（保存版サンプル）｜LawRow`;
const description=`${name}・施行令・施行規則の条項号を並べた三段対照表の保存版サンプル。取得後の改正は自動反映されません。最新の法令を読むページとe-Govへのリンクを掲載。`;
const html=`<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta name="lawrow-laws" content="${ids.join(',')}"><meta name="lawrow-snapshot" content="${esc(JSON.stringify(snapshot))}"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>${htmlCSS}
#seo-snapshot{position:fixed;inset:0;z-index:100;background:#f5f5f5;color:#252525;overflow:auto;padding:20px;font:14px/1.8 system-ui,sans-serif}#seo-snapshot h1{font-size:24px}#seo-snapshot h2{font-size:15px;margin:4px 0}#seo-snapshot table{width:100%;min-width:900px;table-layout:fixed;border-collapse:collapse;background:white}#seo-snapshot th,#seo-snapshot td{width:33.333%;padding:12px;vertical-align:top;border:1px solid #ddd}#seo-snapshot th{border-top:4px solid #f8766d}#seo-snapshot th:nth-child(2){border-top-color:#00ba38}#seo-snapshot th:nth-child(3){border-top-color:#619cff}#seo-snapshot .snapshot-table{overflow:auto}#seo-snapshot .snapshot-version{font-size:12px}#seo-snapshot section{overflow-wrap:anywhere}#seo-snapshot .article-title{font-weight:bold}#seo-snapshot a{color:#245b84}</style></head><body><div id="seo-snapshot"><header><a href="${back}?samples=1">サンプルページ一覧</a><h1>${name}の三段表・三段対照表</h1><aside style="border:1px solid #ddeade;padding:12px;background:#f1f8f2;color:#48634d;margin:16px 0"><strong>保存版サンプル：最新の法令ではない場合があります。</strong><p>取得日：${[...new Set(acquiredDates)].join('／')}。取得後の改正は自動反映されません。実務で利用する際は、現行条文・施行日を必ず確認してください。対応関係は機械的に推定しています。</p>${laws.filter(l=>l.note).map(l=>`<p>${esc(l.note)}</p>`).join('')}<a href="${latest}">最新の法令をLawRowで開く</a>${name==='会社法'?'<p>このサンプルは会社法・施行令・施行規則の3法令を収録しています。会社計算規則などの関連法令は含みません。</p>':''}</aside><p>${name}・施行令・施行規則の対応する条項号を、共通の行に並べた保存版サンプルです。</p><p id="snapshot-status" role="status">引用・検索・PDF保存などの閲覧機能を読み込んでいます。JavaScriptが無効な場合も、下記の条文を読めます。</p></header><div class="snapshot-table"><table><caption>${name}・施行令・施行規則の三段対照表（本則）</caption><thead><tr>${laws.map((l,i)=>`<th scope="col">${['法律','施行令','施行規則'][i]}<br>${esc(l.title)}<p class="snapshot-version">${esc(l.num)}<br>施行日 ${esc(l.date)}／取得日 ${l.acquired}<br>版 ${esc(l.revision)}<br><a href="https://laws.e-gov.go.jp/law/${l.id}" target="_blank" rel="noreferrer">e-Govで確認</a></p></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><footer>法令データ：e-Gov法令検索／表示処理：<a href="https://github.com/yamachig/Lawtext">Lawtext</a>（MIT）<br><a href="${back}LAWText-LICENSE.txt">ライセンス</a></footer></div><div id="root"></div><script>globalThis.global=globalThis;</script><script type="module" src="/src/main.jsx"></script></body></html>`;
await fs.mkdir(config.path,{recursive:true});await fs.writeFile(`${config.path}/index.html`,html);console.log(`Generated ${config.path}/index.html: ${rows.length} rows`);
