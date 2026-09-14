/* Timeline Admin — add/edit/delete entries and links on The Sacred Timeline.

   Security model (same idea as RaceDates' admin.js): the password gate
   below is a deterrent only — this is a static site, so a password typed
   into it can never be a real secret (anyone can view source and see the
   hash). The password's only job is to stop you landing in the edit UI by
   accident. Real write authority is a GitHub Personal Access Token, pasted
   in at the moment you commit and never stored anywhere (not localStorage,
   not this file, not the repo) — only you can generate one with write
   access to this repo, and losing/leaking it just means regenerating a new
   one in your GitHub settings; it can't touch anything outside this repo. */
(function(){
  const OWNER = "JamesWardVP";
  const REPO = "MCUWeb";
  const DATA_PATH = "data/timeline.json";
  const OVERRIDES_PATH = "data/media-overrides.json";
  const PASSWORD_SHA256 = "f1e99169b05000270f52cf44ce7fc0378e00a503657afb39a0eb5a35812d5fbe";

  const $ = id => document.getElementById(id);

  async function sha256Hex(text){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function slugify(label){
    return label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---------------- password gate ---------------- */
  async function tryUnlock(){
    const val = $('password').value;
    if ((await sha256Hex(val)) === PASSWORD_SHA256){
      sessionStorage.setItem('mcu-admin', '1');
      showApp();
    } else {
      $('lock-msg').textContent = 'Wrong password.';
    }
  }
  $('unlock-btn').addEventListener('click', tryUnlock);
  $('password').addEventListener('keydown', e => { if(e.key === 'Enter') tryUnlock(); });

  function showApp(){
    $('lock').hidden = true;
    $('app').hidden = false;
    loadData();
  }
  if (sessionStorage.getItem('mcu-admin') === '1') showApp();

  /* ---------------- state ---------------- */
  const state = { nodes: [], edges: [], overrides: {}, staged: [], timelineDirty: false, overridesDirty: false };
  let editingId = null;

  async function loadData(){
    try {
      const res = await fetch(DATA_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      state.nodes = data.nodes;
      state.edges = data.edges;
      try {
        const overridesRes = await fetch(OVERRIDES_PATH, { cache: 'no-store' });
        state.overrides = overridesRes.ok ? await overridesRes.json() : {};
      } catch { state.overrides = {}; }
      renderEntryList();
      renderLinkSelects();
      renderLinkList();
      populateStudioList();
      resetAddForm(); // rebuilds the add picker + pin itself
    } catch (err) {
      $('entry-list').innerHTML = `<p class="msg error">Failed to load ${DATA_PATH}: ${err.message}</p>`;
    }
  }

  function markDirty(description, file){
    state.staged.push(description);
    if (file === 'overrides') state.overridesDirty = true;
    else state.timelineDirty = true;
    renderStaged();
  }

  function findNodeIndexById(id){ return state.nodes.findIndex(n => n.id === id); }

  function findInsertIndex(year, month){
    for (let i = 0; i < state.nodes.length; i++){
      const n = state.nodes[i];
      if (n.year > year || (n.year === year && n.month > month)) return i;
    }
    return state.nodes.length;
  }

  function studioColors(studio){
    const n = state.nodes.find(n => n.studio === studio);
    return n ? { fill: n.fill, stroke: n.stroke } : null;
  }

  function populateStudioList(){
    const studios = [...new Set(state.nodes.map(n => n.studio))].sort();
    $('studio-list').innerHTML = studios.map(s => `<option value="${escapeHtml(s)}">`).join('');
  }

  /* ---------------- tabs ---------------- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      ['add','manage','links','publish'].forEach(t => { $('tab-' + t).hidden = (t !== btn.dataset.tab); });
    });
  });

  /* ---------------- shared entry-form fields (used by both Add and Edit) ---------------- */
  function fieldsHtml(prefix){
    return `
      <label for="${prefix}-label">Title</label>
      <input id="${prefix}-label" required>
      <div class="row">
        <div>
          <label for="${prefix}-format">Format</label>
          <select id="${prefix}-format">
            <option value="film">Film</option>
            <option value="tv">TV Show</option>
            <option value="special">Special / One-Shot</option>
          </select>
        </div>
        <div>
          <label for="${prefix}-studio">Studio / origin</label>
          <input id="${prefix}-studio" list="studio-list" required>
        </div>
      </div>
      <div class="row">
        <div><label for="${prefix}-year">Year</label><input id="${prefix}-year" type="number" min="1900" max="2100" required></div>
        <div><label for="${prefix}-month">Month (1–12)</label><input id="${prefix}-month" type="number" min="1" max="12" required></div>
      </div>
      <div class="row">
        <div><label for="${prefix}-fill">Fill colour</label><input id="${prefix}-fill" type="color" value="#dae8fc"></div>
        <div><label for="${prefix}-stroke">Stroke colour</label><input id="${prefix}-stroke" type="color" value="#6c8ebf"></div>
        <div style="flex:0 0 auto; align-self:flex-end;"><button type="button" class="secondary" id="${prefix}-match-studio-colors">Match studio colours</button></div>
      </div>
      <hr class="rule">
      <p class="hint" style="margin:0 0 0.5rem;">TMDB matching — controls the poster/rating/blurb/streaming button shown on the site. Leave on Auto unless the automatic search picks the wrong title.</p>
      <div class="row" style="align-items:flex-end;">
        <div>
          <label for="${prefix}-match-mode">Match mode</label>
          <select id="${prefix}-match-mode">
            <option value="auto">Auto (search TMDB by title)</option>
            <option value="manual">Manual (use a specific TMDB page)</option>
          </select>
        </div>
        <div id="${prefix}-tmdb-id-wrap">
          <label for="${prefix}-tmdb-id">TMDB ID</label>
          <input id="${prefix}-tmdb-id" type="number" min="1" placeholder="e.g. 24428">
        </div>
        <div id="${prefix}-tmdb-type-wrap">
          <label for="${prefix}-tmdb-type">Type</label>
          <select id="${prefix}-tmdb-type">
            <option value="movie">Movie</option>
            <option value="tv">TV Show</option>
          </select>
        </div>
        <div style="flex:0 0 auto;"><button type="button" class="secondary" id="${prefix}-tmdb-search">Search TMDB ↗</button></div>
      </div>
      <p class="hint" id="${prefix}-tmdb-manual-hint" hidden style="margin:0.4rem 0 0;">Find the ID in the page URL — themoviedb.org/movie/<strong>24428</strong>-the-avengers</p>
      <hr class="rule">
      <p class="hint" style="margin:0 0 0.4rem;">Flowchart position — click the map to place this entry (drag to pan, scroll/pinch to zoom). Only affects the Flowchart view, not the Timeline.</p>
      <div class="picker-wrap" id="${prefix}-picker-wrap">
        <svg id="${prefix}-picker-svg" class="picker-svg"></svg>
        <div class="picker-controls">
          <button type="button" class="secondary" id="${prefix}-picker-zoom-out">−</button>
          <button type="button" class="secondary" id="${prefix}-picker-fit">Fit</button>
          <button type="button" class="secondary" id="${prefix}-picker-zoom-in">+</button>
        </div>
      </div>
      <div class="row" style="margin-top:0.6rem;">
        <div><label for="${prefix}-x">X</label><input id="${prefix}-x" type="number" step="any"></div>
        <div><label for="${prefix}-y">Y</label><input id="${prefix}-y" type="number" step="any"></div>
        <div><label for="${prefix}-w">Width</label><input id="${prefix}-w" type="number" step="any" value="340"></div>
        <div><label for="${prefix}-h">Height</label><input id="${prefix}-h" type="number" step="any" value="60"></div>
      </div>
    `;
  }
  $('add-fields').innerHTML = fieldsHtml('add');
  $('edit-fields').innerHTML = fieldsHtml('edit');

  function applyMatchModeVisibility(prefix){
    const manual = $(`${prefix}-match-mode`).value === 'manual';
    $(`${prefix}-tmdb-id-wrap`).hidden = !manual;
    $(`${prefix}-tmdb-type-wrap`).hidden = !manual;
    $(`${prefix}-tmdb-manual-hint`).hidden = !manual;
  }

  function wireFormBehaviors(prefix, msgId){
    $(`${prefix}-match-mode`).addEventListener('change', () => applyMatchModeVisibility(prefix));

    $(`${prefix}-match-studio-colors`).addEventListener('click', () => {
      const c = studioColors($(`${prefix}-studio`).value.trim());
      const msg = $(msgId);
      if (c){ $(`${prefix}-fill`).value = c.fill; $(`${prefix}-stroke`).value = c.stroke; msg.textContent = ''; }
      else { msg.className = 'msg error'; msg.textContent = 'No existing studio matches that name exactly.'; }
    });

    $(`${prefix}-tmdb-search`).addEventListener('click', () => {
      const title = $(`${prefix}-label`).value.trim();
      const msg = $(msgId);
      if (!title){ msg.className = 'msg error'; msg.textContent = 'Type a title first.'; return; }
      window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`, '_blank', 'noopener');
    });
  }
  wireFormBehaviors('add', 'add-msg');
  wireFormBehaviors('edit', 'edit-msg');

  function collectFormValues(prefix){
    return {
      label: $(`${prefix}-label`).value.trim(),
      format: $(`${prefix}-format`).value,
      studio: $(`${prefix}-studio`).value.trim(),
      year: parseInt($(`${prefix}-year`).value, 10),
      month: parseInt($(`${prefix}-month`).value, 10),
      fill: $(`${prefix}-fill`).value,
      stroke: $(`${prefix}-stroke`).value,
      x: parseFloat($(`${prefix}-x`).value) || 0,
      y: parseFloat($(`${prefix}-y`).value) || 0,
      w: parseFloat($(`${prefix}-w`).value) || 340,
      h: parseFloat($(`${prefix}-h`).value) || 60,
      matchMode: $(`${prefix}-match-mode`).value,
      tmdbId: parseInt($(`${prefix}-tmdb-id`).value, 10),
      tmdbType: $(`${prefix}-tmdb-type`).value
    };
  }

  function validateForm(v, msgEl){
    if (!v.label || !v.studio || !v.year || !v.month){
      msgEl.className = 'msg error'; msgEl.textContent = 'Title, studio, year and month are required.'; return false;
    }
    if (v.month < 1 || v.month > 12){
      msgEl.className = 'msg error'; msgEl.textContent = 'Month must be between 1 and 12.'; return false;
    }
    return true;
  }

  // TMDB match mode — Manual writes/updates an override entry keyed by this
  // node's id; Auto clears one if it existed (falls back to the refresh
  // script's own title search).
  function applyOverrideChange(id, label, v){
    const existingOverride = state.overrides[id];
    if (v.matchMode === 'manual' && v.tmdbId){
      const changed = !existingOverride || existingOverride.tmdbId !== v.tmdbId || existingOverride.mediaType !== v.tmdbType;
      if (changed){
        state.overrides[id] = { tmdbId: v.tmdbId, mediaType: v.tmdbType };
        markDirty(`Set manual TMDB match for ${label}: ${v.tmdbType} ${v.tmdbId}`, 'overrides');
      }
    } else if (existingOverride){
      delete state.overrides[id];
      markDirty(`Cleared manual TMDB match for ${label}`, 'overrides');
    }
  }

  /* ---------------- visual flowchart-position picker ---------------- */
  function createPositionPicker(prefix){
    const svg = $(`${prefix}-picker-svg`);
    const wrap = $(`${prefix}-picker-wrap`);
    let vb = { x: -500, y: -500, w: 1000, h: 1000 };

    function computeFullBox(){
      const PAD = 400;
      if (!state.nodes.length) return { minX: -500, minY: -500, w: 1000, h: 1000 };
      const minX = Math.min(...state.nodes.map(n => n.x));
      const minY = Math.min(...state.nodes.map(n => n.y));
      const maxX = Math.max(...state.nodes.map(n => n.x + n.w));
      const maxY = Math.max(...state.nodes.map(n => n.y + n.h));
      return { minX: minX - PAD, minY: minY - PAD, w: (maxX - minX) + PAD * 2, h: (maxY - minY) + PAD * 2 };
    }

    function applyViewBox(){
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    }

    function fit(){
      const box = computeFullBox();
      vb = { x: box.minX, y: box.minY, w: box.w, h: box.h };
      applyViewBox();
    }

    function rebuild(){
      let markup = '';
      state.nodes.forEach(n => {
        markup += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" fill="${n.fill}" stroke="${n.stroke}" stroke-width="4" opacity="0.85"><title>${escapeHtml(n.label)}</title></rect>`;
      });
      svg.innerHTML = `<g>${markup}</g><g id="${prefix}-picker-pin"></g>`;
      fit();
    }

    function currentWH(){
      const w = parseFloat($(`${prefix}-w`).value) || 340;
      const h = parseFloat($(`${prefix}-h`).value) || 60;
      return { w, h };
    }

    function setPin(x, y, w, h){
      const cx = x + w / 2, cy = y + h / 2;
      const pinLayer = $(`${prefix}-picker-pin`);
      if (!pinLayer) return;
      pinLayer.innerHTML = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="#F2790B" stroke-width="10" stroke-dasharray="14 8"/>
        <circle cx="${cx}" cy="${cy}" r="16" fill="#F2790B" stroke="#fff" stroke-width="4"/>
      `;
    }

    function showPinFromFields(){
      const x = parseFloat($(`${prefix}-x`).value) || 0;
      const y = parseFloat($(`${prefix}-y`).value) || 0;
      const { w, h } = currentWH();
      setPin(x, y, w, h);
    }

    function svgPoint(clientX, clientY){
      const pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const loc = pt.matrixTransform(ctm.inverse());
      return { x: loc.x, y: loc.y };
    }

    function zoomAround(factor, px, py){
      const rect = wrap.getBoundingClientRect();
      const scaleX = vb.w / rect.width, scaleY = vb.h / rect.height;
      const dataX = vb.x + px * scaleX, dataY = vb.y + py * scaleY;
      vb.w *= factor; vb.h *= factor;
      vb.x = dataX - px * (vb.w / rect.width);
      vb.y = dataY - py * (vb.h / rect.height);
      applyViewBox();
    }

    let dragging = false, dragStart = null, didDrag = false, vbStart = null;
    wrap.addEventListener('pointerdown', e => {
      wrap.setPointerCapture(e.pointerId);
      dragging = true; didDrag = false;
      dragStart = { x: e.clientX, y: e.clientY };
      vbStart = { ...vb };
    });
    wrap.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      if (!didDrag) return;
      const rect = wrap.getBoundingClientRect();
      vb.x = vbStart.x - dx * (vb.w / rect.width);
      vb.y = vbStart.y - dy * (vb.h / rect.height);
      applyViewBox();
    });
    wrap.addEventListener('pointerup', e => {
      dragging = false;
      if (!didDrag){
        const pt = svgPoint(e.clientX, e.clientY);
        const { w, h } = currentWH();
        const x = Math.round(pt.x - w / 2), y = Math.round(pt.y - h / 2);
        $(`${prefix}-x`).value = x;
        $(`${prefix}-y`).value = y;
        setPin(x, y, w, h);
      }
    });
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomAround(Math.pow(1.0015, e.deltaY), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    $(`${prefix}-picker-zoom-in`).addEventListener('click', () => zoomAround(0.8, wrap.clientWidth / 2, wrap.clientHeight / 2));
    $(`${prefix}-picker-zoom-out`).addEventListener('click', () => zoomAround(1.25, wrap.clientWidth / 2, wrap.clientHeight / 2));
    $(`${prefix}-picker-fit`).addEventListener('click', fit);

    ['x','y','w','h'].forEach(f => $(`${prefix}-${f}`).addEventListener('input', showPinFromFields));

    return { rebuild, showPinFromFields };
  }
  const addPicker = createPositionPicker('add');
  const editPicker = createPositionPicker('edit');

  /* ---------------- entries: list + search ---------------- */
  function renderEntryList(){
    const q = $('entry-search').value.trim().toLowerCase();
    const list = $('entry-list');
    list.innerHTML = '';
    state.nodes
      .filter(n => !q || n.label.toLowerCase().includes(q))
      .forEach(n => {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.innerHTML = `
          <div class="info">
            <div class="t">${escapeHtml(n.label)}</div>
            <div class="m">${escapeHtml(n.studio)} · ${n.format} · ${n.year}-${String(n.month).padStart(2,'0')}</div>
          </div>
          <button type="button" class="secondary" data-edit="${n.id}">Edit</button>
          <button type="button" class="danger" data-del="${n.id}">Delete</button>
        `;
        list.appendChild(row);
      });
  }
  $('entry-search').addEventListener('input', renderEntryList);

  $('entry-list').addEventListener('click', e => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) startEdit(editId);
    if (delId) deleteEntry(delId);
  });

  function startEdit(id){
    const n = state.nodes[findNodeIndexById(id)];
    if (!n) return;
    editingId = id;
    $('edit-panel-title').textContent = `Editing: ${n.label}`;
    $('edit-label').value = n.label;
    $('edit-format').value = n.format;
    $('edit-studio').value = n.studio;
    $('edit-year').value = n.year;
    $('edit-month').value = n.month;
    $('edit-fill').value = n.fill;
    $('edit-stroke').value = n.stroke;
    $('edit-x').value = n.x;
    $('edit-y').value = n.y;
    $('edit-w').value = n.w;
    $('edit-h').value = n.h;
    const ov = state.overrides[id];
    $('edit-match-mode').value = ov ? 'manual' : 'auto';
    $('edit-tmdb-id').value = ov ? ov.tmdbId : '';
    $('edit-tmdb-type').value = ov ? ov.mediaType : (n.format === 'tv' ? 'tv' : 'movie');
    applyMatchModeVisibility('edit');
    $('edit-msg').textContent = '';
    $('edit-panel').hidden = false;
    editPicker.rebuild();
    editPicker.showPinFromFields();
    window.scrollTo({ top: $('edit-panel').offsetTop - 20, behavior: 'smooth' });
  }

  function closeEditPanel(){
    editingId = null;
    $('edit-panel').hidden = true;
  }
  $('edit-cancel-btn').addEventListener('click', closeEditPanel);

  function resetAddForm(){
    $('add-form').reset();
    $('add-fill').value = '#dae8fc';
    $('add-stroke').value = '#6c8ebf';
    $('add-w').value = 340;
    $('add-h').value = 60;
    const maxY = state.nodes.length ? Math.max(...state.nodes.map(n => n.y)) : 0;
    $('add-x').value = 0;
    $('add-y').value = maxY + 150;
    $('add-match-mode').value = 'auto';
    $('add-tmdb-id').value = '';
    $('add-tmdb-type').value = 'movie';
    applyMatchModeVisibility('add');
    $('add-msg').textContent = '';
    addPicker.rebuild();
    addPicker.showPinFromFields();
  }

  function deleteEntry(id){
    const idx = findNodeIndexById(id);
    if (idx === -1) return;
    const n = state.nodes[idx];
    if (!confirm(`Delete "${n.label}"? This also removes any links to/from it.`)) return;
    state.nodes.splice(idx, 1);
    const before = state.edges.length;
    state.edges = state.edges.filter(e => e.source !== id && e.target !== id);
    const removedLinks = before - state.edges.length;
    if (state.overrides[id]){ delete state.overrides[id]; state.overridesDirty = true; }
    markDirty(`Deleted entry: ${n.label}${removedLinks ? ` (and ${removedLinks} link${removedLinks===1?'':'s'})` : ''}`);
    if (editingId === id) closeEditPanel();
    renderEntryList();
    renderLinkSelects();
    renderLinkList();
    addPicker.rebuild();
    addPicker.showPinFromFields();
  }

  /* ---------------- add form ---------------- */
  $('add-form').addEventListener('submit', e => {
    e.preventDefault();
    const msg = $('add-msg');
    msg.className = 'msg';
    const v = collectFormValues('add');
    if (!validateForm(v, msg)) return;

    const id = slugify(v.label);
    if (findNodeIndexById(id) !== -1){
      msg.className = 'msg error';
      msg.textContent = 'An entry with this title already exists — adjust the title slightly.';
      return;
    }
    const node = { id, label: v.label, format: v.format, studio: v.studio, fill: v.fill, stroke: v.stroke, datekey: v.year*12+v.month, year: v.year, month: v.month, x: v.x, y: v.y, w: v.w, h: v.h };
    state.nodes.splice(findInsertIndex(v.year, v.month), 0, node);
    markDirty(`Added entry: ${v.label}`);
    applyOverrideChange(id, v.label, v);

    resetAddForm();
    renderEntryList();
    renderLinkSelects();
    msg.className = 'msg ok';
    msg.textContent = 'Added (not yet published — see the Publish tab).';
  });

  /* ---------------- edit form ---------------- */
  $('edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const msg = $('edit-msg');
    msg.className = 'msg';
    if (!editingId) return;
    const v = collectFormValues('edit');
    if (!validateForm(v, msg)) return;

    const idx = findNodeIndexById(editingId);
    const n = state.nodes[idx];
    const datesChanged = (n.year !== v.year || n.month !== v.month);
    Object.assign(n, { label: v.label, format: v.format, studio: v.studio, fill: v.fill, stroke: v.stroke, year: v.year, month: v.month, datekey: v.year*12+v.month, x: v.x, y: v.y, w: v.w, h: v.h });
    if (datesChanged){
      state.nodes.splice(idx, 1);
      state.nodes.splice(findInsertIndex(v.year, v.month), 0, n);
    }
    markDirty(`Edited entry: ${v.label}`);
    applyOverrideChange(editingId, v.label, v);

    renderEntryList();
    renderLinkSelects();
    addPicker.rebuild();
    addPicker.showPinFromFields();
    msg.className = 'msg ok';
    msg.textContent = 'Saved (not yet published — see the Publish tab).';
    closeEditPanel();
  });

  /* ---------------- links ---------------- */
  function sortedNodesForSelect(){
    return [...state.nodes].sort((a,b) => (a.year - b.year) || (a.month - b.month) || a.label.localeCompare(b.label));
  }

  function renderLinkSelects(){
    const opts = sortedNodesForSelect().map(n => `<option value="${n.id}">${escapeHtml(n.label)}</option>`).join('');
    $('link-source').innerHTML = opts;
    $('link-target').innerHTML = opts;
  }

  $('link-add-btn').addEventListener('click', () => {
    const source = $('link-source').value, target = $('link-target').value;
    const msg = $('link-msg');
    msg.className = 'msg';
    if (!source || !target || source === target){
      msg.className = 'msg error'; msg.textContent = 'Pick two different entries.'; return;
    }
    if (state.edges.some(e => e.source === source && e.target === target)){
      msg.className = 'msg error'; msg.textContent = 'That link already exists.'; return;
    }
    state.edges.push({ source, target });
    const sLabel = state.nodes[findNodeIndexById(source)].label;
    const tLabel = state.nodes[findNodeIndexById(target)].label;
    markDirty(`Added link: ${sLabel} → ${tLabel}`);
    msg.className = 'msg ok'; msg.textContent = 'Link added (not yet published — see the Publish tab).';
    renderLinkList();
  });

  function renderLinkList(){
    const q = $('link-search').value.trim().toLowerCase();
    const list = $('link-list');
    list.innerHTML = '';
    state.edges.forEach((e, i) => {
      const sIdx = findNodeIndexById(e.source), tIdx = findNodeIndexById(e.target);
      const sLabel = sIdx !== -1 ? state.nodes[sIdx].label : `(missing: ${e.source})`;
      const tLabel = tIdx !== -1 ? state.nodes[tIdx].label : `(missing: ${e.target})`;
      if (q && !sLabel.toLowerCase().includes(q) && !tLabel.toLowerCase().includes(q)) return;
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `
        <div class="info"><div class="t">${escapeHtml(sLabel)} → ${escapeHtml(tLabel)}</div></div>
        <button type="button" class="danger" data-remove="${i}">Remove</button>
      `;
      list.appendChild(row);
    });
  }
  $('link-search').addEventListener('input', renderLinkList);

  $('link-list').addEventListener('click', e => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    const edge = state.edges[parseInt(i,10)];
    const sIdx = findNodeIndexById(edge.source), tIdx = findNodeIndexById(edge.target);
    const sLabel = sIdx !== -1 ? state.nodes[sIdx].label : edge.source;
    const tLabel = tIdx !== -1 ? state.nodes[tIdx].label : edge.target;
    state.edges.splice(parseInt(i,10), 1);
    markDirty(`Removed link: ${sLabel} → ${tLabel}`);
    renderLinkList();
  });

  /* ---------------- publish ---------------- */
  function renderStaged(){
    const box = $('staged-list');
    const badge = $('staged-count');
    if (state.staged.length === 0){
      box.innerHTML = '<p class="hint">Nothing staged yet.</p>';
      $('publish-controls').hidden = true;
      badge.hidden = true;
    } else {
      box.innerHTML = '<ul>' + state.staged.map(s => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>';
      $('publish-controls').hidden = false;
      badge.hidden = false;
      badge.textContent = state.staged.length;
    }
  }
  renderStaged();

  function currentTimelineJson(){
    return JSON.stringify({ nodes: state.nodes, edges: state.edges }, null, 2);
  }
  function currentOverridesJson(){
    return JSON.stringify(state.overrides, null, 2);
  }

  async function commitFile(path, content, message, token){
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    const getRes = await fetch(url, { headers });
    if (!getRes.ok) throw new Error(`Could not read current file (HTTP ${getRes.status})`);
    const sha = (await getRes.json()).sha;
    const b64 = btoa(unescape(encodeURIComponent(content)));
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: b64, sha })
    });
    if (!putRes.ok){
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `Commit failed (HTTP ${putRes.status})`);
    }
    return putRes.json();
  }

  // Fires the same workflow_dispatch trigger as the "Run workflow" button on
  // GitHub's Actions tab — reuses the just-used token, so it only works if
  // that token also has "Actions: Read and write" (Contents alone isn't
  // enough for this endpoint).
  async function triggerWorkflow(workflowFile, token){
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowFile}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' })
    });
    if (!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Trigger failed (HTTP ${res.status})`);
    }
  }

  /* ---------------- success modal ---------------- */
  let pendingToken = null; // held only transiently, for the optional "refresh now" click; cleared on modal close

  function showModal(message){
    $('modal-message').textContent = message;
    $('modal-submsg').className = 'msg';
    $('modal-submsg').textContent = '';
    $('modal-refresh-btn').disabled = false;
    $('modal-refresh-btn').textContent = 'Refresh media data now';
    $('modal-overlay').hidden = false;
  }
  function closeModal(){
    $('modal-overlay').hidden = true;
    pendingToken = null;
  }
  $('modal-close-btn').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

  $('modal-refresh-btn').addEventListener('click', async () => {
    const submsg = $('modal-submsg');
    if (!pendingToken){ closeModal(); return; }
    $('modal-refresh-btn').disabled = true;
    submsg.className = 'msg';
    submsg.textContent = 'Triggering…';
    try {
      await triggerWorkflow('refresh-media-data.yml', pendingToken);
      submsg.className = 'msg ok';
      submsg.textContent = 'Triggered — check the Actions tab on GitHub for progress (usually a minute or two).';
      $('modal-refresh-btn').textContent = 'Triggered ✓';
    } catch (err) {
      submsg.className = 'msg error';
      submsg.textContent = 'Failed: ' + err.message + ' — your token may need "Actions: Read and write" permission too.';
      $('modal-refresh-btn').disabled = false;
    }
  });

  $('commit-btn').addEventListener('click', async () => {
    const token = $('gh-token').value.trim();
    const msg = $('publish-msg');
    msg.className = 'msg';
    if (!token){ msg.className = 'msg error'; msg.textContent = 'Paste a GitHub token first (or use Download).'; return; }
    $('commit-btn').disabled = true;
    msg.textContent = 'Committing…';
    try {
      const message = `Admin: ${state.staged.join('; ').slice(0, 200)}`;
      if (state.timelineDirty) await commitFile(DATA_PATH, currentTimelineJson(), message, token);
      if (state.overridesDirty) await commitFile(OVERRIDES_PATH, currentOverridesJson(), message, token);
      msg.className = 'msg ok';
      msg.textContent = 'Committed. GitHub Pages will redeploy the live site in about a minute.';
      state.staged = [];
      state.timelineDirty = false;
      state.overridesDirty = false;
      renderStaged();
      pendingToken = token;
      showModal('Committed successfully. GitHub Pages will redeploy the live site in about a minute.');
    } catch (err) {
      msg.className = 'msg error';
      msg.textContent = 'Failed: ' + err.message;
    } finally {
      $('commit-btn').disabled = false;
      $('gh-token').value = '';
    }
  });

  $('download-btn').addEventListener('click', () => {
    function download(filename, content){
      const blob = new Blob([content], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    if (state.timelineDirty) download('timeline.json', currentTimelineJson());
    if (state.overridesDirty) download('media-overrides.json', currentOverridesJson());
  });
})();
