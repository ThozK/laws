import {test} from 'node:test';
import assert from 'node:assert/strict';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {analyzeLaw} from '../src/analyzeLaw.js';
import {internalTargets} from '../src/references.js';

const xml=`<Law Era="Showa" Year="46" Num="300" LawType="CabinetOrder" Lang="ja"><LawNum>昭和四十六年政令第三百号</LawNum><LawBody><LawTitle>廃棄物の処理及び清掃に関する法律施行令</LawTitle><MainProvision><Article Num="2_4"><ArticleTitle>第二条の四</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>次に掲げるもの。</Sentence></ParagraphSentence><Item Num="5"><ItemTitle>五</ItemTitle><ItemSentence><Sentence>廃棄物</Sentence></ItemSentence><Subitem1 Num="10"><Subitem1Title>ヌ</Subitem1Title><Subitem1Sentence><Sentence>別の細分</Sentence></Subitem1Sentence><Subitem2 Num="11"><Subitem2Title>（１１）</Subitem2Title><Subitem2Sentence><Sentence>誤って拾われた細分</Sentence></Subitem2Sentence></Subitem2></Subitem1><Subitem1 Num="11"><Subitem1Title>ル</Subitem1Title><Subitem1Sentence><Sentence>正しいルの本文</Sentence></Subitem1Sentence><Subitem2 Num="25"><Subitem2Title>（２５）</Subitem2Title><Subitem2Sentence><Sentence>正しい二十五の本文</Sentence></Subitem2Sentence></Subitem2></Subitem1></Item><Item Num="7"><ItemTitle>七</ItemTitle><ItemSentence><Sentence>第二条の四第五号ル（２５）に掲げるものを除く。</Sentence></ItemSentence></Item></Paragraph></Article></MainProvision></LawBody></Law>`;
test('ルと数値括弧を別階層の同じ番号と混同せず参照する',async()=>{
 const el=xmlToEL(xml),original=el.text();const analysis=await analyzeLaw(el);
 let n=0;function visit(e){e.readerNode=String(n++);if(e.tag==='Article')e.readerKey='a';for(const c of e.children)if(typeof c!=='string')visit(c);}visit(el);
 const env=[...analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='第二条の四第五号ル（２５）');assert.ok(env);
 const targets=internalTargets(env);assert.deepEqual(targets.map(t=>t.text),['第二条の四','第五号','ル','（２５）']);
 const fragments=env.located.fragments;
 assert.equal(fragments[2].containers[0].el.tag,'Subitem1');assert.equal(fragments[2].containers[0].el.children[0].text(),'ル');
 assert.equal(fragments[3].containers[0].el.tag,'Subitem2');assert.equal(fragments[3].containers[0].el.attr.Num,'25');
 assert.equal(targets[3].target.node,fragments[3].containers[0].el.readerNode);assert.equal(el.text(),original);
});
