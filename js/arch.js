// Edge AI section: architecture diagram with packets flowing along each link. Content follows the team's flight code.
(() => {
  const svg = document.getElementById('arch-svg');
  const root = svg.closest('.arch');
  const infoTitle = document.getElementById('arch-info-title');
  const infoBody = document.getElementById('arch-info-body');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = { video: '#3be0c4', control: '#ffb02e', mission: '#b18cff' };

  const NODES = [
    { id: 'cam', x: 64, y: 64, w: 150, g: 'video', t: 'CSI camera', s: '1920×1080 · 60 fps',
      i: 'MIPI-CSI sensor read by nvarguscamerasrc at 1920×1080, 60 fps. For simulator tests the same graph takes an RTP/UDP H.264 stream instead of the camera.' },
    { id: 'mux', x: 64, y: 196, w: 150, g: 'video', t: 'nvstreammux', s: 'frames in GPU memory',
      i: 'Batches frames into NVMM GPU buffers, so every later stage works on the GPU without copying frames back to the CPU.' },
    { id: 'roi', x: 234, y: 196, w: 160, g: 'video', t: 'Dynamic ROI', s: 'crop around last hit',
      i: 'After a detection, the next frames are cropped to a padded region around the target, kept at the frame aspect ratio, so a distant aircraft keeps enough pixels. Times out back to full-frame scanning.' },
    { id: 'infer', x: 414, y: 196, w: 170, g: 'video', t: 'nvinfer · YOLO11', s: 'TensorRT · 720p branch',
      i: 'Runs our custom-trained YOLO11-S (or N, or both as an IoU-fused ensemble) as a TensorRT engine through the DeepStream-Yolo parser, on a 1280×720 inference branch.' },
    { id: 'track', x: 604, y: 196, w: 144, g: 'control', t: 'Tracker + lock', s: 'IoU · 4 s lock rule',
      i: 'Matches detections by IoU or centre distance, coasts for 0.8 s through misses and re-acquires after 3 consistent frames. The lock counter needs 4.0 s continuously inside the yellow zone at ≥5% of the frame, with 0.2 s of tolerance.' },
    { id: 'osd', x: 604, y: 316, w: 144, g: 'video', t: 'nvdsosd', s: 'overlay · 640×480',
      i: 'Draws the lock zone, ROI, boxes, mode, lock timer and clock on a 640×480 branch: the overlay the pilots watch, and the one in the flight videos above.' },
    { id: 'enc', x: 414, y: 316, w: 170, g: 'video', t: 'H.264 encoder', s: 'NVENC · x264 on Super',
      i: 'Hardware H.264 encoding with NVENC on the Orin NX. The Orin Nano Super variant of the pipeline uses x264 with VIC-friendly caps.' },
    { id: 'ts', x: 234, y: 316, w: 160, g: 'video', t: 'MPEG-TS → tee', s: '1 stream → 3 sinks',
      i: 'A single MPEG-TS stream is split with a tee into two UDP destinations on two subnets and a local recording.' },
    { id: 'rec', x: 64, y: 316, w: 150, g: 'video', t: 'Recorder', s: 'every flight · .ts',
      i: 'Each flight is written to the Jetson\'s disk as an MPEG-TS file, independent of the radio links.' },
    { id: 'udp', x: 234, y: 436, w: 160, g: 'video', t: 'udpsink ×2', s: ':5425 · :5430',
      i: 'The same encoded video goes to two ground addresses on separate subnets, so one link can drop without losing the picture.' },
    { id: 'link', x: 414, y: 436, w: 170, g: 'control', t: 'Data link', s: 'UDP :5008 · JSON 20 Hz',
      i: 'Two-way UDP JSON at 20 Hz. The ground sends mode changes and live tuning (speed limits, box thresholds, PID); the Jetson sends detections, lock state and QR results.' },
    { id: 'guide', x: 604, y: 436, w: 144, g: 'control', t: 'Guidance', s: 'pixel → LOS → GPS',
      i: 'Turns the target\'s pixel position and the aircraft attitude into a line-of-sight bearing, projects a GPS waypoint ahead and sends it as MAV_CMD_DO_REPOSITION every 0.1 s. Speed follows box size: 25 m/s when the target is small, 13 m/s when it is close.' },
    { id: 'fc', x: 470, y: 616, w: 278, g: 'control', t: 'Pixhawk · ArduPilot', s: 'flight controller · SITL in tests',
      i: 'Flies the aircraft. A telemetry thread reads attitude and GPS over MAVLink; mission items and parameters are written for the QR task. ArduPilot SITL stands in for the aircraft on the ground.' },
    { id: 'view', x: 868, y: 80, w: 300, g: 'video', t: 'Stream viewer', s: 'dual-link failover · relay · record',
      i: 'Receives both video links, switches automatically when one fails, relays and records. Compressed packets are never dropped, only decoded frames, so the picture does not break up mid-GOP.' },
    { id: 'sel', x: 868, y: 196, w: 300, g: 'mission', t: 'Target selector', s: 'XGBoost · 12 geometry features',
      i: 'Scores rival aircraft reported by the competition server with an XGBoost model over 12 relative-geometry features such as distance, closing speed, relative bearing and altitude difference, plus a blacklist manager.' },
    { id: 'mode', x: 868, y: 316, w: 300, g: 'mission', t: 'Mission control', s: 'modes · live parameters',
      i: 'Runs the mission: Transit, YOLO lock, QR, HSS air-defence avoidance and Standby. Mode and parameter changes are pushed to the Jetson over the data link.' },
    { id: 'server', x: 868, y: 616, w: 300, g: 'mission', t: 'Competition server', s: 'REST · telemetry · lock-on · QR · HSS',
      i: 'The TEKNOFEST API: login, telemetry every cycle, lock-on and kamikaze reports out; rival telemetry, QR and air-defence coordinates and field limits back.' },
  ];

  const EDGES = [
    { f: 'video', d: 'M139,122 V196', l: ['CSI 1080p60', 148, 140] },
    { f: 'video', d: 'M214,225 H234' },
    { f: 'video', d: 'M394,225 H414' },
    { f: 'video', d: 'M584,225 H604' },
    { f: 'video', d: 'M676,254 V316' },
    { f: 'video', d: 'M604,345 H584' },
    { f: 'video', d: 'M414,345 H394' },
    { f: 'video', d: 'M234,345 H214' },
    { f: 'video', d: 'M314,374 V436' },
    { f: 'video', d: 'M314,494 V546 H800 V109 H868', l: ['H.264 · MPEG-TS · 640×480', 330, 540] },
    { f: 'control', d: 'M748,225 H760 V465 H748' },
    { f: 'control', d: 'M716,494 V616', l: ['reposition · speed', 722, 598] },
    { f: 'control', d: 'M640,616 V494', l: ['attitude · GPS', 634, 598, 'end'] },
    { f: 'control', d: 'M499,494 V584 H826 V345 H868', both: true, l: ['mode · PID · target', 506, 578] },
    { f: 'mission', d: 'M1018,254 V316', l: ['chosen target', 1026, 290] },
    { f: 'mission', d: 'M1168,345 H1186 V645 H1168', both: true, l: ['HTTPS', 1180, 600, 'end'] },
  ];
  const LANE_LABELS = [
    { f: 'video', text: 'VIDEO DOWNLINK', x: 812, y: 300 },
    { f: 'control', text: 'DATA LINK', x: 838, y: 470 },
  ];
  const MODES = ['Transit', 'YOLO lock', 'QR', 'HSS avoid', 'Standby'];

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };

  // frames
  el('rect', { class: 'a-frame', x: 16, y: 36, width: 772, height: 668, rx: 16 }, svg);
  el('text', { class: 'a-frame-label', x: 772, y: 58, 'text-anchor': 'end' }, svg).textContent = 'ON-BOARD · FIGHTER UAV';
  el('rect', { class: 'a-jetson', x: 40, y: 150, width: 724, height: 416, rx: 12 }, svg);
  el('text', { class: 'a-jetson-label', x: 160, y: 176 }, svg).textContent = 'NVIDIA JETSON ORIN NX · DEEPSTREAM 7.1';
  el('rect', { class: 'a-frame', x: 850, y: 36, width: 334, height: 448, rx: 16 }, svg);
  el('text', { class: 'a-frame-label', x: 868, y: 66 }, svg).textContent = 'GROUND CONTROL STATION';

  // edges below nodes
  const edgeLayer = el('g', {}, svg);
  const edges = EDGES.map(e => {
    const path = el('path', { class: `a-edge f-${e.f}`, d: e.d }, edgeLayer);
    if (e.l) el('text', { class: `a-label f-${e.f}`, x: e.l[1], y: e.l[2], 'text-anchor': e.l[3] || 'start' }, edgeLayer).textContent = e.l[0];
    return { ...e, path, len: path.getTotalLength() };
  });
  for (const l of LANE_LABELS) {
    el('text', { class: `a-label f-${l.f}`, x: l.x, y: l.y, 'text-anchor': 'middle', transform: `rotate(-90 ${l.x} ${l.y})` }, edgeLayer).textContent = l.text;
  }

  // nodes
  const nodeLayer = el('g', {}, svg);
  const nodeEls = new Map();
  for (const n of NODES) {
    const g = el('g', { class: `a-node g-${n.g}`, tabindex: 0, role: 'button', 'aria-label': `${n.t}: ${n.s}` }, nodeLayer);
    el('rect', { x: n.x, y: n.y, width: n.w, height: 58, rx: 10 }, g);
    el('text', { class: 't', x: n.x + 12, y: n.y + 25 }, g).textContent = n.t;
    el('text', { class: 's', x: n.x + 12, y: n.y + 44 }, g).textContent = n.s;
    const select = () => {
      nodeEls.forEach(x => x.classList.remove('is-selected'));
      g.classList.add('is-selected');
      infoTitle.textContent = n.t;
      infoBody.textContent = n.i;
    };
    g.addEventListener('click', select);
    g.addEventListener('mouseenter', select);
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); } });
    nodeEls.set(n.id, g);
  }

  // mission modes inside the ground frame
  el('text', { class: 'a-frame-label', x: 868, y: 414 }, svg).textContent = 'MISSION MODES';
  const modeEls = MODES.map((m, i) => {
    const x = 868 + (i % 3) * 102, y = 424 + Math.floor(i / 3) * 30;
    const g = el('g', {}, svg);
    const r = el('rect', { x, y, width: 96, height: 24, rx: 12, fill: 'none', stroke: '#2a3442' }, g);
    const t = el('text', { class: 'a-mode', x: x + 48, y: y + 16, 'text-anchor': 'middle', fill: '#8d99a8' }, g);
    t.textContent = `${i} ${m}`;
    return { r, t };
  });

  // packets
  const packetLayer = el('g', {}, svg);
  const packets = [];
  edges.forEach((e, ei) => {
    const count = Math.max(1, Math.round(e.len / 140));
    for (let k = 0; k < count; k++) {
      const c = el('circle', { class: `a-packet f-${e.f}`, r: e.f === 'video' ? 3 : 3.4, fill: COLORS[e.f] }, packetLayer);
      packets.push({ c, e, off: k / count, rev: e.both && k % 2 === 1, speed: e.f === 'video' ? 120 : 80, seed: ei });
    }
  });

  let visible = false, last = performance.now(), clock = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    for (const p of packets) {
      let u = (p.off + clock * p.speed / p.e.len) % 1;
      if (p.rev) u = 1 - u;
      const pt = p.e.path.getPointAtLength(u * p.e.len);
      p.c.setAttribute('cx', pt.x); p.c.setAttribute('cy', pt.y);
    }
    const active = Math.floor(clock / 2.6) % MODES.length;
    modeEls.forEach((m, i) => {
      m.r.setAttribute('stroke', i === active ? '#b18cff' : '#2a3442');
      m.r.setAttribute('fill', i === active ? 'rgba(177,140,255,.14)' : 'none');
      m.t.setAttribute('fill', i === active ? '#e7edf4' : '#8d99a8');
    });
    if (visible && !reduceMotion) requestAnimationFrame(tick);
  }
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(tick); }
  }).observe(svg);
  requestAnimationFrame(tick);

  // flow tabs
  root.querySelectorAll('.arch-tabs button').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('.arch-tabs button').forEach(x => x.classList.toggle('is-active', x === b));
    root.dataset.flow = b.dataset.flow;
  }));
  root.dataset.flow = 'all';
})();
