import {test} from 'node:test';import assert from 'node:assert/strict';
import {fetchLawCatalog,companionSearchTerm,attachmentURL,standaloneIds} from '../src/lawApi.js';
import {selectCompanion} from '../src/reading.js';import {delegationCandidates} from '../src/references.js';
import {pdfUnit,pdfHTML,pdfRows} from '../src/exportPdf.js';import {xmlToEL} from 'lawtext/dist/src/node/el/xmlToEL.js';
test('法令一覧は最終ページまで取得して重複を除外する',async()=>{const offsets=[];const row=id=>({law_info:{law_id:id}});const rows=await fetchLawCatalog('Act',undefined,async url=>{const o=Number(new URL(url).searchParams.get('offset'));offsets.push(o);return {ok:true,json:async()=>o?{total_count:3,laws:[row('b'),row('c')]}:{total_count:3,next_offset:2,laws:[row('a'),row('b')]}};});assert.deepEqual(offsets,[0,2]);assert.deepEqual(rows.map(r=>r.law_info.law_id),['a','b','c']);});
test('中断された一覧を採用しない',async()=>{const c=new AbortController();await assert.rejects(fetchLawCatalog('Act',c.signal,async()=>{c.abort();return {ok:true,json:async()=>({laws:[]})};}),{name:'AbortError'});});
test('労働安全衛生規則を施行規則として自動選択する',()=>{const row={law_info:{law_id:'rule',law_type:'MinisterialOrdinance'},revision_info:{law_title:'労働安全衛生規則',repeal_status:'None'}};assert.equal(companionSearchTerm('労働安全衛生法'),'労働安全衛生');assert.equal(selectCompanion([row],'労働安全衛生法','施行規則','MinisterialOrdinance,Rule'),'rule');});
test('省エネ法19条2項の届出方法と届出事項を区別する',()=>{const refs=new Map([['a',[{sourceIndex:2,key:'40',relations:[{target:{paragraph:'2'},node:'40p',subject:'procedure'}]},{sourceIndex:2,key:'41',relations:[{target:{paragraph:'2'},node:'41p',subject:'事項',defining:true}]}]]]);for(const [tail,key] of [['経済産業省令で定めるところにより','40'],['経済産業省令で定める事項','41']])assert.deepEqual(delegationCandidates(refs,{article:'a',index:0,paragraph:'2',delegationText:tail},'経済産業省令').map(r=>r.key),[key]);});
test('添付ファイルは取得版を指定したe-Govの画像PDFへリンクする',()=>{const url=new URL(attachmentURL({revision:'rev'},'./pict/a.pdf'));assert.equal(url.pathname,'/api/2/attachment/rev');assert.equal(url.searchParams.get('src'),'./pict/a.pdf');assert.deepEqual(standaloneIds({type:'CabinetOrder',id:'order'}),[null,'order',null]);});
test('縦書き出力は番号と本文の間隔・細分のインデントを保持する',()=>{const el=xmlToEL('<Subitem1 Num="1"><Subitem1Title>イ</Subitem1Title><Subitem1Sentence><Sentence>本文　中の空白</Sentence></Subitem1Sentence></Subitem1>');assert.deepEqual(pdfUnit(el),{text:'イ　本文　中の空白',depth:2,bold:false});});
test('PDF組版はA4縦置きの3段で未参照条項も保持する',()=>{const el=xmlToEL('<Law><LawBody><LawTitle>試験法</LawTitle><MainProvision><Article Num="1"><ArticleTitle>第一条</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>消えない本文</Sentence></ParagraphSentence></Paragraph></Article></MainProvision></LawBody></Law>');let n=0;function visit(e){e.readerNode=String(n++);for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);const law={el,title:'試験法',analysis:{pointerEnvByEL:new Map()}};assert.match(pdfHTML([law,null,null]),/size:A4 portrait/);assert.match(pdfHTML([law,null,null]),/writing-mode:vertical-rl/);assert.match(JSON.stringify(pdfRows([law,null,null])),/消えない本文/);});

// Real e-Gov text: the same paragraph delegates the procedure to rule 40 and the matters to rule 41.
test('省エネ法の実データでも40条・41条を混同しない',async()=>{
 const {readFile}=await import('node:fs/promises'),{analyze}=await import('lawtext/dist/src/analyzer/index.js'),{resolveLawReferences}=await import('../src/resolveReferences.js'),{buildBacklinks,findTarget}=await import('../src/references.js');
 const loaded=[];for(const name of ['energy-act','energy-rule']){const d=JSON.parse(await readFile(new URL(`./fixtures/${name}.json`,import.meta.url)));const el=xmlToEL(Buffer.from(d.law_full_text,'base64').toString()),articles=[];let n=0,a=0;function visit(e){e.readerNode=String(n++);if(e.tag==='Article'){e.readerKey=String(a++);articles.push({key:e.readerKey,label:e.children.find(c=>c.tag==='ArticleTitle').text()});}for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);loaded.push(resolveLawReferences({el,articles,num:d.law_info.law_num,title:d.revision_info.law_title,analysis:await analyze({elToBeModified:el})}));}
 const laws=[loaded[0],null,loaded[1]],maps=buildBacklinks(laws),article=findTarget(laws[0],{article:'19'}).articleKey;
 for(const [tail,label] of [['経済産業省令で定めるところにより','第四十条'],['経済産業省令で定める事項','第四十一条']])assert.deepEqual(delegationCandidates(maps[0],{article,index:0,paragraph:'2',delegationText:tail},'経済産業省令').map(c=>c.label),[label]);
});
test('三段表は条番号を第1項本文と続け、号の折り返しにぶら下げインデントを指定する',async()=>{
 const {PDF_TYPE}=await import('../src/exportPdf.js');assert.equal(PDF_TYPE.fontPt,9);assert.equal(PDF_TYPE.linePt,12.6);
 const el=xmlToEL('<Law><LawBody><LawTitle>試験法</LawTitle><MainProvision><Article Num="1"><ArticleCaption>（目的）</ArticleCaption><ArticleTitle>第一条</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>目的の本文。</Sentence></ParagraphSentence><Item Num="1"><ItemTitle>一</ItemTitle><ItemSentence><Sentence>号の本文。</Sentence></ItemSentence></Item></Paragraph></Article></MainProvision></LawBody></Law>');let n=0;function visit(e){e.readerNode=String(n++);for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);const law={el,title:'試験法',num:'令和元年法律第一号',analysis:{pointerEnvByEL:new Map()}};
 const paragraphs=pdfRows([law,null,null]).flatMap(r=>r[0]);assert.ok(paragraphs.some(p=>p.text==='第一条　目的の本文。'&&p.hanging));assert.ok(paragraphs.some(p=>p.text==='（目的）'&&p.depth===1));assert.ok(paragraphs.some(p=>p.text==='一　号の本文。'&&p.depth===1&&p.hanging));
});

test('石綿規則のような別名の規則でも番号を省いた「法」の定義を解決する',async()=>{
 const {resolveLawReferences}=await import('../src/resolveReferences.js');
 const title='労働安全衛生法',num='昭和四十七年法律第五十七号';
 const ref={tag:'____LawRef',attr:{lawNum:num,suggestedLawTitle:title},children:[],text:()=>title+'（'+num+'）'};
 const law={title:'石綿障害予防規則',el:{children:[ref],text:()=>title+'（'+num+'）の規定に基づき制定。'+title+'（以下「法」という。）に規定する措置。'},analysis:{pointerEnvByEL:new Map()}};
 resolveLawReferences(law);assert.equal(law.aliases.法.lawNum,num);
});

test('関連リスト未登録でも通常の施行令・施行規則だけを候補とし他法令を混ぜない',async()=>{
 const {fetchStandardCompanions}=await import('../src/lawApi.js');const title='使用済自動車の再資源化等に関する法律';
 const row=(id,name,type,status='None')=>({law_info:{law_id:id,law_type:type},revision_info:{law_title:name,repeal_status:status}});
 const rows=await fetchStandardCompanions(title,{fetcher:async()=>({ok:true,status:200,json:async()=>({laws:[row('order',title+'施行令','CabinetOrder'),row('rule',title+'施行規則','MinisterialOrdinance'),row('other','別の法律施行令','CabinetOrder'),row('repeal',title+'施行規則','Rule','Repeal')]})})});
 assert.deepEqual(rows.map(r=>r.law_info.law_id),['order','rule']);
});

test('PDF冒頭は丸なしの法令名・施行日・制定文・目次を保持する',()=>{
 const el=xmlToEL('<Law><LawBody><LawTitle>試験法</LawTitle><EnactStatement>試験法を次のように制定する。</EnactStatement><TOC><TOCLabel>目次</TOCLabel><TOCChapter Num="1"><ChapterTitle>第一章　総則</ChapterTitle><ArticleRange>（第一条―第二条）</ArticleRange><TOCSection Num="1"><SectionTitle>第一節　目的</SectionTitle><ArticleRange>（第一条）</ArticleRange></TOCSection></TOCChapter></TOC><MainProvision><Article Num="1"><ArticleTitle>第一条</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>本文。</Sentence></ParagraphSentence></Paragraph></Article></MainProvision></LawBody></Law>');let n=0;function visit(e){e.readerNode=String(n++);if(e.tag==='Article')e.readerKey='0';for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);
 const law={title:'試験法',num:'令和元年法律第一号',date:'2026-10-01',el,analysis:{pointerEnvByEL:new Map()}},rows=pdfRows([law,null,null]),parts=rows.flatMap(r=>r[0]);
 assert.equal(parts[0].text,'試験法（令和元年法律第一号）');assert.equal(parts[1].text,'施行日　2026-10-01');assert.ok(parts.some(p=>p.text==='試験法を次のように制定する。'));assert.ok(parts.some(p=>p.text==='目次'));assert.ok(parts.some(p=>p.text==='第一章　総則　（第一条―第二条）'));assert.ok(parts.some(p=>p.depth===1&&p.text.startsWith('第一節')));
});

test('PDFは章節・条の見出し・項の前を空け、号には空白行を足さない',()=>{
 const el=xmlToEL('<Law><LawBody><LawTitle>試験法</LawTitle><MainProvision><Chapter Num="1"><ChapterTitle>第一章　総則</ChapterTitle><Section Num="1"><SectionTitle>第一節　目的</SectionTitle><Article Num="1"><ArticleCaption>（目的）</ArticleCaption><ArticleTitle>第一条</ArticleTitle><Paragraph Num="1"><ParagraphNum/><ParagraphSentence><Sentence>最初の項。</Sentence></ParagraphSentence><Item Num="1"><ItemTitle>一</ItemTitle><ItemSentence><Sentence>号の本文。</Sentence></ItemSentence></Item></Paragraph><Paragraph Num="2"><ParagraphNum>２</ParagraphNum><ParagraphSentence><Sentence>次の項。</Sentence></ParagraphSentence></Paragraph></Article></Section></Chapter></MainProvision></LawBody></Law>');let n=0;function visit(e){e.readerNode=String(n++);if(e.tag==='Article')e.readerKey='0';for(const c of e.children||[])if(typeof c!=='string')visit(c);}visit(el);
 const law={el,title:'試験法',num:'令和元年法律第一号',analysis:{pointerEnvByEL:new Map()}},parts=pdfRows([law,null,null]).flatMap(r=>r[0]);
 assert.ok(parts.filter(p=>p.heading||p.caption).every(p=>p.gapBefore));assert.equal(parts.find(p=>p.text.includes('最初の項')).gapBefore,false);assert.equal(parts.find(p=>p.text.includes('次の項')).gapBefore,true);assert.equal(parts.find(p=>p.text.includes('号の本文')).gapBefore,false);assert.match(pdfHTML([law,null,null]),/marginBlockStart='12.6pt'/);
});

test('PDFは空行と章節見出しの長さを含む本文開始位置を揃える',async()=>{
 const {pdfBodyPadding}=await import('../src/exportPdf.js');
 assert.deepEqual(pdfBodyPadding([0,16.8,null]),[16.8,0,0]);
 assert.deepEqual(pdfBodyPadding([0,84,33.6]),[84,0,50.4]);
 assert.deepEqual(pdfBodyPadding([0,0,0]),[0,0,0]);
 const offsets=[16.8,84,33.6],pad=pdfBodyPadding(offsets);assert.ok(offsets.every((n,i)=>Math.abs(n+pad[i]-84)<.001));
});
