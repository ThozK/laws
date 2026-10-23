const unit=tag=>['Article','Paragraph','Item'].includes(tag)||/^Subitem\d+$/.test(tag);
export function unitText(el){function text(node){if(typeof node==='string')return node;if(node!==el&&unit(node.tag))return '';return (node.children||[]).map(text).join('');}return text(el);}
