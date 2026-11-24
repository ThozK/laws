export function referenceKind(target,sourceIndex,laws){
 const index=target.internal?sourceIndex:laws.findIndex(l=>l?.num===target.lawNum);
 return ['act','order','rule'][index]||'external';
}

// Explicitly resolved aliases override the parser's original same-law scope.
export function isCrossReference(target,sourceIndex,laws){
 return !target.internal&&laws.some((law,index)=>index!==sourceIndex&&law?.num===target.lawNum);
}
