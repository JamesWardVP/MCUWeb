(function(){
  const nodes = DATA.nodes;   // {label, format, studio, fill, stroke, datekey, year, month, x, y, w, h}
  const edges = DATA.edges;   // {source, target, dashed}

  // ---------- build adjacency ----------
  nodes.forEach((n,i)=>{ n.idx = i; n.outConn=[]; n.inConn=[]; });
  edges.forEach(e=>{
    const s = nodes[e.source], t = nodes[e.target];
    if(!s || !t) return;
    s.outConn.push(t.idx); t.inConn.push(s.idx);
  });
  nodes.forEach(n=>{
    n.connCount = n.outConn.length+n.inConn.length;
  });

  const FORMAT_META = {
    film:    {label:'Film',    icon: sh => `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="${sh}" stroke-width="2"/></svg>`},
    tv:      {label:'TV Show', icon: sh => `<svg viewBox="0 0 24 24"><polygon points="7,4 17,4 22,12 17,20 7,20 2,12" fill="none" stroke="${sh}" stroke-width="2"/></svg>`},
    special: {label:'Special / One-Shot', icon: sh => `<svg viewBox="0 0 24 24"><polygon points="8,5 22,5 16,19 2,19" fill="none" stroke="${sh}" stroke-width="2"/></svg>`}
  };

  const studios = [...new Set(nodes.map(n=>n.studio))].sort();
  const studioColor = {};
  nodes.forEach(n=>{ if(!studioColor[n.studio]) studioColor[n.studio] = n.stroke; });

  // ---------- stat strip ----------
  const minY = Math.min(...nodes.map(n=>n.year)), maxY = Math.max(...nodes.map(n=>n.year));
  document.getElementById('statStrip').innerHTML = `
    <div class="stat"><span class="n">${nodes.length}</span><span class="l">Entries Catalogued</span></div>
    <div class="stat"><span class="n">${edges.length}</span><span class="l">Traced Connections</span></div>
    <div class="stat"><span class="n">${studios.length}</span><span class="l">Origin Branches</span></div>
    <div class="stat"><span class="n">${minY}&ndash;${maxY}</span><span class="l">Years Spanned</span></div>
  `;
  document.getElementById('footerNote').innerHTML =
    `Compiled from MCU_Flowchart_v5 &mdash; ${nodes.length} catalogued entries, ${edges.length} traced connections &mdash; for personal reference only.`;

  // ---------- legend ----------
  document.getElementById('legendStrip').innerHTML = `
    <span class="legend-item">${FORMAT_META.film.icon('#9C8D74')}Film — rounded box</span>
    <span class="legend-item">${FORMAT_META.tv.icon('#9C8D74')}TV Show — hexagon</span>
    <span class="legend-item">${FORMAT_META.special.icon('#9C8D74')}Special / One-Shot — parallelogram</span>
    <span class="legend-item"><span class="legend-line solid"></span>Traced connection</span>
  `;

  // ---------- filter chip state ----------
  const state = { formats: new Set(Object.keys(FORMAT_META)), studios: new Set(studios), query:'' };

  const formatChipsEl = document.getElementById('formatChips');
  Object.keys(FORMAT_META).forEach(fmt=>{
    const b = document.createElement('button');
    b.className='chip active';
    b.dataset.fmt = fmt;
    b.innerHTML = `${FORMAT_META[fmt].label}`;
    b.addEventListener('click', ()=>{
      if(state.formats.has(fmt)){ state.formats.delete(fmt); b.classList.remove('active'); }
      else { state.formats.add(fmt); b.classList.add('active'); }
      renderAll();
    });
    formatChipsEl.appendChild(b);
  });

  const studioChipsEl = document.getElementById('studioChips');
  studios.forEach(st=>{
    const b = document.createElement('button');
    b.className='chip active';
    b.dataset.studio = st;
    b.innerHTML = `<span class="sw" style="background:${studioColor[st]}"></span>${st}`;
    b.addEventListener('click', ()=>{
      if(state.studios.has(st)){ state.studios.delete(st); b.classList.remove('active'); }
      else { state.studios.add(st); b.classList.add('active'); }
      renderAll();
    });
    studioChipsEl.appendChild(b);
  });

  document.getElementById('searchInput').addEventListener('input', e=>{
    state.query = e.target.value.trim().toLowerCase();
    renderAll();
  });

  document.getElementById('resetBtn').addEventListener('click', ()=>{
    state.formats = new Set(Object.keys(FORMAT_META));
    state.studios = new Set(studios);
    state.query='';
    document.getElementById('searchInput').value='';
    document.querySelectorAll('.chip').forEach(c=>c.classList.add('active'));
    renderAll();
  });

  function passesFilter(n){
    if(!state.formats.has(n.format)) return false;
    if(!state.studios.has(n.studio)) return false;
    if(state.query && !n.label.toLowerCase().includes(state.query)) return false;
    return true;
  }

  // ==================================================================
  // VIEW SWITCHING
  // ==================================================================
  let currentView = 'timeline';
  const timelineView = document.getElementById('timelineView');
  const flowchartView = document.getElementById('flowchartView');
  const viewToggle = document.getElementById('viewToggle');

  viewToggle.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=> switchView(btn.dataset.view));
  });

  function switchView(view){
    if(view === currentView) return;
    currentView = view;
    viewToggle.querySelectorAll('button').forEach(b=>{
      const active = b.dataset.view === view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    timelineView.classList.toggle('hidden', view !== 'timeline');
    flowchartView.classList.toggle('hidden', view !== 'flowchart');
    if(view === 'timeline'){
      if(selectedIdx !== null){
        const el = listEl.querySelector(`.card[data-idx="${selectedIdx}"]`);
        if(el) el.scrollIntoView({behavior:'auto', block:'center'});
      }
      drawArcsForSelection();
    } else {
      ensureFlowchartBuilt();
      requestAnimationFrame(()=> resizeFlowchart());
    }
  }

  function renderAll(){
    renderTimeline();
    updateFlowchartVisualState();
  }

  // ==================================================================
  // TIMELINE
  // ==================================================================
  const listEl = document.getElementById('timelineList');
  let selectedIdx = null;

  function renderTimeline(){
    listEl.innerHTML='';
    let lastYear = null;
    nodes.forEach((n)=>{
      const visible = passesFilter(n);
      const y = n.year;
      if(y !== lastYear){
        const marker = document.createElement('div');
        marker.className = 'year-marker has-items';
        marker.textContent = y;
        marker.dataset.year = y;
        listEl.appendChild(marker);
        lastYear = y;
      }
      const row = document.createElement('div');
      row.className = 'entry' + (visible? '' : ' hidden');
      row.dataset.idx = n.idx;

      const dot = document.createElement('div');
      dot.className = 'node-dot';
      row.appendChild(dot);

      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--stroke', n.stroke);
      card.dataset.idx = n.idx;
      card.innerHTML = `
        <span class="fmt-icon">${FORMAT_META[n.format].icon(n.stroke)}</span>
        <span class="card-main">
          <span class="card-title">${n.label}</span>
          <span class="card-meta">${n.studio}</span>
        </span>
        ${n.connCount ? `<span class="conn-count">${n.connCount} link${n.connCount===1?'':'s'}</span>` : ''}
      `;
      card.addEventListener('click', ()=> selectNode(n.idx));
      row.appendChild(card);
      listEl.appendChild(row);
    });
    cleanupYearMarkers();
    if(selectedIdx !== null) applyTimelineSelectionClasses();
    if(currentView === 'timeline') drawArcsForSelection();
  }

  function cleanupYearMarkers(){
    const children = Array.from(listEl.children);
    for(let i=0;i<children.length;i++){
      const el = children[i];
      if(el.classList.contains('year-marker')){
        let hasVisible = false;
        for(let j=i+1;j<children.length;j++){
          if(children[j].classList.contains('year-marker')) break;
          if(!children[j].classList.contains('hidden')){ hasVisible = true; break; }
        }
        el.classList.toggle('hidden', !hasVisible);
      }
    }
  }

  function applyTimelineSelectionClasses(){
    const n = nodes[selectedIdx];
    listEl.querySelectorAll('.card').forEach(c=>{
      const i = parseInt(c.dataset.idx,10);
      c.classList.remove('selected','dimmed','related');
      if(i === n.idx){ c.classList.add('selected'); }
      else if(n.outConn.includes(i) || n.inConn.includes(i)){ c.classList.add('related'); }
      else { c.classList.add('dimmed'); }
    });
  }

  function clearTimelineSelectionClasses(){
    listEl.querySelectorAll('.card').forEach(c=>c.classList.remove('selected','dimmed','related'));
  }

  // ---------- SVG arc drawing (timeline) ----------
  const overlaySvg = document.getElementById('overlay-svg');
  const timelineWrap = document.getElementById('timelineWrap');

  function drawArcsForSelection(){
    overlaySvg.innerHTML='';
    if(currentView !== 'timeline') return;
    overlaySvg.setAttribute('height', timelineWrap.scrollHeight);
    if(selectedIdx===null) return;

    overlaySvg.innerHTML = `<defs>
      <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#F2790B"/>
      </marker>
    </defs>`;

    const n = nodes[selectedIdx];
    const wrapRect = timelineWrap.getBoundingClientRect();

    function cardCenter(idx){
      const el = listEl.querySelector(`.card[data-idx="${idx}"]`);
      if(!el || el.closest('.entry').classList.contains('hidden')) return null;
      const r = el.getBoundingClientRect();
      return { x: r.right - wrapRect.left, y: r.top - wrapRect.top + r.height/2 };
    }

    function drawEdge(fromIdx, toIdx){
      const a = cardCenter(fromIdx), b = cardCenter(toIdx);
      if(!a || !b) return;
      const maxBulge = Math.max(40, wrapRect.width * 0.06);
      const bulge = Math.min(maxBulge, 60 + Math.abs(a.y-b.y)*0.04);
      const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
      const cx = Math.max(x1,x2) + bulge;
      const path = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d', path);
      p.setAttribute('fill','none');
      p.setAttribute('stroke', '#F2790B');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('marker-end', 'url(#arrow-solid)');
      p.setAttribute('opacity','0.85');
      overlaySvg.appendChild(p);
    }

    n.outConn.forEach(t=> drawEdge(n.idx, t));
    n.inConn.forEach(s=> drawEdge(s, n.idx));
  }

  window.addEventListener('resize', ()=>{
    if(currentView === 'timeline') drawArcsForSelection();
    else resizeFlowchart();
  });
  window.addEventListener('scroll', ()=>{ if(selectedIdx!==null && currentView==='timeline') drawArcsForSelection(); }, {passive:true});

  // ==================================================================
  // SELECTION + DETAIL PANEL (shared by both views)
  // ==================================================================
  const panel = document.getElementById('detailPanel');
  const backdrop = document.getElementById('backdrop');

  function selectNode(idx){
    selectedIdx = idx;
    applyTimelineSelectionClasses();
    updateFlowchartVisualState();
    openDetail(idx);
    if(currentView === 'timeline'){
      drawArcsForSelection();
      const el = listEl.querySelector(`.card[data-idx="${idx}"]`);
      if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
    } else {
      panToNode(idx);
    }
  }

  function connItem(idx){
    const li = document.createElement('li');
    li.className = 'conn-item';
    li.textContent = nodes[idx].label;
    li.addEventListener('click', ()=> selectNode(idx));
    return li;
  }

  function openDetail(idx){
    const n = nodes[idx];
    document.getElementById('detailEyebrow').textContent = FORMAT_META[n.format].label.toUpperCase();
    document.getElementById('detailTitle').textContent = n.label;
    document.getElementById('detailStudio').textContent = n.studio;
    document.getElementById('detailSw').style.background = n.stroke;

    const fillList = (elId, arr) => {
      const ul = document.getElementById(elId);
      ul.innerHTML='';
      if(arr.length===0){ const li=document.createElement('li'); li.className='conn-empty'; li.textContent='None on record.'; ul.appendChild(li); return; }
      arr.forEach(i=> ul.appendChild(connItem(i)));
    };
    fillList('connOut', n.outConn);
    fillList('connIn', n.inConn);

    panel.classList.add('open');
    backdrop.classList.add('open');
  }

  document.getElementById('detailClose').addEventListener('click', closeDetail);
  backdrop.addEventListener('click', closeDetail);
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeDetail(); });

  function closeDetail(){
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    selectedIdx = null;
    clearTimelineSelectionClasses();
    updateFlowchartVisualState();
    if(currentView === 'timeline') drawArcsForSelection();
  }

  // ==================================================================
  // FLOWCHART
  // ==================================================================
  const fcViewport = document.getElementById('fcViewport');
  const fcSvg = document.getElementById('fcSvg');
  const fcZoomLabel = document.getElementById('fcZoomLabel');

  let fcBuilt = false;
  let fcNodeEls = [];
  let fcEdgeEls = [];
  let CONTENT_W = 0, CONTENT_H = 0;
  let scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = 0.05, MAX_SCALE = 2.5;

  function escapeXml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function wrapLabel(ctx, text, maxWidth, maxLines){
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for(const w of words){
      const test = cur ? cur + ' ' + w : w;
      if(ctx.measureText(test).width > maxWidth && cur){
        lines.push(cur);
        cur = w;
        if(lines.length === maxLines - 1){
          // last allowed line: fit remaining words, ellipsize if needed
          const rest = words.slice(words.indexOf(w)).join(' ');
          let last = rest;
          while(ctx.measureText(last + '…').width > maxWidth && last.length > 1){
            last = last.slice(0, -1);
          }
          lines.push(last.length < rest.length ? last.trim() + '…' : rest);
          return lines;
        }
      } else {
        cur = test;
      }
    }
    if(cur) lines.push(cur);
    return lines;
  }

  function fcShapeMarkup(format, w, h, stroke){
    if(format === 'film'){
      return `<rect class="fc-shape" x="0" y="0" width="${w}" height="${h}" rx="10" ry="10" stroke="${stroke}"/>`;
    }
    if(format === 'tv'){
      const tip = w*0.085, flat = w*0.29;
      const pts = `${flat},0 ${w-flat},0 ${w-tip},${h/2} ${w-flat},${h} ${flat},${h} ${tip},${h/2}`;
      return `<polygon class="fc-shape" points="${pts}" stroke="${stroke}"/>`;
    }
    const skew = w*0.14;
    const pts = `${skew},0 ${w},0 ${w-skew},${h} 0,${h}`;
    return `<polygon class="fc-shape" points="${pts}" stroke="${stroke}"/>`;
  }

  function anchorPoints(a, b){
    const acx = a.fx + a.w/2, acy = a.fy + a.h/2;
    const bcx = b.fx + b.w/2, bcy = b.fy + b.h/2;
    const dx = bcx - acx, dy = bcy - acy;
    let sx, sy, tx2, ty2, sdir, tdir;
    if(Math.abs(dy) >= Math.abs(dx) * 0.6){
      if(dy >= 0){ sx=acx; sy=a.fy+a.h; sdir='down'; tx2=bcx; ty2=b.fy; tdir='up'; }
      else { sx=acx; sy=a.fy; sdir='up'; tx2=bcx; ty2=b.fy+b.h; tdir='down'; }
    } else {
      if(dx >= 0){ sx=a.fx+a.w; sy=acy; sdir='right'; tx2=b.fx; ty2=bcy; tdir='left'; }
      else { sx=a.fx; sy=acy; sdir='left'; tx2=b.fx+b.w; ty2=bcy; tdir='right'; }
    }
    return {sx,sy,tx:tx2,ty:ty2,sdir,tdir};
  }

  const DIR_VEC = {down:[0,1], up:[0,-1], left:[-1,0], right:[1,0]};

  function bezierPath(p){
    const off = Math.max(36, Math.min(160, Math.hypot(p.tx-p.sx, p.ty-p.sy)*0.35));
    const [sdx,sdy] = DIR_VEC[p.sdir], [tdx,tdy] = DIR_VEC[p.tdir];
    const c1x = p.sx+sdx*off, c1y = p.sy+sdy*off;
    const c2x = p.tx+tdx*off, c2y = p.ty+tdy*off;
    return `M ${p.sx} ${p.sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p.tx} ${p.ty}`;
  }

  function ensureFlowchartBuilt(){
    if(fcBuilt) return;
    fcBuilt = true;
    fcViewport.classList.add('loading');
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(()=>{
      requestAnimationFrame(buildFlowchart);
    });
  }

  function buildFlowchart(){
    const PAD = 140;
    const minX = Math.min(...nodes.map(n=>n.x));
    const minY = Math.min(...nodes.map(n=>n.y));
    const maxX = Math.max(...nodes.map(n=>n.x+n.w));
    const maxY = Math.max(...nodes.map(n=>n.y+n.h));
    const OFF_X = -minX + PAD, OFF_Y = -minY + PAD;
    CONTENT_W = (maxX-minX) + PAD*2;
    CONTENT_H = (maxY-minY) + PAD*2;

    nodes.forEach(n=>{ n.fx = n.x + OFF_X; n.fy = n.y + OFF_Y; });

    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    const FONT_SIZE = 15, LINE_HEIGHT = 17;
    ctx.font = `500 ${FONT_SIZE}px 'IBM Plex Sans', Arial, sans-serif`;

    let defs = `<defs>
      <marker id="fc-arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#F2790B"/></marker>
    </defs>`;

    let edgeMarkup = '';
    edges.forEach((e,i)=>{
      const a = nodes[e.source], b = nodes[e.target];
      if(!a || !b) return;
      const p = anchorPoints(a, b);
      const d = bezierPath(p);
      edgeMarkup += `<path data-i="${i}" class="fc-edge" d="${d}" marker-end="url(#fc-arrow-solid)"></path>`;
    });

    let nodeMarkup = '';
    nodes.forEach(n=>{
      const maxWidth = n.w - 20;
      const maxLines = Math.max(1, Math.floor((n.h - 10) / LINE_HEIGHT));
      const lines = wrapLabel(ctx, n.label, maxWidth, maxLines);
      const startY = n.h/2 - ((lines.length-1) * LINE_HEIGHT)/2 + FONT_SIZE*0.34;
      let textMarkup = `<text class="fc-label" x="${n.w/2}" y="${startY}" text-anchor="middle" font-size="${FONT_SIZE}">`;
      lines.forEach((line, li)=>{
        textMarkup += `<tspan x="${n.w/2}" y="${startY + li*LINE_HEIGHT}">${escapeXml(line)}</tspan>`;
      });
      textMarkup += `</text>`;

      let badge = '';
      if(n.connCount){
        const bx = n.w - 4, by = 4;
        badge = `<g transform="translate(${bx},${by})">
          <rect class="fc-badge-bg" x="-18" y="0" width="18" height="14" rx="3"/>
          <text class="fc-badge-text" x="-9" y="10" text-anchor="middle" font-size="9">${n.connCount}</text>
        </g>`;
      }

      nodeMarkup += `<g class="fc-node" data-idx="${n.idx}" transform="translate(${n.fx},${n.fy})">
        ${fcShapeMarkup(n.format, n.w, n.h, n.stroke)}
        ${textMarkup}
        ${badge}
      </g>`;
    });

    fcSvg.setAttribute('width', CONTENT_W);
    fcSvg.setAttribute('height', CONTENT_H);
    fcSvg.innerHTML = `${defs}<g id="fcEdgesLayer">${edgeMarkup}</g><g id="fcNodesLayer">${nodeMarkup}</g>`;

    fcNodeEls = new Array(nodes.length).fill(null);
    fcSvg.querySelectorAll('.fc-node').forEach(el=>{
      const idx = parseInt(el.dataset.idx, 10);
      fcNodeEls[idx] = el;
    });
    fcEdgeEls = new Array(edges.length).fill(null);
    fcSvg.querySelectorAll('.fc-edge').forEach(el=>{
      fcEdgeEls[parseInt(el.dataset.i,10)] = el;
    });

    fcViewport.classList.remove('loading');
    updateFlowchartVisualState();
    fitToScreen(false);
  }

  function updateFlowchartVisualState(){
    if(!fcBuilt) return;
    let related = null;
    if(selectedIdx !== null){
      const n = nodes[selectedIdx];
      related = new Set([...n.outConn, ...n.inConn]);
    }
    nodes.forEach(n=>{
      const el = fcNodeEls[n.idx];
      if(!el) return;
      const passes = passesFilter(n);
      let cls = 'fc-node';
      let opacity = 1;
      if(selectedIdx !== null){
        if(n.idx === selectedIdx){ cls += ' selected'; }
        else if(related.has(n.idx)){ cls += ' related'; }
        else { opacity = 0.14; }
      }
      if(!passes) opacity = Math.min(opacity, 0.07);
      el.setAttribute('class', cls);
      el.style.opacity = opacity;
    });
    edges.forEach((e,i)=>{
      const el = fcEdgeEls[i];
      if(!el) return;
      const sPass = passesFilter(nodes[e.source]), tPass = passesFilter(nodes[e.target]);
      let opacity = (sPass && tPass) ? 0.55 : 0.05;
      let active = false;
      if(selectedIdx !== null){
        if(e.source === selectedIdx || e.target === selectedIdx){
          active = true;
          opacity = (sPass && tPass) ? 1 : 0.5;
        } else {
          opacity = Math.min(opacity, 0.05);
        }
      }
      el.classList.toggle('active', active);
      el.style.opacity = opacity;
    });
  }

  // ---------- pan & zoom ----------
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  function applyTransform(animate){
    if(animate){
      fcSvg.classList.add('animate');
      window.clearTimeout(applyTransform._t);
      applyTransform._t = window.setTimeout(()=> fcSvg.classList.remove('animate'), 440);
    }
    fcSvg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    fcZoomLabel.textContent = Math.round(scale*100) + '%';
  }

  function zoomAt(clientX, clientY, factor){
    const rect = fcViewport.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const cx = (px - tx) / scale, cy = (py - ty) / scale;
    scale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    tx = px - cx * scale;
    ty = py - cy * scale;
    applyTransform(false);
  }

  function fitToScreen(animate){
    if(!CONTENT_W) return;
    const vp = fcViewport.getBoundingClientRect();
    const sx = vp.width / CONTENT_W, sy = vp.height / CONTENT_H;
    scale = clamp(Math.min(sx, sy) * 0.96, MIN_SCALE, MAX_SCALE);
    tx = (vp.width - CONTENT_W*scale) / 2;
    ty = (vp.height - CONTENT_H*scale) / 2;
    applyTransform(animate);
  }

  function panToNode(idx){
    if(!fcBuilt) return;
    const n = nodes[idx];
    const vp = fcViewport.getBoundingClientRect();
    scale = clamp(Math.max(scale, 0.55), MIN_SCALE, MAX_SCALE);
    const cx = n.fx + n.w/2, cy = n.fy + n.h/2;
    tx = vp.width/2 - cx*scale;
    ty = vp.height/2 - cy*scale;
    applyTransform(true);
  }

  function resizeFlowchart(){
    if(!fcBuilt || currentView !== 'flowchart') return;
    // keep current pan/zoom; nothing to recompute besides available viewport bounds
  }

  document.getElementById('fcZoomIn').addEventListener('click', ()=>{
    const vp = fcViewport.getBoundingClientRect();
    zoomAt(vp.left+vp.width/2, vp.top+vp.height/2, 1.3);
  });
  document.getElementById('fcZoomOut').addEventListener('click', ()=>{
    const vp = fcViewport.getBoundingClientRect();
    zoomAt(vp.left+vp.width/2, vp.top+vp.height/2, 1/1.3);
  });
  fcZoomLabel.addEventListener('click', ()=> fitToScreen(true));

  fcViewport.addEventListener('wheel', e=>{
    e.preventDefault();
    const factor = Math.pow(1.0016, -e.deltaY);
    zoomAt(e.clientX, e.clientY, factor);
  }, {passive:false});

  const pointers = new Map();
  let dragLast = null;
  let didDrag = false;
  let lastPinchDist = null;

  fcViewport.addEventListener('pointerdown', e=>{
    if(e.button !== undefined && e.button > 0) return;
    fcViewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    didDrag = false;
    if(pointers.size === 1){
      dragLast = {x:e.clientX, y:e.clientY};
      fcViewport.classList.add('dragging');
    }
  });

  fcViewport.addEventListener('pointermove', e=>{
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size === 1 && dragLast){
      const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
      if(Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      tx += dx; ty += dy;
      dragLast = {x:e.clientX, y:e.clientY};
      applyTransform(false);
    } else if(pointers.size === 2){
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      const mid = {x:(pts[0].x+pts[1].x)/2, y:(pts[0].y+pts[1].y)/2};
      if(lastPinchDist) zoomAt(mid.x, mid.y, dist/lastPinchDist);
      lastPinchDist = dist;
      didDrag = true;
    }
  });

  function endPointer(e, allowClick){
    const wasSingleDrag = pointers.size === 1 && !didDrag;
    pointers.delete(e.pointerId);
    if(pointers.size < 2) lastPinchDist = null;
    if(pointers.size === 0){ dragLast = null; fcViewport.classList.remove('dragging'); }
    // setPointerCapture makes the native 'click' event always target fcViewport
    // itself, so resolve the actual element under the pointer by hand here.
    if(allowClick && wasSingleDrag){
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = el && el.closest && el.closest('.fc-node');
      if(nodeEl) selectNode(parseInt(nodeEl.dataset.idx, 10));
    }
  }
  fcViewport.addEventListener('pointerup', e=> endPointer(e, true));
  fcViewport.addEventListener('pointercancel', e=> endPointer(e, false));
  fcViewport.addEventListener('pointerleave', e=>{ if(pointers.size <= 1) endPointer(e, false); });

  // ---------- init ----------
  renderTimeline();
})();
