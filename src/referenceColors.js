export function referenceKind(target,sourceIndex,laws){
 const index=target.internal?sourceIndex:laws.findIndex(l=>l?.num===target.lawNum);
 return ['act','order','rule'][index]||'external';
}
