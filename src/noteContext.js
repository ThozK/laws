import {subitemLevel} from './references.js';
export function noteContext(law,content){
 if(!law?.el||!content)return '';
 function pathTo(node,path=[]){
  const next=[...path,node];if(node===content)return next;
  for(const child of node.children||[])if(typeof child!=='string'){const found=pathTo(child,next);if(found)return found;}
  return null;
 }
 const path=pathTo(law.el)||[];
 const article=path.find(el=>el.tag==='Article');
 const paragraph=path.find(el=>el.tag==='Paragraph');
 const item=path.find(el=>el.tag==='Item');
 const title=article?.children.find(el=>el.tag==='ArticleTitle')?.text()||'';
 return [(article?.readerSection||'')+title,paragraph?.attr.Num&&`第${paragraph.attr.Num}項`,item?.attr.Num&&`第${item.attr.Num}号`,...path.filter(el=>subitemLevel(el.tag)>0).map(el=>el.children.find(c=>c.tag===`${el.tag}Title`)?.text()||el.attr.Num)].filter(Boolean).join('　');
}
