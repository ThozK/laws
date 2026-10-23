import {analyze} from 'lawtext/dist/src/analyzer/index.js';
import {isSentenceLike} from 'lawtext/dist/src/node/container/sentenceEnv.js';

// Lawtext 0.2.3 escapes apostrophes as &apos; before parsing inline XML,
// but its sentence parser cannot consume that entity. Apostrophes are legal
// literal characters in XML text; retain the exact chemical name throughout.
export async function analyzeLaw(el,analyzer=analyze){
 const restored=[];
 function visit(node){
  if(isSentenceLike(node)&&node.text().includes("'")){
   const own=Object.getOwnPropertyDescriptor(node,'innerXML'),original=node.innerXML;
   node.innerXML=function(...args){return original.apply(this,args).replace(/&apos;/g,"'");};
   restored.push(()=>{if(own)Object.defineProperty(node,'innerXML',own);else delete node.innerXML;});
  }
  for(const child of node.children||[])if(typeof child!=='string')visit(child);
 }
 visit(el);
 try{return await analyzer({elToBeModified:el});}finally{for(const restore of restored)restore();}
}
