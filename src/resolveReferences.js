import {parseNamedNum} from 'lawtext/dist/src/law/num.js';
// Explicit aliases take precedence over the parser's implicit same-law scope.
export function resolveLawReferences(law,peers=[]){
 const base=law.title?.replace(/施行(?:令|規則)$/,'');
 const aliases={};
 for(const name of ['法','令']){
  const suffix=name==='法'?'':'施行令',title=base+suffix;
  const peer=peers.find(p=>p&&p.title===title);
  if(peer)aliases[name]={lawNum:peer.num,title:peer.title};
 }
 const refs=[];function visit(el){if(el.tag==='____LawRef')refs.push(el);for(const c of el.children||[])if(typeof c!=='string')visit(c);}visit(law.el);
 for(const ref of refs){const t=ref.attr.suggestedLawTitle,n=ref.attr.lawNum;if(!n)continue;if(t===base||(!aliases.法&&law.title?.endsWith('施行令')&&law.el.text().includes(base+'（以下「法」という')&&refs[0]===ref))aliases.法={lawNum:n,title:base};if(t===base+'施行令')aliases.令={lawNum:n,title:t};}
 for(const env of law.analysis.pointerEnvByEL.values()){
  delete env.readerTargets;
  let prefix='',found=false;
  function before(el){if(el===env.pointer){found=true;return;}if(found)return;if(typeof el==='string'){prefix+=el;return;}for(const c of el.children||[]){before(c);if(found)break;}}
  before(env.sentenceEnv.el);
  const alias=prefix.match(/(?:^|[^一-龥々])([法令])$/)?.[1]||prefix.match(/以下「([法令])」という。?）$/)?.[1];
  const owner=aliases[alias];if(!owner)continue;
  const state={...owner};let supported=true;
  env.readerTargets=env.pointer.children.map(f=>{
   const type=f.attr?.targetType,num=f.attr?.num||parseNamedNum(f.attr?.name||'');
   if(type==='Article'){state.article=num;delete state.paragraph;delete state.item;}
   else if(type==='Paragraph')state.paragraph=num;
   else if(type==='Item')state.item=num;
   else if(type==='SUBITEM')state.subitems=[...(state.subitems||[]),num];
   else supported=false;
   return {text:f.text?.()||'',target:supported&&state.article?{...state,subitems:state.subitems?[...state.subitems]:undefined}:null};
  });
 }
 law.aliases=aliases;return law;
}
