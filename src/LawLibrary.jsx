import React from 'react';
import {entryKey} from './lawLibrary.js';
export default function LawLibrary({library,setLibrary,current,onOpen,error,tab}){
 const rows=library[tab],saved=current&&library.favorites.some(r=>entryKey(r.ids)===entryKey(current.ids));
 return <section className="law-library">
 <div className="library-toolbar">{tab==='history'&&<label><input type="checkbox" checked={library.enabled} onChange={e=>setLibrary(p=>({...p,enabled:e.target.checked}))}/> 履歴を自動保存</label>}{tab==='favorites'&&current&&<button onClick={()=>setLibrary(p=>({...p,favorites:saved?p.favorites.filter(r=>entryKey(r.ids)!==entryKey(current.ids)):[current,...p.favorites].slice(0,50)}))}>{saved?'★ お気に入り解除':'☆ お気に入りに追加'}</button>}</div>
 <p className="catalog-help">このブラウザ内に保存します。サーバーには送信しません。履歴は30件、お気に入りは50件まで。</p>{error&&<p role="alert">{error}</p>}
 <div className="library-rows">{rows.map(row=><div className="library-row" key={entryKey(row.ids)}><button className="result" onClick={()=>onOpen(row)}><strong>{row.titles.filter(Boolean).join(' ／ ')}</strong><span>{new Date(row.time).toLocaleDateString('ja-JP')}</span></button><button aria-label={`${row.titles.find(Boolean)}を${tab==='history'?'履歴':'お気に入り'}から削除`} onClick={()=>setLibrary(p=>({...p,[tab]:p[tab].filter(r=>entryKey(r.ids)!==entryKey(row.ids))}))}>×</button></div>)}{!rows.length&&<p>{tab==='history'?'閲覧履歴はまだありません。':'お気に入りはまだありません。'}</p>}</div>
 {rows.length>0&&<button onClick={()=>setLibrary(p=>({...p,[tab]:[]}))}>{tab==='history'?'履歴':'お気に入り'}をすべて削除</button>}</section>;
}
