// Operations section: animated walkthrough of PrintOS. Channels feed one shop center, the center keeps the workstations in sync, workstations print.
(() => {
  const root = document.getElementById('pos');
  const svg = document.getElementById('pos-svg');
  const stepsEl = document.getElementById('pos-steps');
  const kickerEl = document.getElementById('pos-kicker');
  const headingEl = document.getElementById('pos-heading');
  const textEl = document.getElementById('pos-text');
  const screen = document.getElementById('pos-screen');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const CHAPTER_MS = 9000;
  const C = { store: '#ffb02e', wa: '#45d97e', mail: '#b18cff', mob: '#3be0c4', sync: '#5b84ff', print: '#ff4d5e' };

  const ICON = {
    store: 'M3 10h18v10H3zM5 10V6h14v4M8 14h8',
    wa: 'M4 20l1.5-4A8 8 0 1 1 8 18.5z',
    mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
    mob: 'M7 2.5h10v19H7zM11 18h2',
    kiosk: 'M5 3h14v12H5zM9 21h6M12 15v6',
    design: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
    cash: 'M3 7h18v11H3zM3 11h18M7 15h3',
    admin: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
    printer: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
    slip: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  };

  // x, y = centre
  const NODES = [
    { id: 'store', x: 110, y: 105, w: 176, t: 'In-store', s: 'walk-in · kiosk', c: C.store },
    { id: 'wa', x: 110, y: 235, w: 176, t: 'WhatsApp', s: 'AI assistant', c: C.wa },
    { id: 'mail', x: 110, y: 365, w: 176, t: 'E-mail', s: 'Gmail → drafts', c: C.mail },
    { id: 'mob', x: 110, y: 495, w: 176, t: 'Mobile app', s: 'wallet orders', c: C.mob },
    { id: 'kiosk', x: 420, y: 95, w: 156, t: 'Kiosk', s: 'self-service', c: C.sync },
    { id: 'design', x: 640, y: 95, w: 156, t: 'Design desk', s: 'PDF prep', c: C.sync },
    { id: 'admin', x: 420, y: 505, w: 156, t: 'Admin', s: 'catalogue', c: C.sync },
    { id: 'cash', x: 640, y: 505, w: 156, t: 'Cashier', s: 'payments', c: C.sync },
    { id: 'printer', x: 862, y: 215, w: 156, t: 'Printer', s: 'production', c: C.print },
    { id: 'slip', x: 862, y: 395, w: 156, t: 'Slip printer', s: 'order slips', c: C.print },
  ];
  const H = 60;

  const PATHS = {
    'store-hub': 'M198,105 C310,105 310,300 405,300',
    'wa-hub': 'M198,235 C300,235 320,300 405,300',
    'mail-hub': 'M198,365 C300,365 320,300 405,300',
    'mob-hub': 'M198,495 C310,495 310,300 405,300',
    'hub-kiosk': 'M480,240 C480,180 420,190 420,125',
    'hub-design': 'M520,240 C520,180 640,190 640,125',
    'hub-admin': 'M480,360 C480,420 420,410 420,475',
    'hub-cash': 'M520,360 C520,420 640,410 640,475',
    'design-printer': 'M718,95 C800,95 862,120 862,185',
    'kiosk-printer': 'M420,65 C420,20 840,10 862,185',
    'cash-slip': 'M718,505 C800,505 862,480 862,425',
  };

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // --- build the scene ---
  const defs = el('defs', {}, svg);
  const glow = el('filter', { id: 'posGlow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
  el('feGaussianBlur', { stdDeviation: 5, result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);
  const hubGrad = el('radialGradient', { id: 'posHubGrad' }, defs);
  el('stop', { offset: '0', 'stop-color': '#3be0c4', 'stop-opacity': .22 }, hubGrad);
  el('stop', { offset: '1', 'stop-color': '#3be0c4', 'stop-opacity': 0 }, hubGrad);

  const gridG = el('g', { class: 'pos-grid' }, svg);
  for (let x = 40; x < 960; x += 40) for (let y = 40; y < 600; y += 40) el('circle', { cx: x, cy: y, r: 1 }, gridG);

  const linkG = el('g', { class: 'pos-links' }, svg);
  const paths = {};
  for (const [id, d] of Object.entries(PATHS)) {
    el('path', { d, class: 'pos-link-base', pathLength: 1 }, linkG);
    paths[id] = el('path', { d, class: 'pos-link', 'data-id': id, pathLength: 1 }, linkG);
  }

  // hub
  const hubG = el('g', { class: 'pos-hub', transform: 'translate(500 300)' }, svg);
  el('circle', { r: 150, fill: 'url(#posHubGrad)', class: 'pos-hub-halo' }, hubG);
  el('circle', { r: 104, class: 'pos-hub-ring' }, hubG);
  el('circle', { r: 118, class: 'pos-hub-ring pos-hub-ring-2' }, hubG);
  el('rect', { x: -95, y: -60, width: 190, height: 120, rx: 18, class: 'pos-hub-body' }, hubG);
  el('text', { y: -22, class: 'pos-hub-k' }, hubG).textContent = 'SHOP CENTER';
  el('text', { y: 8, class: 'pos-hub-t' }, hubG).textContent = 'Cashier · Center';
  el('text', { y: 32, class: 'pos-hub-s' }, hubG).textContent = 'orders · payments · catalogue';
  const hubVer = el('text', { y: 50, class: 'pos-hub-v' }, hubG);
  hubVer.textContent = 'catalogue v41';

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
    if (['kiosk', 'design', 'admin', 'cash'].includes(n.id)) {
      el('circle', { cx: n.w / 2 - 12, cy: -H / 2 + 12, r: 3.5, class: 'pos-node-dot' }, inner);
      n.badge = el('text', { x: n.w / 2 - 10, y: H / 2 + 18, class: 'pos-node-badge' }, g);
    }
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
    el('circle', { r: 5.5, fill: color, filter: 'url(#posGlow)' }, g);
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
  const badge = (id, text) => { if (nodeEls[id].n.badge) nodeEls[id].n.badge.textContent = text; };

  // --- chapter runner with cancellable waits ---
  let run = 0;
  const wait = (ms, token) => new Promise((res, rej) => setTimeout(() => (token === run ? res() : rej('stale')), ms));
  const go = (token, fn) => (...a) => (token === run ? fn(...a) : new Promise(() => {}));

  // screen helpers: every line is revealed by adding .in after a delay
  const lines = html => { screen.innerHTML = html; return [...screen.querySelectorAll('[data-at]')]; };
  const reveal = (items, token) => items.forEach(n => setTimeout(() => token === run && n.classList.add('in'), +n.dataset.at));

  const CHAPTERS = [
    {
      step: 'Intake', kicker: '01 · Every channel, one queue',
      title: 'Four ways in, one kind of order',
      text: 'A walk-in at the kiosk, a WhatsApp chat, an e-mail with attachments and a phone order all become the same order record in the shop center. The order code shows where it came from.',
      focus: ['store', 'wa', 'mail', 'mob'],
      screen: `<div class="ps-list">
        <div class="ps-row" data-at="300" style="--c:${C.store}"><b>K-2041</b><span>Kiosk · poster A2 · colour</span><i>at the counter</i></div>
        <div class="ps-row" data-at="1500" style="--c:${C.wa}"><b>W-1043</b><span>WhatsApp · thesis 84 pp ×2</span><i>confirmed by customer</i></div>
        <div class="ps-row" data-at="2700" style="--c:${C.mail}"><b>Draft</b><span>E-mail · 3 attachments</span><i>waits for staff</i></div>
        <div class="ps-row" data-at="3900" style="--c:${C.mob}"><b>U-000128</b><span>Mobile · A4 B/W · 12 pp</span><i>paid from wallet</i></div>
      </div>`,
      async play(t) {
        const s = go(t, send);
        s('store-hub', C.store, { label: 'K-2041' }); await wait(1200, t);
        s('wa-hub', C.wa, { label: 'W-1043' }); await wait(1200, t);
        s('mail-hub', C.mail, { label: 'draft' }); await wait(1200, t);
        await s('mob-hub', C.mob, { label: 'U-000128' });
        pulse('cash'); go(t, send)('hub-cash', C.sync, {});
      },
    },
    {
      step: 'AI agent', kicker: '02 · WhatsApp order desk',
      title: 'An LLM agent takes the order',
      text: 'The assistant reads the message and the file, asks only for what is missing, then sends a priced summary. Nothing becomes an order until the customer confirms it. Big jobs or unclear requests are handed to staff.',
      focus: ['wa', 'cash'],
      screen: `<div class="ps-chat">
        <div class="ps-msg me" data-at="200"><span class="ps-file">PDF</span>thesis_final.pdf · 84 pages</div>
        <div class="ps-msg me" data-at="900">Can you print this? Need it tomorrow</div>
        <div class="ps-typing" data-at="1500"><i></i><i></i><i></i></div>
        <div class="ps-msg ai" data-at="2500">Sure. Black &amp; white or colour, and how many copies?</div>
        <div class="ps-msg me" data-at="3600">B/W, 2 copies, spiral bound</div>
        <div class="ps-msg ai card" data-at="4700"><b>Summary</b>84 pp × 2 · A4 · B/W · double-sided · spiral<em>₺310</em><span>Reply “confirm” to place the order</span></div>
        <div class="ps-msg me" data-at="5900">confirm ✓</div>
        <div class="ps-chip" data-at="6600" style="--c:${C.wa}">Order <b>W-1043</b> created · one order, one total</div>
      </div>`,
      async play(t) {
        pulse('wa');
        await wait(6500, t);
        await go(t, send)('wa-hub', C.wa, { label: 'W-1043', dur: 1100 });
        pulse('cash'); badge('cash', 'W-1043 · ₺310');
        go(t, send)('hub-cash', C.wa, { dur: 900 });
      },
    },
    {
      step: 'Pricing', kicker: '03 · Price you can explain',
      title: 'How was this price calculated?',
      text: 'Files in the same product group are priced together. The kiosk shows the working: total pages, the price tier they fall into and any extras, all from the published catalogue.',
      focus: ['kiosk'],
      screen: `<div class="ps-price">
        <div class="ps-file-row" data-at="200"><span>notes.pdf</span><i style="--w:11%"></i><b>1 pp</b></div>
        <div class="ps-file-row" data-at="700"><span>slides.pdf</span><i style="--w:56%"></i><b>5 pp</b></div>
        <div class="ps-file-row" data-at="1200"><span>form.pdf</span><i style="--w:33%"></i><b>3 pp</b></div>
        <div class="ps-sum" data-at="2100">Same group · A4 B/W → <b>9 pages</b> priced together</div>
        <div class="ps-tiers" data-at="3000"><span class="hit">1–9 · ₺3.00</span><span>10–49 · ₺2.50</span><span>50+ · ₺2.00</span></div>
        <div class="ps-total" data-at="4200"><span>9 × ₺3.00</span><b>₺27.00</b></div>
      </div>`,
      async play(t) {
        pulse('kiosk');
        go(t, send)('hub-kiosk', C.store, { reverse: true, label: 'quote' });
        await wait(1800, t);
        await go(t, send)('hub-kiosk', C.sync, { label: 'catalogue v41' });
        badge('kiosk', '₺27.00');
      },
    },
    {
      step: 'Live sync', kicker: '04 · One center, live updates',
      title: 'Publish once, every screen follows',
      text: 'Admin edits prices as a draft. Only a validated, published package goes out, and the center pushes it to every workstation over a live event stream. Workstations that drop off reconnect and catch up.',
      focus: ['admin', 'kiosk', 'design', 'cash'],
      screen: `<div class="ps-sync">
        <div class="ps-publish" data-at="200"><span>Draft · 3 price changes</span><button tabindex="-1">Publish v42</button></div>
        <div class="ps-check" data-at="1200">Validated · no conflicting edits</div>
        <div class="ps-term" data-at="2600"><span>Kiosk</span><s>v41</s><b>v42 ✓</b></div>
        <div class="ps-term" data-at="2900"><span>Design desk</span><s>v41</s><b>v42 ✓</b></div>
        <div class="ps-term" data-at="3200"><span>Cashier</span><s>v41</s><b>v42 ✓</b></div>
        <div class="ps-term" data-at="3500"><span>Admin</span><s>v41</s><b>v42 ✓</b></div>
      </div>`,
      async play(t) {
        pulse('admin');
        await wait(1000, t);
        await go(t, send)('hub-admin', C.sync, { reverse: true, label: 'publish v42' });
        hubVer.textContent = 'catalogue v42'; hubG.classList.add('flash');
        setTimeout(() => hubG.classList.remove('flash'), 900);
        for (const id of ['kiosk', 'design', 'cash', 'admin']) {
          go(t, send)(`hub-${id}`, C.sync, { dur: 1100 }).then(() => { pulse(id); badge(id, 'v42 ✓'); }, () => {});
          await wait(260, t);
        }
      },
    },
    {
      step: 'File prep', kicker: '05 · PDF prep on the workstation',
      title: 'Pages arranged, then locked',
      text: 'The design desk picks pages, reorders, repeats and lays them out 1, 2 or 4 to a sheet. Office files are converted to PDF first. The finished file is fingerprinted, so what gets printed is exactly what was approved.',
      focus: ['design'],
      screen: `<div class="ps-prep">
        <div class="ps-pages" id="ps-pages">${[1, 2, 3, 4, 5, 6].map(n => `<span data-n="${n}">${n}</span>`).join('')}</div>
        <div class="ps-ops"><em data-at="900">select 1–6</em><em data-at="2300">reorder</em><em data-at="3700">2-up</em><em data-at="5200">lock</em></div>
        <div class="ps-hash" data-at="5400">sha256 <b>a41c…09e2</b> · settings fingerprint pinned</div>
      </div>`,
      async play(t) {
        const pages = screen.querySelector('#ps-pages');
        pulse('design');
        go(t, send)('hub-design', C.sync, { label: 'files' });
        await wait(2300, t);
        const before = new Map([...pages.children].map(sp => [sp, sp.getBoundingClientRect()]));
        [1, 3, 2, 4, 6, 5].forEach(n => pages.appendChild(pages.querySelector(`[data-n="${n}"]`)));
        for (const [sp, r] of before) {
          const now = sp.getBoundingClientRect();
          sp.animate([{ transform: `translate(${r.left - now.left}px, ${r.top - now.top}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
        pages.classList.add('moved');
        await wait(1400, t);
        pages.classList.add('nup');
        await wait(1500, t);
        pages.classList.add('locked'); pulse('design'); badge('design', 'ready · 3 sheets');
      },
    },
    {
      step: 'Safe print', kicker: '06 · Print safety gates',
      title: 'Printed once, on purpose',
      text: 'Confirming an order is not the same as printing it. Before the printer is called, the workstation checks that the center is live, the printer and file match what was prepared, and the center grants a one-time claim. If the result is unclear, it is never re-sent on its own.',
      focus: ['design', 'printer', 'cash', 'slip'],
      screen: `<div class="ps-gates">
        <div class="ps-gate" data-at="300">Order confirmed <i>≠ print approval</i></div>
        <div class="ps-gate" data-at="1000">Center live · center ID matches</div>
        <div class="ps-gate" data-at="1700">Printer profile verified</div>
        <div class="ps-gate" data-at="2400">File sha256 matches prepared job</div>
        <div class="ps-gate" data-at="3100">One-time claim granted</div>
        <div class="ps-gate" data-at="3800">DISPATCHING saved before spool</div>
        <div class="ps-gate ok" data-at="5200">Spool accepted · W-1043</div>
        <div class="ps-warn" data-at="6200"><b>UNCERTAIN</b> results are never retried automatically. Staff checks the paper first.</div>
      </div>`,
      async play(t) {
        await go(t, send)('hub-design', C.sync, { reverse: true, label: 'authorize', dur: 1000 });
        await go(t, send)('hub-design', C.sync, { label: 'claim ✓', dur: 1000 });
        await wait(1700, t);
        pulse('design');
        await go(t, send)('design-printer', C.print, { label: 'job W-1043', dur: 1400 });
        pulse('printer'); badge('design', 'spool accepted');
        await wait(400, t);
        go(t, send)('hub-cash', C.sync, { dur: 900 }).then(() => go(t, send)('cash-slip', C.print, { label: 'slip', dur: 1100 })).then(() => pulse('slip'), () => {});
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
    if (i === 0) hubVer.textContent = 'catalogue v41';
    if (reduceMotion) { items.forEach(n => n.classList.add('in')); finishStatic(i); return; }
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

  // reduced motion: show each chapter's end state without packets
  const finishStatic = i => {
    if (i === 3) hubVer.textContent = 'catalogue v42';
    if (i === 4) { const p = screen.querySelector('#ps-pages'); p.classList.add('moved', 'nup', 'locked'); }
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
