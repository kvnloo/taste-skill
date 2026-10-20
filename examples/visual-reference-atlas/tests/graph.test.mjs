import test from 'node:test';
import assert from 'node:assert/strict';
import {importBookmarks, importJson, normalizeGraph, safeUrl, starterGraph} from '../src/graph.mjs';
test('seed graph has resolved references and taxonomy tiers', () => {
  const {nodes,edges} = normalizeGraph(starterGraph());
  assert.equal(nodes.length, 11);
  assert.ok(edges.length >= 10);
  assert.equal(new Set(nodes.map(n=>n.data.kind)).size,4);
});
test('URL handling blocks script/data schemes', () => {
  assert.equal(safeUrl('javascript:alert(1)'),'');
  assert.equal(safeUrl('data:text/html,x'),'');
  assert.equal(safeUrl('https://x.com/post/1'),'https://x.com/post/1');
});
test('bookmark imports skip invalid and duplicate entries', () => {
  const graph=importBookmarks([{url:'https://x.com/u/status/7',title:'motion study'},
    {url:'javascript:alert(1)'},{url:'https://x.com/u/status/7'}]);
  assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].data.kind,'reference');
});
test('imports drop unknown kinds, broken edges and nonfinite positions', () => {
  const graph=normalizeGraph({nodes:[{id:'a',data:{kind:'purpose',label:'A'},position:{x:Infinity,y:2}},
    {id:'b',data:{kind:'fake',label:'B'}}],edges:[{source:'a',target:'b'}]});
  assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].position.x,0);assert.equal(graph.edges.length,0);
});
test('empty imports and malformed JSON fail without destroying state', () => {
  assert.throws(()=>importJson('{invalid'));
  assert.throws(()=>importBookmarks([{url:'file:///etc/passwd'}]));
});
