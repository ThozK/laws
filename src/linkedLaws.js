import {lawURL} from './navigation.js';
import {standaloneIds} from './lawApi.js';
import {selectCompanion} from './reading.js';
export function relatedLawURL(href,law){const url=new URL(lawURL(href,standaloneIds(law)));url.searchParams.set('related','1');return url.toString();}
export function linkedLawPicks(act,related,seed){
 const title=act.revision_info.law_title;
 const picks=[act.law_info.law_id,selectCompanion(related,title,'施行令','CabinetOrder'),selectCompanion(related,title,'施行規則','MinisterialOrdinance,Rule')];
 if(seed.type==='CabinetOrder')picks[1]=seed.id;
 if(['MinisterialOrdinance','Rule'].includes(seed.type))picks[2]=seed.id;
 return picks;
}
