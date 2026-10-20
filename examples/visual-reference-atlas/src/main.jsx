import React, {useCallback, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,ReactFlowProvider,Background,BackgroundVariant,Controls,Handle,Position,useReactFlow,applyNodeChanges,applyEdgeChanges,addEdge} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {KINDS,STORAGE_KEY,starterGraph,normalizeGraph,importJson,safeUrl} from './graph.mjs';
import './style.css';

const FILTERS=[['all','All layers'],['purpose','Purpose'],['material','Material'],['decision','Decision'],['reference','References']];
const KIND_LABEL={purpose:'01 / Purpose',material:'02 / Material',decision:'03 / Decision',reference:'04 / Reference'};
function readSaved(){
  try {const stored=localStorage.getItem(STORAGE_KEY);return stored?normalizeGraph(JSON.parse(stored)):starterGraph();}
  catch {return starterGraph();}
}
function TaxonomyNode({data,selected}){
  return <article className={'tax-node kind-'+data.kind+(selected?' selected':'')}>
    <Handle type="target" position={Position.Left}/>
    {data.kind==='reference'&&<div className={'specimen specimen-'+(data.palette||'field')}>
      {data.imageUrl&&<img src={safeUrl(data.imageUrl)} alt={'Reference visual for '+data.label} loading="lazy" referrerPolicy="no-referrer"/>}
      {!data.imageUrl&&<div className="specimen-mark" aria-hidden="true"/>}
    </div>}
    <div className="node-body"><div className="node-eyebrow">{KIND_LABEL[data.kind]}</div>
      <h3>{data.label}</h3><p>{data.description}</p>
      {data.kind==='reference'&&<small>{data.creator||'Add creator attribution'}</small>}
    </div><Handle type="source" position={Position.Right}/>
  </article>;
}
const nodeTypes={taxonomy:TaxonomyNode};
function Atlas(){
  const [graph,setGraph]=useState(readSaved);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [selectedId,setSelectedId]=useState(null);
  const [message,setMessage]=useState('');
  const [mobilePanel,setMobilePanel]=useState('');
  const importInput=useRef(null);
  const {fitView,setViewport}=useReactFlow();
  const isMobile=window.matchMedia('(max-width:800px)').matches;
  const selected=graph.nodes.find(n=>n.id===selectedId);
  const changeGraph=useCallback((updater)=>setGraph(old=>{
    const next=typeof updater==='function'?updater(old):updater;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{}
    return next;
  }),[]);
  const onNodesChange=useCallback(changes=>changeGraph(g=>({...g,nodes:applyNodeChanges(changes,g.nodes)})),[changeGraph]);
  const onEdgesChange=useCallback(changes=>changeGraph(g=>({...g,edges:applyEdgeChanges(changes,g.edges)})),[changeGraph]);
  const onConnect=useCallback(link=>changeGraph(g=>({...g,edges:addEdge({...link,type:'smoothstep'},g.edges)})),[changeGraph]);
  const shown=useMemo(()=>{
    const match=new Set(graph.nodes.filter(n=>
      (filter==='all'||n.data.kind===filter)&&
      (!search||[n.data.label,n.data.description,n.data.creator,n.data.sourceUrl].join(' ').toLowerCase().includes(search.toLowerCase()))
    ).map(n=>n.id));
    return {nodes:graph.nodes.map(n=>({...n,hidden:!match.has(n.id)})),
      edges:graph.edges.map(e=>({...e,hidden:!match.has(e.source)||!match.has(e.target)}))};
  },[graph,filter,search]);
  function updateField(field,value){changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedId?
    {...n,data:{...n.data,[field]:value}}:n)}));}
  function addReference(){
    const id='ref-'+Date.now();const n={id,type:'taxonomy',position:{x:900,y:((graph.nodes.length-8)%5)*190},
      data:{kind:'reference',label:'Untitled reference',description:'What makes this reference effective?',
        creator:'',sourceUrl:'',imageUrl:'',palette:'field'}};
    changeGraph(g=>({...g,nodes:[...g.nodes,n]}));setSelectedId(id);setFilter('all');setSearch('');setMobilePanel('inspector');
    setMessage('New reference created. Connect its handle to a design decision.');
  }
  function doExport(){
    const blob=new Blob([JSON.stringify({version:1,...graph},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
    anchor.href=url;anchor.download='taste-visual-reference-atlas.json';anchor.click();URL.revokeObjectURL(url);
    setMessage('Exported a local JSON file.');
  }
  async function doImport(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{if(file.size>2_000_000)throw new Error('File too large (2 MB maximum).');
      const incoming=importJson(await file.text());
      if(!incoming.nodes.length)throw new Error('No valid references found.');
      changeGraph(incoming);setSelectedId(null);setFilter('all');setSearch('');
      setMessage('Imported '+incoming.nodes.length+' entries. Import replaces the current board; export a backup first.');
      requestAnimationFrame(()=>fitView({padding:0.14,duration:350}));
    }catch(e){setMessage('Import failed: '+e.message);}
  }
  function reset(){if(window.confirm('Replace your current local board with the demo? Export first to keep changes.')){
    changeGraph(starterGraph());setSelectedId(null);setFilter('all');setSearch('');setMessage('Demo restored.');}}
  const counts=Object.fromEntries(KINDS.map(k=>[k,graph.nodes.filter(n=>n.data.kind===k).length]));
  return <div className="app-shell">
    <aside className={'sidebar '+(mobilePanel==='library'?'mobile-open':'')}>
      <div className="brand"><span className="brand-mark" aria-hidden="true">✳</span><div><strong>TASTE / LAB</strong><span>Reference systems</span></div></div>
      <div className="eyebrow sidebar-section">YOUR INDEX</div>
      <div className="view-switch">{FILTERS.map(([key,label])=><button className={'view-item '+(filter===key?'active':'')} key={key}
        onClick={()=>{setFilter(key);setMobilePanel('');}}><span>{label}</span><span>{key==='all'?graph.nodes.length:counts[key]}</span></button>)}</div>
      <div className="sidebar-bottom"><span className="eyebrow">WHY THIS EXISTS</span><p>Collect a reference. Name the decision behind it. Connect it to a purpose. Find it again.</p>
        <a href="https://visuals.modernartdirection.com/" target="_blank" rel="noreferrer">Inspired by Jason Murray’s Iris <span aria-hidden="true">↗</span></a>
      </div>
    </aside>
    <main className="workbench">
      <header className="toolbar"><div className="toolbar-title"><div className="eyebrow">TOOL 01 <span className="divider-dot">·</span> VISUAL INTELLIGENCE</div><h1>Reference Atlas <sup>beta</sup></h1><p>Map why visuals work, not just what they look like.</p></div>
        <div className="toolbar-actions"><button className="button subtle mobile-only" onClick={()=>setMobilePanel(mobilePanel==='library'?'':'library')}>Index</button>
          <button className="button subtle" onClick={()=>isMobile?setViewport({x:25,y:130,zoom:0.29},{duration:350}):fitView({padding:0.18,duration:350})}>Fit view</button>
          <button className="button primary" onClick={addReference}>+ Reference</button>
          <button className="button subtle mobile-only" onClick={()=>setMobilePanel(mobilePanel==='inspector'?'':'inspector')}>Details</button>
        </div>
      </header>
      <div className="canvas-meta"><label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ideas, sources, authors..." aria-label="Search visual references"/></label>
        <div className="canvas-stats"><span className="status-dot"/> {shown.nodes.filter(n=>!n.hidden).length} nodes <span className="separator">/</span> {shown.edges.filter(e=>!e.hidden).length} links</div>
      </div>
      <section className="graph-wrap" aria-label="Interactive visual-reference graph"><ReactFlow nodes={shown.nodes} edges={shown.edges}
        nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onNodeClick={(_,n)=>{setSelectedId(n.id);setMobilePanel('inspector');}}
        onPaneClick={()=>{setSelectedId(null);setMobilePanel('');}}
        fitView={!isMobile} defaultViewport={isMobile?{x:25,y:130,zoom:0.29}:undefined}
        fitViewOptions={{padding:0.17,minZoom:0.12}} minZoom={0.12} maxZoom={2.5}
        onInit={instance=>{if(!isMobile)window.setTimeout(()=>instance.fitView({padding:0.18,minZoom:0.12,maxZoom:1}),400);}}
        defaultEdgeOptions={{style:{stroke:'#586b66',strokeWidth:1.4}}}
        colorMode="dark" proOptions={{hideAttribution:false}}>
        <Background variant={BackgroundVariant.Dots} color="#27332d" gap={22} size={1}/>
        <Controls showInteractive={false} position="bottom-left"/>
      </ReactFlow><div className="canvas-hint">DRAG TO CONNECT <span>·</span> SCROLL TO ZOOM <span>·</span> CLICK TO INSPECT</div></section>
      <footer className="status-bar"><span>{message||'Local-first · No account · No automatic scraping'}</span>
        <div className="footer-actions"><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={doImport}/>
          <button onClick={()=>importInput.current?.click()}>Import JSON</button><button onClick={doExport}>Export</button><button onClick={reset}>Reset demo</button></div></footer>
    </main>
    <aside className={'inspector '+(mobilePanel==='inspector'?'mobile-open':'')}>
      <div className="inspector-heading"><span className="eyebrow">OBJECT INSPECTOR</span><button className="mobile-only close-panel" onClick={()=>setMobilePanel('')}>×</button></div>
      {selected?<div className="inspect-content"><div className="inspect-type">{KIND_LABEL[selected.data.kind]}</div><h2>{selected.data.label}</h2>
        {selected.data.kind==='reference'&&<div className={'inspect-preview specimen-'+(selected.data.palette||'field')}>
          {selected.data.imageUrl?<img alt="Selected visual reference" src={safeUrl(selected.data.imageUrl)} referrerPolicy="no-referrer"/>:<div className="specimen-mark"/>}</div>}
        <label className="field">Name<input value={selected.data.label} maxLength={120} onChange={e=>updateField('label',e.target.value)}/></label>
        <label className="field">Why it works<textarea rows="4" value={selected.data.description} onChange={e=>updateField('description',e.target.value)}/></label>
        {selected.data.kind==='reference'&&<><label className="field">Creator / credit<input value={selected.data.creator} onChange={e=>updateField('creator',e.target.value)} placeholder="Original creator"/></label>
          <label className="field">Source link<input value={selected.data.sourceUrl} onChange={e=>updateField('sourceUrl',safeUrl(e.target.value)||e.target.value)} placeholder="https://..."/></label>
          <label className="field">Image URL (optional)<input value={selected.data.imageUrl} onChange={e=>updateField('imageUrl',safeUrl(e.target.value)||e.target.value)} placeholder="https://..."/></label>
          {safeUrl(selected.data.sourceUrl)&&<a className="inspect-link" href={safeUrl(selected.data.sourceUrl)} target="_blank" rel="noreferrer">View original source ↗</a>}</>}
        <p className="inspect-footnote">References are yours to curate. Preserve creator credits and check image rights before sharing.</p>
        </div>:<div className="inspect-empty"><div className="empty-glyph" aria-hidden="true">⌁</div><h2>Select an idea</h2><p>Choose a node to edit its meaning and provenance. Drag connectors to express relationships.</p></div>}
    </aside>
    {mobilePanel&&<button className="scrim mobile-only" onClick={()=>setMobilePanel('')} aria-label="Close side panel"/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ReactFlowProvider><Atlas/></ReactFlowProvider></React.StrictMode>);
