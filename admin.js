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
      resetEntryForm(); // recompute the new-entry Y default now real data is loaded
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

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---------------- tabs ---------------- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      ['entries','links','publish'].forEach(t => { $('tab-' + t).hidden = (t !== btn.dataset.tab); });
    });
  });

  /* ---------------- entries: list + search ---------------- */
  let editingId = null;

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
    $('entry-form-title').textContent = 'Edit entry';
    $('f-label').value = n.label;
    $('f-format').value = n.format;
    $('f-studio').value = n.studio;
    $('f-year').value = n.year;
    $('f-month').value = n.month;
    $('f-fill').value = n.fill;
    $('f-stroke').value = n.stroke;
    $('f-x').value = n.x;
    $('f-y').value = n.y;
    $('f-w').value = n.w;
    $('f-h').value = n.h;
    const ov = state.overrides[id];
    $('f-match-mode').value = ov ? 'manual' : 'auto';
    $('f-tmdb-id').value = ov ? ov.tmdbId : '';
    $('f-tmdb-type').value = ov ? ov.mediaType : (n.format === 'tv' ? 'tv' : 'movie');
    applyMatchModeVisibility();
    $('entry-save-btn').textContent = 'Save changes';
    $('entry-cancel-btn').hidden = false;
    $('entry-msg').textContent = '';
    window.scrollTo({ top: $('entry-form').offsetTop - 20, behavior: 'smooth' });
  }

  function applyMatchModeVisibility(){
    const manual = $('f-match-mode').value === 'manual';
    $('f-tmdb-id-wrap').hidden = !manual;
    $('f-tmdb-type-wrap').hidden = !manual;
    $('tmdb-manual-hint').hidden = !manual;
  }
  $('f-match-mode').addEventListener('change', applyMatchModeVisibility);

  $('tmdb-search-btn').addEventListener('click', () => {
    const title = $('f-label').value.trim();
    if (!title){ $('entry-msg').className = 'msg error'; $('entry-msg').textContent = 'Type a title first.'; return; }
    window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`, '_blank', 'noopener');
  });

  function resetEntryForm(){
    editingId = null;
    $('entry-form').reset();
    $('f-fill').value = '#dae8fc';
    $('f-stroke').value = '#6c8ebf';
    $('f-w').value = 340;
    $('f-h').value = 60;
    const maxY = state.nodes.length ? Math.max(...state.nodes.map(n => n.y)) : 0;
    $('f-x').value = 0;
    $('f-y').value = maxY + 150;
    $('f-match-mode').value = 'auto';
    $('f-tmdb-id').value = '';
    $('f-tmdb-type').value = 'movie';
    applyMatchModeVisibility();
    $('entry-form-title').textContent = 'Add entry';
    $('entry-save-btn').textContent = 'Add entry';
    $('entry-cancel-btn').hidden = true;
    $('entry-msg').textContent = '';
  }
  resetEntryForm();
  $('entry-cancel-btn').addEventListener('click', resetEntryForm);

  $('match-studio-colors').addEventListener('click', () => {
    const c = studioColors($('f-studio').value.trim());
    if (c){ $('f-fill').value = c.fill; $('f-stroke').value = c.stroke; $('entry-msg').textContent = ''; }
    else { $('entry-msg').className = 'msg error'; $('entry-msg').textContent = 'No existing studio matches that name exactly.'; }
  });

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
    if (editingId === id) resetEntryForm();
    renderEntryList();
    renderLinkSelects();
    renderLinkList();
  }

  /* ---------------- entries: add/edit form ---------------- */
  $('entry-form').addEventListener('submit', e => {
    e.preventDefault();
    const msg = $('entry-msg');
    msg.className = 'msg';

    const label = $('f-label').value.trim();
    const format = $('f-format').value;
    const studio = $('f-studio').value.trim();
    const year = parseInt($('f-year').value, 10);
    const month = parseInt($('f-month').value, 10);
    const fill = $('f-fill').value;
    const stroke = $('f-stroke').value;
    const x = parseFloat($('f-x').value) || 0;
    const y = parseFloat($('f-y').value) || 0;
    const w = parseFloat($('f-w').value) || 340;
    const h = parseFloat($('f-h').value) || 60;

    if (!label || !studio || !year || !month){
      msg.className = 'msg error'; msg.textContent = 'Title, studio, year and month are required.'; return;
    }
    if (month < 1 || month > 12){
      msg.className = 'msg error'; msg.textContent = 'Month must be between 1 and 12.'; return;
    }

    let id;
    if (editingId){
      id = editingId;
      const idx = findNodeIndexById(editingId);
      const n = state.nodes[idx];
      const datesChanged = (n.year !== year || n.month !== month);
      Object.assign(n, { label, format, studio, fill, stroke, year, month, datekey: year*12+month, x, y, w, h });
      if (datesChanged){
        state.nodes.splice(idx, 1);
        state.nodes.splice(findInsertIndex(year, month), 0, n);
      }
      markDirty(`Edited entry: ${label}`);
    } else {
      id = slugify(label);
      if (findNodeIndexById(id) !== -1){
        msg.className = 'msg error';
        msg.textContent = 'An entry with this title already exists — adjust the title slightly.';
        return;
      }
      const node = { id, label, format, studio, fill, stroke, datekey: year*12+month, year, month, x, y, w, h };
      state.nodes.splice(findInsertIndex(year, month), 0, node);
      markDirty(`Added entry: ${label}`);
    }

    // TMDB match mode — Manual writes/updates an override entry keyed by
    // this node's id; Auto clears one if it existed (falls back to the
    // refresh script's own title search).
    const matchMode = $('f-match-mode').value;
    const tmdbId = parseInt($('f-tmdb-id').value, 10);
    const tmdbType = $('f-tmdb-type').value;
    const existingOverride = state.overrides[id];
    if (matchMode === 'manual' && tmdbId){
      const changed = !existingOverride || existingOverride.tmdbId !== tmdbId || existingOverride.mediaType !== tmdbType;
      if (changed){
        state.overrides[id] = { tmdbId, mediaType: tmdbType };
        markDirty(`Set manual TMDB match for ${label}: ${tmdbType} ${tmdbId}`, 'overrides');
      }
    } else if (existingOverride){
      delete state.overrides[id];
      markDirty(`Cleared manual TMDB match for ${label}`, 'overrides');
    }

    resetEntryForm();
    renderEntryList();
    renderLinkSelects();
    msg.className = 'msg ok';
    msg.textContent = 'Saved (not yet published — see the Publish tab).';
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
