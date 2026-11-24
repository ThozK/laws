import {test} from 'node:test';
import assert from 'node:assert/strict';
import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
import {analyzeLaw} from '../src/analyzeLaw.js';
import {resolveLawReferences} from '../src/resolveReferences.js';
import {externalTargets} from '../src/references.js';
import {buildDetailedAlignment} from '../src/alignment.js';
const title='感染症の予防及び感染症の患者に対する医療に関する法律',num='平成十年法律第百十四号',other='困難な問題を抱える女性への支援に関する法律',otherNum='令和四年法律第五十二号';
const para=(num,text)=>`<Paragraph Num="${num}"><ParagraphNum>${num==='1'?'':num}</ParagraphNum><ParagraphSentence><Sentence>${text}</Sentence></ParagraphSentence></Paragraph>`;
async function parse(xml,title,num){const el=xmlToEL(xml),analysis=await analyzeLaw(el);let n=0,a=0;function v(e){e.readerNode=String(n++);if(e.tag==='Article')e.readerKey=String(a++);for(const c of e.children||[])if(typeof c!=='string')v(c);}v(el);return {el,analysis,title,num};}
test('附則の別法の略称で本則の「法」を上書きせず、三段表を親法へ整列する',async()=>{
 const act=await parse(`<Law><LawNum>${num}</LawNum><LawBody><LawTitle>${title}</LawTitle><MainProvision><Article Num="6"><ArticleTitle>第六条</ArticleTitle>${para('6','次に掲げるもの。')}</Article></MainProvision></LawBody></Law>`,title,num);
 const rule=await parse(`<Law><LawNum>平成十年厚生省令第九十九号</LawNum><LawBody><LawTitle>${title}施行規則</LawTitle><EnactStatement>${title}（${num}）の規定に基づき定める。</EnactStatement><MainProvision><Article Num="1"><ArticleTitle>第一条</ArticleTitle>${para('1',`${title}（以下「法」という。）第六条第六項に規定する疾病。`)}</Article><Article Num="27"><ArticleTitle>第二十七条</ArticleTitle>${para('1',`${other}（${otherNum}）第十二条第一項に規定する施設。`)}</Article></MainProvision><SupplProvision><SupplProvisionLabel>附則</SupplProvisionLabel>${para('1',`${other}（以下「法」という。）の施行の日から施行する。法第十二条第一項の規定による。`)}</SupplProvision></LawBody></Law>`,title+'施行規則','平成十年厚生省令第九十九号');
 resolveLawReferences(rule,[act,null,rule]);assert.equal(rule.aliases.法.lawNum,num);
 const env=[...rule.analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='第六条第六項');assert.equal(externalTargets(env).at(-1).target.lawNum,num);
 const model=buildDetailedAlignment([act,null,rule]),upper=model.articles[0].find(e=>e.tag==='Paragraph'),lower=model.articles[2].find(e=>e.tag==='Article');assert.equal(model.assignments[0].get(upper.readerNode).row,model.assignments[2].get(lower.readerNode).row);
});

import {isCrossReference} from '../src/referenceColors.js';
test('行合わせの初回計算で番号なしの「法」を親法に解決し、別列リンクの表示にする',async()=>{
 const title='特定商取引に関する法律',num='昭和五十一年法律第五十七号';
 const law=await parse(`<Law><LawNum>${num}</LawNum><LawBody><LawTitle>${title}</LawTitle><MainProvision><Article Num="2"><ArticleTitle>第二条</ArticleTitle>${para('1','対象を定める。')}</Article></MainProvision></LawBody></Law>`,title,num);
 const rule=await parse(`<Law><LawNum>昭和五十一年通商産業省令第八十九号</LawNum><LawBody><LawTitle>${title}施行規則</LawTitle><MainProvision><Article Num="1"><ArticleTitle>第一条</ArticleTitle>${para('1',`${title}（以下「法」という。）第二条第一項の主務省令で定める場所。`)}</Article></MainProvision></LawBody></Law>`,title+'施行規則','昭和五十一年通商産業省令第八十九号');
 const laws=[law,null,rule];const model=buildDetailedAlignment(laws);
 assert.equal(rule.aliases.法.lawNum,num);
 const upper=model.articles[0].find(e=>e.tag==='Paragraph'),lower=model.articles[2].find(e=>e.tag==='Article');
 assert.equal(model.assignments[0].get(upper.readerNode).row,model.assignments[2].get(lower.readerNode).row);
 const env=[...rule.analysis.pointerEnvByEL.values()].find(e=>e.pointer.text()==='第二条第一項');const target=externalTargets(env).at(-1).target;
 assert.equal(isCrossReference({...target,internal:false},2,laws),true);
 assert.equal(isCrossReference({...target,internal:true},2,laws),false);
});

test('後続条文が親の条全体を参照しても、先行条文と号の対応を外さない',async()=>{
 const title='特定商取引に関する法律',num='昭和五十一年法律第五十七号';
 const law=await parse(`<Law><LawNum>${num}</LawNum><LawBody><LawTitle>${title}</LawTitle><MainProvision><Article Num="11"><ArticleTitle>第十一条</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>広告には次の事項を表示する。</Sentence></ParagraphSentence><Item Num="1"><ItemTitle>一</ItemTitle><ItemSentence><Sentence>価格</Sentence></ItemSentence></Item><Item Num="6"><ItemTitle>六</ItemTitle><ItemSentence><Sentence>その他省令で定める事項</Sentence></ItemSentence></Item></Paragraph></Article><Article Num="12"><ArticleTitle>第十二条</ArticleTitle>${para('1','広告の禁止。')}</Article></MainProvision></LawBody></Law>`,title,num);
 const rule=await parse(`<Law><LawNum>昭和五十一年通商産業省令第八十九号</LawNum><LawBody><LawTitle>${title}施行規則</LawTitle><MainProvision><Article Num="23"><ArticleTitle>第二十三条</ArticleTitle>${para('1','法第十一条第六号の事項は次のとおりとする。')}<Paragraph Num="2"><ParagraphNum>２</ParagraphNum><ParagraphSentence><Sentence>追加の内容。</Sentence></ParagraphSentence></Paragraph></Article><Article Num="24"><ArticleTitle>第二十四条</ArticleTitle>${para('1','法第十一条の表示方法。')}</Article><Article Num="25"><ArticleTitle>第二十五条</ArticleTitle>${para('1','法第十一条の例外。')}</Article><Article Num="26"><ArticleTitle>第二十六条</ArticleTitle>${para('1','法第十二条の内容。')}</Article></MainProvision></LawBody></Law>`,title+'施行規則','昭和五十一年通商産業省令第八十九号');
 const model=buildDetailedAlignment([law,null,rule]);
 const upper=model.articles[0].find(e=>e.tag==='Item'&&e.attr.Num==='6'),lower=model.articles[2].find(e=>e.tag==='Article'&&e.attr.Num==='23');
 assert.equal(model.assignments[0].get(upper.readerNode).row,model.assignments[2].get(lower.readerNode).row);
 let row=-1;for(const unit of model.articles[2]){const next=model.assignments[2].get(unit.readerNode).row;assert.ok(next>=row);row=next;}
 assert.equal(model.assignments[2].size,model.articles[2].length);
});
