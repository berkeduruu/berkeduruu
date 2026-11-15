// GPU Studio section: animated walkthrough of Colab Station. Two clients feed one station server, which starts, feeds and stops a Colab GPU.
(() => {
  const root = document.getElementById('cs');
  const svg = document.getElementById('cs-svg');
  const stepsEl = document.getElementById('cs-steps');
  const kickerEl = document.getElementById('cs-kicker');
  const headingEl = document.getElementById('cs-heading');
  const textEl = document.getElementById('cs-text');
  const screen = document.getElementById('cs-screen');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const CHAPTER_MS = 9000;
  const C = { ui: '#ffb02e', mcp: '#b18cff', hf: '#ffd166', gpu: '#76b900', media: '#3be0c4', watch: '#ff4d5e', sync: '#5b84ff' };

  const ICON = {
    ui: 'M4 20l1.5-4A8 8 0 1 1 8 18.5zM8.5 11h7M8.5 14h4',
    mcp: 'M3 5h18v14H3zM7 10l3 2-3 2M12 15h5',
    hf: 'M12 3v12M7 10l5 5 5-5M4 20h16',
    gpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    media: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
    watch: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  };

  // x, y = centre
  const NODES = [
    { id: 'ui', x: 110, y: 150, w: 176, t: 'Studio chat', s: 'React · threads · 3D viewer', c: C.ui },
    { id: 'mcp', x: 110, y: 450, w: 176, t: 'Claude Code', s: 'MCP tools in any project', c: C.mcp },
    { id: 'hf', x: 640, y: 95, w: 156, t: 'Model packs', s: 'Hugging Face', c: C.hf },
    { id: 'gpu', x: 862, y: 300, w: 156, t: 'Colab L4', s: 'ComfyUI · 24 GB', c: C.gpu, badge: true },
    { id: 'media', x: 420, y: 505, w: 156, t: 'Media store', s: 'outputs · threads', c: C.media, badge: true },
    { id: 'watch', x: 640, y: 505, w: 156, t: 'Watchdog', s: 'credits · idle stop', c: C.watch, badge: true },
  ];
  const H = 60;

  const PATHS = {
    'ui-hub': 'M198,150 C310,150 310,280 405,288',
    'mcp-hub': 'M198,450 C310,450 310,320 405,312',
    'hub-gpu': 'M595,300 H784',
    'hf-gpu': 'M718,95 C820,95 862,140 862,270',
    'hub-media': 'M480,360 C480,420 420,410 420,475',
    'hub-watch': 'M520,360 C520,420 640,410 640,475',
    'watch-gpu': 'M718,505 C820,505 862,470 862,330',
  };

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // --- build the scene ---
  const defs = el('defs', {}, svg);
  const glow = el('filter', { id: 'csGlow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
  el('feGaussianBlur', { stdDeviation: 5, result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);
  const hubGrad = el('radialGradient', { id: 'csHubGrad' }, defs);
  el('stop', { offset: '0', 'stop-color': '#76b900', 'stop-opacity': .2 }, hubGrad);
  el('stop', { offset: '1', 'stop-color': '#76b900', 'stop-opacity': 0 }, hubGrad);

  const linkG = el('g', { class: 'pos-links' }, svg);
  const paths = {};
  for (const [id, d] of Object.entries(PATHS)) {
    el('path', { d, class: 'pos-link-base', pathLength: 1 }, linkG);
    paths[id] = el('path', { d, class: 'pos-link', 'data-id': id, pathLength: 1 }, linkG);
  }

  const hubG = el('g', { class: 'pos-hub', transform: 'translate(500 300)' }, svg);
  el('circle', { r: 150, fill: 'url(#csHubGrad)', class: 'pos-hub-halo' }, hubG);
  el('circle', { r: 104, class: 'pos-hub-ring' }, hubG);
  el('circle', { r: 118, class: 'pos-hub-ring pos-hub-ring-2' }, hubG);
  el('rect', { x: -95, y: -60, width: 190, height: 120, rx: 18, class: 'pos-hub-body' }, hubG);
  el('text', { y: -22, class: 'pos-hub-k' }, hubG).textContent = 'STATION SERVER';
  el('text', { y: 8, class: 'pos-hub-t' }, hubG).textContent = 'Queue · Tracker';
  el('text', { y: 32, class: 'pos-hub-s' }, hubG).textContent = 'jobs · timings · credits';
  const hubVer = el('text', { y: 50, class: 'pos-hub-v' }, hubG);
  const HUB_IDLE = 'queue empty · GPU off';
  hubVer.textContent = HUB_IDLE;

  const nodeEls = {};
  const nodeG = el('g', { class: 'pos-nodes' }, svg);
  NODES.forEach((n, i) => {
    const g = el('g', { class: 'pos-node', transform: `translate(${n.x} ${n.y})`, style: `--c:${n.c};--i:${i}` }, nodeG);
    const inner = el('g', { class: 'pos-node-in' }, g);
    el('rect', { x: -n.w / 2, y: -H / 2, width: n.w, height: H, rx: 12, class: 'pos-node-body' }, inner);
    el('rect', { x: -n.w / 2 + 10, y: -16, width: 32, height: 32, rx: 9, class: 'pos-node-chip' }, inner);
    el('path', { d: ICON[n.id], transform: `translate(${-n.w / 2 + 14} -12)`, class: 'pos-node-icon' }, inner);
    el('text', { x: -n.w / 2 + 52, y: -3, class: 'pos-node-t' }, inner).textContent = n.t;
    el('text', { x: -n.w / 2 + 52, y: 16, class: 'pos-node-s' }, inner).textContent = n.s;
    if (n.badge) n.badgeEl = el('text', { x: n.w / 2 - 10, y: H / 2 + 18, class: 'pos-node-badge' }, g);
    nodeEls[n.id] = { g, n };
  });

  const packetG = el('g', { class: 'pos-packets' }, svg);

  // --- packets ---
  let packets = [];
  const send = (pathId, color, { reverse = false, dur = 1300, label = '' } = {}) => {
    const p = paths[pathId];
    const len = p.getTotalLength();
    const g = el('g', { class: 'pos-packet' }, packetG);
    el('circle', { r: 11, fill: color, opacity: .18 }, g);
    el('circle', { r: 5.5, fill: color, filter: 'url(#csGlow)' }, g);
    if (label) {
      const w = label.length * 7.4 + 14;
      el('rect', { x: 12, y: -24, width: w, height: 20, rx: 6, class: 'pos-packet-tag', stroke: color }, g);
      el('text', { x: 19, y: -10, class: 'pos-packet-label', fill: color }, g).textContent = label;
    }
    p.classList.add('hot'); p.style.setProperty('--c', color);
    return new Promise(resolve => packets.push({ g, p, len, reverse, dur, t0: performance.now(), resolve }));
  };

  const tick = now => {
    packets = packets.filter(pk => {
      const k = Math.min(1, (now - pk.t0) / pk.dur);
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const pt = pk.p.getPointAtLength((pk.reverse ? 1 - e : e) * pk.len);
      pk.g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      if (k < 1) return true;
      pk.g.remove();
      if (!packets.some(o => o !== pk && o.p === pk.p)) pk.p.classList.remove('hot');
      pk.resolve();
      return false;
    });
    requestAnimationFrame(tick);
  };

  const pulse = id => {
    const g = nodeEls[id].g;
    g.classList.remove('pulse'); void g.getBBox(); g.classList.add('pulse');
    setTimeout(() => g.classList.remove('pulse'), 900);
  };
  const focus = ids => NODES.forEach(n => nodeEls[n.id].g.classList.toggle('on', ids.includes(n.id)));
  const badge = (id, text) => { const b = nodeEls[id].n.badgeEl; if (b) b.textContent = text; };
  const hubText = text => { hubVer.textContent = text; hubG.classList.add('flash'); setTimeout(() => hubG.classList.remove('flash'), 900); };

  // --- chapter runner with cancellable waits ---
  let run = 0;
  const wait = (ms, token) => new Promise((res, rej) => setTimeout(() => (token === run ? res() : rej('stale')), ms));
  const go = (token, fn) => (...a) => (token === run ? fn(...a) : new Promise(() => {}));

  const lines = html => { screen.innerHTML = html; return [...screen.querySelectorAll('[data-at]')]; };
  const reveal = (items, token) => items.forEach(n => setTimeout(() => token === run && n.classList.add('in'), +n.dataset.at));

  const CHAPTERS = [
    {
      step: 'Request', kicker: '01 · Two front doors',
      title: 'The same job from a chat or from Claude Code',
      text: 'A prompt typed in the studio and a tool call from an agent in another project end up as the same kind of job: a mode, its settings and optional reference files. Jobs from both wait in one priority queue; prompt help always goes first.',
      focus: ['ui', 'mcp'],
      screen: `<div class="ps-list">
        <div class="ps-row" data-at="300" style="--c:${C.ui}"><b>G-0412</b><span>Image · 1K · 20 steps</span><i>from the studio chat</i></div>
        <div class="ps-row" data-at="1500" style="--c:${C.mcp}"><b>G-0413</b><span>3D model · 1024 · PBR textures</span><i>from Claude Code (generate_3d)</i></div>
        <div class="ps-row" data-at="2700" style="--c:${C.mcp}"><b>G-0414</b><span>Speech · Qwen3-TTS</span><i>from Claude Code (generate_speech)</i></div>
        <div class="ps-row" data-at="3900" style="--c:${C.ui}"><b>G-0415</b><span>Video · 720p · 6 s</span><i>queued, start time estimated from learned run times</i></div>
      </div>`,
      async play(t) {
        go(t, send)('ui-hub', C.ui, { label: 'G-0412' }); await wait(1200, t);
        go(t, send)('mcp-hub', C.mcp, { label: 'G-0413' }); await wait(1200, t);
        go(t, send)('mcp-hub', C.mcp, { label: 'G-0414' }); await wait(1200, t);
        await go(t, send)('ui-hub', C.ui, { label: 'G-0415' });
        hubText('queue · 4 jobs');
      },
    },
    {
      step: 'Cold start', kicker: '02 · A GPU that is not running yet',
      title: 'The first job starts the machine',
      text: 'Nothing keeps a GPU warm. The station asks Colab for an L4, opens an SSH tunnel and builds the environment from pinned files, then starts ComfyUI. Every step of this was timed, and the slowest ones were rewritten: parallel Range downloads, a prebuilt wheel archive and uv.',
      focus: ['gpu', 'watch'],
      screen: `<div class="ps-gates">
        <div class="ps-gate" data-at="300">Allocate an L4 with the Colab CLI <i>8 s</i></div>
        <div class="ps-gate" data-at="1000">Open the SSH tunnel to the VDS <i>5 s</i></div>
        <div class="ps-gate" data-at="1700">Python 3.13 · torch from the lock file</div>
        <div class="ps-gate" data-at="2400">Wheel archive over HTTPS · sha256 checked</div>
        <div class="ps-gate ok" data-at="3100">ComfyUI at a pinned commit · environment check passes</div>
      </div>
      <div class="ps-price" style="margin-top:var(--space-md)">
        <div class="ps-file-row" data-at="4000"><span>before</span><i style="--w:100%"></i><b>4.8 min</b></div>
        <div class="ps-file-row" data-at="4600"><span>after</span><i style="--w:38%"></i><b>1.8 min</b></div>
      </div>`,
      async play(t) {
        hubText('starting the GPU');
        pulse('gpu'); badge('gpu', 'booting…');
        await go(t, send)('hub-gpu', C.sync, { label: 'colab new', dur: 1500 });
        await wait(1500, t);
        go(t, send)('hub-gpu', C.sync, { label: 'setup', dur: 1500 });
        await wait(1700, t);
        pulse('gpu'); badge('gpu', 'ComfyUI ready');
        hubText('GPU ready');
      },
    },
    {
      step: 'Models', kicker: '03 · Weights before work',
      title: 'The job’s own model downloads first',
      text: 'Model packs come from Hugging Face straight onto the GPU machine at hundreds of MB/s. The pack the job needs goes first, and the others follow in the background. If no new bytes arrive for ten minutes, the job fails instead of waiting forever.',
      focus: ['hf', 'gpu'],
      screen: `<div class="ps-price">
        <div class="ps-file-row" data-at="300"><span>Image pack</span><i style="--w:100%"></i><b>17.3 GB</b></div>
        <div class="ps-file-row" data-at="900"><span>Speech</span><i style="--w:34%"></i><b>pre-fetch</b></div>
        <div class="ps-file-row" data-at="1500"><span>3D</span><i style="--w:62%"></i><b>on demand</b></div>
        <div class="ps-sum" data-at="2400">Speech models are fetched during boot: the first speech job went from <b>230 s to 75 s</b></div>
        <div class="ps-warn" data-at="3400"><b>NO PROGRESS · 10 MIN</b> The job fails with a clear error and the GPU may shut down. The failure is written for that pack only.</div>
      </div>`,
      async play(t) {
        pulse('hf');
        await go(t, send)('hf-gpu', C.hf, { label: 'image pack', dur: 1800 });
        pulse('gpu'); badge('gpu', 'models ✓');
        await wait(500, t);
        go(t, send)('hf-gpu', C.hf, { label: 'speech', dur: 1500 });
      },
    },
    {
      step: 'Run', kicker: '04 · One graph at a time',
      title: 'ComfyUI runs it, the tracker keeps time',
      text: 'The station builds the workflow graph, sends it to ComfyUI and follows progress over a websocket. Remaining time comes from per-node timings learned on this exact GPU, kept separately for cold and warm runs. Nothing here is a guess.',
      focus: ['gpu'],
      screen: `<div class="ps-price">
        <div class="ps-file-row" data-at="300"><span>1st image</span><i style="--w:100%"></i><b>~115 s</b></div>
        <div class="ps-file-row" data-at="900"><span>next images</span><i style="--w:30%"></i><b>~35 s</b></div>
        <div class="ps-sum" data-at="1600">The first run includes about 40 s of loading the model from disk to the GPU</div>
        <div class="ps-tiers" data-at="2600"><span>3D 1024 · 204 s</span><span class="hit">3D 1536 · 516 s</span><span>3D 2048 · 1291 s</span></div>
        <div class="ps-total" data-at="3600"><span>3D 1536 at 40%, remaining from learned timings</span><b>~5 min</b></div>
      </div>`,
      async play(t) {
        hubText('G-0412 running');
        pulse('gpu'); badge('gpu', 'sampling…');
        await go(t, send)('hub-gpu', C.sync, { label: 'workflow', dur: 1300 });
        await wait(600, t);
        go(t, send)('hub-gpu', C.gpu, { reverse: true, label: 'progress 40%', dur: 1300 });
        await wait(1400, t);
        hubText('ETA 35 s');
      },
    },
    {
      step: 'Guard rails', kicker: '05 · Spend little, fail clearly',
      title: 'It stops itself, and says why',
      text: 'The watchdog is the reason this is affordable to leave running. Idle GPUs are shut down, jobs that cannot finish in time are refused before they start, and each kind of breakage ends the job with an explicit message rather than a stuck status.',
      focus: ['watch', 'gpu'],
      screen: `<div class="ps-gates">
        <div class="ps-gate" data-at="300">Longer than 30 min by measurement <i>rejected up front</i></div>
        <div class="ps-gate" data-at="1000">Model download stalls for 10 min <i>job fails</i></div>
        <div class="ps-gate" data-at="1700">ComfyUI process dies <i>error + log tail</i></div>
        <div class="ps-gate" data-at="2400">Websocket drops mid-job <i>explicit error</i></div>
        <div class="ps-gate" data-at="3100">Service stops <i>GPU is shut down</i></div>
        <div class="ps-gate ok" data-at="3800">15 idle minutes <i>GPU stops itself</i></div>
        <div class="ps-warn" data-at="5000"><b>NO FALLBACKS</b> A hidden retry would spend credits twice. The station fails fast and shows the root cause.</div>
      </div>`,
      async play(t) {
        pulse('watch');
        await wait(600, t);
        await go(t, send)('hub-watch', C.sync, { label: 'idle 15 min', dur: 1100 });
        await go(t, send)('watch-gpu', C.watch, { label: 'stop', dur: 1400 });
        pulse('gpu'); badge('gpu', 'stopped'); badge('watch', 'credits kept');
        hubText(HUB_IDLE);
      },
    },
    {
      step: 'Result', kicker: '06 · The file comes back',
      title: 'Outputs land where the request came from',
      text: 'The result is saved to the media store with its thread and settings. The chat shows it live, with a 3D viewer for models. Claude Code receives a URL it can download with curl, so a generated asset goes straight into the project it was asked for.',
      focus: ['media', 'ui', 'mcp'],
      screen: `<div class="ps-list">
        <div class="ps-row" data-at="300" style="--c:${C.media}"><b>G-0412</b><span>Image · PNG</span><i>shown in the chat thread</i></div>
        <div class="ps-row" data-at="1200" style="--c:${C.media}"><b>G-0413</b><span>3D model · GLB</span><i>opens in the 3D viewer</i></div>
        <div class="ps-row" data-at="2100" style="--c:${C.media}"><b>G-0414</b><span>Speech · audio</span><i>URL returned to Claude Code</i></div>
        <div class="ps-chip" data-at="3200" style="--c:${C.media}">Files are cleaned up with their chat, <b>unless</b> another chat’s job still uses them as input</div>
      </div>`,
      async play(t) {
        pulse('gpu');
        await go(t, send)('hub-gpu', C.gpu, { reverse: true, label: 'G-0412.png', dur: 1200 });
        await go(t, send)('hub-media', C.media, { label: 'save', dur: 900 });
        pulse('media'); badge('media', '3 files');
        go(t, send)('ui-hub', C.ui, { reverse: true, label: 'preview', dur: 1300 });
        await wait(300, t);
        go(t, send)('mcp-hub', C.mcp, { reverse: true, label: 'URL', dur: 1300 });
      },
    },
  ];

  // --- steps UI ---
  const stepBtns = CHAPTERS.map((c, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${c.step}`;
    b.addEventListener('click', () => show(i));
    li.appendChild(b); stepsEl.appendChild(li);
    return b;
  });

  let current = -1, timer = null, progRaf = null, visible = false, started = false;

  const show = i => {
    const token = ++run;
    current = i;
    const c = CHAPTERS[i];
    root.dataset.chapter = i;
    root.classList.remove('is-intro'); root.classList.add('is-live'); started = true;
    stepBtns.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      b.classList.toggle('is-done', k < i);
      b.style.setProperty('--p', k < i ? '100%' : '0%');
    });
    kickerEl.textContent = c.kicker;
    headingEl.textContent = c.title;
    textEl.textContent = c.text;
    screen.classList.remove('swap'); void screen.offsetWidth; screen.classList.add('swap');
    const items = lines(c.screen);
    focus(c.focus);
    NODES.forEach(n => badge(n.id, ''));
    packets.forEach(pk => { pk.g.remove(); pk.p.classList.remove('hot'); });
    packets = [];
    hubVer.textContent = HUB_IDLE;
    if (reduceMotion) { items.forEach(n => n.classList.add('in')); return; }
    reveal(items, token);
    c.play(token).catch(() => {});
    clearTimeout(timer); cancelAnimationFrame(progRaf);
    const t0 = performance.now(), btn = stepBtns[i];
    const prog = now => {
      if (token !== run) return;
      btn.style.setProperty('--p', `${Math.min(100, (now - t0) / CHAPTER_MS * 100)}%`);
      if (now - t0 < CHAPTER_MS) progRaf = requestAnimationFrame(prog);
    };
    progRaf = requestAnimationFrame(prog);
    timer = setTimeout(() => { if (token === run && visible) show((i + 1) % CHAPTERS.length); }, CHAPTER_MS);
  };

  const start = () => {
    if (started) return;
    started = true;
    if (reduceMotion) { root.classList.add('is-live'); show(0); return; }
    root.classList.add('is-intro');
    setTimeout(() => { root.classList.add('is-live'); }, 1400);
    setTimeout(() => { if (current < 0) show(0); }, 2600);
  };

  requestAnimationFrame(tick);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) {
      start();
      if (current >= 0 && !reduceMotion) show(current);
    } else {
      run++; clearTimeout(timer); cancelAnimationFrame(progRaf);
    }
  }, { threshold: 0.3 }).observe(root);
})();
