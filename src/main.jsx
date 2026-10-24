import React, {useEffect,useRef,useState,useMemo,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import LawLibrary from './LawLibrary.jsx';
import RandomWave,{DiceIcon} from './RandomWave.jsx';
import {LIBRARY_KEY,readLibrary,entryKey,rememberEntry} from './lawLibrary.js';
import {HTMLLaw} from 'lawtext/dist/src/renderer/rules/law.js';
import {htmlCSS} from 'lawtext/dist/src/renderer/rules/htmlCSS.js';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {analyzeLaw} from './analyzeLaw.js';
import {HTMLAnyELs} from 'lawtext/dist/src/renderer/rules/any.js';
import {externalTargets,internalTargets,findTarget,buildBacklinks,delegationCandidates,delegationWords,subitemLevel} from './references.js';
import {readingSectionAt,selectCompanion} from './reading.js';
import {isAvailableLaw} from './catalog.js';
import LawCatalog from './LawCatalog.jsx';
import CompanionPicker from './CompanionPicker.jsx';
import RelatedLaws from './RelatedLaws.jsx';
import {loadRelatedSnapshot,parentRecord} from './relatedLaws.js';
import {toggleColumnWidth,validWeights,captureReadingAnchor,restoreReadingAnchor} from './layout.js';
import {referenceKind} from './referenceColors.js';
import {definitionFor} from './definitions.js';
import {noteContext} from './noteContext.js';
import {noteStack,noteById,childNotePosition} from './noteStack.js';
import {buildDetailedAlignment,alignArticleRows,clearAlignment} from './alignment.js';
import {resolveLawReferences} from './resolveReferences.js';
import {lawIdsFromURL,lawURL,lawPageTitle,randomLawFrom} from './navigation.js';
import {openPdf} from './exportPdf.js';
import {fetchLawCatalog,companionSearchTerm,fetchStandardCompanions,attachmentURL,standaloneIds} from './lawApi.js';
import './style.css';
import './ggplot-theme.css';
import './mobile.css';

const API='https://laws.e-gov.go.jp/api/2';
const DEFAULTS=['415AC0000000057','415CO0000000507','428M60020000003'];
const LABELS=['法律','施行令','施行規則'];
// true に戻すと「この条文を参照」の表示を復活できます。
const SHOW_BACKLINKS=false;
const TYPES=['Act','CabinetOrder','MinisterialOrdinance,Rule'];
const STORE='sandan-reader-v1';
function readSaved(){try{return JSON.parse(localStorage.getItem(STORE))||{};}catch{return {};}}
const saved=readSaved();
const linkedIds=lawIdsFromURL(location.href);
function walk(el,tag,result=[]){if(el.tag===tag)result.push(el);for(const c of el.children||[])if(typeof c!=='string')walk(c,tag,result);return result;}
function text(el){return el?.text?.()||'';}
async function parseLaw(data,source){
 const xml=new TextDecoder().decode(Uint8Array.from(atob(data.law_full_text),c=>c.charCodeAt(0)));
 const el=xmlToEL(xml);if(el.tag!=='Law')throw Error('法令XMLを読み込めませんでした。');
 const analysis=await analyzeLaw(el);
 let nodeIndex=0;function annotate(node,section=''){if(node.tag==='SupplProvision')section=`附則${node.attr.AmendLawNum?`（${node.attr.AmendLawNum}）`:''} `;node.readerSection=section;node.readerNode=String(nodeIndex++);for(const c of node.children)if(typeof c!=='string')annotate(c,section);}annotate(el);
 let n=0;const articles=walk(el,'Article').map(a=>{a.readerKey=String(n++);return {key:a.readerKey,label:(a.readerSection||'')+text(a.children.find(c=>c.tag==='ArticleTitle'))+' '+text(a.children.find(c=>c.tag==='ArticleCaption')),num:a.attr.Num};});
 return resolveLawReferences({id:data.law_info.law_id,type:data.law_info.law_type,title:data.revision_info.law_title,num:data.law_info.law_num,revision:data.revision_info.law_revision_id,date:data.revision_info.amendment_enforcement_date,el,articles,analysis,source});
}
async function request(url,signal){const res=await fetch(url,{signal:signal||AbortSignal.timeout(20000)});if(!res.ok)throw Error(`法令APIから取得できませんでした（${res.status}）。`);return res.json();}
function notePosition(anchor){
 const rect=anchor.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
 const below=window.innerHeight-rect.bottom-20,above=rect.top-20;
 const useBelow=below>=Math.min(300,above),top=useBelow?rect.bottom+8:Math.max(12,rect.top-338);
 return {width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top,maxHeight:useBelow?window.innerHeight-top-12:rect.top-top-8};
}
function referenceAnchorKey(anchor,index){const node=anchor.closest('[data-node]');return `${anchor.closest('.reference-note')?.dataset.noteId||'reader'}:${index}:${node?.dataset.node}:${[...(node?.querySelectorAll('.reference')||[])].indexOf(anchor)}:${anchor.textContent}`;}
function ReferenceButton({options,preview,target,candidates,onClick,...props}){
 function enter(anchor){options.highlightTargets(target,options.index,candidates);}
 return <button {...props} onMouseEnter={e=>enter(e.currentTarget)} onMouseLeave={()=>{options.clearTargetHighlights();options.endPreview();}} onFocus={e=>enter(e.currentTarget)} onBlur={()=>{options.clearTargetHighlights();options.endPreview();}} onClick={e=>{e.stopPropagation();options.endPreview();options.clearTargetHighlights();preview(e.currentTarget);}}/>;
}
function Wrap({htmlComponentID,childProps,ChildComponent}){
 const {el,htmlOptions}=childProps,options=htmlOptions.options||{};
 if(htmlComponentID==='HTMLFigRun'){const url=attachmentURL(options.law,el.attr.src);return url?<a className="egov-attachment" href={/\.pdf$/i.test(el.attr.src)?`${import.meta.env.BASE_URL}attachment-preview.html?revision=${encodeURIComponent(options.law.revision)}&src=${encodeURIComponent(el.attr.src)}`:url} target="_blank" rel="noreferrer">{ /\.pdf$/i.test(el.attr.src)?'PDF':'画像'}をe-Govで開く ↗</a>:<span>{el.attr.src}</span>;}
 if(htmlComponentID==='HTMLControlRun'&&el.text()==='この法律')return <>{el.text()}</>;
 if(htmlComponentID==='HTMLControlRun'&&el.tag==='____VarRef'){
  const alias=options.law?.aliases?.[el.text()];if(alias)return <ReferenceButton options={options} target={alias} preview={anchor=>options.onReference(alias,options.index,anchor,true)} className="reference">{el.text()}</ReferenceButton>;
  const definition=definitionFor(options.law,el);
  if(definition)return <ReferenceButton options={options} target={{internal:true,node:definition.content.readerNode}} preview={anchor=>options.onDefinition(definition,options.index,anchor,true)} className={`reference definition-reference ref-${['act','order','rule'][options.index]}`} title={`${el.text()}の定義を表示`} onClick={e=>options.onDefinition(definition,options.index,e.currentTarget)}>{el.text()}</ReferenceButton>;
 }
 if(htmlComponentID==='HTMLControlRun'&&el.tag==='____Pointer'){
  if(el.text()==='この法律')return <>{el.text()}</>;
  const env=options.law?.analysis.pointerEnvByEL.get(el);
  const targets=env?.readerTargets||env?.located?.type==='external'?externalTargets(env):env?.located?.type==='internal'?internalTargets(env):[];
  if(targets.some(t=>t.target))return <>{targets.map((t,k)=>t.target?<ReferenceButton options={options} target={{...t.target,internal:!env.readerTargets&&env.located?.type==='internal'}} preview={anchor=>options.onReference({...t.target,internal:!env.readerTargets&&env.located?.type==='internal'},options.index,anchor,true)} className={`reference ${!t.target.internal&&env.located?.type!=='internal'&&options.laws.some((l,i)=>i!==options.index&&l?.num===t.target.lawNum)?'ref-cross':''} ref-${referenceKind({...t.target,internal:!env.readerTargets&&env.located?.type==='internal'},options.index,options.laws)}`} key={k} title="参照条文を表示" onClick={e=>options.onReference({...t.target,internal:!env.readerTargets&&env.located?.type==='internal'},options.index,e.currentTarget)}>{t.text}</ReferenceButton>:<React.Fragment key={k}>{t.text}</React.Fragment>)}</>;
 }
 if(htmlComponentID==='HTMLControlRun'&&['____LawRef','____LawNum'].includes(el.tag)){
  const lawNum=el.attr.lawNum||el.text();
  return <ReferenceButton options={options} target={{lawNum}} preview={anchor=>options.onReference({lawNum,title:el.attr.suggestedLawTitle},options.index,anchor,true)} className={`reference law-reference ${options.laws.some((l,i)=>i!==options.index&&l?.num===lawNum)?'ref-cross':''} ref-${referenceKind({lawNum},options.index,options.laws)}`} title="参照法令を表示" onClick={e=>options.onReference({lawNum,title:el.attr.suggestedLawTitle},options.index,e.currentTarget)}>{el.text()}</ReferenceButton>;
 }
 if(htmlComponentID==='HTMLSentenceChildrenRun'){
  const runText=childProps.els.map(p=>typeof p==='string'?p:(typeof p.text==='function'?p.text():p.text||'')).join(''),sentence=options.delegationSentence??runText;let cursor=options.delegationOffset||0;
  const parts=childProps.els.map((part,k)=>{const start=cursor;cursor+=typeof part==='string'?part.length:((typeof part.text==='function'?part.text():part.text||'')).length;
   if(part?.citation){const target=part.target;return <ReferenceButton key={k} options={options} target={target} preview={anchor=>options.onReference(target,options.index,anchor,true)} className={`reference citation-reference ${options.laws?.some((l,i)=>i!==options.index&&l?.num===target.lawNum)?'ref-cross':''} ref-${referenceKind(target,options.index,options.laws||[])}`} title="参照条項を表示" onClick={e=>options.onReference(target,options.index,e.currentTarget)}>{part.text}</ReferenceButton>;}

   if(typeof part!=='string')return <ChildComponent key={k} {...childProps} els={[part]} htmlOptions={{...htmlOptions,options:{...options,delegationSentence:sentence,delegationOffset:start}}}/>;
   const aliasMatch=part.match(/(?:^|[^一-龥々])([法令])$/),alias=options.law?.aliases?.[aliasMatch?.[1]];
   if(alias&&childProps.els[k+1]?.tag==='____PointerRanges'){const name=aliasMatch[1];return <React.Fragment key={k}>{part.slice(0,-1)}<ReferenceButton options={options} target={alias} preview={anchor=>options.onReference(alias,options.index,anchor,true)} className="reference">{name}</ReferenceButton></React.Fragment>;}
   const pieces=[];let offset=0;
   for(const match of part.matchAll(delegationWords)){
    pieces.push(part.slice(offset,match.index));const candidates=delegationCandidates(options.backlinks,{article:options.article,paragraph:options.paragraph,item:options.item,subitems:options.subitems,index:options.index,delegationText:sentence.slice(start+match.index),delegationBefore:sentence.slice(0,start+match.index)},match[0]);
    pieces.push(candidates.length?<ReferenceButton options={options} candidates={candidates} preview={anchor=>options.previewDelegation(candidates,match[0],options.index,anchor)} className={`reference ref-cross delegation-reference ref-${['act','order','rule'][candidates[0]?.sourceIndex]||'external'}`} key={`${k}-${match.index}`} title={candidates.length===1?`対応する下位法令：${candidates[0].label}`:`${candidates.length}件の参照候補を表示`} onClick={e=>options.onDelegation(candidates,match[0],options.index,e.currentTarget)}>{match[0]}</ReferenceButton>:match[0]);offset=match.index+match[0].length;
   }
   pieces.push(part.slice(offset));return <React.Fragment key={k}>{pieces}</React.Fragment>;
  });return <>{parts}</>;
 }
 let nestedOptions=options;
 if(htmlComponentID==='HTMLArticle')nestedOptions={...options,article:el.readerKey,paragraph:undefined,item:undefined,subitems:[]};
 if(htmlComponentID==='HTMLParagraphItem'&&el.tag==='Paragraph')nestedOptions={...options,paragraph:el.attr.Num,item:undefined,subitems:[]};
 if(htmlComponentID==='HTMLParagraphItem'&&el.tag==='Item')nestedOptions={...options,item:el.attr.Num,subitems:[]};
 if(htmlComponentID==='HTMLParagraphItem'&&subitemLevel(el.tag))nestedOptions={...options,subitems:[...(options.subitems||[]).slice(0,subitemLevel(el.tag)-1),el.attr.Num]};
 const rendered=<ChildComponent {...childProps} htmlOptions={{...htmlOptions,options:nestedOptions}}/>;
 if(htmlComponentID==='HTMLArticle'){
  const refs=options.backlinks?.get(el.readerKey)||[];
  return <section data-article={el.readerKey} data-node={el.readerNode}>{rendered}{SHOW_BACKLINKS&&refs.length>0&&<aside className="backlinks"><span>この条文を参照</span>{refs.map(r=><ReferenceButton options={options} candidates={[r]} key={`${r.sourceIndex}-${r.key}`} className="reference backlink-reference" preview={anchor=>options.previewDelegation([r],'この条文を参照',options.index,anchor)}>{LABELS[r.sourceIndex]}・{r.label} →</ReferenceButton>)}</aside>}</section>;
 }
 if(htmlComponentID==='HTMLArticleGroup')return <div data-node={el.readerNode} data-group-first={walk(el,'Article')[0]?.readerKey}>{rendered}</div>;
 if(['HTMLLaw','HTMLParagraphItem','HTMLAppdxItem','HTMLArticleGroup','HTMLTable','HTMLTableStruct'].includes(htmlComponentID))return <div data-node={el.readerNode}>{rendered}</div>;
 return rendered;
}
class RenderBoundary extends React.Component{constructor(p){super(p);this.state={error:false};}static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<p role="alert">この法令の表示に失敗しました。別の法令を選ぶか、e-Govで本文をご確認ください。</p>:this.props.children;}}
function App(){
 const [ids,setIds]=useState(linkedIds||(saved.ids?.length===3?saved.ids:DEFAULTS)),[laws,setLaws]=useState([null,null,null]);
 const [started,setStarted]=useState(!!linkedIds);
 const [library,setLibrary]=useState(()=>{try{return readLibrary(localStorage);}catch{return readLibrary(null);}}),[libraryError,setLibraryError]=useState(''),[libraryTab,setLibraryTab]=useState(null);
 const [favoriteToast,setFavoriteToast]=useState(null);
 const toastTimer=useRef(null);
 const jumpTimer=useRef(null);
 useEffect(()=>()=>clearTimeout(jumpTimer.current),[ids]);
 useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
 function notifyFavorite(message){clearTimeout(toastTimer.current);setFavoriteToast({message,id:Date.now()});toastTimer.current=setTimeout(()=>setFavoriteToast(null),2000);}
 const lastRecorded=useRef(null);
 const currentEntry=useMemo(()=>started&&ids.some(Boolean)&&ids.every((id,i)=>!id||laws[i]?.id===id)?{ids:[...ids],titles:laws.map(l=>l?.title||''),time:Date.now()}:null,[started,ids,laws]);
 const isFavorite=!!currentEntry&&library.favorites.some(row=>entryKey(row.ids)===entryKey(currentEntry.ids));
 useEffect(()=>{try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(library));setLibraryError('');}catch{setLibraryError('このブラウザでは保存できません。今回開いている間のみ保持します。');}},[library]);
 useEffect(()=>{if(!currentEntry||!library.enabled)return;const key=entryKey(currentEntry.ids);if(lastRecorded.current===key)return;lastRecorded.current=key;setLibrary(p=>({...p,history:rememberEntry(p.history,currentEntry,30)}));},[currentEntry,library.enabled]);
 const [visited,setVisited]=useState([true,false,false]);
 const sectionCache=useRef(new WeakMap());
 const [dark,setDark]=useState(!!saved.dark);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
 const [utility,setUtility]=useState(null),[randomLoading,setRandomLoading]=useState(false),[randomOpen,setRandomOpen]=useState(false);
 const randomCatalog=useRef(null);
 const [loading,setLoading]=useState([false,false,false]),[errors,setErrors]=useState(['','','']);
 const [selected,setSelected]=useState(['','','']);
 const [dialog,setDialog]=useState(null),[query,setQuery]=useState(''),[results,setResults]=useState([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const [font,setFont]=useState(saved.font||17),[notice,setNotice]=useState(''),[mobile,setMobile]=useState(0);
 const previewTimer=useRef(null),previewHide=useRef(null),hoverNote=useRef(false);
 const noteAnchor=useRef(null);
 const panes=useRef([]),searchSeq=useRef(0),noteSeq=useRef(0),noteCache=useRef(new Map());
 const [note,setNote]=useState(null);
 const [readingHistory,setReadingHistory]=useState([[],[],[]]);
 const [weights,setWeights]=useState(validWeights(saved.weights)?saved.weights:[1,1,1]);
 const [phone,setPhone]=useState(()=>matchMedia('(max-width:700px)').matches);
 useEffect(()=>{const mq=matchMedia('(max-width:700px)'),update=()=>setPhone(mq.matches);mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update);},[]);
 useEffect(()=>{setVisited(v=>v[mobile]?v:v.map((seen,i)=>seen||i===mobile));},[mobile]);
 const [desktopAligned,setAligned]=useState(true);
 const aligned=!phone&&desktopAligned;
 const scrollLeader=useRef({index:-1,until:0});
 const alignment=useMemo(()=>aligned&&laws.every((law,i)=>!ids[i]||law)?buildDetailedAlignment(laws):{unitMode:true,articles:[[],[],[]],assignments:[new Map(),new Map(),new Map()]},[laws,aligned,ids]);
 useLayoutEffect(()=>{
  if(!aligned){clearAlignment(panes.current);return;}
  if(!laws.every((law,i)=>!ids[i]||law))return;
  let frame,lastSize='';const update=()=>{const size=panes.current.map(p=>`${p?.clientWidth}:${p?.clientHeight}`).join(',');if(size===lastSize)return;lastSize=size;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const anchors=panes.current.map(captureReadingAnchor);alignArticleRows(panes.current,alignment);panes.current.forEach((pane,i)=>restoreReadingAnchor(pane,anchors[i]));});};
  update();const observer=new ResizeObserver(update);panes.current.forEach(pane=>pane&&observer.observe(pane));
  return()=>{observer.disconnect();cancelAnimationFrame(frame);clearAlignment(panes.current);};
 },[aligned,alignment,font,weights]);
 const pendingAnchors=useRef(null);
 const [catalogMode,setCatalogMode]=useState(false);
 const [bundle,setBundle]=useState(null),[bundleLoading,setBundleLoading]=useState(false),[companionPicker,setCompanionPicker]=useState(null);
 const scrollFrames=useRef([]);
 const backlinks=useMemo(()=>buildBacklinks(laws),[laws]);
 useEffect(()=>{if(!note)return;const escape=e=>{if(e.key==='Escape')closeNoteBranch(note);};const outside=e=>{if(!e.target.closest?.('.reference-note, .reference'))closeNote();};document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);};},[note]);
 useEffect(()=>{noteAnchor.current=null;noteSeq.current++;setNote(null);setReadingHistory([[],[],[]]);},[ids]);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify({ids,font,weights,dark}));}catch{setNotice('このブラウザでは設定を保存できません。');}},[ids,font,weights,dark]);
 useEffect(()=>{document.title=lawPageTitle(laws);if(started)history.replaceState(null,'',lawURL(location.href,ids));},[ids,laws,started]);
 useEffect(()=>{
 if(!started)return;
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
 },[ids,started]);
 function trackReading(i){
  if(aligned){const now=performance.now();if(scrollLeader.current.index===i||now>scrollLeader.current.until){scrollLeader.current={index:i,until:now+120};const top=panes.current[i]?.scrollTop;panes.current.forEach((pane,j)=>{if(pane&&i!==j&&Math.abs(pane.scrollTop-top)>1)pane.scrollTop=top;});}}
  if(scrollFrames.current[i])return;
  scrollFrames.current[i]=requestAnimationFrame(()=>{
   scrollFrames.current[i]=null;const panel=panes.current[i];if(!panel||!panel.clientHeight)return;
   let cache=sectionCache.current.get(panel);const root=panel.firstElementChild;if(!cache||cache.root!==root||cache.law!==laws[i]){cache={root,law:laws[i],sections:[...panel.querySelectorAll('section[data-article]')]};sectionCache.current.set(panel,cache);}
   const current=readingSectionAt(cache.sections,panel.getBoundingClientRect().top+30),key=current?.dataset.article||'';
   setSelected(prev=>prev[i]===key?prev:prev.map((v,j)=>j===i?key:v));
  });
 }
 useEffect(()=>{laws.forEach((_,i)=>trackReading(i));const update=()=>laws.forEach((_,i)=>trackReading(i));window.addEventListener('resize',update);return()=>{window.removeEventListener('resize',update);scrollFrames.current.forEach(frame=>cancelAnimationFrame(frame));scrollFrames.current=[];};},[laws,font,mobile]);
 function rememberPosition(index){
  const anchor=captureReadingAnchor(panes.current[index]);if(!anchor)return;
  setReadingHistory(prev=>prev.map((entries,i)=>i===index?[...entries.slice(-49),anchor]:entries));
 }
 function goBack(index){
  const anchor=readingHistory[index].at(-1);if(!anchor)return;
  closeNote();setMobile(index);setReadingHistory(prev=>prev.map((entries,i)=>i===index?entries.slice(0,-1):entries));
  requestAnimationFrame(()=>{const panel=panes.current[index];panel?.scrollTo({top:panel.scrollTop,behavior:'instant'});restoreReadingAnchor(panel,anchor);trackReading(index);});
 }
 function jump(i,key){slide(i,{articleKey:key});}
 function slide(index,target){
  clearTimeout(jumpTimer.current);
  jumpTimer.current=setTimeout(()=>performSlide(index,target),300);
 }
 function performSlide(index,target){
  if(phone&&!visited[index])flushSync(()=>setVisited(v=>v.map((seen,i)=>seen||i===index)));
  const panel=panes.current[index];if(!panel)return;
  const element=(target.node?panel.querySelector(`[data-node="${target.node}"]`):null)||(target.articleKey?panel.querySelector(`[data-article="${target.articleKey}"]`):panel.querySelector('.law'));
  if(!element){setNotice('参照先の表示位置を見つけられませんでした。');return;}
  scrollLeader.current={index,until:performance.now()+150};rememberPosition(index);closeNote();setMobile(index);
  if(target.articleKey!==undefined)setSelected(p=>p.map((v,i)=>i===index?target.articleKey:v));
  requestAnimationFrame(()=>{
   // Smooth scroll events from multiple synchronized panes can interrupt each other.
   // Move every pane atomically and measure the actual text below alignment gaps.
   const baseline=element.matches('section')?element:(element.querySelector('.paragraph-item-main')||element);
   const top=Math.max(0,baseline.getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop-16);
   scrollLeader.current={index,until:performance.now()+500};
   panel.scrollTo({top,behavior:'instant'});
   if(aligned)panes.current.forEach((pane,i)=>{if(pane&&i!==index)pane.scrollTo({top:panel.scrollTop,behavior:'instant'});});
   trackReading(index);
  });
 }
 function backlink(index,key,node){slide(index,{articleKey:key,node});setNotice(`${LABELS[index]}の参照元条文を表示しました。`);}
 function startPreview(show){clearTimeout(previewTimer.current);previewTimer.current=setTimeout(show,300);}
 function endPreview(){clearTimeout(previewTimer.current);}
 function parentNote(anchor){return noteById(note,anchor.closest('.reference-note')?.dataset.noteId);}
 function newNotePosition(anchor){const parent=parentNote(anchor);return {...(parent?childNotePosition(parent,{width:window.innerWidth,height:window.innerHeight},anchor.getBoundingClientRect()):notePosition(anchor)),previousNote:parent,id:++noteSeq.current};}
 function closeNoteBranch(sheet){clearTimeout(previewTimer.current);clearTargetHighlights();noteAnchor.current=null;noteSeq.current++;setNote(sheet.previousNote||null);}
 useEffect(()=>()=>{clearTimeout(previewTimer.current);clearTimeout(previewHide.current);},[]);
 async function onReference(target,sourceIndex,anchor,preview=false,sourceLaw=laws[sourceIndex]){

  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);
  const wasHover=hoverNote.current;hoverNote.current=preview;
  if(!preview){
   if(target.internal){slide(sourceIndex,{node:target.node,articleKey:target.article});return;}
   const destination=laws.findIndex(l=>l?.num===target.lawNum);
   if(destination>=0){const found=findTarget(laws[destination],target);if(found)slide(destination,{node:found.el.readerNode,articleKey:found.articleKey});else setNotice('表示中の版には指定の参照条文が見つかりませんでした。');return;}
  }
  if(noteAnchor.current===referenceAnchorKey(anchor,sourceIndex)){
   if(!parentNote(anchor))closeNote();return;
  }noteAnchor.current=referenceAnchorKey(anchor,sourceIndex);
  const position=newNotePosition(anchor);
  if(target.internal){
   noteSeq.current++;
   const law=sourceLaw,nodes=target.nodes||[target.node];
   const contents=nodes.map(node=>[...law.analysis.containers.values()].find(c=>c.el.readerNode===node)?.el).filter(Boolean);
   setNote({...position,target,law,contents,loading:false,local:true,error:contents.length?null:'参照条文を見つけられませんでした。'});return;
  }
  const index=sourceLaw?.num===target.lawNum&&laws.includes(sourceLaw)?sourceIndex:laws.findIndex(l=>l?.num===target.lawNum);
  if(index>=0){const found=findTarget(laws[index],target);
   if(index===sourceIndex||preview){noteSeq.current++;setNote({...position,target,law:laws[index],content:found?.el,loading:false,local:true,error:found?null:'表示中の版には指定の参照条文が見つかりませんでした。'});}
   else if(found){slide(index,{node:found.el.readerNode,articleKey:found.articleKey});setNotice(`${LABELS[index]}の参照先へ移動しました。`);}else{setNotice('表示中の版には指定の参照条文が見つかりませんでした。');}return;
  }
  const seq=++noteSeq.current;setNote({target,...position,loading:true});
  try{let law=noteCache.current.get(target.lawNum);if(!law){const data=await request(`${API}/law_data/${encodeURIComponent(target.lawNum)}?law_full_text_format=xml&response_format=json`);law=await parseLaw(data,'e-Gov APIから取得');noteCache.current.set(target.lawNum,law);}if(seq!==noteSeq.current)return;
   const found=findTarget(law,target);setNote({target,...position,loading:false,law,content:found?.el,error:found?null:'この版には指定された条文が見つかりませんでした。'});
  }catch(e){if(seq===noteSeq.current)setNote({target,...position,loading:false,error:e.message});}
 }
 function onDefinition(definition,index,anchor,preview=false,sourceLaw=laws[index]){
  if(!preview){slide(index,{node:definition.content.readerNode});return;}
  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);const wasHover=hoverNote.current;hoverNote.current=preview;
  if(noteAnchor.current===referenceAnchorKey(anchor,index)){if(!parentNote(anchor))closeNote();return;}noteAnchor.current=referenceAnchorKey(anchor,index);noteSeq.current++;
  setNote({target:{},law:sourceLaw,content:definition.content,...newNotePosition(anchor),loading:false});
 }
 function previewDelegation(candidates,word,index,anchor){
  if(candidates.length===1){const r=candidates[0],law=laws[r.sourceIndex],article=walk(law.el,'Article').find(a=>a.readerKey===r.key);onReference({internal:true,node:r.destinationNode||article.readerNode},r.sourceIndex,anchor,true);return;}
  onDelegation(candidates,word,index,anchor,true);
 }
 function onDelegation(candidates,word,index,anchor,preview=false){
  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);const wasHover=hoverNote.current;hoverNote.current=preview;
  if(noteAnchor.current===referenceAnchorKey(anchor,index)){if(!parentNote(anchor))closeNote();return;}noteAnchor.current=referenceAnchorKey(anchor,index);
  if(candidates.length===1){closeNote();backlink(candidates[0].sourceIndex,candidates[0].key,candidates[0].destinationNode);return;}
  noteSeq.current++;
  setNote({target:{},law:laws[index],candidates,word,...newNotePosition(anchor),loading:false});
 }
 function clearTargetHighlights(){document.querySelectorAll('.reference-target-highlight').forEach(el=>el.classList.remove('reference-target-highlight'));}
 function highlightTargets(target,index,candidates){
  clearTargetHighlights();
  const destinations=candidates?.map(r=>({index:r.sourceIndex,node:r.destinationNode,articleKey:r.key}))||[];
  if(target?.internal){for(const node of target.nodes||[target.node])destinations.push({index,node});}
  else if(target?.article){const destination=laws.findIndex(l=>l?.num===target.lawNum);if(destination>=0){const found=findTarget(laws[destination],target);if(found)destinations.push({index:destination,node:found.el.readerNode});}}
  for(const destination of destinations){const panel=panes.current[destination.index],element=destination.node?panel?.querySelector(`[data-node="${destination.node}"]`):panel?.querySelector(`[data-article="${destination.articleKey}"]`);element?.classList.add('reference-target-highlight');}
 }
 useEffect(()=>clearTargetHighlights,[ids,aligned,note]);
 function chooseDelegation(candidate,chooser,anchor){
  endPreview();const candidateKey=`${candidate.sourceIndex}:${candidate.key}:${candidate.destinationNode||''}`;if(note?.previousNote?.id===chooser.id&&note.candidateKey===candidateKey)return;
  const law=laws[candidate.sourceIndex];
  const content=(candidate.destinationNode?[...law.analysis.containers.values()].find(c=>c.el.readerNode===candidate.destinationNode)?.el:null)||walk(law.el,'Article').find(a=>a.readerKey===candidate.key);
  noteAnchor.current=null;const id=++noteSeq.current;
  setNote({...childNotePosition(chooser,{width:window.innerWidth,height:window.innerHeight},anchor?.getBoundingClientRect()),id,candidateKey,previousNote:chooser,target:{},law,content,loading:false,error:content?null:'参照条文を見つけられませんでした。'});
 }
 function closeNote(){clearTargetHighlights();clearTimeout(previewTimer.current);clearTimeout(previewHide.current);hoverNote.current=false;noteAnchor.current=null;noteSeq.current++;setNote(null);}
 async function search(e){e.preventDefault();if(!query.trim())return;const seq=++searchSeq.current;setSearching(true);setBundleLoading(false);setResults([]);setSearchError('');try{const d=await request(`${API}/laws?law_title=${encodeURIComponent(query.trim())}&limit=100&law_type=${TYPES[dialog]||'Act'}&response_format=json`);if(seq===searchSeq.current){setResults(d.laws||[]);if(!d.laws?.length)setSearchError('一致する法令がありません。検索語を短くしてお試しください。');}}catch(e){if(seq===searchSeq.current)setSearchError(e.message);}finally{if(seq===searchSeq.current)setSearching(false);}}
 function openSearch(){
  setLibraryTab(null);setCatalogMode(false);const seq=++searchSeq.current;setDialog(3);setQuery('');setResults([]);setSearchError('');setSearching(false);setBundleLoading(false);
  if(!laws[0]||laws[0].id!==ids[0]){setBundle(null);return;}
  const act=parentRecord(laws[0]),related=laws.slice(1).filter(Boolean).map(parentRecord);
  setBundle({act,related,missingRelated:false,picks:[...ids]});
  loadRelatedSnapshot(act,{baseURL:import.meta.env.BASE_URL}).then(async snapshot=>{if(!snapshot){const rows=await fetchStandardCompanions(act.revision_info.law_title);snapshot=rows.length?{laws:rows}:null;}if(seq!==searchSeq.current)return;if(!snapshot){setBundle(previous=>previous?{...previous,missingRelated:true}:previous);return;}setBundle(previous=>previous?{...previous,missingRelated:false,related:[...new Map([...snapshot.laws,...related].map(r=>[r.law_info.law_id,r])).values()]}:previous);}).catch(()=>{});
 }
 function closeSearch(){setCompanionPicker(null);searchSeq.current++;setDialog(null);setSearching(false);setBundle(null);setBundleLoading(false);}
 async function choose(id,record){
  if(dialog!==3){setStarted(true);setIds(p=>p.map((v,i)=>i===dialog?id:v));closeSearch();return;}
  const seq=++searchSeq.current;setBundleLoading(true);setSearchError('');
  try{
   let act=record||results.find(r=>r.law_info.law_id===id);
   if(!act){const d=await request(`${import.meta.env.BASE_URL}data/${id}.json`);act={law_info:d.law_info,revision_info:d.revision_info};}
   const title=act.revision_info.law_title;
   let snapshot=null;try{snapshot=await loadRelatedSnapshot(act,{baseURL:import.meta.env.BASE_URL});}catch{}if(seq!==searchSeq.current)return;
   const related=snapshot?.laws||await fetchStandardCompanions(title);
   if(seq!==searchSeq.current)return;
   setBundle({act,related,missingRelated:!snapshot&&!related.length,picks:[id,selectCompanion(related,title,'施行令','CabinetOrder'),selectCompanion(related,title,'施行規則','MinisterialOrdinance,Rule')]});
  }catch(e){if(seq===searchSeq.current)setSearchError(e.message);}
  finally{if(seq===searchSeq.current)setBundleLoading(false);}
 }
 function applyBundle(){setStarted(true);setIds([...bundle.picks]);closeSearch();setNotice('法律・施行令・施行規則をまとめて切り替えました。');}
 function preserveReading(change){pendingAnchors.current=panes.current.map(captureReadingAnchor);closeNote();change();}
 function changeWeights(next){preserveReading(()=>setWeights(next));}
 useLayoutEffect(()=>{if(!pendingAnchors.current)return;const anchors=pendingAnchors.current;pendingAnchors.current=null;panes.current.forEach((panel,i)=>restoreReadingAnchor(panel,anchors[i]));laws.forEach((_,i)=>trackReading(i));},[weights,font]);
 async function randomLaw(){
  if(randomLoading)return;setRandomLoading(true);setSearchError('');
  try{if(!randomCatalog.current){const rows=await fetchLawCatalog('Act');randomCatalog.current=rows.filter(isAvailableLaw);}
   const act=randomLawFrom(randomCatalog.current,ids[0]);if(!act)throw Error('選択できる法律がありません。');
   const title=act.revision_info.law_title,data=await request(`${API}/laws?law_title=${encodeURIComponent(companionSearchTerm(title))}&limit=1000&response_format=json`),related=data.laws.filter(isAvailableLaw);
   setIds([act.law_info.law_id,selectCompanion(related,title,'施行令','CabinetOrder'),selectCompanion(related,title,'施行規則','MinisterialOrdinance,Rule')]);setStarted(true);closeSearch();setRandomOpen(false);setNotice(`${title}を選びました。`);
  }catch(e){setSearchError(e.message);}finally{setRandomLoading(false);}
 }


 const readerHandlers=useRef({});
 readerHandlers.current={highlightTargets,clearTargetHighlights,onReference,onDefinition,onDelegation,previewDelegation,startPreview,endPreview,backlink};
 function lawOptions(law,index,content){const context={};if(content){function path(el){if(el===content)return [el];for(const c of el.children||[])if(typeof c!=='string'){const found=path(c);if(found)return [el,...found];}return null;}for(const el of path(law.el)||[]){if(el.tag==='Article')context.article=el.readerKey;if(el.tag==='Paragraph')context.paragraph=el.attr.Num;if(el.tag==='Item')context.item=el.attr.Num;if(subitemLevel(el.tag))context.subitems=[...(context.subitems||[]),el.attr.Num];}}return {...context,law,laws,index,backlinks:index>=0?backlinks[index]:new Map(),...Object.fromEntries(['highlightTargets','clearTargetHighlights','onDelegation','previewDelegation','startPreview','endPreview'].map(name=>[name,(...args)=>readerHandlers.current[name](...args)])),onReference:(target,i,anchor,preview)=>readerHandlers.current.onReference(target,i,anchor,preview,law),onDefinition:(definition,i,anchor,preview)=>readerHandlers.current.onDefinition(definition,i,anchor,preview,law)};}
 const lawViews=useMemo(()=>laws.map((law,i)=>law&&(!phone||visited[i])&&<RenderBoundary key={law.revision}><HTMLLaw el={law.el} indent={0} htmlOptions={{WrapComponent:Wrap,renderControlEL:true,renderPDFAsLink:true,options:lawOptions(law,i)}}/></RenderBoundary>),[laws,backlinks,phone,visited]);
 return <div className="app" style={{'--reader-font':`${font}px`}}>
  <style>{htmlCSS}</style>
  {favoriteToast&&<div key={favoriteToast.id} className="favorite-toast" role="status" aria-live="polite">{favoriteToast.message}</div>}
  <header className="header"><a className="brand" href={import.meta.env.BASE_URL} aria-label="LawRow トップページへ"><span className="brand-mark"><svg viewBox="0 0 460 240" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><g transform="rotate(-10 230 120)"><path className="constellation-line" pathLength="1" strokeWidth="9" d="M31 187 111 122 180 127 263 120 312 173 422 117 402 37"/>{[[31,187],[111,122],[180,127],[263,120],[312,173],[422,117],[402,37]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} className="constellation-star" r="14" fill="currentColor" stroke="none"/>)}</g></svg></span><div><h1>LawRow — 法令三段表メーカー</h1><p>法令三段表の様式は政令に定める。</p></div></a><div className="header-actions"><button className="bundle-open" onClick={()=>openSearch(3)}>法令を選ぶ</button><div className="font-control"><button aria-label="文字を小さく" onClick={()=>preserveReading(()=>setFont(v=>Math.max(11,v-1)))}>A−</button><button aria-label="文字を大きく" onClick={()=>preserveReading(()=>setFont(v=>Math.min(24,v+1)))}>A＋</button></div><button className="alignment-toggle" aria-pressed={aligned} onClick={()=>{closeNote();setAligned(v=>!v);}}>三段化 {aligned?'ON':'OFF'}</button><button onClick={()=>setUtility('export')} disabled={!laws.some(Boolean)||loading.some(Boolean)}>pdf保存</button><button className="random-open" aria-label="ランダムに法令を開く" title="ランダムに法令を開く" onClick={()=>{setSearchError('');setRandomOpen(true);}}><DiceIcon/></button><button className="favorite-toggle" disabled={!currentEntry} aria-label={isFavorite?'お気に入りから解除':'お気に入りに追加'} aria-pressed={isFavorite} title={isFavorite?'お気に入りから解除':'お気に入りに追加'} onClick={()=>{if(!currentEntry)return;setLibrary(p=>({...p,favorites:isFavorite?p.favorites.filter(row=>entryKey(row.ids)!==entryKey(currentEntry.ids)):rememberEntry(p.favorites,currentEntry,50)}));notifyFavorite(isFavorite?'お気に入りを解除しました':'お気に入りに追加しました');}}><svg viewBox="0 0 24 24" width="19" height="19" fill={isFavorite?'currentColor':'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.38 1.06 6.19L12 17.19l-5.56 2.92 1.06-6.19L3 9.54l6.22-.91Z"/></svg></button><button className="theme-toggle" aria-label={dark?'ライトモードに切り替え':'ダークモードに切り替え'} aria-pressed={dark} title={dark?'ライトモードに切り替え':'ダークモードに切り替え'} onClick={()=>setDark(v=>!v)}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dark?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></>:<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>}</svg></button></div></header>
  {started?<><nav className="mobile-tabs" aria-label="表示する列">{LABELS.map((label,i)=><button key={label} aria-label={`${label}${!ids[i]?"（未選択）":""}`} aria-pressed={mobile===i} onClick={()=>{setMobile(i);if(aligned&&matchMedia('(max-width:700px)').matches){const column=panes.current[i]?.parentElement,main=column?.parentElement;if(main)main.scrollTo({left:main.scrollLeft+column.getBoundingClientRect().left-main.getBoundingClientRect().left-10,behavior:'auto'});}}}>{label}{!ids[i]&&<span className="mobile-unselected">未選択</span>}</button>)}</nav>
  <main onScroll={e=>{if(e.target!==e.currentTarget||!aligned||!matchMedia('(max-width:700px)').matches)return;const main=e.currentTarget,columns=[...main.children];const nearest=columns.reduce((best,c,i)=>Math.abs(c.getBoundingClientRect().left-main.getBoundingClientRect().left-10)<best.distance?{index:i,distance:Math.abs(c.getBoundingClientRect().left-main.getBoundingClientRect().left-10)}:best,{index:0,distance:Infinity});setMobile(nearest.index);}} className={`columns ${aligned?'aligned-columns':''} ${aligned?'detail-aligned':''}`} style={{'--column-widths':weights.map(v=>`minmax(0, ${v}fr)`).join(' ')}}>{LABELS.map((label,i)=><div className={`column col-${i} ${mobile===i?'active':''}`} key={label}>
   <button className="column-width-toggle" aria-label={weights[i]===2?`${label}の幅を元に戻す`:`${label}の幅を2倍にする`} aria-pressed={weights[i]===2} title={weights[i]===2?'等幅に戻す':'この列を2倍に広げる'} onClick={()=>changeWeights(toggleColumnWidth(weights,i))}><span className="colored-label">{label}</span><svg className="column-arrow-icon" viewBox="0 0 32 20" width="32" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{weights[i]===2?<path d="M2 10h10M8 6l4 4-4 4M30 10H20m4-4-4 4 4 4"/>:<path d="M4 10h24M9 5l-5 5 5 5M23 5l5 5-5 5"/>}</svg></button>
   <div className="column-header"><h3>{laws[i]?.title||(!started?'法令を選択してください':loading[i]?'法令を読み込み中…':!ids[i]?'法令が選ばれていません':'法令を取得できませんでした')}</h3><p className="law-number">{laws[i]?.num||'　'}{laws[i]?.date&&<span className="law-date">施行日 {laws[i].date}</span>}</p><label className="jump-label">条文へ移動<select aria-label={`${label}の条文へ移動`} disabled={!laws[i]} value={selected[i]} onChange={e=>jump(i,e.target.value)}><option value="">目次・前文</option>{laws[i]?.articles.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
   </div>
   <div className="reader" onScroll={()=>trackReading(i)} ref={el=>panes.current[i]=el} tabIndex="0" aria-label={`${label}の本文`}>
    {!started?<div className="empty-law"><p>「法令を選ぶ」から選択すると、本文を読み込みます。</p></div>:loading[i]?<div className="loading"><div className="spinner"/><p>法令を読み込んでいます</p></div>:errors[i]?<div role="alert" className="error"><h4>法令を取得できませんでした</h4><p>{errors[i]}</p><button onClick={()=>setIds(p=>[...p])}>再読み込み</button><button onClick={()=>openSearch(i)}>別の法令を選ぶ</button></div>:!ids[i]?<div className="empty-law"><p>この列に表示する法令は未選択です。</p><button onClick={()=>openSearch(i)}>法令を選ぶ</button></div>:lawViews[i]}
   </div><div className="column-footer">{laws[i]?.articles.length||0} 条文（附則を含む）{laws[i]&&<a href={`https://laws.e-gov.go.jp/law/${laws[i].id}`} target="_blank" rel="noreferrer">e-Govで開く ↗</a>}</div>
  </div>)}</main></>:<main className="welcome"><div className="welcome-content"><p className="welcome-name"><ruby>LawRow<rp>（</rp><rt>ローロー</rt><rp>）</rp></ruby></p><p className="welcome-kicker">法令三段表メーカー</p><p className="welcome-description">法律・施行令・施行規則を読み込み、対応する条項号を三段表で表示します。</p><div className="welcome-preview" aria-hidden="true">{LABELS.map((label,i)=><div key={label} className={`welcome-paper welcome-paper-${i}`}><span>{label}</span><i/><i/><i/><i/></div>)}</div><button className="primary welcome-start" onClick={()=>openSearch()}>法令を選ぶ <span aria-hidden="true">→</span></button><p className="welcome-hint">法令名での検索、一覧、お気に入り、履歴から選択できます。</p></div></main>}
  <footer className="footer"><span>法令データ：<a href="https://laws.e-gov.go.jp/" target="_blank" rel="noreferrer">e-Gov法令検索</a></span><span>Powered by <a href="https://github.com/yamachig/Lawtext" target="_blank" rel="noreferrer">Lawtext</a> <a href={`${import.meta.env.BASE_URL}LAWText-LICENSE.txt`} target="_blank">MIT License</a><a className="github-profile" href="https://github.com/ThozK" target="_blank" rel="noreferrer" aria-label="ThozKのGitHubページ"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15A10.8 10.8 0 0 1 12 6.15c.96 0 1.92.13 2.82.38 2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"/></svg></a></span></footer>
  {companionPicker!==null&&bundle&&<CompanionPicker parent={bundle.act} index={companionPicker} onClose={()=>setCompanionPicker(null)} onChoose={row=>{setBundle(previous=>({...previous,related:[...previous.related.filter(r=>r.law_info.law_id!==row.law_info.law_id),row],picks:previous.picks.map((v,i)=>i===companionPicker?row.law_info.law_id:v)}));setCompanionPicker(null);}}/>}
  {randomOpen&&<div className="overlay random-overlay" onClick={e=>{if(e.target===e.currentTarget&&!randomLoading)setRandomOpen(false);}}><dialog open className="dialog random-dialog" aria-modal="true" aria-labelledby="random-title" onKeyDown={e=>{if(e.key==='Escape'&&!randomLoading)setRandomOpen(false);if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><h2 id="random-title">ランダムに法令を開きますか？</h2><RandomWave active={randomLoading}/><p role="status">{randomLoading?'読み込んでいます。':'知らない法令に出会う。'}</p><div className="random-confirm-actions"><button autoFocus className="primary" disabled={randomLoading} onClick={randomLaw}>開く</button><button disabled={randomLoading} onClick={()=>setRandomOpen(false)}>キャンセル</button></div>{searchError&&<p role="alert">{searchError}</p>}</dialog></div>}
  {utility&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setUtility(null);}}><dialog open className="dialog" aria-modal="true" aria-label={utility==='export'?'pdf保存':'ブックマーク追加'} onKeyDown={e=>{if(e.key==='Escape')setUtility(null);}}><div className="dialog-heading"><h2>{utility==='export'?'pdf保存':'ブックマーク追加'}</h2><button aria-label="閉じる" onClick={()=>setUtility(null)}>×</button></div>{utility==='bookmark'?<p><strong>{/Mac|iPhone|iPad/.test(navigator.platform)?'⌘D':'Ctrl+D'}</strong> でブックマークに追加できます。</p>:<><p className="catalog-help">PDFはA4縦置きの上・中・下3段で、各段を右から左へ縦書きにします。下のボタンで新しいウィンドウに表示します。その画面の「PDFとして保存・印刷」からPDFを保存できます。</p><div className="export-options"><button onClick={()=>{try{openPdf(laws);setUtility(null);}catch(e){setNotice(e.message);}}}>新しいウィンドウで表示</button></div></>}</dialog></div>}
  {noteStack(note).map((note,depth)=><aside key={note.id} data-note-id={note.id} className={`reference-note${note.candidates?' candidate-popup':''}`} role="dialog" aria-label="参照法令の付箋" style={{zIndex:8+depth,left:note.left,top:note.top,width:note.width,maxHeight:note.maxHeight||`calc(100dvh - ${note.top+12}px)`}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeNoteBranch(note);}}}><div className="note-heading"><h3>{note.candidates?'下位法令の候補':note.law?.title||note.target.title||note.target.lawNum}</h3>{note.law&&laws.includes(note.law)&&!note.candidates&&<button className="note-jump-icon" aria-label="この条項へ移動" title="この条項へ移動" onClick={()=>{const index=laws.indexOf(note.law),content=note.contents?.[0]||note.content;slide(index,{node:content?.readerNode});}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>}<button aria-label={note.candidates?"候補を閉じる":"付箋を閉じる"} onClick={()=>closeNoteBranch(note)}>×</button></div>{note.law&&!laws.some(l=>l?.num===note.law.num)&&<a className="note-open-law" href={lawURL(new URL(import.meta.env.BASE_URL,location.href).href,standaloneIds(note.law))} target="_blank" rel="noreferrer">この法令を新しいタブで開く ↗</a>}{note.candidateList&&!note.candidates&&<button className="note-jump" onClick={()=>{clearTargetHighlights();setNote(previous=>({...previous,...previous.candidateList,content:undefined,contents:undefined,error:null}));}}>← 候補一覧に戻る</button>}<div className="note-body">{note.candidates?<div className="delegation-choices"><p>「{note.word}」の参照候補を選んでください。</p>{note.candidates.map(r=><button key={`${r.sourceIndex}-${r.key}`} onMouseEnter={()=>{highlightTargets(null,0,[r]);}} onMouseLeave={()=>{clearTargetHighlights();endPreview();}} onFocus={()=>{highlightTargets(null,0,[r]);}} onBlur={()=>{clearTargetHighlights();endPreview();}} onClick={e=>{clearTargetHighlights();chooseDelegation(r,note,e.currentTarget);}}>{LABELS[r.sourceIndex]}・{r.label} →</button>)}</div>:note.loading?<p role="status">参照条文を読み込み中…</p>:note.error?<p role="alert">{note.error}</p>:<RenderBoundary key={note.law.revision}>{(note.contents||[note.content]).map((content,k)=><div className="note-excerpt" key={k}>{noteContext(note.law,content)&&<p className="note-location">{noteContext(note.law,content)}</p>}<HTMLAnyELs els={[content]} indent={0} htmlOptions={{WrapComponent:Wrap,renderControlEL:true,renderPDFAsLink:true,options:lawOptions(note.law,laws.findIndex(l=>l?.num===note.law.num),content)}}/></div>)}</RenderBoundary>}</div></aside>)}
  {dialog!==null&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeSearch();}}><dialog open className={catalogMode==='related'&&!bundle?'dialog related-dialog':'dialog'} aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==='Escape')closeSearch();if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll('button:not(:disabled),input,a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><div className="dialog-heading"><div><span className="eyebrow">SELECT LAW</span><h2 id="dialog-title">法令を選ぶ</h2></div><button aria-label="閉じる" onClick={closeSearch}>×</button></div><nav className="selection-modes law-selection-tabs" aria-label="法令の選び方"><button aria-pressed={libraryTab===null&&catalogMode!==true} onClick={()=>{setLibraryTab(null);setCatalogMode(false);setBundle(null);}}>名前で検索</button><button aria-pressed={libraryTab===null&&catalogMode===true} onClick={()=>{setLibraryTab(null);setCatalogMode(true);setBundle(null);}}>一覧から探す</button><button aria-pressed={libraryTab==='favorites'} onClick={()=>setLibraryTab('favorites')}>お気に入り</button><button aria-pressed={libraryTab==='history'} onClick={()=>setLibraryTab('history')}>履歴</button></nav>{(libraryTab==='favorites'||libraryTab==='history')&&<LawLibrary tab={libraryTab} library={library} setLibrary={setLibrary} current={currentEntry} error={libraryError} onOpen={row=>{setStarted(true);setIds([...row.ids]);closeSearch();}}/>}<div hidden={libraryTab!==null}>{!bundle&&!bundleLoading&&catalogMode==='related'&&laws[0]&&<RelatedLaws parent={parentRecord(laws[0])} type={TYPES[dialog]} onChoose={r=>choose(r.law_info.law_id,r)}/>} {!bundle&&!bundleLoading&&catalogMode===true&&<LawCatalog type={TYPES[dialog]||'Act'} onChoose={r=>choose(r.law_info.law_id,r)}/>} {!bundle&&!catalogMode&&<form onSubmit={search}><label htmlFor="search-law">法令名で検索</label><div className="search-row"><input id="search-law" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：個人情報、建築基準"/><button className="primary" disabled={searching||!query.trim()}>{searching?'検索中…':'検索'}</button></div></form>}<div className="results" aria-live="polite">{searchError&&<p role="alert">{searchError}</p>}{!bundle&&!bundleLoading&&!catalogMode&&results.map(r=><button className="result" key={r.law_info.law_id} onClick={()=>choose(r.law_info.law_id)}><strong>{r.revision_info.law_title}</strong><span>{r.law_info.law_num} · {!isAvailableLaw(r)?'廃止法令':r.revision_info.current_revision_status||''}</span></button>)}</div>{bundleLoading&&<p role="status">政省令のリストを読み込んでいます…</p>}{bundle&&<div className="bundle-review"><h3>{bundle.act.revision_info.law_title}</h3><p>施行令・施行規則を選んでください。リストから別の法令も選べます。</p>{bundle.missingRelated&&<p className="catalog-help" role="status">e-Gov経由で表示できる政省令の候補はありません。</p>}{[1,2].map(i=><label key={i}>{LABELS[i]}<select aria-label={`一括選択の${LABELS[i]}`} value={bundle.picks[i]||''} onChange={e=>setBundle(p=>({...p,picks:p.picks.map((v,j)=>j===i?e.target.value||null:v)}))}><option value="">該当なし／表示しない</option>{bundle.related.filter(r=>TYPES[i].split(',').includes(r.law_info.law_type)).map(r=><option key={r.law_info.law_id} value={r.law_info.law_id}>{r.revision_info.law_title}</option>)}</select><button type="button" onClick={()=>setCompanionPicker(i)}>リストから選ぶ</button></label>)}<button className="primary" onClick={applyBundle}>この組み合わせで開く</button><button onClick={()=>setBundle(null)}>法令を選び直す</button></div>}<p className="dialog-note">e-Gov法令APIを使用します。検索結果には廃止法令が含まれる場合があります。</p></div></dialog></div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
