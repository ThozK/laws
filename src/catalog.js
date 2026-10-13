export function isAvailableLaw(row){return !['Repeal','Expire','Suspend','LossOfEffectiveness','Repealed'].includes(row.revision_info.repeal_status)&&row.revision_info.current_revision_status!=='Repeal';}
export function catalogRows(rows,category,filter){
 return rows.filter(r=>isAvailableLaw(r)&&(!category||r.revision_info.category===category)&&(!filter||`${r.revision_info.law_title} ${r.revision_info.law_title_kana||''} ${r.law_info.law_num}`.includes(filter))).sort((a,b)=>(a.revision_info.law_title_kana||a.revision_info.law_title).localeCompare(b.revision_info.law_title_kana||b.revision_info.law_title,'ja'));
}
