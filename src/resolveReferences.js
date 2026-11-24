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
 const refs=[],scopes=new Map(),scopeByNode=new WeakMap();
 function visit(el,scope=null){if(el.tag==='SupplProvision'){scope=el;scopes.set(scope,[]);}scopeByNode.set(el,scope);if(el.tag==='____LawRef'){if(scope)scopes.get(scope).push(el);else refs.push(el);}for(const c of el.children||[])if(typeof c!=='string')visit(c,scope);}visit(law.el);
 const body=law.el.children.find(e=>e.tag==='LawBody');
 const text=body?body.children.filter(e=>typeof e!=='string'&&e.tag!=='SupplProvision').map(e=>e.text()).join(''):law.el.text();
 for(const ref of refs){const t=ref.attr.suggestedLawTitle,n=ref.attr.lawNum;if(!n)continue;if(t===base||(!aliases.法&&law.title?.endsWith('施行令')&&law.el.text().includes(base+'（以下「法」という')&&refs[0]===ref))aliases.法={lawNum:n,title:base};if(t===base+'施行令')aliases.令={lawNum:n,title:t};}
 // Read explicit aliases even when the regulation name differs from the parent law.
 function readDeclarations(refs,text,aliases){
 for(const ref of refs){
  const n=ref.attr.lawNum;if(!n)continue;
  const t=ref.attr.suggestedLawTitle,value=ref.text();
  // Do not scan ahead across another law citation: its alias belongs to it.
  const declaration=value.match(/[（(](?:[^（）()]*[。．]\s*)?以下「([法令])」という/)?.[1];
  const bareTitleAlias=['法','令'].find(a=>t&&text.includes(`${t}（以下「${a}」という`));
  let adjacent;
  for(let pos=text.indexOf(value);pos>=0;pos=text.indexOf(value,pos+Math.max(value.length,1))){
   adjacent=text.slice(pos+value.length).match(/^[（(]\s*以下「([法令])」という/)?.[1];if(adjacent)break;
  }
  const name=declaration||bareTitleAlias||adjacent;
  if(name)aliases[name]={lawNum:n,title:t||n};
 }
 return aliases;
 }
 readDeclarations(refs,text,aliases);
 const scopedAliases=new Map([...scopes].map(([scope,refs])=>[scope,readDeclarations(refs,scope.text(),{...aliases})]));
 for(const env of law.analysis.pointerEnvByEL.values()){
  delete env.readerTargets;
  let prefix='',found=false;
  function before(el){if(el===env.pointer){found=true;return;}if(found)return;if(typeof el==='string'){prefix+=el;return;}for(const c of el.children||[]){before(c);if(found)break;}}
  before(env.sentenceEnv.el);
  const alias=prefix.match(/(?:^|[^一-龥々])([法令])$/)?.[1]||prefix.match(/以下「([法令])」という。?）$/)?.[1];
  const owner=(scopedAliases.get(scopeByNode.get(env.pointer))||aliases)[alias];if(!owner)continue;
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
