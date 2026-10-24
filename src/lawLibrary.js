export const LIBRARY_KEY='lawonrow-library-v1';
export function entryKey(ids){return ids.map(id=>id||'').join(',');}
export function readLibrary(storage){
 try{const data=JSON.parse(storage?.getItem(LIBRARY_KEY)||'null');const clean=rows=>(Array.isArray(rows)?rows:[]).filter(r=>Array.isArray(r.ids)&&r.ids.length===3&&r.ids.some(Boolean)&&r.ids.every(id=>id===null||typeof id==='string')&&Array.isArray(r.titles)).map(r=>({ids:r.ids,titles:r.titles.map(t=>String(t||'')),time:Number(r.time)||0}));return {enabled:data?.enabled!==false,history:clean(data?.history).slice(0,30),favorites:clean(data?.favorites).slice(0,50)};}catch{return {enabled:true,history:[],favorites:[]};}
}
export function rememberEntry(rows,entry,limit){return [entry,...rows.filter(r=>entryKey(r.ids)!==entryKey(entry.ids))].slice(0,limit);}
