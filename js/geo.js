// Geo-AI section: step-by-step replay of the change-detection pipeline on real Gaziemir footprints (OSM, July 2022 vs July 2025).
(async () => {
  const root = document.getElementById('geo-viz');
  const svg = document.getElementById('geo-svg');
  const stepsEl = document.getElementById('geo-steps');
  const titleEl = document.getElementById('geo-title');
  const textEl = document.getElementById('geo-text');
  const codeEl = document.getElementById('geo-code');
  const badge = document.getElementById('geo-badge');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const STEP_MS = 4600, PIN_MS = 1400;

  const res = await fetch('assets/data/gaziemir.json');
  if (!res.ok) throw new Error(`gaziemir.json: ${res.status}`);
  const data = await res.json();
  const oldCount = data.old.length, newCount = data.new.length;
  const coords = data.new.map(n => n.ll);
  const fmt = ([lat, lon]) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  const STEPS = [
    { title: 'Collect footprints', badge: `OSM · 2022-07 · ${oldCount} buildings`,
      text: 'Selenium drives Overpass with a date-pinned query and exports every building footprint as GeoJSON, district by district, for July 2022.',
      code: '<span class="k">[out:json]</span>[date:<span class="n">"2022-07-22T00:00:00Z"</span>];\narea["name"="İzmir"]->.izmir;\n<span class="c">// district → neighbourhood areas</span>\nway(area.mahalle)["building"];\nout body; >; out skel qt;' },
    { title: 'Second date', badge: `OSM · 2025-07 · ${oldCount + newCount} buildings`,
      text: `The same query pinned to July 2025. In this 700 × 550 m window of Gaziemir, ${newCount} footprints exist in 2025 that were not there in 2022.`,
      code: '[date:<span class="n">"2025-07-22T00:00:00Z"</span>];\n<span class="c">// same areas, same filter</span>\n→ Gaziemir_2022.geojson\n→ Gaziemir_2025.geojson' },
    { title: 'Render tiles', badge: 'PyQGIS · 1:2000 tiles',
      text: 'PyQGIS renders both layers at a fixed 1:2000 scale into identical image tiles, buildings filled in one solid colour. Every tile gets a .pgw world file, so any pixel can be turned back into map coordinates.',
      code: 'TARGET_SCALE = <span class="n">2000</span>\nmap_settings.setOutputSize(QSize(w, h))\nmap_settings.setExtent(tile_rect)\nQgsMapRendererParallelJob(map_settings)\n→ tile_07.png + <span class="k">tile_07.pgw</span>' },
    { title: 'Binary masks', badge: 'K-means · k = 4',
      text: 'Colour quantisation with K-means groups the pixels into four colours. The cluster closest to the building colour becomes white, everything else black: one clean mask per date.',
      code: '_, labels, centers = cv2.kmeans(pixels, <span class="n">4</span>, …)\nbuilding = argmin(‖center − ORANGE‖)\nmask = (labels == building) * <span class="n">255</span>' },
    { title: 'Difference + erosion', badge: 'mask 2025 − mask 2022',
      text: 'Subtracting the 2022 mask from the 2025 mask leaves only what was added. One pass of 3×3 erosion splits buildings that touch, so each new structure becomes its own contour.',
      code: 'added = cv2.subtract(mask_after, mask_before)\nadded = cv2.erode(added, np.ones((<span class="n">3</span>, <span class="n">3</span>)), iterations=<span class="n">1</span>)\ncontours = cv2.findContours(added, RETR_EXTERNAL, …)\nkeep area ≥ MIN_AREA' },
    { title: 'Coordinates', badge: `${newCount} candidates`,
      text: 'Each contour\'s pixel position goes through the tile\'s world file into UTM 35N (EPSG:32635), then to latitude and longitude. The output is a list of candidate buildings to check.',
      code: '' },
    { title: 'Parcel check', badge: 'TKGM parcel query',
      text: 'Each coordinate opens the land-registry parcel query at that exact point, where the parcel and its zoning details can be read. This step was automated with Selenium too; the site\'s daily query limit stopped the full run.',
      code: '' },
  ];

  // --- build the map ---
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const toPath = pts => 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'scanGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#3be0c4', 'stop-opacity': 0 }, grad);
  el('stop', { offset: '.85', 'stop-color': '#3be0c4', 'stop-opacity': .35 }, grad);
  el('stop', { offset: '1', 'stop-color': '#3be0c4', 'stop-opacity': .9 }, grad);
  el('rect', { class: 'bg', width: data.w, height: data.h }, svg);
  const oldG = el('g', { class: 'old' }, svg);
  data.old.forEach(p => el('path', { d: toPath(p), pathLength: 1 }, oldG));
  const newG = el('g', { class: 'new' }, svg);
  data.new.forEach(n => el('path', { d: toPath(n.p) }, newG));
  const grid = el('g', { class: 'grid' }, svg);
  [250, 500, 750].forEach(x => el('line', { x1: x, y1: 0, x2: x, y2: data.h }, grid));
  [264, 528].forEach(y => el('line', { x1: 0, y1: y, x2: data.w, y2: y }, grid));
  el('rect', { class: 'tile', x: 500, y: 264, width: 250, height: 264 }, svg);
  el('rect', { class: 'scan', x: 0, y: 0, width: data.w, height: 160 }, svg);
  const pinsG = el('g', { class: 'pins' }, svg);
  const pins = data.new.map(n => {
    const xs = n.p.map(p => p[0]), ys = n.p.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const g = el('g', { class: 'pin' }, pinsG);
    const ring = el('circle', { class: 'r', cx, cy, r: 9 }, g);
    if (!reduceMotion) {
      el('animate', { attributeName: 'r', values: '7;15;7', dur: '1.8s', repeatCount: 'indefinite', begin: `${(cx % 9) / 10}s` }, ring);
    }
    el('circle', { class: 'c', cx, cy, r: 3.5 }, g);
    return g;
  });

  // --- step UI ---
  const buttons = STEPS.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = String(i + 1).padStart(2, '0');
    b.setAttribute('aria-label', `Step ${i + 1}: ${s.title}`);
    b.addEventListener('click', () => go(i));
    li.appendChild(b); stepsEl.appendChild(li);
    return b;
  });

  let step = 0, stepStart = 0, pinIdx = 0, running = false, raf = 0;
  const setCode = html => { codeEl.innerHTML = html; };

  function showPin(i) {
    pins.forEach((p, k) => p.classList.toggle('hot', k === i));
    const [lat, lon] = coords[i];
    setCode(`<span class="c">// candidate ${i + 1} / ${coords.length}</span>\nparselsorgu.tkgm.gov.tr/#ara/cografi/\n  <span class="n">${lat.toFixed(5)}</span>/<span class="n">${lon.toFixed(5)}</span>\n→ parcel · zoning · building permit`);
  }

  function go(i) {
    step = i; stepStart = performance.now(); pinIdx = 0;
    const s = STEPS[i];
    root.dataset.step = i;
    titleEl.textContent = `${i + 1} · ${s.title}`;
    textEl.textContent = s.text;
    badge.textContent = s.badge;
    buttons.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      b.classList.toggle('is-done', k < i);
      b.style.setProperty('--p', k < i ? '100%' : '0%');
    });
    pins.forEach(p => p.classList.remove('hot'));
    if (i === 5) setCode('<span class="c">// pixel → UTM 35N → WGS84</span>\nx, y = world_file · (col, row)\nTransformer.from_crs(<span class="n">"epsg:32635"</span>, <span class="n">"epsg:4326"</span>)\n' + coords.slice(0, 3).map(c => `<span class="k">${fmt(c)}</span>`).join('\n') + `\n… ${coords.length - 3} more`);
    else if (i === 6) showPin(0);
    else setCode(s.code);
  }

  function loop(now) {
    const dur = step === 6 ? PIN_MS * 5 : STEP_MS;
    const k = Math.min(1, (now - stepStart) / dur);
    buttons[step].style.setProperty('--p', `${k * 100}%`);
    if (step === 6) {
      const idx = Math.min(4, Math.floor((now - stepStart) / PIN_MS));
      if (idx !== pinIdx) { pinIdx = idx; showPin(idx * 5 % coords.length); }
    }
    if (k >= 1) go((step + 1) % STEPS.length);
    if (running) raf = requestAnimationFrame(loop);
  }

  go(0);
  if (reduceMotion) { go(5); return; }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; go(0); raf = requestAnimationFrame(loop); }
    if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0.3 }).observe(root);
})();
