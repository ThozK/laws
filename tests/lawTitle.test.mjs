import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plainLawTitle,normalizeLawTitles} from '../src/lawTitle.js';
const raw='<Ruby>へ<Rt>ヽ</Rt></Ruby><Ruby>き<Rt>ヽ</Rt></Ruby>地教育振興法施行規則';
test('へき地教育振興法施行規則の傍点ルビをタイトルに混ぜない',()=>{assert.equal(plainLawTitle(raw),'へき地教育振興法施行規則');assert.equal(plainLawTitle(raw.replaceAll('<','&lt;').replaceAll('>','&gt;')),'へき地教育振興法施行規則');});
test('読み仮名と括弧を取り除き、親文字と通常の法令名を保持する',()=>{assert.equal(plainLawTitle('<Ruby>漢字<Rp>（</Rp><Rt>かんじ</Rt><Rp>）</Rp></Ruby>法'),'漢字法');assert.equal(plainLawTitle('労働安全衛生規則'),'労働安全衛生規則');});
test('検索・保存済み関連一覧のタイトルを正規化して本文には触れない',()=>{const record={laws:[{revision_info:{law_title:raw},relation:{parent_title:raw}}],law_full_text:'<Ruby>本文</Ruby>'};normalizeLawTitles(record);assert.equal(record.laws[0].revision_info.law_title,'へき地教育振興法施行規則');assert.equal(record.laws[0].relation.parent_title,'へき地教育振興法施行規則');assert.equal(record.law_full_text,'<Ruby>本文</Ruby>');});
