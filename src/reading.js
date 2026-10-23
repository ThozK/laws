import {isAvailableLaw} from './catalog.js';
export function chooseReadingSection(sections,line){
 let current=null;
 for(const section of sections){if(section.top>line)break;current=section;}
 return current;
}
export function selectCompanion(laws,title,suffix,type){
 const names=[title+suffix,...(suffix==='施行規則'?[title.replace(/法$/,'')+'規則']:[])];
 const match=laws.find(r=>type.split(',').includes(r.law_info.law_type)&&names.includes(r.revision_info.law_title)&&isAvailableLaw(r));
 return match?.law_info.law_id||null;
}
