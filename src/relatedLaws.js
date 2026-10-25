import {normalizeLawTitles} from './lawTitle.js';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {LAW_API} from './lawApi.js';
import {isAvailableLaw} from './catalog.js';
const TYPES=['CabinetOrder','MinisterialOrdinance','Rule'];
const normalize=s=>(s||'').normalize('NFKC').replace(/\s/g,'');
const memory=new Map(),VERSION=1;
export function parentRecord(law){return law?.law_info?law:{law_info:{law_id:law.id,law_num:law.num,law_type:law.type||'Act'},revision_info:{law_title:law.title,law_revision_id:law.revision}};}
export function compactRecord(row){const {law_info:i,revision_info:r}=row;return {law_info:{law_id:i.law_id,law_num:i.law_num,law_type:i.law_type},revision_info:{law_title:r.law_title,law_title_kana:r.law_title_kana,law_revision_id:r.law_revision_id,amendment_enforcement_date:r.amendment_enforcement_date,repeal_status:r.repeal_status,current_revision_status:r.current_revision_status},...(row.relation?{relation:row.relation}:{})};}
export function basisRelation(statement,parents){const text=normalize(statement);if(!/(?:に基[づつ]?(?:き|いて)|を実施するため)/.test(text))return null;for(const parent of parents){const number=normalize(parent.law_info.law_num);if(number&&text.includes(number))return {kind:'enactment',basis:statement,parent_id:parent.law_info.law_id,parent_title:parent.revision_info.law_title};}return null;}
export function sortRelated(rows){return [...rows].sort((a,b)=>(a.law_info.law_type==='CabinetOrder'?0:1)-(b.law_info.law_type==='CabinetOrder'?0:1)||(a.revision_info.law_title_kana||a.revision_info.law_title).localeCompare(b.revision_info.law_title_kana||b.revision_info.law_title,'ja'));}
export async function discoverRelatedLaws(parent,{signal,fetcher=fetch,onProgress=()=>{}}={}){
 parent=parentRecord(parent);const candidates=new Map(),confirmed=new Map(),checked=new Map(),unverified=new Map();
 async function json(path){const response=await fetcher(`${LAW_API}${path}`,{signal});const data=normalizeLawTitles(await response.json());if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(!response.ok){if(path.startsWith('/keyword?')&&data.code==='404001')return {items:[]};if(path.includes('elm=EnactStatement')&&data.code==='400021')return {law_full_text:null};const error=Error(`関連法令の取得に失敗しました（${response.status}）。`);error.code=data.code;throw error;}return data;}

 async function search(target){for(const keyword of new Set([target.revision_info.law_title,target.law_info.law_num].filter(Boolean))){let offset=0;for(;;){const params=new URLSearchParams({keyword,law_type:TYPES.join(','),limit:'1000',sentences_limit:'1',sentence_text_size:'1',offset:String(offset),response_format:'json'}),data=await json(`/keyword?${params}`);for(const row of data.items||[])if(TYPES.includes(row.law_info.law_type)&&isAvailableLaw(row)&&row.law_info.law_id!==parent.law_info.law_id)candidates.set(row.law_info.law_id,row);if(data.next_offset==null)break;if(data.next_offset<=offset)throw Error('関連法令の検索を続行できませんでした。');offset=data.next_offset;}}}
 async function check(parents){const queue=[...candidates.values()];let next=0,done=0;const failures=[];onProgress({phase:'verify',done,total:queue.length});await Promise.all(Array.from({length:3},async()=>{while(next<queue.length){if(signal?.aborted)throw new DOMException('Aborted','AbortError');const row=queue[next++],id=row.law_info.law_id;let statement=checked.get(id);try{if(statement===undefined){const data=await json(`/law_data/${encodeURIComponent(row.revision_info.law_revision_id||id)}?elm=EnactStatement&law_full_text_format=xml&response_format=json`);const xml=data.law_full_text?new TextDecoder().decode(Uint8Array.from(atob(data.law_full_text),c=>c.charCodeAt(0))):'';statement=xml?xmlToEL(xml).text():'';checked.set(id,statement);}const relation=basisRelation(statement,parents);if(relation)confirmed.set(id,compactRecord({...row,relation}));}catch(error){if(signal?.aborted)throw error;if(error.code==='404004'){checked.set(id,'');unverified.set(id,{...compactRecord(row),reason:'APIから本文を取得できませんでした。'});}else {failures.push(id);onProgress({phase:'error',id,error:error.message});}}finally{onProgress({phase:'verify',done:++done,total:queue.length});}}}));return failures;}
 onProgress({phase:'search'});await search(parent);let failures=await check([parent]);
 const orders=[...confirmed.values()].filter(r=>r.law_info.law_type==='CabinetOrder');for(const order of orders){onProgress({phase:'search',title:order.revision_info.law_title});await search(order);}if(orders.length)failures=await check([parent,...orders]);
 // An interrupted or incomplete result must never be stored as a complete list.
 if(failures.length)throw Error(`${failures.length}件の制定根拠を確認できませんでした。再読み込みしてください。`);
 return {version:VERSION,parent:compactRecord(parent),generated_at:new Date().toISOString(),laws:sortRelated([...confirmed.values()]),searched:candidates.size,unverified:[...unverified.values()]};
}
export async function loadRelatedSnapshot(parent,{signal,fetcher=fetch,baseURL='',storage=globalThis.localStorage}={}){
 parent=parentRecord(parent);const id=parent.law_info.law_id,key=`sandan-related-v${VERSION}:${id}`,revision=parent.revision_info.law_revision_id;
 function usable(data){return data?.version===VERSION&&data.parent?.law_info.law_id===id&&Array.isArray(data.laws);}
 if(memory.has(key))return memory.get(key);
 try{const data=normalizeLawTitles(JSON.parse(storage?.getItem(key)||'null'));if(usable(data)){memory.set(key,data);return data;}}catch{}
 const response=await fetcher(`${baseURL}data/relations/${encodeURIComponent(id)}.json`,{signal});if(response.status===404||/^text\/html\b/i.test(response.headers?.get('content-type')||''))return null;if(!response.ok)throw Error('保存済みの関連法令一覧を読み込めませんでした。');const data=normalizeLawTitles(await response.json());if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(!usable(data))throw Error('関連法令一覧の形式が正しくありません。');memory.set(key,data);return data;
}
export async function getRelatedLaws(parent,{refresh=false,storage=globalThis.localStorage,...options}={}){
 parent=parentRecord(parent);if(!refresh){const snapshot=await loadRelatedSnapshot(parent,{...options,storage});if(snapshot)return snapshot;}
 const data=await discoverRelatedLaws(parent,options),key=`sandan-related-v${VERSION}:${parent.law_info.law_id}`;memory.set(key,data);try{storage?.setItem(key,JSON.stringify(data));}catch{}return data;
}
