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
import {definitionFor} from './definitions.js';
import {noteContext} from './noteContext.js';
import {buildDetailedAlignment,alignArticleRows,clearAlignment} from './alignment.js';
import {citationRuns} from './citations.js';
import './style.css';

const API='https://laws.e-gov.go.jp/api/2';
const DEFAULTS=['415AC0000000057','415CO0000000507','428M60020000003'];
const EXAMPLES=[
 {label:'個人情報保護法',title:'個人情報の保護に関する法律',ids:DEFAULTS},
 {label:'廃棄物処理法',title:'廃棄物の処理及び清掃に関する法律',ids:['345AC0000000137','346CO0000000300','346M50000100035']},
];
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
function ReferenceButton({options,preview,onClick,...props}){
 return <button {...props} onMouseEnter={e=>{const anchor=e.currentTarget;options.startPreview(()=>preview(anchor));}} onMouseLeave={options.endPreview} onFocus={e=>{const anchor=e.currentTarget;options.startPreview(()=>preview(anchor));}} onBlur={options.endPreview} onClick={onClick}/>;
}
function Wrap({htmlComponentID,childProps,ChildComponent}){
 const {el,htmlOptions}=childProps,options=htmlOptions.options||{};
 if(htmlComponentID==='HTMLControlRun'&&el.text()==='この法律')return <>{el.text()}</>;
 if(htmlComponentID==='HTMLControlRun'&&el.tag==='____VarRef'){
  const definition=definitionFor(options.law,el);
  if(definition)return <ReferenceButton options={options} preview={anchor=>options.onDefinition(definition,options.index,anchor,true)} className={`reference definition-reference ref-${['act','order','rule'][options.index]}`} title={`${el.text()}の定義を表示`} onClick={e=>options.onDefinition(definition,options.index,e.currentTarget)}>{el.text()}</ReferenceButton>;
 }
 if(htmlComponentID==='HTMLControlRun'&&el.tag==='____Pointer'){
  if(el.text()==='この法律')return <>{el.text()}</>;
  const env=options.law?.analysis.pointerEnvByEL.get(el);
  const targets=env?.located?.type==='external'?externalTargets(env):env?.located?.type==='internal'?internalTargets(env):[];
  if(targets.length&&targets.every(t=>t.target)){
   const target={...targets.at(-1).target,internal:env.located.type==='internal'};
   return <ReferenceButton options={options} preview={anchor=>options.onReference(target,options.index,anchor,true)} className={`reference ${!target.internal&&options.laws.some((l,i)=>i!==options.index&&l?.num===target.lawNum)?'ref-cross':''} ref-${referenceKind(target,options.index,options.laws)}`} title="参照条項を表示" onClick={e=>options.onReference(target,options.index,e.currentTarget)}>{el.text()}</ReferenceButton>;
  }
  if(targets.some(t=>t.target))return <>{targets.map((t,k)=>t.target?<ReferenceButton options={options} preview={anchor=>options.onReference({...t.target,internal:env.located.type==='internal'},options.index,anchor,true)} className={`reference ${!t.target.internal&&env.located.type!=='internal'&&options.laws.some((l,i)=>i!==options.index&&l?.num===t.target.lawNum)?'ref-cross':''} ref-${referenceKind({...t.target,internal:env.located.type==='internal'},options.index,options.laws)}`} key={k} title="参照条文を表示" onClick={e=>options.onReference({...t.target,internal:env.located.type==='internal'},options.index,e.currentTarget)}>{t.text}</ReferenceButton>:<React.Fragment key={k}>{t.text}</React.Fragment>)}</>;
 }
 if(htmlComponentID==='HTMLControlRun'&&['____LawRef','____LawNum'].includes(el.tag)){
  const lawNum=el.attr.lawNum||el.text();
  return <ReferenceButton options={options} preview={anchor=>options.onReference({lawNum,title:el.attr.suggestedLawTitle},options.index,anchor,true)} className={`reference law-reference ${options.laws.some((l,i)=>i!==options.index&&l?.num===lawNum)?'ref-cross':''} ref-${referenceKind({lawNum},options.index,options.laws)}`} title="参照法令を表示" onClick={e=>options.onReference({lawNum,title:el.attr.suggestedLawTitle},options.index,e.currentTarget)}>{el.text()}</ReferenceButton>;
 }
 if(htmlComponentID==='HTMLSentenceChildrenRun'){
  const parts=citationRuns(childProps.els,options.law).map((part,k)=>{
   if(part?.citation){const target=part.target;return <ReferenceButton key={k} options={options} preview={anchor=>options.onReference(target,options.index,anchor,true)} className={`reference citation-reference ${options.laws?.some((l,i)=>i!==options.index&&l?.num===target.lawNum)?'ref-cross':''} ref-${referenceKind(target,options.index,options.laws||[])}`} title="参照条項を表示" onClick={e=>options.onReference(target,options.index,e.currentTarget)}>{part.text}</ReferenceButton>;}

   if(typeof part!=='string')return <ChildComponent key={k} {...childProps} els={[part]}/>;
   const pieces=[];let offset=0;
   for(const match of part.matchAll(delegationWords)){
    pieces.push(part.slice(offset,match.index));const candidates=delegationCandidates(options.backlinks,{article:options.article,paragraph:options.paragraph,item:options.item,index:options.index},match[0]);
    pieces.push(candidates.length?<ReferenceButton options={options} preview={anchor=>options.previewDelegation(candidates,match[0],options.index,anchor)} className={`reference ref-cross delegation-reference ref-${['act','order','rule'][candidates[0]?.sourceIndex]||'external'}`} key={`${k}-${match.index}`} title="この条項を参照する下位法令を表示" onClick={e=>options.onDelegation(candidates,match[0],options.index,e.currentTarget)}>{match[0]}</ReferenceButton>:match[0]);offset=match.index+match[0].length;
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
 const [started,setStarted]=useState(false);
 const [loading,setLoading]=useState([false,false,false]),[errors,setErrors]=useState(['','','']);
 const [selected,setSelected]=useState(['','','']);
 const [dialog,setDialog]=useState(3),[query,setQuery]=useState(''),[results,setResults]=useState([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const [font,setFont]=useState(saved.font||17),[notice,setNotice]=useState(''),[mobile,setMobile]=useState(0);
 const previewTimer=useRef(null),previewHide=useRef(null),hoverNote=useRef(false);
 const noteAnchor=useRef(null);
 const panes=useRef([]),searchSeq=useRef(0),noteSeq=useRef(0),noteCache=useRef(new Map());
 const [note,setNote]=useState(null);
 const [readingHistory,setReadingHistory]=useState([[],[],[]]);
 const [weights,setWeights]=useState(validWeights(saved.weights)?saved.weights:[1,1,1]);
 const [aligned,setAligned]=useState(false);
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
 const [bundle,setBundle]=useState(null),[bundleLoading,setBundleLoading]=useState(false);
 const scrollFrames=useRef([]);
 const backlinks=useMemo(()=>buildBacklinks(laws),[laws]);
 useEffect(()=>{if(!note)return;const escape=e=>{if(e.key==='Escape'){noteAnchor.current=null;noteSeq.current++;setNote(null);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[note]);
 useEffect(()=>{noteAnchor.current=null;noteSeq.current++;setNote(null);setReadingHistory([[],[],[]]);},[ids]);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify({ids,font,weights}));}catch{setNotice('このブラウザでは設定を保存できません。');}},[ids,font,weights]);
 useEffect(()=>{const url=new URL(location.href);const values=url.searchParams.get('laws')?.split(',');if(values?.length===3&&values.every(v=>v===''||/^[a-zA-Z0-9_]+$/.test(v)))setIds(values.map(v=>v||null));},[]);
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
   const sections=[...panel.querySelectorAll('section[data-article]')].map(el=>({key:el.dataset.article,top:el.getBoundingClientRect().top}));
   const current=chooseReadingSection(sections,panel.getBoundingClientRect().top+30),key=current?.key||'';
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
  const panel=panes.current[index];if(!panel)return;
  const element=(target.node?panel.querySelector(`[data-node="${target.node}"]`):null)||(target.articleKey?panel.querySelector(`[data-article="${target.articleKey}"]`):panel.querySelector('.law'));
  if(!element){setNotice('参照先の表示位置を見つけられませんでした。');return;}
  scrollLeader.current={index,until:performance.now()+150};rememberPosition(index);closeNote();setMobile(index);
  if(target.articleKey!==undefined)setSelected(p=>p.map((v,i)=>i===index?target.articleKey:v));
  requestAnimationFrame(()=>{const top=element.getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;panel.scrollTo({top:Math.max(0,top-16),behavior:reduced?'auto':'smooth'});if(!reduced)element.animate([{backgroundColor:'#b8dfd6'},{backgroundColor:'transparent'}],{duration:1800});});
 }
 function backlink(index,key,node){slide(index,{articleKey:key,node});setNotice(`${LABELS[index]}の参照元条文を表示しました。`);}
 function startPreview(show){clearTimeout(previewTimer.current);clearTimeout(previewHide.current);if(note&&!hoverNote.current)return;previewTimer.current=setTimeout(show,300);}
 function endPreview(){clearTimeout(previewTimer.current);clearTimeout(previewHide.current);previewHide.current=setTimeout(()=>{if(hoverNote.current)closeNote();},180);}
 useEffect(()=>()=>{clearTimeout(previewTimer.current);clearTimeout(previewHide.current);},[]);
 async function onReference(target,sourceIndex,anchor,preview=false){
  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);
  const wasHover=hoverNote.current;hoverNote.current=preview;
  if(!preview){
   if(target.internal){slide(sourceIndex,{node:target.node,articleKey:target.article});return;}
   const destination=laws.findIndex(l=>l?.num===target.lawNum);
   if(destination>=0){const found=findTarget(laws[destination],target);if(found)slide(destination,{node:found.el.readerNode,articleKey:found.articleKey});else setNotice('表示中の版には指定の参照条文が見つかりませんでした。');return;}
  }
  if(note&&noteAnchor.current===anchor&&!preview){
   if(!wasHover){closeNote();return;}
   if(target.internal||laws[sourceIndex]?.num===target.lawNum||!laws.some(l=>l?.num===target.lawNum))return;
   closeNote();
  }noteAnchor.current=anchor;
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
   if(index===sourceIndex||preview){noteSeq.current++;setNote({...position,target,law:laws[index],content:found?.el,loading:false,local:true,error:found?null:'表示中の版には指定の参照条文が見つかりませんでした。'});}
   else if(found){slide(index,{node:found.el.readerNode,articleKey:found.articleKey});setNotice(`${LABELS[index]}の参照先へ移動しました。`);}else{setNotice('表示中の版には指定の参照条文が見つかりませんでした。');}return;
  }
  const seq=++noteSeq.current;setNote({target,...position,loading:true});
  try{let law=noteCache.current.get(target.lawNum);if(!law){const data=await request(`${API}/law_data/${encodeURIComponent(target.lawNum)}?law_full_text_format=xml&response_format=json`);law=await parseLaw(data,'e-Gov APIから取得');noteCache.current.set(target.lawNum,law);}if(seq!==noteSeq.current)return;
   const found=findTarget(law,target);setNote({target,...position,loading:false,law,content:found?.el,error:found?null:'この版には指定された条文が見つかりませんでした。'});
  }catch(e){if(seq===noteSeq.current)setNote({target,...position,loading:false,error:e.message});}
 }
 function onDefinition(definition,index,anchor,preview=false){
  if(!preview){slide(index,{node:definition.content.readerNode});return;}
  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);const wasHover=hoverNote.current;hoverNote.current=preview;
  if(note&&noteAnchor.current===anchor&&!preview){if(wasHover)return;closeNote();return;}noteAnchor.current=anchor;noteSeq.current++;
  const rect=anchor.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
  setNote({target:{},law:laws[index],content:definition.content,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-330)),width,loading:false});
 }
 function previewDelegation(candidates,word,index,anchor){
  if(candidates.length===1){const r=candidates[0],law=laws[r.sourceIndex],article=walk(law.el,'Article').find(a=>a.readerKey===r.key);onReference({lawNum:law.num,article:article.attr.Num},index,anchor,true);return;}
  onDelegation(candidates,word,index,anchor,true);
 }
 function onDelegation(candidates,word,index,anchor,preview=false){
  clearTimeout(previewTimer.current);clearTimeout(previewHide.current);const wasHover=hoverNote.current;hoverNote.current=preview;
  if(note&&noteAnchor.current===anchor&&!preview){if(wasHover&&candidates.length>1)return;closeNote();if(candidates.length>1)return;}noteAnchor.current=anchor;
  if(candidates.length===1){closeNote();backlink(candidates[0].sourceIndex,candidates[0].key,candidates[0].destinationNode);return;}
  const rect=anchor.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);noteSeq.current++;
  setNote({target:{},law:laws[index],candidates,word,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-330)),width,loading:false});
 }
 function closeNote(){clearTimeout(previewTimer.current);clearTimeout(previewHide.current);hoverNote.current=false;noteAnchor.current=null;noteSeq.current++;setNote(null);}
 async function search(e){e.preventDefault();if(!query.trim())return;const seq=++searchSeq.current;setSearching(true);setBundleLoading(false);setResults([]);setSearchError('');try{const d=await request(`${API}/laws?law_title=${encodeURIComponent(query.trim())}&limit=100&law_type=${TYPES[dialog]||'Act'}&response_format=json`);if(seq===searchSeq.current){setResults(d.laws||[]);if(!d.laws?.length)setSearchError('一致する法令がありません。検索語を短くしてお試しください。');}}catch(e){if(seq===searchSeq.current)setSearchError(e.message);}finally{if(seq===searchSeq.current)setSearching(false);}}
 function openSearch(i){setCatalogMode(false);searchSeq.current++;setDialog(i);setQuery('');setResults([]);setSearchError('');setSearching(false);setBundle(null);setBundleLoading(false);}
 function closeSearch(){searchSeq.current++;setDialog(null);setSearching(false);setBundle(null);setBundleLoading(false);}
 async function choose(id,record){
  if(dialog!==3){setStarted(true);setIds(p=>p.map((v,i)=>i===dialog?id:v));closeSearch();return;}
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
 function applyBundle(){setStarted(true);setIds([...bundle.picks]);closeSearch();setNotice('法律・施行令・施行規則をまとめて切り替えました。');}
 function preserveReading(change){pendingAnchors.current=panes.current.map(captureReadingAnchor);closeNote();change();}
 function changeWeights(next){preserveReading(()=>setWeights(next));}
 useLayoutEffect(()=>{if(!pendingAnchors.current)return;const anchors=pendingAnchors.current;pendingAnchors.current=null;panes.current.forEach((panel,i)=>restoreReadingAnchor(panel,anchors[i]));laws.forEach((_,i)=>trackReading(i));},[weights,font]);
 async function share(){const url=new URL(location.href);url.searchParams.set('laws',ids.join(','));try{await navigator.clipboard.writeText(url.toString());setNotice('この3法令を開くURLをコピーしました。');}catch{setNotice(url.toString());}}
 const readerHandlers=useRef({});
 readerHandlers.current={onReference,onDefinition,onDelegation,previewDelegation,startPreview,endPreview,backlink};
 const lawViews=useMemo(()=>laws.map((law,i)=>law&&<RenderBoundary key={law.revision}><HTMLLaw el={law.el} indent={0} htmlOptions={{WrapComponent:Wrap,renderControlEL:true,renderPDFAsLink:true,options:{law,laws,index:i,backlinks:backlinks[i],...Object.fromEntries(['onReference','onDefinition','onDelegation','previewDelegation','startPreview','endPreview'].map(name=>[name,(...args)=>readerHandlers.current[name](...args)])),onBacklink:(...args)=>readerHandlers.current.backlink(...args)}}}/></RenderBoundary>),[laws,backlinks]);
 return <div className="app" style={{'--reader-font':`${font}px`}}>
  <style>{htmlCSS}</style>
  <header className="header"><div className="brand"><span className="brand-mark">三</span><div><h1>三段法令ビューア</h1><p>法律と、その先を。並べて読む。</p></div></div><div className="header-actions"><button className="bundle-open" onClick={()=>openSearch(3)}>法令を選ぶ</button><div className="font-control"><button aria-label="文字を小さく" onClick={()=>preserveReading(()=>setFont(v=>Math.max(11,v-1)))}>A−</button><button aria-label="文字を大きく" onClick={()=>preserveReading(()=>setFont(v=>Math.min(24,v+1)))}>A＋</button></div><button aria-pressed={aligned} onClick={()=>{closeNote();setAligned(v=>!v);}}>三段表化{aligned?' ON':''}</button><button className="share" onClick={share}>閲覧URLをコピー ↗</button></div></header>
  <nav className="mobile-tabs" aria-label="表示する列">{LABELS.map((label,i)=><button key={label} aria-pressed={mobile===i} onClick={()=>setMobile(i)}>{label}</button>)}</nav>
  <main className={`columns ${aligned?'aligned-columns':''} ${aligned?'detail-aligned':''}`} style={{'--column-widths':weights.map(v=>`minmax(0, ${v}fr)`).join(' ')}}>{LABELS.map((label,i)=><div className={`column col-${i} ${mobile===i?'active':''}`} key={label}>
   <button className="column-width-toggle" aria-label={weights[i]===2?`${label}の幅を元に戻す`:`${label}の幅を2倍にする`} aria-pressed={weights[i]===2} title={weights[i]===2?'等幅に戻す':'この列を2倍に広げる'} onClick={()=>changeWeights(toggleColumnWidth(weights,i))}><span className="colored-label">{label}</span><svg className="column-arrow-icon" viewBox="0 0 32 20" width="32" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{weights[i]===2?<path d="M2 10h10M8 6l4 4-4 4M30 10H20m4-4-4 4 4 4"/>:<path d="M4 10h24M9 5l-5 5 5 5M23 5l5 5-5 5"/>}</svg></button>
   <div className="column-header"><h3>{laws[i]?.title||(!started?'法令を選択してください':loading[i]?'法令を読み込み中…':!ids[i]?'法令が選ばれていません':'法令を取得できませんでした')}</h3><p className="law-number">{laws[i]?.num||'　'}{laws[i]?.date&&<span className="law-date">施行日 {laws[i].date}</span>}</p><label className="jump-label"><button type="button" className="reading-back" aria-label={`${label}の一つ前の位置に戻る`} title="一つ前の位置に戻る" disabled={!readingHistory[i].length} onClick={()=>goBack(i)}>↶ 戻る</button>条文へ移動<select aria-label={`${label}の条文へ移動`} disabled={!laws[i]} value={selected[i]} onChange={e=>jump(i,e.target.value)}><option value="">目次・前文</option>{laws[i]?.articles.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
   </div>
   <div className="reader" onScroll={()=>trackReading(i)} ref={el=>panes.current[i]=el} tabIndex="0" aria-label={`${label}の本文`}>
    {!started?<div className="empty-law"><p>「法令を選ぶ」から選択すると、本文を読み込みます。</p></div>:loading[i]?<div className="loading"><div className="spinner"/><p>法令を読み込んでいます</p></div>:errors[i]?<div role="alert" className="error"><h4>法令を取得できませんでした</h4><p>{errors[i]}</p><button onClick={()=>setIds(p=>[...p])}>再読み込み</button><button onClick={()=>openSearch(i)}>別の法令を選ぶ</button></div>:!ids[i]?<div className="empty-law"><p>この列に表示する法令は未選択です。</p><button onClick={()=>openSearch(i)}>法令を選ぶ</button></div>:lawViews[i]}
   </div><div className="column-footer">{laws[i]?.articles.length||0} 条文（附則を含む）{laws[i]&&<a href={`https://laws.e-gov.go.jp/law/${laws[i].id}`} target="_blank" rel="noreferrer">e-Govで開く ↗</a>}</div>
  </div>)}</main>
  <p className="notice" role="status">{notice}</p>
  <footer className="footer"><span>法令データ：<a href="https://laws.e-gov.go.jp/" target="_blank" rel="noreferrer">e-Gov法令検索</a></span><span>Powered by <a href="https://github.com/yamachig/Lawtext" target="_blank" rel="noreferrer">Lawtext</a> <a href={`${import.meta.env.BASE_URL}LAWText-LICENSE.txt`} target="_blank">MIT License</a><a className="github-profile" href="https://github.com/ThozK" target="_blank" rel="noreferrer" aria-label="ThozKのGitHubページ"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15A10.8 10.8 0 0 1 12 6.15c.96 0 1.92.13 2.82.38 2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"/></svg></a></span></footer>
  {note&&<aside className="reference-note" role="dialog" aria-label="参照法令の付箋" onMouseEnter={()=>clearTimeout(previewHide.current)} onMouseLeave={endPreview} style={{left:note.left,top:note.top,width:note.width,maxHeight:`calc(100dvh - ${note.top+12}px)`}} onKeyDown={e=>{if(e.key==='Escape')closeNote();}}><div className="note-heading"><h3>{note.law?.title||note.target.title||note.target.lawNum}</h3><button aria-label="付箋を閉じる" onClick={closeNote}>×</button></div><div className="note-body">{note.candidates?<div className="delegation-choices"><p>「{note.word}」の参照候補を選んでください。</p>{note.candidates.map(r=><button key={`${r.sourceIndex}-${r.key}`} onClick={()=>{closeNote();backlink(r.sourceIndex,r.key,r.destinationNode);}}>{LABELS[r.sourceIndex]}・{r.label} →</button>)}</div>:note.loading?<p role="status">参照条文を読み込み中…</p>:note.error?<p role="alert">{note.error}</p>:<RenderBoundary key={note.law.revision}>{(note.contents||[note.content]).map((content,k)=><div className="note-excerpt" key={k}>{noteContext(note.law,content)&&<p className="note-location">{noteContext(note.law,content)}</p>}<HTMLAnyELs els={[content]} indent={0} htmlOptions={{renderControlEL:false,renderPDFAsLink:true}}/></div>)}</RenderBoundary>}</div>{note.law&&<a className="note-source" href={`https://laws.e-gov.go.jp/law/${note.law.id}`} target="_blank" rel="noreferrer">e-Govで全文を開く ↗</a>}</aside>}
  {dialog!==null&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeSearch();}}><dialog open className="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==='Escape')closeSearch();if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll('button:not(:disabled),input,a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><div className="dialog-heading"><div><span className="eyebrow">SELECT LAW</span><h2 id="dialog-title">法令を選ぶ</h2></div><button aria-label="閉じる" onClick={closeSearch}>×</button></div><nav className="selection-targets" aria-label="選択する法令"><button aria-pressed={dialog===3} onClick={()=>openSearch(3)}>3法令まとめて</button>{LABELS.map((label,i)=><button key={label} aria-pressed={dialog===i} onClick={()=>openSearch(i)}>{label}</button>)}</nav>{!bundle&&!bundleLoading&&<nav className="selection-modes" aria-label="法令の選び方"><button aria-pressed={!catalogMode} onClick={()=>{searchSeq.current++;setSearching(false);setSearchError('');setCatalogMode(false);}}>名前で検索</button><button aria-pressed={catalogMode} onClick={()=>{searchSeq.current++;setSearching(false);setSearchError('');setCatalogMode(true);}}>一覧から選ぶ</button></nav>}{!bundle&&!bundleLoading&&catalogMode&&<LawCatalog type={TYPES[dialog]||'Act'} onChoose={r=>choose(r.law_info.law_id,r)}/>} {!bundle&&!catalogMode&&<form onSubmit={search}><label htmlFor="search-law">法令名で検索</label><div className="search-row"><input id="search-law" autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：個人情報、建築基準"/><button className="primary" disabled={searching||!query.trim()}>{searching?'検索中…':'検索'}</button></div></form>}<div className="results" aria-live="polite">{searchError&&<p role="alert">{searchError}</p>}{!bundle&&!bundleLoading&&!catalogMode&&results.map(r=><button className="result" key={r.law_info.law_id} onClick={()=>choose(r.law_info.law_id)}><strong>{r.revision_info.law_title}</strong><span>{r.law_info.law_num} · {!isAvailableLaw(r)?'廃止法令':r.revision_info.current_revision_status||''}</span></button>)}</div>{bundleLoading&&<p role="status">施行令・施行規則を探しています…</p>}{bundle&&<div className="bundle-review"><h3>{bundle.act.revision_info.law_title}</h3><p>同名の施行令・施行規則を選択しました。必要に応じて候補を変更できます。</p>{[1,2].map(i=><label key={i}>{LABELS[i]}<select aria-label={`一括選択の${LABELS[i]}`} value={bundle.picks[i]||''} onChange={e=>setBundle(p=>({...p,picks:p.picks.map((v,j)=>j===i?e.target.value||null:v)}))}><option value="">該当なし／表示しない</option>{bundle.related.filter(r=>TYPES[i].split(',').includes(r.law_info.law_type)).map(r=><option key={r.law_info.law_id} value={r.law_info.law_id}>{r.revision_info.law_title}</option>)}</select></label>)}<button className="primary" onClick={applyBundle}>この組み合わせで開く</button><button onClick={()=>setBundle(null)}>法律を選び直す</button></div>}<div className="default-choice"><p>表示例</p>{EXAMPLES.map(example=><button key={example.label} onClick={()=>{setStarted(true);setIds(p=>dialog===3?[...example.ids]:p.map((id,i)=>i===dialog?example.ids[i]:id));closeSearch();}}>{dialog===3?`${example.label}・施行令・施行規則をまとめて開く`:`${example.title}${['','施行令','施行規則'][dialog]}`} →</button>)}</div><p className="dialog-note">e-Gov法令APIを使用します。検索結果には廃止法令が含まれる場合があります。</p></dialog></div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
