export function generateHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>minicli — Memory</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <!-- Phosphor Icons (react-icons style, works in plain HTML) -->
  <script src="https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #0a0a0a;
      --bg1:      #111111;
      --bg2:      #181818;
      --border:   #222222;
      --green:    #a3e635;
      --green-d:  #84cc16;
      --green-bg: rgba(163,230,53,0.06);
      --muted:    #555555;
      --text:     #e5e5e5;
      --text2:    #999999;
      --amber:    #fbbf24;
      --red:      #f87171;
      --blue:     #60a5fa;
      --purple:   #c084fc;
      --r:        6px;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      overflow: hidden;
      font-size: 14px;
    }

    /* ── Top bar ─────────────────────────────── */
    #topbar {
      position: fixed; top: 0; left: 0; right: 0; height: 56px;
      background: var(--bg1);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px; padding: 0 20px;
      z-index: 100;
    }
    #logo {
      display: flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: var(--green);
      letter-spacing: -0.3px; white-space: nowrap; margin-right: 4px;
    }
    #logo-dot {
      width: 8px; height: 8px; background: var(--green);
      border-radius: 50%; animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; } 50% { opacity: 0.35; }
    }
    #logo-sub { font-size: 12px; color: var(--muted); font-weight: 400; }

    .divider { width: 1px; height: 24px; background: var(--border); margin: 0 4px; }

    /* Search */
    .search-box {
      display: flex; align-items: center; gap: 7px;
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: var(--r); padding: 6px 12px;
      flex: 1; max-width: 260px; transition: border-color .15s;
    }
    .search-box:focus-within { border-color: var(--green); }
    .search-box i { color: var(--muted); font-size: 15px; }
    #search {
      background: none; border: none; outline: none;
      color: var(--text); font-size: 13px; font-family: inherit; width: 100%;
    }
    #search::placeholder { color: var(--muted); }

    /* Filters */
    #filters { display: flex; gap: 4px; }
    .chip {
      background: transparent; border: 1px solid var(--border);
      border-radius: 20px; padding: 4px 13px;
      font-size: 12px; font-family: inherit; font-weight: 500;
      color: var(--muted); cursor: pointer; transition: all .12s;
      white-space: nowrap;
    }
    .chip:hover { color: var(--text); border-color: #444; }
    .chip.active {
      background: var(--green-bg); border-color: var(--green);
      color: var(--green);
    }

    #count {
      margin-left: auto; font-size: 12px; color: var(--muted);
      white-space: nowrap; display: flex; align-items: center; gap: 5px;
    }

    /* ── Canvas ──────────────────────────────── */
    canvas { position: fixed; top: 56px; left: 0; width: 100%; height: calc(100vh - 56px); }

    /* ── Tooltip ─────────────────────────────── */
    #tooltip {
      position: fixed; background: var(--bg1);
      border: 1px solid var(--border); border-radius: var(--r);
      padding: 10px 14px; pointer-events: none;
      font-size: 13px; max-width: 240px;
      display: none; z-index: 200;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    }
    .tt-badge {
      display: inline-block; border-radius: 3px; padding: 1px 7px;
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .5px; margin-bottom: 5px;
    }
    .tt-title { font-weight: 600; color: var(--text); margin-bottom: 3px; }
    .tt-sub   { font-size: 12px; color: var(--text2); line-height: 1.4; }

    /* ── Side panel ──────────────────────────── */
    #panel {
      position: fixed; top: 56px; right: 0; bottom: 0; width: 360px;
      background: var(--bg1);
      border-left: 1px solid var(--border);
      overflow-y: auto; overflow-x: hidden;
      transform: translateX(100%); transition: transform .22s cubic-bezier(.4,0,.2,1);
      z-index: 150;
    }
    #panel.open { transform: translateX(0); }

    .panel-inner { padding: 20px; }

    #panel-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 18px;
    }
    .panel-logo { font-size: 12px; color: var(--muted); font-weight: 500; }

    #close-panel {
      width: 30px; height: 30px; border-radius: var(--r);
      background: var(--bg2); border: 1px solid var(--border);
      color: var(--muted); font-size: 16px; font-family: inherit;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all .12s;
    }
    #close-panel:hover { border-color: var(--red); color: var(--red); }

    .p-badge {
      display: inline-flex; align-items: center; gap: 5px;
      border-radius: 4px; padding: 2px 9px;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .5px; margin-bottom: 10px;
    }
    .p-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 4px; line-height: 1.3; }
    .p-meta  { font-size: 12px; color: var(--muted); margin-bottom: 14px; }

    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 16px; }
    .tag {
      background: var(--green-bg); border: 1px solid rgba(163,230,53,.2);
      border-radius: 4px; padding: 2px 9px;
      font-size: 11px; color: var(--green);
    }

    .msg-sep { font-size: 11px; color: var(--muted); font-weight: 500;
      text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px;
      display: flex; align-items: center; gap: 8px;
    }
    .msg-sep::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    .msg-list  { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .msg-row   { display: flex; flex-direction: column; gap: 3px; }
    .msg-who   { font-size: 11px; font-weight: 600; color: var(--muted); }
    .msg-who.u { color: var(--blue); }
    .msg-who.b { color: var(--green); }
    .msg-body  {
      padding: 9px 12px; border-radius: var(--r);
      font-size: 13px; line-height: 1.55; word-break: break-word;
    }
    .msg-body.u { background: rgba(96,165,250,.08); border: 1px solid rgba(96,165,250,.18); color: #bfdbfe; }
    .msg-body.b { background: var(--green-bg);      border: 1px solid rgba(163,230,53,.15); color: var(--text); }

    .rel-hdr { font-size: 11px; color: var(--muted); font-weight: 500;
      text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
    .related-chip {
      display: inline-block; background: var(--bg2);
      border: 1px solid var(--border); border-radius: 5px;
      padding: 4px 10px; font-size: 12px; font-family: inherit;
      color: var(--text2); cursor: pointer; margin: 3px; transition: all .12s;
    }
    .related-chip:hover { border-color: var(--green); color: var(--green); }

    /* ── Empty ───────────────────────────────── */
    #empty {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      text-align: center; pointer-events: none;
    }
    #empty i   { font-size: 40px; color: var(--muted); margin-bottom: 14px; display: block; }
    #empty h3  { color: var(--text2); font-size: 15px; font-weight: 500; margin-bottom: 6px; }
    #empty p   { color: var(--muted); font-size: 13px; }

    /* ── Legend ──────────────────────────────── */
    #legend {
      position: fixed; bottom: 20px; left: 20px; z-index: 90;
      background: var(--bg1); border: 1px solid var(--border);
      border-radius: var(--r); padding: 10px 14px;
    }
    .leg-title { font-size: 10px; color: var(--muted); font-weight: 600;
      text-transform: uppercase; letter-spacing: .5px; margin-bottom: 7px; }
    .leg-row   { display: flex; align-items: center; gap: 8px; margin: 3px 0;
      font-size: 12px; color: var(--text2); }
    .leg-dot   { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }

    /* ── Scrollbar ───────────────────────────── */
    #panel::-webkit-scrollbar { width: 4px; }
    #panel::-webkit-scrollbar-track { background: transparent; }
    #panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  </style>
</head>
<body>

<div id="topbar">
  <div id="logo">
    minicli
    <span id="logo-sub">/ Parth</span>
  </div>
  <div class="divider"></div>
  <div class="search-box">
    <i class="ph ph-magnifying-glass"></i>
    <input id="search" placeholder="Search memories…" />
  </div>
  <div class="divider"></div>
  <div id="filters">
    <button class="chip active" data-type="all">All</button>
    <button class="chip" data-type="conversation">Chats</button>
    <button class="chip" data-type="task">Tasks</button>
    <button class="chip" data-type="note">Notes</button>
    <button class="chip" data-type="reminder">Reminders</button>
    <button class="chip" data-type="fact">Facts</button>
  </div>
  <span id="count"><i class="ph ph-circles-three" style="font-size:14px"></i> <span id="count-num">—</span></span>
</div>

<canvas id="graph"></canvas>

<div id="tooltip">
  <div class="tt-badge" id="tt-badge"></div>
  <div class="tt-title" id="tt-title"></div>
  <div class="tt-sub"   id="tt-sub"></div>
</div>

<div id="panel">
  <div class="panel-inner">
    <div id="panel-header">
      <span class="panel-logo">memory detail</span>
      <button id="close-panel">✕</button>
    </div>
    <div class="p-badge" id="p-badge"></div>
    <div class="p-title" id="p-title"></div>
    <div class="p-meta"  id="p-meta"></div>
    <div class="tags"    id="p-tags"></div>
    <div class="msg-sep" id="p-msg-hdr" style="display:none">Messages</div>
    <div class="msg-list" id="p-messages"></div>
    <div class="rel-hdr" id="p-rel-hdr" style="display:none">Related</div>
    <div id="p-related"></div>
  </div>
</div>

<div id="empty" style="display:none">
  <i class="ph ph-circles-three-plus"></i>
  <h3>No memories yet</h3>
  <p>Start a conversation to see your memory graph.</p>
</div>

<div id="legend">
  <div class="leg-title">Node types</div>
  <div class="leg-row"><div class="leg-dot" style="background:#a3e635"></div>Conversation</div>
  <div class="leg-row"><div class="leg-dot" style="background:#fbbf24"></div>Task</div>
  <div class="leg-row"><div class="leg-dot" style="background:#f87171"></div>Reminder</div>
  <div class="leg-row"><div class="leg-dot" style="background:#60a5fa"></div>Note</div>
  <div class="leg-row"><div class="leg-dot" style="background:#c084fc"></div>Fact</div>
</div>

<script>
const TYPE_COLOR = {
  conversation: '#a3e635',
  task:         '#fbbf24',
  reminder:     '#f87171',
  note:         '#60a5fa',
  fact:         '#c084fc',
};

let allMemories = [], filteredNodes = [], sim, transform = { x:0, y:0, k:1 };
let activeType = 'all', searchQuery = '', selectedId = null;

const canvas  = document.getElementById('graph');
const ctx2d   = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const panel   = document.getElementById('panel');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - 56;
  if (sim) { sim.force('center', d3.forceCenter(canvas.width/2, canvas.height/2)); sim.alpha(0.3).restart(); }
  render();
}

function nodeColor(d)  { return TYPE_COLOR[d.type] || '#555'; }
function nodeRadius(d) { return 9 + Math.min((d.messages?.length || 0) * 1.5, 16); }

function render() {
  if (!ctx2d) return;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.save();
  ctx2d.translate(transform.x, transform.y);
  ctx2d.scale(transform.k, transform.k);

  // Links
  const links = buildLinks();
  ctx2d.globalAlpha = 0.12;
  ctx2d.strokeStyle = '#a3e635';
  ctx2d.lineWidth   = 1;
  for (const l of links) {
    const s = l.source, t = l.target;
    if (s.x == null || t.x == null) continue;
    ctx2d.beginPath(); ctx2d.moveTo(s.x, s.y); ctx2d.lineTo(t.x, t.y); ctx2d.stroke();
  }
  ctx2d.globalAlpha = 1;

  // Nodes
  for (const d of filteredNodes) {
    if (d.x == null) continue;
    const r   = nodeRadius(d);
    const col = nodeColor(d);
    const sel = d.id === selectedId;

    // Outer glow (selected only)
    if (sel) {
      const grd = ctx2d.createRadialGradient(d.x, d.y, r, d.x, d.y, r * 2.5);
      grd.addColorStop(0, col + '30');
      grd.addColorStop(1, col + '00');
      ctx2d.beginPath();
      ctx2d.arc(d.x, d.y, r * 2.5, 0, Math.PI * 2);
      ctx2d.fillStyle = grd;
      ctx2d.fill();
    }

    // Node fill
    ctx2d.beginPath();
    ctx2d.arc(d.x, d.y, r, 0, Math.PI * 2);
    ctx2d.fillStyle = col + (sel ? '22' : '14');
    ctx2d.fill();

    // Node border
    ctx2d.strokeStyle = col + (sel ? 'ff' : '99');
    ctx2d.lineWidth   = sel ? 1.8 : 1.2;
    ctx2d.stroke();

    // Label below
    const label = (d.title || '').slice(0, 20);
    ctx2d.fillStyle    = sel ? col : '#666666';
    ctx2d.font         = \`\${sel ? 500 : 400} 11px Inter, sans-serif\`;
    ctx2d.textAlign    = 'center';
    ctx2d.textBaseline = 'top';
    ctx2d.fillText(label, d.x, d.y + r + 5);
  }
  ctx2d.restore();
}

function buildLinks() {
  const map  = new Map(filteredNodes.map((d) => [d.id, d]));
  const seen = new Set(), links = [];
  for (const d of filteredNodes) {
    for (const lid of (d.linkedIds || [])) {
      const key = [d.id, lid].sort().join('|');
      if (!seen.has(key) && map.has(lid)) { seen.add(key); links.push({ source: d, target: map.get(lid) }); }
    }
  }
  return links;
}

function applyFilter() {
  const q = searchQuery.toLowerCase();
  filteredNodes = allMemories.filter((d) => {
    const typeOk = activeType === 'all' || d.type === activeType;
    const textOk = !q || d.title.toLowerCase().includes(q) ||
      (d.summary||'').toLowerCase().includes(q) ||
      (d.tags||[]).some(t => t.toLowerCase().includes(q));
    return typeOk && textOk;
  });
  document.getElementById('count-num').textContent = filteredNodes.length + ' nodes';
  document.getElementById('empty').style.display = filteredNodes.length === 0 ? '' : 'none';
  rebuildSim();
}

function rebuildSim() {
  if (sim) sim.stop();
  const W = canvas.width, H = canvas.height;
  filteredNodes.forEach((d) => { if (d.x == null) { d.x = W/2 + (Math.random()-0.5)*200; d.y = H/2 + (Math.random()-0.5)*200; } });
  sim = d3.forceSimulation(filteredNodes)
    .force('link', d3.forceLink(buildLinks()).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(W/2, H/2))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 18))
    .on('tick', render);
}

function hitTest(mx, my) {
  const wx = (mx - transform.x) / transform.k;
  const wy = (my - transform.y) / transform.k;
  for (const d of filteredNodes) {
    if (d.x == null) continue;
    const dx = wx - d.x, dy = wy - d.y;
    if (dx*dx + dy*dy <= (nodeRadius(d)+6)**2) return d;
  }
  return null;
}

const BADGE_STYLE = {
  conversation: 'background:rgba(163,230,53,.12);color:#a3e635;border:1px solid rgba(163,230,53,.25)',
  task:         'background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.25)',
  reminder:     'background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.25)',
  note:         'background:rgba(96,165,250,.12);color:#60a5fa;border:1px solid rgba(96,165,250,.25)',
  fact:         'background:rgba(192,132,252,.12);color:#c084fc;border:1px solid rgba(192,132,252,.25)',
};

canvas.addEventListener('mousemove', (e) => {
  const hit = hitTest(e.clientX, e.clientY - 56);
  if (hit) {
    tooltip.style.display = 'block';
    tooltip.style.left    = (e.clientX + 16) + 'px';
    tooltip.style.top     = (e.clientY + 12) + 'px';
    const badge = document.getElementById('tt-badge');
    badge.textContent = hit.type || 'memory';
    badge.style.cssText = BADGE_STYLE[hit.type] || '';
    document.getElementById('tt-title').textContent = hit.title || '';
    document.getElementById('tt-sub').textContent   = hit.summary || (new Date(hit.timestamp).toLocaleString());
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.style.display = 'none';
    canvas.style.cursor = 'default';
  }
});

canvas.addEventListener('click', (e) => {
  const hit = hitTest(e.clientX, e.clientY - 56);
  if (hit) openPanel(hit); else { panel.classList.remove('open'); selectedId = null; render(); }
});

const zoom = d3.zoom().scaleExtent([0.15, 5]).on('zoom', (ev) => { transform = ev.transform; render(); });
d3.select(canvas).call(zoom);

function openPanel(mem) {
  selectedId = mem.id;

  const badge = document.getElementById('p-badge');
  badge.textContent = mem.type || 'memory';
  badge.style.cssText = BADGE_STYLE[mem.type] || '';

  document.getElementById('p-title').textContent = mem.title || 'Memory';
  document.getElementById('p-meta').textContent  = [
    new Date(mem.timestamp).toLocaleString(),
    mem.source,
  ].filter(Boolean).join(' · ');

  const tagsEl = document.getElementById('p-tags');
  tagsEl.innerHTML = (mem.tags||[]).map(t => \`<span class="tag">#\${esc(t)}</span>\`).join('');

  const msgs  = mem.messages || [];
  const msgEl = document.getElementById('p-messages');
  const hdr   = document.getElementById('p-msg-hdr');
  hdr.style.display = msgs.length ? '' : 'none';
  msgEl.innerHTML = msgs.map(m => {
    const isU = m.role === 'user';
    return \`<div class="msg-row">
      <div class="msg-who \${isU ? 'u' : 'b'}">\${isU ? 'Parth' : 'minicli'}</div>
      <div class="msg-body \${isU ? 'u' : 'b'}">\${esc(m.content)}</div>
    </div>\`;
  }).join('');

  const relEl  = document.getElementById('p-related');
  const relHdr = document.getElementById('p-rel-hdr');
  const linked = (mem.linkedIds||[]).map(lid => allMemories.find(m => m.id === lid)).filter(Boolean);
  relHdr.style.display = linked.length ? '' : 'none';
  relEl.innerHTML = linked.map(l => \`<span class="related-chip" data-id="\${l.id}">\${esc(l.title||l.id)}</span>\`).join('');
  relEl.querySelectorAll('.related-chip').forEach(c => {
    c.addEventListener('click', () => { const m = allMemories.find(x => x.id === c.dataset.id); if (m) openPanel(m); });
  });

  panel.classList.add('open');
  render();
}

document.getElementById('close-panel').addEventListener('click', () => { panel.classList.remove('open'); selectedId = null; render(); });
document.getElementById('search').addEventListener('input', (e) => { searchQuery = e.target.value; applyFilter(); });
document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); activeType = btn.dataset.type; applyFilter();
  });
});

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadData() {
  try {
    const res = await fetch('/api/memories');
    allMemories = await res.json();
    allMemories.forEach(d => { d.x = null; d.y = null; });
    applyFilter();
  } catch { document.getElementById('empty').style.display = ''; }
}

window.addEventListener('resize', resize);
resize();
loadData();
</script>
</body>
</html>`;
}
//# sourceMappingURL=web-ui.js.map