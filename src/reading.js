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

// Ordered article elements allow logarithmic layout reads during scrolling.
export function readingSectionAt(elements,line,topOf=el=>el.getBoundingClientRect().top){
 let low=0,high=elements.length;
 while(low<high){const mid=(low+high)>>>1;if(topOf(elements[mid])<=line)low=mid+1;else high=mid;}
 return low?elements[low-1]:null;
}
