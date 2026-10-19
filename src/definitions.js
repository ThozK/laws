import {subitemLevel} from './references.js';
// Use Lawtext's declaration scopes instead of matching a term across the whole law.
export function definitionFor(law,reference){
 if(reference.text()==='この法律')return null;
 const declaration=law?.analysis.declarations.get(reference.attr.declarationID);
 if(!declaration||declaration.attr.name==='この法律')return null;
 const sentence=law.analysis.sentenceEnvs[declaration.nameSentenceTextRange.start.sentenceIndex];
 if(!sentence)return null;
 const ancestors=[...sentence.parentELs,sentence.el];
 const content=[...ancestors].reverse().find(el=>(['Item','Paragraph','Article'].includes(el.tag)||subitemLevel(el.tag)>0))||sentence.el;
 return {declaration,content};
}
