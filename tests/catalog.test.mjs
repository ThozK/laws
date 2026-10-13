import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogRows} from '../src/catalog.js';
const row=(name,kana,category,status='None')=>({law_info:{law_num:'法令番号'},revision_info:{law_title:name,law_title_kana:kana,category,repeal_status:status}});
test('法令一覧は分野で絞り込み五十音順に並べる',()=>{const rows=[row('B法','い','民事'),row('A法','あ','民事'),row('C法','う','労働')];assert.deepEqual(catalogRows(rows,'民事','').map(r=>r.revision_info.law_title),['A法','B法']);assert.equal(catalogRows(rows,'','あ')[0].revision_info.law_title,'A法');});
test('APIの廃止・失効状態を一覧から除外する',()=>{const rows=['None','Repeal','Expire','Suspend','LossOfEffectiveness'].map(status=>row(status,status,'民事',status));assert.deepEqual(catalogRows(rows,'','').map(r=>r.revision_info.law_title),['None']);});
