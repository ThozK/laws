export function lawIdsFromURL(href){try{const values=new URL(href).searchParams.get('laws')?.split(',');return values?.length===3&&values.every(v=>v===''||/^[a-zA-Z0-9_]+$/.test(v))?values.map(v=>v||null):null;}catch{return null;}}
export function lawURL(href,ids){const url=new URL(href);url.searchParams.set('laws',ids.map(v=>v||'').join(','));return url.toString();}
export function lawPageTitle(laws){const title=laws.find(Boolean)?.title;return title?`${title}｜星野式法令三段表製作所`:'星野式法令三段表製作所';}
export function randomLawFrom(rows,currentId,random=Math.random){const available=rows.filter(r=>r.law_info.law_id!==currentId);return available.length?available[Math.min(available.length-1,Math.floor(random()*available.length))]:null;}
