import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseReadingSection,selectCompanion} from '../src/reading.js';
test('現在位置は本文上端を通過した最後の条文を使う',()=>{const sections=[{key:'1',top:100},{key:'2',top:300}];assert.equal(chooseReadingSection(sections,99),null);assert.equal(chooseReadingSection(sections,100).key,'1');assert.equal(chooseReadingSection(sections,299).key,'1');assert.equal(chooseReadingSection(sections,300).key,'2');});
test('同名の施行法令を選び廃止法令や類似名を混同しない',()=>{const row=(id,title,type,repeal='None')=>({law_info:{law_id:id,law_type:type},revision_info:{law_title:title,repeal_status:repeal}});const rows=[row('wrong','例法の特例施行令','CabinetOrder'),row('old','例法施行令','CabinetOrder','Repealed'),row('order','例法施行令','CabinetOrder'),row('rules','例法施行規則','MinisterialOrdinance')];assert.equal(selectCompanion(rows,'例法','施行令','CabinetOrder'),'order');assert.equal(selectCompanion(rows,'例法','施行規則','MinisterialOrdinance'),'rules');assert.equal(selectCompanion(rows,'別法','施行規則','MinisterialOrdinance'),null);});

test('委員会規則も施行規則の候補に含める',()=>{const rows=[{law_info:{law_id:'rule',law_type:'Rule'},revision_info:{law_title:'例法施行規則',repeal_status:'None'}}];assert.equal(selectCompanion(rows,'例法','施行規則','MinisterialOrdinance,Rule'),'rule');});
