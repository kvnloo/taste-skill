export const KINDS = ['purpose', 'material', 'decision', 'reference'];
export const STORAGE_KEY = 'taste.visual-reference-atlas.v1';
const node = (id, kind, label, description, x, y, extra = {}) => ({
  id, type: 'taxonomy', position: { x, y },
  data: { kind, label, description, creator: '', sourceUrl: '', imageUrl: '', ...extra },
});
const edge = (source, target) => ({ id: source + ':' + target, source, target, type: 'smoothstep' });

export const SEED_GRAPH = {
  nodes: [
    node('p-focus','purpose','Direct attention','Create a clear point of entry.',0,70),
    node('p-motion','purpose','Suggest motion','Give a static surface momentum.',0,380),
    node('m-type','material','Typography','Work with scale, rhythm, and spacing.',290,35),
    node('m-form','material','Shape & color','Work with silhouette, density, and contrast.',290,355),
    node('d-scale','decision','Extreme scale','Change proportions to establish a hierarchy.',580,0),
    node('d-repeat','decision','Directed repetition','Repeat elements along a deliberate path.',580,275),
    node('d-break','decision','Unexpected interruption','Break a visual pattern at the meaningful moment.',580,550),
    node('r-signal','reference','Editorial signal','A typographic system with one decisive interruption.',910,-55,{palette:'signal', creator:'Original demo specimen'}),
    node('r-pulse','reference','Tempo study','Repeated forms that create directional energy.',910,155,{palette:'pulse', creator:'Original demo specimen'}),
    node('r-field','reference','Quiet interface','A calm data surface with a deliberate focal point.',910,365,{palette:'field', creator:'Original demo specimen'}),
    node('r-orbit','reference','Orbital study','A single irregularity in an ordered system.',910,575,{palette:'orbit', creator:'Original demo specimen'}),
  ],
  edges: [
    edge('p-focus','m-type'),edge('p-focus','m-form'),edge('p-motion','m-form'),
    edge('m-type','d-scale'),edge('m-form','d-scale'),edge('m-form','d-repeat'),edge('m-form','d-break'),
    edge('d-scale','r-signal'),edge('d-scale','r-field'),edge('d-repeat','r-pulse'),edge('d-break','r-orbit'),
  ],
};
export function starterGraph() { return JSON.parse(JSON.stringify(SEED_GRAPH)); }
function plain(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
export function safeUrl(value) {
  const text = plain(value, 2000);
  if (!text) return '';
  try {
    const url = new URL(text);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.toString() : '';
  } catch { return ''; }
}
export function normalizeGraph(input) {
  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error('Expected a graph with nodes and edges.');
  const seen = new Set();
  const nodes = [];
  for (const raw of input.nodes.slice(0, 300)) {
    if (!raw || !raw.data || !KINDS.includes(raw.data.kind)) continue;
    const id = plain(raw.id, 80);
    if (!/^[a-zA-Z0-9:_-]+$/.test(id) || seen.has(id)) continue;
    const position = raw.position ?? {};
    seen.add(id);
    nodes.push({ id, type:'taxonomy', position:{
      x:Number.isFinite(position.x)?Math.max(-10000,Math.min(10000,position.x)):0,
      y:Number.isFinite(position.y)?Math.max(-10000,Math.min(10000,position.y)):0,
    }, data:{kind:raw.data.kind,label:plain(raw.data.label,120)||'Untitled',
      description:plain(raw.data.description,600),creator:plain(raw.data.creator,120),
      sourceUrl:safeUrl(raw.data.sourceUrl),imageUrl:safeUrl(raw.data.imageUrl),
      palette:['signal','pulse','field','orbit'].includes(raw.data.palette)?raw.data.palette:'field'},
    });
  }
  const edges = [];
  const edgeSeen = new Set();
  for (const e of input.edges.slice(0, 600)) {
    if (!e || !seen.has(e.source) || !seen.has(e.target) || e.source===e.target) continue;
    const id = e.source+':'+e.target;
    if (edgeSeen.has(id)) continue;
    edgeSeen.add(id);
    edges.push({id,source:e.source,target:e.target,type:'smoothstep'});
  }
  return {nodes,edges};
}
export function importBookmarks(items) {
  if (!Array.isArray(items)) throw new Error('Bookmarks must be a JSON array.');
  const nodes = [], seen = new Set();
  for (const item of items.slice(0,200)) {
    const url = safeUrl(typeof item === 'string' ? item : item?.url ?? item?.sourceUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const n = nodes.length;
    nodes.push(node('bookmark-'+n,'reference',plain(item?.title,120)||new URL(url).hostname,
      plain(item?.description ?? item?.text,600),n%4*255,Math.floor(n/4)*230,
      {sourceUrl:url,creator:plain(item?.creator ?? item?.author ?? item?.username,120),
        imageUrl:safeUrl(item?.imageUrl ?? item?.image),palette:'field'}));
  }
  if (!nodes.length) throw new Error('No public HTTP(S) bookmark URLs found.');
  return normalizeGraph({nodes,edges:[]});
}
export function importJson(data) {
  const value = typeof data === 'string' ? JSON.parse(data) : data;
  if (Array.isArray(value)) return importBookmarks(value);
  if (Array.isArray(value?.bookmarks)) return importBookmarks(value.bookmarks);
  return normalizeGraph(value);
}
