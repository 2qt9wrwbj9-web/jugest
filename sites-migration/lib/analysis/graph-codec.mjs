// Lossless, versioned structured state. Entries are arrays: original key and Map
// insertion order, holes, undefined, nonfinite values, -0 and sharing survive JSON.
export function encodeGraph(value){
 const nodes=[],seen=new Map();
 function visit(x){
  if(x===undefined)return['undefined'];if(x===null||typeof x==='string'||typeof x==='boolean')return['value',x];
  if(typeof x==='number')return['number',Number.isNaN(x)?'NaN':x===Infinity?'+Infinity':x===-Infinity?'-Infinity':Object.is(x,-0)?'-0':x];
  if(typeof x!=='object')throw Error('stage_unsupported_value');
  if(seen.has(x))return['ref',seen.get(x)];const id=nodes.length;seen.set(x,id);nodes.push(null);
  const tag=Object.prototype.toString.call(x);let node;
  if(tag==='[object Map]')node={kind:'map',entries:[...x].map(([k,v])=>[visit(k),visit(v)])};
  else if(tag==='[object Set]')node={kind:'set',entries:[...x].map(visit)};
  else if(Array.isArray(x))node={kind:'array',length:x.length,entries:Object.keys(x).map(k=>[k,visit(x[k])])};
  else if(tag==='[object Object]')node={kind:'object',nullPrototype:Object.getPrototypeOf(x)===null,entries:Object.keys(x).map(k=>[k,visit(x[k])])};
  else throw Error('stage_unsupported_object');nodes[id]=node;return['ref',id];
 }
 const root=visit(value);return{format:'jugest-stage-graph-v1',root,nodes};
}
export function decodeGraph(graph){
 if(graph?.format!=='jugest-stage-graph-v1'||!Array.isArray(graph.nodes))throw Error('stage_graph_invalid');
 const values=graph.nodes.map(n=>{if(n.kind==='map')return new Map;if(n.kind==='set')return new Set;if(n.kind==='object')return n.nullPrototype?Object.create(null):{};if(n.kind==='array'&&Number.isSafeInteger(n.length)&&n.length>=0&&n.length<=4294967295)return new Array(n.length);throw Error('stage_graph_invalid')});
 function read(t){if(!Array.isArray(t))throw Error('stage_graph_invalid');if(t[0]==='undefined')return undefined;if(t[0]==='value'&&(t[1]===null||['string','boolean'].includes(typeof t[1])))return t[1];if(t[0]==='number'){if(typeof t[1]==='number'&&Number.isFinite(t[1]))return t[1];if(t[1]==='NaN')return NaN;if(t[1]==='+Infinity')return Infinity;if(t[1]==='-Infinity')return-Infinity;if(t[1]==='-0')return-0}if(t[0]==='ref'&&Number.isInteger(t[1])&&t[1]>=0&&t[1]<values.length)return values[t[1]];throw Error('stage_graph_invalid')}
 graph.nodes.forEach((n,i)=>{if(!Array.isArray(n.entries))throw Error('stage_graph_invalid');const value=values[i];for(const entry of n.entries){if(n.kind==='set'){value.add(read(entry));continue}if(!Array.isArray(entry)||entry.length!==2)throw Error('stage_graph_invalid');if(n.kind==='map')value.set(read(entry[0]),read(entry[1]));else{if(typeof entry[0]!=='string'||(n.kind==='array'&&entry[0]==='length'))throw Error('stage_graph_invalid');Object.defineProperty(value,entry[0],{value:read(entry[1]),enumerable:true,writable:true,configurable:true})}}});return read(graph.root);
}
