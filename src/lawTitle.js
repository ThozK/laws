// API titles may contain XML ruby/emphasis markup. Keep base text, never render HTML.
export function plainLawTitle(value){
 if(typeof value!=='string')return value;
 let title=value;
 for(let i=0;i<2;i++)title=title.replace(/&(?:lt|gt|quot|apos|amp);|&#(?:x[0-9a-f]+|\d+);/gi,entity=>{
  const named={'&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&amp;':'&'};
  if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
  const code=entity.slice(2,-1),number=parseInt(code[0].toLowerCase()==='x'?code.slice(1):code,code[0].toLowerCase()==='x'?16:10);
  return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';
 });
 return title.replace(/<(?:Rt|Rp)\b[^>]*>[\s\S]*?<\/(?:Rt|Rp)\s*>/gi,'').replace(/<[^>]*>/g,'');
}
export function normalizeLawTitles(data){
 if(!data||typeof data!=='object')return data;
 for(const key of Object.keys(data)){
  if(['law_title','parent_title'].includes(key)&&typeof data[key]==='string')data[key]=plainLawTitle(data[key]);
  else if(data[key]&&typeof data[key]==='object')normalizeLawTitles(data[key]);
 }
 return data;
}
