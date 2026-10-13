import React, {useEffect,useRef,useState,useMemo,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {HTMLLaw} from 'lawtext/dist/src/renderer/rules/law.js';
import {htmlCSS} from 'lawtext/dist/src/renderer/rules/htmlCSS.js';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {analyze} from 'lawtext/dist/src/analyzer/index.js';
import {HTMLAnyELs} from 'lawtext/dist/src/renderer/rules/any.js';
import {externalTargets,internalTargets,findTarget,buildBacklinks,delegationCandidates,delegationWords} from './references.js';
import {chooseReadingSection,selectCompanion} from './reading.js';
import {isAvailableLaw} from './catalog.js';
import LawCatalog from './LawCatalog.jsx';
import {toggleColumnWidth,validWeights,captureReadingAnchor,restoreReadingAnchor} from './layout.js';
import {referenceKind} from './referenceColors.js';
import './style.css';

const API='https://laws.e-gov.go.jp/api/2';
const DEFAULTS=['415AC0000000057','415CO0000000507','428M60020000003'];
const LABELS=['法律','施行令','施行規則'];
const TYPES=['Act','CabinetOrder','MinisterialOrdinance,Rule'];
const STORE='sandan-reader-v1';
function readSaved(){try{return JSON.parse(localStorage.getItem(STORE))||{};}catch{return {};}}
const saved=readSaved();
function walk(el,tag,result=[]){if(el.tag===tag)result.push(el);for(const c of el.children||[])if(typeof c!=='string')walk(c,tag,result);return result;}
function text(el){return el?.text?.()||'';}
async function parseLaw(data,source){
 const xml=new TextDecoder().decode(Uint8Array.from(atob(data.law_full_text),c=>c.charCodeAt(0)));
 const el=xmlToEL(xml);if(el.tag!=='Law')throw Error('法令XMLを読み込めませんでした。');
 const analysis=await analyze({elToBeModified:el});
 let nodeIndex=0;function annotate(node,section=''){if(node.tag==='SupplProvision')section=`附則${node.attr.AmendLawNum?`（${node.attr.AmendLawNum}）`:''} `;node.readerSection=section;node.readerNode=String(nodeIndex++);for(const c of node.children)if(typeof c!=='string')annotate(c,section);}annotate(el);
 let n=0;const articles=walk(el,'Article').map(a=>{a.readerKey=String(n++);return {key:a.readerKey,label:(a.readerSection||'')+text(a.children.find(c=>c.tag==='ArticleTitle'))+' '+text(a.children.find(c=>c.tag==='ArticleCaption')),num:a.attr.Num};});
 return {id:data.law_info.law_id,title:data.revision_info.law_title,num:data.law_info.law_num,revision:data.revision_info.law_revision_id,date:data.revision_info.amendment_enforcement_date,el,articles,analysis,source};
}
async function request(url,signal){const res=await fetch(url,{signal:signal||AbortSignal.timeout(20000)});if(!res.ok)throw Error(`法令APIから取得できませんでした（${res.status}）。`);return res.json();}
function Wrap({htmlComponentID,childProps,ChildComponent}){
 const {el,htmlOptions}=childProps,options=htmlOptions.options||{};
 if(htmlComponentID==='HTMLControlRun'&&el.tag==='____Pointer'){
  if(el.text()==='この法律')return <>{el.text()}</>;
  const env=options.law?.analysis.pointerEnvByEL.get(el);
  const targets=env?.located?.type==='external'?externalTargets(env):env?.located?.type==='internal'?internalTargets(env):[];
  if(targets.some(t=>t.target))return <>{targets.map((t,k)=>t.target?<button className={`reference ref-${referenceKind({...t.target,internal:env.located.type==='internal'},options.index,options.laws)}`} key={k} title="参照条文を表示" onClick={e=>options.onReference({...t.target,internal:env.located.type==='internal'},options.index,e.currentTarget)}>{t.text}</button>:<React.Fragment key={k}>{t.text}</React.Fragment>)}</>;
 }
 if(htmlComponentID==='HTMLControlRun'&&['____LawRef','____LawNum'].includes(el.tag)){
  const lawNum=el.attr.lawNum||el.text();
  return <button className={`reference law-reference ref-${referenceKind({lawNum},options.index,options.laws)}`} title="参照法令を表示" onClick={e=>options.onReference({lawNum,title:el.attr.suggestedLawTitle},options.index,e.currentTarget)}>{el.text()}</button>;
 }
 if(htmlComponentID==='HTMLSentenceChildrenRun'&&options.article!==undefined){
  const parts=childProps.els.map((part,k)=>{
   if(typeof part!=='string')return <ChildComponent key={k} {...childProps} els={[part]}/>;
   const pieces=[];let offset=0;
   for(const match of part.matchAll(delegationWords)){
    pieces.push(part.slice(offset,match.index));const candidates=delegationCandidates(options.backlinks,{article:options.article,paragraph:options.paragraph,item:options.item,index:options.index},match[0]);
    pieces.push(candidates.length?<button className={`reference delegation-reference ref-${['act','order','rule'][candidates[0]?.sourceIndex]||'external'}`} key={`${k}-${match.index}`} title="この条項を参照する下位法令を表示" onClick={e=>options.onDelegation(candidates,match[0],options.index,e.currentTarget)}>{match[0]}</button>:match[0]);offset=match.index+match[0].length;
   }
   pieces.push(part.slice(offset));return <React.Fragment key={k}>{pieces}</React.Fragment>;
  });return <>{parts}</>;
 }
 let nestedOptions=options;
 if(htmlComponentID==='HTMLArticle')nestedOptions={...options,article:el.readerKey,paragraph:undefined,item:undefined};
 if(htmlComponentID==='HTMLParagraphItem'&&el.tag==='Paragraph')nestedOptions={...options,paragraph:el.attr.Num,item:undefined};
 if(htmlComponentID==='HTMLParagraphItem'&&el.tag==='Item')nestedOptions={...options,item:el.attr.Num};
 const rendered=<ChildComponent {...childProps} htmlOptions={{...htmlOptions,options:nestedOptions}}/>;
 if(htmlComponentID==='HTMLArticle'){
  const refs=options.backlinks?.get(el.readerKey)||[];
  return <section data-article={el.readerKey} data-node={el.readerNode}>{rendered}{refs.length>0&&<aside className="backlinks"><span>この条文を参照</span>{refs.map(r=><button key={`${r.sourceIndex}-${r.key}`} onClick={()=>options.onBacklink(r.sourceIndex,r.key)}>{LABELS[r.sourceIndex]}・{r.label} →</button>)}</aside>}</section>;
 }
 if(['HTMLLaw','HTMLParagraphItem','HTMLAppdxItem','HTMLArticleGroup','HTMLTable','HTMLTableStruct'].includes(htmlComponentID))return <div data-node={el.readerNode}>{rendered}</div>;
 return rendered;
}
class RenderBoundary extends React.Component{constructor(p){super(p);this.state={error:false};}static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<p role="alert">この法令の表示に失敗しました。別の法令を選ぶか、e-Govで本文をご確認ください。</p>:this.props.children;}}
function App(){
 const [ids,setIds]=useState(saved.ids?.length===3?saved.ids:DEFAULTS),[laws,setLaws]=useState([null,null,null]);
 const [loading,setLoading]=useState([true,true,true]),[errors,setErrors]=useState(['','','']);
 const [selected,setSelected]=useState(['','','']);
 const [dialog,setDialog]=useState(null),[query,setQuery]=useState(''),[results,setResults]=useState([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const [font,setFont]=useState(saved.font||17),[notice,setNotice]=useState(''),[mobile,setMobile]=useState(0);
 const panes=useRef([]),searchSeq=useRef(0),noteSeq=useRef(0),noteCache=useRef(new Map());
 const [note,setNote]=useState(null);
 const [weights,setWeights]=useState(validWeights(saved.weights)?saved.weights:[1,1,1]);
 const pendingAnchors=useRef(null);
 const [catalogMode,setCatalogMode]=useState(false);
 const [bundle,setBundle]=useState(null),[bundleLoading,setBundleLoading]=useState(false);
 const scrollFrames=useRef([]);
 const backlinks=useMemo(()=>buildBacklinks(laws),[laws]);
 useEffect(()=>{if(!note)return;const escape=e=>{if(e.key==='Escape'){noteSeq.current++;setNote(null);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[note]);
 useEffect(()=>{noteSeq.current++;setNote(null);},[ids]);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify({ids,font,weights}));}catch{setNotice('このブラウザでは設定を保存できません。');}},[ids,font,weights]);
 useEffect(()=>{const url=new URL(location.href);const values=url.searchParams.get('laws')?.split(',');if(values?.length===3&&values.every(v=>v===''||/^[a-zA-Z0-9_]+$/.test(v)))setIds(values.map(v=>v||null));},[]);
 useEffect(()=>{
 const controller=new AbortController();
 ids.forEach(async(id,i)=>{
  setLoading(p=>p.map((v,j)=>j===i?true:v));setErrors(p=>p.map((v,j)=>j===i?'':v));setLaws(p=>p.map((v,j)=>j===i?null:v));
  if(!id){setLoading(p=>p.map((v,j)=>j===i?false:v));setSelected(p=>p.map((v,j)=>j===i?'':v));return;}
  try{
   let data,source='e-Gov APIから取得';
   try{data=await request(`${API}/law_data/${encodeURIComponent(id)}?law_full_text_format=xml&response_format=json`,controller.signal);}
   catch(error){if(controller.signal.aborted)return;if(!DEFAULTS.includes(id))throw error;data=await request(`${import.meta.env.BASE_URL}data/${id}.json`,controller.signal);source=`保存データ・${data.snapshot_date}取得（API接続不可）`;}
   const law=await parseLaw(data,source);if(controller.signal.aborted)return;
   setLaws(p=>p.map((v,j)=>j===i?law:v));setSelected(p=>p.map((v,j)=>j===i?(law.articles[0]?.key??''):v));
  }catch(e){if(!controller.signal.aborted)setErrors(p=>p.map((v,j)=>j===i?e.message:v));}
  finally{if(!controller.signal.aborted)setLoading(p=>p.map((v,j)=>j===i?false:v));}
 });return()=>controller.abort();
 },[ids]);
 function trackReading(i){
  if(scrollFrames.current[i])return;
  scrollFrames.current[i]=requestAnimationFrame(()=>{
   scrollFrames.current[i]=null;const panel=panes.current[i];if(!panel||!panel.clientHeight)return;
   const sections=[...panel.querySelectorAll('section[data-article]')].map(el=>({key:el.dataset.article,top:el.getBoundingClientRect().top}));
   const current=chooseReadingSection(sections,panel.getBoundingClientRect().top+30),key=current?.key||'';
   setSelected(prev=>prev[i]===key?prev:prev.map((v,j)=>j===i?key:v));
  });
 }
 useEffect(()=>{laws.forEach((_,i)=>trackReading(i));const update=()=>laws.forEach((_,i)=>trackReading(i));window.addEventListener('resize',update);return()=>{window.removeEventListener('resize',update);scrollFrames.current.forEach(frame=>cancelAnimationFrame(frame));scrollFrames.current=[];};},[laws,font,mobile]);
 function jump(i,key){setSelected(p=>p.map((v,j)=>j===i?key:v));const panel=panes.current[i],target=panel?.querySelector(`[data-article="${key}"]`);if(target){panel.scrollTo({top:target.offsetTop-16,behavior:'smooth'});target.animate([{backgroundColor:'#d7eee9'},{backgroundColor:'transparent'}],{duration:1300});}}
 function slide(index,target){
  const panel=panes.current[index];if(!panel)return;
  const element=(target.node?panel.querySelector(`[data-node="${target.node}"]`):null)||(target.articleKey!==undefined?panel.querySelector(`[data-article="${target.articleKey}"]`):panel.querySelector('.law'));
  if(!element){setNotice('参照先の表示位置を見つけられませんでした。');return;}
  setMobile(index);
  if(target.articleKey!==undefined)setSelected(p=>p.map((v,i)=>i===index?target.articleKey:v));
  requestAnimationFrame(()=>{const top=element.getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;panel.scrollTo({top:Math.max(0,top-16),behavior:reduced?'auto':'smooth'});if(!reduced)element.animate([{backgroundColor:'#b8dfd6'},{backgroundColor:'transparent'}],{duration:1800});});
 }
 function backlink(index,key){slide(index,{articleKey:key});setNotice(`${LABELS[index]}の参照元条文を表示しました。`);}
 async function onReference(target,sourceIndex,anchor){
  const rect=anchor.getBoundingClientRect();const width=Math.min(440,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));const top=Math.max(12,Math.min(rect.bottom+8,window.innerHeight-330));
  const position={left,top,width};
  if(target.internal){
   noteSeq.current++;
   const law=laws[sourceIndex],nodes=target.nodes||[target.node];
   const contents=nodes.map(node=>[...law.analysis.containers.values()].find(c=>c.el.readerNode===node)?.el).filter(Boolean);
   setNote({...position,target,law,contents,loading:false,local:true,error:contents.length?null:'参照条文を見つけられませんでした。'});return;
  }
  const index=laws[sourceIndex]?.num===target.lawNum?sourceIndex:laws.findIndex(l=>l?.num===target.lawNum);
  if(index>=0){const found=findTarget(laws[index],target);
   if(index===sourceIndex){noteSeq.current++;setNote({...position,target,law:laws[index],content:found?.el,loading:false,local:true,error:found?null:'表示中の版には指定の参照条文が見つかりませんでした。'});}
   else if(found){slide(index,{node:found.el.readerNode,articleKey:found.articleKey});setNotice(`${LABELS[index]}の参照先へ移動しました。`);}else{setNotice('表示中の版には指定の参照条文が見つかりませんでした。');}return;
  }
  const seq=++noteSeq.current;setNote({target,...position,loading:true});
  try{let law=noteCache.current.get(target.lawNum);if(!law){const data=await request(`${API}/law_data/${encodeURIComponent(target.lawNum)}?law_full_text_format=xml&response_format=json`);law=await parseLaw(data,'e-Gov APIから取得');noteCache.current.set(target.lawNum,law);}if(seq!==noteSeq.current)return;
   const found=findTarget(law,target);setNote({target,...position,loading:false,law,content:found?.el,error:found?null:'この版には指定された条文が見つかりませんでした。'});
  }catch(e){if(seq===noteSeq.current)setNote({target,...position,loading:false,error:e.message});}
 }
 function onDelegation(candidates,word,index,anchor){
  if(candidates.length===1){closeNote();backlink(candidates[0].sourceIndex,candidates[0].key);return;}
  const rect=anchor.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);noteSeq.current++;
  setNote({target:{},law:laws[index],candidates,word,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-330)),width,loading:false});
 }
 function closeNote(){noteSeq.current++;setNote(null);}
 async function search(e){e.preventDefault();if(!query.trim())return;const seq=++searchSeq.current;setSearching(true);setBundleLoading(false);setResults([]);setSearchError('');try{const d=await request(`${API}/laws?law_title=${encodeURIComponent(query.trim())}&limit=100&law_type=${TYPES[dialog]||'Act'}&response_format=json`);if(seq===searchSeq.current){setResults(d.laws||[]);if(!d.laws?.length)setSearchError('一致する法令がありません。検索語を短くしてお試しください。');}}catch(e){if(seq===searchSeq.current)setSearchError(e.message);}finally{if(seq===searchSeq.current)setSearching(false);}}
 function openSearch(i){setCatalogMode(false);searchSeq.current++;setDialog(i);setQuery('');setResults([]);setSearchError('');setSearching(false);setBundle(null);setBundleLoading(false);}
 function closeSearch(){searchSeq.current++;setDialog(null);setSearching(false);setBundle(null);setBundleLoading(false);}
 async function choose(id,record){
  if(dialog!==3){setIds(p=>p.map((v,i)=>i===dialog?id:v));closeSearch();return;}
  const seq=++searchSeq.current;setBundleLoading(true);setSearchError('');
  try{
   let act=record||results.find(r=>r.law_info.law_id===id);
   if(!act){const d=await request(`${import.meta.env.BASE_URL}data/${id}.json`);act={law_info:d.law_info,revision_info:d.revision_info};}
   const title=act.revision_info.law_title;
   const d=await request(`${API}/laws?law_title=${encodeURIComponent(title)}&limit=1000&response_format=json`);
   if(seq!==searchSeq.current)return;
   const related=(d.laws||[]).filter(r=>isAvailableLaw(r)&&['CabinetOrder','MinisterialOrdinance','Rule'].includes(r.law_info.law_type));
   setBundle({act,related,picks:[id,selectCompanion(related,title,'施行令','CabinetOrder'),selectCompanion(related,title,'施行規則','MinisterialOrdinance,Rule')]});
  }catch(e){if(seq===searchSeq.current)setSearchError(e.message);}
  finally{if(seq===searchSeq.current)setBundleLoading(false);}
 }
 function applyBundle(){setIds([...bundle.picks]);closeSearch();setNotice('法律・施行令・施行規則をまとめて切り替えました。');}
 function preserveReading(change){pendingAnchors.current=panes.current.map(captureReadingAnchor);closeNote();change();}
 function changeWeights(next){preserveReading(()=>setWeights(next));}
 useLayoutEffect(()=>{if(!pendingAnchors.current)return;const anchors=pendingAnchors.current;pendingAnchors.current=null;panes.current.forEach((panel,i)=>restoreReadingAnchor(panel,anchors[i]));laws.forEach((_,i)=>trackReading(i));},[weights,font]);
 async function share(){const url=new URL(location.href);url.searchParams.set('laws',ids.join(','));try{await navigator.clipboard.writeText(url.toString());setNotice('この3法令を開くURLをコピーしました。');}catch{setNotice(url.toString());}}
 return <div className="app" style={{'--reader-font':`${font}px`}}>
  <style>{htmlCSS}</style>
  <header className="header"><div className="brand"><span className="brand-mark">三</span><div><h1>三段法令ビューア</h1><p>法律と、その先を。並べて読む。</p></div></div><div className="header-actions"><button className="bundle-open" onClick={()=>openSearch(3)}>法令を選ぶ</button><div className="font-control"><button aria-label="文字を小さく" onClick={()=>preserveReading(()=>setFont(v=>Math.max(13,v-1)))}>A−</button><button aria-label="文字を大きく" onClick={()=>preserveReading(()=>setFont(v=>Math.min(24,v+1)))}>A＋</button></div><button className="share" onClick={share}>閲覧URLをコピー ↗</button></div></header>
  <nav className="mobile-tabs" aria-label="表示する列">{LABELS.map((label,i)=><button key={label} aria-pressed={mobile===i} onClick={()=>setMobile(i)}>{label}</button>)}</nav>
  <main className="columns" style={{'--column-widths':weights.map(v=>`minmax(0, ${v}fr)`).join(' ')}}>{LABELS.map((label,i)=><div className={`column col-${i} ${mobile===i?'active':''}`} key={label}>
   <button className="column-width-toggle" aria-label={weights[i]===2?`${label}の幅を元に戻す`:`${label}の幅を2倍にする`} aria-pressed={weights[i]===2} title={weights[i]===2?'等幅に戻す':'この列を2倍に広げる'} onClick={()=>changeWeights(toggleColumnWidth(weights,i))}><span className="colored-label">{label}</span><svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{weights[i]===2?<><path d="M2 8h7m-3-3 3 3-3 3M22 8h-7m3-3-3 3 3 3"/></>:<><path d="M10 8H3m3-3L3 8l3 3M14 8h7m-3-3 3 3-3 3"/></>}</svg></button>
   <div className="column-header"><h3>{laws[i]?.title||(loading[i]?'法令を読み込み中…':!ids[i]?'法令が選ばれていません':'法令を取得できませんでした')}</h3><p className="law-number">{laws[i]?.num||'　'}{laws[i]?.date&&<span className="law-date">施行日 {laws[i].date}</span>}</p><label className="jump-label">条文へ移動<select aria-label={`${label}の条文へ移動`} disabled={!laws[i]} value={selected[i]} onChange={e=>jump(i,e.target.value)}><option value="">目次・前文</option>{laws[i]?.articles.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
   </div>
   <div className="reader" onScroll={()=>trackReading(i)} ref={el=>panes.current[i]=el} tabIndex="0" aria-label={`${label}の本文`}>
    {loading[i]?<div className="loading"><div className="spinner"/><p>法令を読み込んでいます</p></div>:errors[i]?<div role="alert" className="error"><h4>法令を取得できませんでした</h4><p>{errors[i]}</p><button onClick={()=>setIds(p=>[...p])}>再読み込み</button><button onClick={()=>openSearch(i)}>別の法令を選ぶ</button></div>:!ids[i]?<div className="empty-law"><p>この列に表示する法令は未選択です。</p><button onClick={()=>openSearch(i)}>法令を選ぶ</button></div>:laws[i]&&<RenderBoundary key={laws[i].revision}><HTMLLaw el={laws[i].el} indent={0} htmlOptions={{WrapComponent:Wrap,renderControlEL:true,renderPDFAsLink:true,options:{law:laws[i],laws,index:i,onReference,onDelegation,onBacklink:backlink,backlinks:backlinks[i]}}}/></RenderBoundary>}
   </div><div className="column-footer">{laws[i]?.articles.length||0} 条文（附則を含む）{laws[i]&&<a href={`https://laws.e-gov.go.jp/law/${laws[i].id}`} target="_blank" rel="noreferrer">e-Govで開く ↗</a>}</div>
  </div>)}</main>
  <p className="notice" role="status">{notice}</p>
  <footer className="footer"><span>法令データ：<a href="https://laws.e-gov.go.jp/" target="_blank" rel="noreferrer">e-Gov法令検索</a> ・表示時に取得した版を各列に記載</span><span>Powered by <a href="https://github.com/yamachig/Lawtext" target="_blank" rel="noreferrer">Lawtext</a> <a href="/LAWText-LICENSE.txt" target="_blank">MIT License</a></span></footer>
  {note&&<aside className="reference-note" role="dialog" aria-label="参照法令の付箋" style={{left:note.left,top:note.top,width:note.width,maxHeight:`calc(100dvh - ${note.top+12}px)`}} onKeyDown={e=>{if(e.key==='Escape')closeNote();}}><div className="note-heading"><span>{note.candidates?'この条項を参照する下位法令':note.local?'同じ法令の参照条文':'参照法令'}</span><button aria-label="付箋を閉じる" onClick={closeNote}>×</button></div><h3>{note.law?.title||note.target.title||note.target.lawNum}</h3><p className="note-meta">{note.law?.num||note.target.lawNum}{note.law?.date&&` ／ 施行日 ${note.law.date}`}</p>{note.target.article&&!note.target.internal&&<p className="note-target">第{note.target.article.replaceAll('_','条の')}条{note.target.paragraph&&` 第${note.target.paragraph}項`}{note.target.item&&` 第${note.target.item}号`}</p>}{note.target.internal&&<p className="note-target">{note.law.articles.find(a=>a.key===note.target.article)?.label}{note.target.count>1&&`（${note.target.count}箇所）`}</p>}<div className="note-body">{note.candidates?<div className="delegation-choices"><p>「{note.word}」の参照候補を選んでください。</p>{note.candidates.map(r=><button key={`${r.sourceIndex}-${r.key}`} onClick={()=>{closeNote();backlink(r.sourceIndex,r.key);}}>{LABELS[r.sourceIndex]}・{r.label} →</button>)}</div>:note.loading?<p role="status">参照条文を読み込み中…</p>:note.error?<p role="alert">{note.error}</p>:<RenderBoundary key={note.law.revision}><HTMLAnyELs els={note.contents||[note.content]} indent={0} htmlOptions={{renderControlEL:false,renderPDFAsLink:true}}/></RenderBoundary>}</div>{note.law&&<a className="note-source" href={`https://laws.e-gov.go.jp/law/${note.law.id}`} target="_blank" rel="noreferrer">e-Govで全文を開く ↗</a>}</aside>}
  {dialog!==null&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeSearch();}}><dialog open className="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==='Escape')closeSearch();if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll('button:not(:disabled),input,a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><div className="dialog-heading"><div><span className="eyebrow">SELECT LAW</span><h2 id="dialog-title">法令を選ぶ</h2></div><button aria-label="閉じる" onClick={closeSearch}>×</button></div><nav className="selection-targets" aria-label="選択する法令"><button aria-pressed={dialog===3} onClick={()=>openSearch(3)}>3法令まとめて</button>{LABELS.map((label,i)=><button key={label} aria-pressed={dialog===i} onClick={()=>openSearch(i)}>{label}</button>)}</nav>{!bundle&&!bundleLoading&&<nav className="selection-modes" aria-label="法令の選び方"><button aria-pressed={!catalogMode} onClick={()=>{searchSeq.current++;setSearching(false);setSearchError('');setCatalogMode(false);}}>名前で検索</button><button aria-pressed={catalogMode} onClick={()=>{searchSeq.current++;setSearching(false);setSearchError('');setCatalogMode(true);}}>一覧から選ぶ</button></nav>}{!bundle&&!bundleLoading&&catalogMode&&<LawCatalog type={TYPES[dialog]||'Act'} onChoose={r=>choose(r.law_info.law_id,r)}/>} {!bundle&&!catalogMode&&<form onSubmit={search}><label htmlFor="search-law">法令名で検索</label><div className="search-row"><input id="search-law" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：個人情報、建築基準"/><button className="primary" disabled={searching||!query.trim()}>{searching?'検索中…':'検索'}</button></div></form>}<div className="results" aria-live="polite">{searchError&&<p role="alert">{searchError}</p>}{!bundle&&!bundleLoading&&!catalogMode&&results.map(r=><button className="result" key={r.law_info.law_id} onClick={()=>choose(r.law_info.law_id)}><strong>{r.revision_info.law_title}</strong><span>{r.law_info.law_num} · {!isAvailableLaw(r)?'廃止法令':r.revision_info.current_revision_status||''}</span></button>)}</div>{bundleLoading&&<p role="status">施行令・施行規則を探しています…</p>}{bundle&&<div className="bundle-review"><h3>{bundle.act.revision_info.law_title}</h3><p>同名の施行令・施行規則を選択しました。必要に応じて候補を変更できます。</p>{[1,2].map(i=><label key={i}>{LABELS[i]}<select aria-label={`一括選択の${LABELS[i]}`} value={bundle.picks[i]||''} onChange={e=>setBundle(p=>({...p,picks:p.picks.map((v,j)=>j===i?e.target.value||null:v)}))}><option value="">該当なし／表示しない</option>{bundle.related.filter(r=>TYPES[i].split(',').includes(r.law_info.law_type)).map(r=><option key={r.law_info.law_id} value={r.law_info.law_id}>{r.revision_info.law_title}</option>)}</select></label>)}<button className="primary" onClick={applyBundle}>この組み合わせで開く</button><button onClick={()=>setBundle(null)}>法律を選び直す</button></div>}<div className="default-choice"><p>表示例</p><button onClick={()=>dialog===3?(setIds([...DEFAULTS]),closeSearch()):choose(DEFAULTS[dialog])}>{dialog===3?'個人情報保護法・施行令・施行規則をまとめて開く':['個人情報の保護に関する法律','個人情報の保護に関する法律施行令','個人情報の保護に関する法律施行規則'][dialog]} →</button></div><p className="dialog-note">e-Gov法令APIを使用します。検索結果には廃止法令が含まれる場合があります。</p></dialog></div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
