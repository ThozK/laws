import React,{useEffect,useMemo,useState} from 'react';
import {fetchLawCatalog} from './lawApi.js';
import {catalogRows,isAvailableLaw} from './catalog.js';
const cache=new Map();
export default function LawCatalog({type,onChoose}){
 const [rows,setRows]=useState(cache.get(type)||[]),[loading,setLoading]=useState(!cache.has(type)),[error,setError]=useState('');
 const [category,setCategory]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setCategory('');setFilter('');setPage(0);setError('');if(cache.has(type)){setRows(cache.get(type));setLoading(false);return;}setRows([]);setLoading(true);
 (async()=>{try{const list=await fetchLawCatalog(type,controller.signal);if(!controller.signal.aborted){cache.set(type,list);setRows(list);}}catch(e){if(!controller.signal.aborted)setError(e.message);}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();
 },[type,retry]);
 const categories=useMemo(()=>[...new Set(rows.filter(isAvailableLaw).map(r=>r.revision_info.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[rows]);
 const filtered=useMemo(()=>catalogRows(rows,category,filter.trim()),[rows,category,filter]);
 const pages=Math.max(1,Math.ceil(filtered.length/40)),current=Math.min(page,pages-1);
 return <section className="catalog" aria-label="法令一覧"><p className="catalog-help">分野から探すか、五十音順の一覧を見ながら選べます。</p><div className="catalog-filters"><label>分野<select disabled={loading||!!error} aria-label="法令一覧の分野" value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="">{loading?'分野を読み込み中…':'すべての分野'}</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>一覧を絞り込む<input aria-label="法令一覧の絞り込み" value={filter} placeholder="名前・読み・法令番号" onChange={e=>{setFilter(e.target.value);setPage(0);}}/></label></div>{loading?<p role="status">法令一覧を読み込んでいます…</p>:error?<div role="alert"><p>{error}</p><button onClick={()=>setRetry(v=>v+1)}>一覧を再読み込み</button></div>:<><div className="catalog-summary"><span>{filtered.length.toLocaleString()}件 · 五十音順（40件ずつ表示）</span><span>{filtered.length?current*40+1:0}–{Math.min((current+1)*40,filtered.length)}件を表示</span></div><div className="catalog-rows">{filtered.slice(current*40,(current+1)*40).map(r=><button className="result" key={r.law_info.law_id} onClick={()=>onChoose(r)}><strong>{r.revision_info.law_title}</strong><span>{r.revision_info.category||'分野未設定'} · {r.law_info.law_num}</span></button>)}{!filtered.length&&<p>この条件に一致する法令はありません。</p>}</div><nav className="catalog-pagination" aria-label="法令一覧のページ"><button disabled={current===0} onClick={()=>setPage(current-1)}>← 前の40件</button><span>{current+1} / {pages}</span><button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>次の40件 →</button></nav></>}</section>;
}
