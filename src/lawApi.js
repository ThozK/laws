export const LAW_API='https://laws.e-gov.go.jp/api/2';
const catalogCache=new Map();
export async function fetchLawCatalog(type,signal,fetcher=fetch){
 if(catalogCache.has(type)&&fetcher===fetch)return catalogCache.get(type);
 const rows=[],seen=new Set();let offset=0;
 for(;;){const response=await fetcher(`${LAW_API}/laws?law_type=${encodeURIComponent(type)}&limit=1000&offset=${offset}&response_format=json`,{signal});if(!response.ok)throw Error(`一覧を取得できませんでした（${response.status}）。`);const data=await response.json();if(signal?.aborted)throw new DOMException('Aborted','AbortError');for(const row of data.laws||[])if(!seen.has(row.law_info.law_id)){seen.add(row.law_info.law_id);rows.push(row);}if(rows.length>=(data.total_count||0)||!data.laws?.length)break;const next=data.next_offset??offset+data.laws.length;if(next<=offset)throw Error('一覧の続きの取得に失敗しました。');offset=next;}
 if(fetcher===fetch)catalogCache.set(type,rows);return rows;
}
export function companionSearchTerm(title){return title.replace(/に関する法律$/,'').replace(/法律$/,'').replace(/法$/,'');}
export function attachmentURL(law,src){if(!law?.revision||!src)return null;return `${LAW_API}/attachment/${encodeURIComponent(law.revision)}?src=${encodeURIComponent(src)}`;}
export function standaloneIds(law){const index=law.type==='CabinetOrder'?1:['MinisterialOrdinance','Rule'].includes(law.type)?2:0;return [0,1,2].map(i=>i===index?law.id:null);}

// Only accept conventional companion names; never fall back to every regulation.
const companionCache=new Map();
export async function fetchStandardCompanions(title,{signal,fetcher=fetch}={}){
 if(fetcher===fetch&&companionCache.has(title))return companionCache.get(title);
 const names=[title+'施行令',title+'施行規則',title.replace(/法$/,'')+'規則'];
 const results=await Promise.all([...new Set(names)].map(async name=>{
  const response=await fetcher(`${LAW_API}/laws?law_title=${encodeURIComponent(name)}&law_type=CabinetOrder,MinisterialOrdinance,Rule&limit=1000&response_format=json`,{signal});
  if(response.status===404)return [];
  if(!response.ok)throw Error('施行令・施行規則の候補を取得できませんでした。');
  const data=await response.json();return (data.laws||[]).filter(r=>r.revision_info?.law_title===name&&['CabinetOrder','MinisterialOrdinance','Rule'].includes(r.law_info?.law_type)&&(!r.revision_info.repeal_status||r.revision_info.repeal_status==='None'));
 }));
 const rows=[...new Map(results.flat().map(r=>[r.law_info.law_id,r])).values()];
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(fetcher===fetch)companionCache.set(title,rows);return rows;
}
