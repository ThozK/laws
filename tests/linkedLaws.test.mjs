import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relatedLawURL,linkedLawPicks} from '../src/linkedLaws.js';
const act={law_info:{law_id:'act'},revision_info:{law_title:'試験法'}};
const row=(id,title,type)=>({law_info:{law_id:id,law_type:type},revision_info:{law_title:title,repeal_status:'None'}});
test('別タブの参照リンクだけ関連法令の読込を明示する',()=>{const url=new URL(relatedLawURL('https://example.test/laws/',{id:'act',type:'Act'}));assert.equal(url.searchParams.get('laws'),'act,,');assert.equal(url.searchParams.get('related'),'1');});
test('参照した法律と対応する施行令・規則を三列に設定する',()=>{assert.deepEqual(linkedLawPicks(act,[row('order','試験法施行令','CabinetOrder'),row('rule','試験法施行規則','MinisterialOrdinance')],{id:'act',type:'Act'}),['act','order','rule']);});
test('参照した別名の規則は通常の規則に置き換えず保持する',()=>{assert.deepEqual(linkedLawPicks(act,[row('rule','試験法施行規則','MinisterialOrdinance')],{id:'special',type:'MinisterialOrdinance'}),['act',null,'special']);});
test('対応候補がない列は無関係な法令で埋めない',()=>{assert.deepEqual(linkedLawPicks(act,[row('wrong','別の法施行令','CabinetOrder')],{id:'act',type:'Act'}),['act',null,null]);});
