// Field section: a top-down replay of one sortie. Distances, speeds, FOV, lock rule and phase logic follow the
// team's ground-station (yki_gorev) and Jetson (jetson_main) code; positions and target scores are simulated.
(() => {
  const canvas = document.getElementById('field-canvas');
  const ctx = canvas.getContext('2d');
  const camCanvas = document.getElementById('field-cam');
  const cctx = camCanvas.getContext('2d');
  const speedBadge = document.getElementById('field-speed');
  const phaseEls = [...document.querySelectorAll('.field-phases li')];
  const logEl = document.getElementById('field-log');
  const T = id => document.getElementById(id);
  const tele = { mode: T('ft-mode'), speed: T('ft-speed'), target: T('ft-target'), range: T('ft-range'), lock: T('ft-lock'), guide: T('ft-guide') };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- rules from the flight code ---
  const PURSUIT_OFFSET = 25;        // m behind the rival, along its own heading
  const LOCK_DISTANCE = 70;         // m: transit speed profile settles here
  const SPD_MIN = 12, SPD_MAX = 22; // m/s
  const SPEED_SLEW = 3;             // m/s² (Jetson SPEED_SLEW)
  const BBOX_FAR = 1, BBOX_MATCH = 6, BBOX_NEAR = 7; // % of frame: full speed / match the rival / slowest
  const HALF_FOV = 22.2 / 2 * Math.PI / 180;
  const CAMERA_RANGE = 160;         // m at which the detector reliably sees a fixed-wing target
  const TRACK_GATE = 1.6;           // dynamic ROI + tracker hold the target a little past the raw FOV edge
  const LOCK_RANGE = 90;            // m: box is ≥5% of the frame from here in
  const LOCK_NEEDED = 4.0, LOCK_TOLERANCE = 0.2, COAST_MAX = 0.8;
  const TURN_RATE = 0.5;            // rad/s, ~45° bank at 20 m/s
  const HSS_RADIUS_MULT = 1.4, HSS_MARGIN = 25, HSS_THRESHOLD = 0.8;
  const MODE = { standby: '4 · STANDBY', transit: '0 · TRANSIT', camera: '1 · YOLO', report: '1 · YOLO', select: '0 · TRANSIT', hss: '3 · HSS AVOID' };

  // --- the field (metres) ---
  const W = 1200, H = 760;
  const FENCE = [[90, 60], [1110, 50], [1150, 360], [1070, 640], [190, 650], [60, 380]];
  const HSS = [{ x: 525, y: 255, r: 58, name: 'HSS-1' }, { x: 340, y: 590, r: 52, name: 'HSS-2' }];
  const GCS = { x: 150, y: 714 }, SERVER = { x: 330, y: 714 };
  const RIVALS = [
    { id: 'T2', cx: 830, cy: 210, rx: 220, ry: 110, dir: 1, v: 15, u: 0.4 },
    { id: 'T5', cx: 760, cy: 500, rx: 250, ry: 95, dir: -1, v: 16, u: 2.2 },
    { id: 'T7', cx: 300, cy: 330, rx: 140, ry: 190, dir: 1, v: 14, u: 4.1 },
  ].map(r => ({ ...r, x: 0, y: 0, hdg: 0, trail: [], locked: false }));

  const me = { x: 640, y: 600, hdg: Math.PI, v: 16, trail: [] };
  let phase = 'standby', phaseT = 0, target = null, lockT = 0, gapT = 0, unseenT = 0, seenT = 0;
  let simT = 0, hssActive = false, hssName = '', lastTrail = 0, pulses = [], lastPulse = 0, lastServerPulse = 0;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtT = s => `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function log(html) {
    const li = document.createElement('li');
    li.innerHTML = `<time>${fmtT(simT)}</time>${html}`;
    logEl.prepend(li);
    while (logEl.children.length > 6) logEl.lastChild.remove();
  }

  function setPhase(p) {
    phase = p; phaseT = 0;
  }

  // --- rivals fly closed loops at constant speed ---
  function stepRival(r, dt) {
    const dx = -r.rx * Math.sin(r.u), dy = r.ry * Math.cos(r.u);
    r.u += r.dir * r.v * dt / Math.hypot(dx, dy);
    r.x = r.cx + r.rx * Math.cos(r.u); r.y = r.cy + r.ry * Math.sin(r.u);
    r.hdg = Math.atan2(r.dir * r.ry * Math.cos(r.u), r.dir * -r.rx * Math.sin(r.u));
  }

  // --- potential field: HSS circles and the fence push the aircraft away ---
  function repulsion() {
    let fx = 0, fy = 0, worst = 0, name = '';
    for (const z of HSS) {
      const d = Math.hypot(me.x - z.x, me.y - z.y), reach = z.r * HSS_RADIUS_MULT + HSS_MARGIN;
      if (d >= reach) continue;
      const k = 3 * (reach - d) / (reach - z.r * 0.6);
      fx += (me.x - z.x) / d * k; fy += (me.y - z.y) / d * k;
      if (k > worst) { worst = k; name = z.name; }
    }
    for (let i = 0; i < FENCE.length; i++) {
      const [ax, ay] = FENCE[i], [bx, by] = FENCE[(i + 1) % FENCE.length];
      const t = clamp(((me.x - ax) * (bx - ax) + (me.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1);
      const px = ax + t * (bx - ax), py = ay + t * (by - ay), d = Math.hypot(me.x - px, me.y - py);
      if (d < 70) {
        // inward normal: rotate the edge direction towards the field centre
        let nx = -(by - ay), ny = bx - ax; const n = Math.hypot(nx, ny); nx /= n; ny /= n;
        if ((600 - px) * nx + (360 - py) * ny < 0) { nx = -nx; ny = -ny; }
        const k = 2.5 * (70 - d) / 70; fx += nx * k; fy += ny * k;
      }
    }
    return { fx, fy, worst, name };
  }

  function score(r) {
    const d = dist(me, r);
    const bearing = Math.atan2(r.y - me.y, r.x - me.x);
    const rel = Math.abs(wrap(bearing - me.hdg)), hd = Math.abs(wrap(r.hdg - me.hdg));
    return Math.exp(-d / 450) * (0.55 + 0.45 * Math.cos(rel)) * (0.7 + 0.3 * Math.cos(hd));
  }

  function selectTarget() {
    let open = RIVALS.filter(r => !r.locked);
    if (!open.length) {
      RIVALS.forEach(r => { r.locked = false; });
      log('All rivals locked once · blacklist reset');
      open = RIVALS;
    }
    const scored = RIVALS.map(r => ({ r, s: r.locked ? null : score(r) }));
    const best = scored.filter(x => x.s !== null).sort((a, b) => b.s - a.s)[0];
    const max = best.s;
    log('Score ' + scored.map(x => x.s === null ? `<s>${x.r.id}</s>` : `${x.r.id} ${(x.s / max * 0.86).toFixed(2)}`).join(' · ') + ` → <b>${best.r.id}</b>`);
    target = best.r; lockT = 0; gapT = 0; unseenT = 0; seenT = 0;
    setPhase('transit');
    log(`Transit to <b>${target.id}</b> · DO_REPOSITION ${PURSUIT_OFFSET} m behind it`);
  }

  function inCamera(r) {
    const d = dist(me, r), rel = wrap(Math.atan2(r.y - me.y, r.x - me.x) - me.hdg);
    return {
      d, rel,
      seen: Math.abs(rel) < HALF_FOV && d < CAMERA_RANGE,
      tracked: Math.abs(rel) < HALF_FOV * TRACK_GATE && d < CAMERA_RANGE * 1.2,
      inZone: Math.abs(rel) < HALF_FOV * 0.5 && d < LOCK_RANGE, // yellow box: the middle half of the frame
    };
  }

  function boxPercent(d) { return clamp(7 * (40 / d) ** 2, 0.2, 12); }
  // far → SPD_MAX, at BBOX_MATCH → the rival's speed, at BBOX_NEAR and closer → SPD_MIN
  function bboxSpeed(pct, rivalSpeed) {
    if (pct <= BBOX_FAR) return SPD_MAX;
    if (pct <= BBOX_MATCH) return SPD_MAX + (pct - BBOX_FAR) / (BBOX_MATCH - BBOX_FAR) * (rivalSpeed - SPD_MAX);
    return clamp(rivalSpeed + (pct - BBOX_MATCH) / (BBOX_NEAR - BBOX_MATCH) * (SPD_MIN - rivalSpeed), SPD_MIN, SPD_MAX);
  }

  function step(dt) {
    simT += dt; phaseT += dt;
    RIVALS.forEach(r => stepRival(r, dt));

    let goal = null, cmdSpeed = me.v;
    if (phase === 'standby') {
      // loiter on the standby circle until the panel sets a mission mode
      const c = { x: 640, y: 560 }, a = Math.atan2(me.y - c.y, me.x - c.x) + 0.5;
      goal = { x: c.x + 70 * Math.cos(a), y: c.y + 70 * Math.sin(a) }; cmdSpeed = 16;
      if (phaseT > 3) { log('Panel → MOD 0 · autonomous target hunt'); setPhase('select'); }
    } else if (phase === 'select') {
      selectTarget();
    }
    if (phase === 'transit' || phase === 'camera') {
      const cam = inCamera(target);
      if (phase === 'transit') {
        goal = { x: target.x - Math.cos(target.hdg) * PURSUIT_OFFSET, y: target.y - Math.sin(target.hdg) * PURSUIT_OFFSET };
        const d = dist(me, goal);
        cmdSpeed = clamp(target.v + (d > LOCK_DISTANCE ? 0.06 * (d - LOCK_DISTANCE) : -0.2 * (LOCK_DISTANCE - d)), SPD_MIN, SPD_MAX);
        seenT = cam.seen ? seenT + dt : 0;
        if (seenT > 0.15) { setPhase('camera'); log(`<b>${target.id}</b> in frame · Jetson takes guidance at 10 Hz`); }
      } else {
        // the camera owns guidance: pixel → line of sight → waypoint projected along it, speed from box size
        const los = Math.atan2(target.y - me.y, target.x - me.x);
        goal = { x: me.x + Math.cos(los) * 120, y: me.y + Math.sin(los) * 120 };
        cmdSpeed = bboxSpeed(boxPercent(cam.d), target.v);
        unseenT = cam.tracked ? 0 : unseenT + dt;
        if (cam.inZone) { lockT += dt; gapT = 0; } else gapT += dt;
        if (gapT > LOCK_TOLERANCE) lockT = 0;
        if (unseenT > COAST_MAX) { setPhase('transit'); seenT = 0; log('Track lost for 0.8 s · back to transit'); }
        if (lockT >= LOCK_NEEDED) {
          target.locked = true;
          log(`<b>LOCK 4.00 s</b> on ${target.id} · POST /api/kilitlenme_bilgisi → 200`);
          log(`${target.id} → blacklist · breaking away`);
          setPhase('report');
        }
      }
    }
    if (phase === 'report') {
      goal = { x: me.x + Math.cos(me.hdg + 0.9) * 200, y: me.y + Math.sin(me.hdg + 0.9) * 200 }; cmdSpeed = SPD_MAX;
      if (phaseT > 2.5) setPhase('select');
    }
    if (!goal) return;

    // steer: attraction to the goal plus repulsion, limited turn rate and speed slew
    const rep = repulsion();
    const gx = goal.x - me.x, gy = goal.y - me.y, gl = Math.hypot(gx, gy) || 1;
    const wasActive = hssActive;
    hssActive = rep.worst > HSS_THRESHOLD; hssName = rep.name;
    if (hssActive && !wasActive) log(`${hssName} ahead · potential-field escape waypoint`);
    const want = Math.atan2(gy / gl + rep.fy, gx / gl + rep.fx);
    me.hdg = wrap(me.hdg + clamp(wrap(want - me.hdg), -TURN_RATE * dt, TURN_RATE * dt));
    me.v += clamp(cmdSpeed - me.v, -SPEED_SLEW * dt, SPEED_SLEW * dt);
    me.x += Math.cos(me.hdg) * me.v * dt; me.y += Math.sin(me.hdg) * me.v * dt;

    if (simT - lastTrail > 0.4) {
      lastTrail = simT;
      for (const a of [me, ...RIVALS]) { a.trail.push([a.x, a.y]); if (a.trail.length > 70) a.trail.shift(); }
    }
    // link traffic: video + data link to the ground every ~0.3 s, telemetry to the server every second
    if (simT - lastPulse > 0.3) {
      lastPulse = simT;
      pulses.push({ from: me, to: GCS, c: '#3be0c4', t: 0, dur: 1.2 });
      pulses.push({ from: GCS, to: me, c: '#ffb02e', t: 0, dur: 1.2 });
    }
    if (simT - lastServerPulse > 1) {
      lastServerPulse = simT;
      pulses.push({ from: GCS, to: SERVER, c: '#b18cff', t: 0, dur: 0.8 });
      pulses.push({ from: SERVER, to: GCS, c: '#b18cff', t: 0, dur: 0.8, delay: 0.4 });
      RIVALS.forEach(r => pulses.push({ from: { x: r.x, y: r.y }, to: SERVER, c: 'rgba(177,140,255,.45)', t: 0, dur: 1.6 }));
    }
    pulses.forEach(p => { p.t += dt; });
    pulses = pulses.filter(p => p.t < p.dur + (p.delay || 0));
  }

  // --- drawing ---
  let S = 1, CW = 0, CH = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    CW = canvas.clientWidth; CH = CW * H / W; S = CW / W;
    canvas.style.height = `${CH}px`;
    canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CH * dpr);
  }
  const X = v => v * S;

  function plane(x, y, hdg, size, fill) {
    ctx.save(); ctx.translate(X(x), X(y)); ctx.rotate(hdg); ctx.scale(size / 20, size / 20);
    ctx.fillStyle = fill; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(3, -1.6); ctx.lineTo(0, -11); ctx.lineTo(-3, -11); ctx.lineTo(-2, -1.6); ctx.lineTo(-8, -1.4);
    ctx.lineTo(-10, -5); ctx.lineTo(-12, -5); ctx.lineTo(-11, 0); ctx.lineTo(-12, 5); ctx.lineTo(-10, 5); ctx.lineTo(-8, 1.4);
    ctx.lineTo(-2, 1.6); ctx.lineTo(-3, 11); ctx.lineTo(0, 11); ctx.lineTo(3, 1.6); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function trail(a, color) {
    if (a.trail.length < 2) return;
    ctx.lineWidth = Math.max(1, 1.5 * S);
    for (let i = 1; i < a.trail.length; i++) {
      ctx.strokeStyle = color.replace('A', (i / a.trail.length * 0.5).toFixed(2));
      ctx.beginPath(); ctx.moveTo(X(a.trail[i - 1][0]), X(a.trail[i - 1][1])); ctx.lineTo(X(a.trail[i][0]), X(a.trail[i][1])); ctx.stroke();
    }
  }
  function text(str, x, y, color, size = 12, align = 'left', weight = 600) {
    ctx.font = `${weight} ${Math.max(9, size * Math.min(1, S * 1.15))}px "JetBrains Mono", monospace`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(str, X(x), X(y));
  }

  function drawCamera() {
    const w = camCanvas.clientWidth, h = w * 0.75;
    camCanvas.style.height = `${h}px`;
    if (camCanvas.width !== Math.round(w * dpr)) { camCanvas.width = Math.round(w * dpr); camCanvas.height = Math.round(h * dpr); }
    const c = cctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // horizon rolls with the turn rate
    const bank = clamp(wrap(me.hdg - (me.prevHdg ?? me.hdg)) * 40, -0.5, 0.5);
    c.save(); c.translate(w / 2, h * 0.62); c.rotate(-bank);
    const sky = c.createLinearGradient(0, -h, 0, 0); sky.addColorStop(0, '#15283a'); sky.addColorStop(1, '#4b6573');
    c.fillStyle = sky; c.fillRect(-w, -h * 1.5, w * 2, h * 1.5);
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2c3a26'); gr.addColorStop(1, '#151d12');
    c.fillStyle = gr; c.fillRect(-w, 0, w * 2, h);
    c.restore();
    c.strokeStyle = '#ffd84a'; c.lineWidth = 1.2; c.strokeRect(w * 0.25, h * 0.1, w * 0.5, h * 0.8);
    let status = 'TRANSIT · NO TARGET', color = '#ff9f40';
    if (target && phase !== 'standby') {
      const cam = inCamera(target);
      if (Math.abs(cam.rel) < HALF_FOV * 1.8 && cam.d < 320) {
        const sx = w / 2 + cam.rel / HALF_FOV * w / 2, sy = h * 0.46 + Math.sin(simT * 1.7) * h * 0.03;
        const size = clamp(900 / cam.d, 2, 34) * w / 260;
        c.save(); c.translate(sx, sy); c.rotate(wrap(target.hdg - me.hdg) * 0.4);
        c.fillStyle = '#e3eaf0'; c.fillRect(-size, -size * 0.12, size * 2, size * 0.24); c.fillRect(-size * 0.18, -size * 0.5, size * 0.36, size);
        c.restore();
        if (phase === 'camera') {
          c.strokeStyle = 'rgba(91,132,255,.9)'; c.lineWidth = 1.4;
          c.strokeRect(clamp(sx - w * 0.22, 0, w * 0.56), clamp(sy - h * 0.2, 0, h * 0.6), w * 0.44, h * 0.4);
          c.strokeStyle = lockT > 0 ? '#ff3b3b' : '#ff7b7b'; c.lineWidth = 1.6;
          c.strokeRect(sx - size * 1.3, sy - size * 0.7, size * 2.6, size * 1.4);
          c.strokeStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(sx, sy); c.stroke();
          const pct = boxPercent(cam.d);
          status = lockT > 0 ? `LOCKING ${lockT.toFixed(2)}s | ${pct.toFixed(1)}%` : `TRACKING | ${pct.toFixed(1)}%`;
          color = '#ffd84a';
        }
      }
      if (phase === 'report') { status = 'LOCK CONFIRMED'; color = '#45d97e'; }
    } else status = 'STANDBY';
    const fs = Math.max(10, w / 24);
    c.font = `600 ${fs}px "JetBrains Mono", monospace`; c.textAlign = 'left';
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(6, 6, w - 12, fs + 8);
    c.fillStyle = color; c.fillText(status, 10, 10 + fs);
    if (phase === 'camera' || phase === 'report') {
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(10, 18 + fs, w * 0.5, 5);
      c.fillStyle = phase === 'report' ? '#45d97e' : '#ffd84a'; c.fillRect(10, 18 + fs, w * 0.5 * (phase === 'report' ? 1 : lockT / LOCK_NEEDED), 5);
    }
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(6, h - fs - 12, w * 0.72, fs + 6);
    c.fillStyle = '#cfd8e2'; c.fillText('ONBOARD CAMERA · 22.2° FOV', 10, h - 10);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, CW, CH);
    // 100 m grid
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 100) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), X(670)); ctx.stroke(); }
    for (let y = 0; y <= 670; y += 100) { ctx.beginPath(); ctx.moveTo(0, X(y)); ctx.lineTo(CW, X(y)); ctx.stroke(); }
    // fence
    ctx.setLineDash([6 * S + 2, 6 * S + 2]); ctx.strokeStyle = 'rgba(141,153,168,.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); FENCE.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), X(y)) : ctx.moveTo(X(x), X(y)))); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    text('FIELD LIMIT · /api/fences', 1100, 74, 'rgba(141,153,168,.8)', 11, 'right');
    // HSS zones
    for (const z of HSS) {
      ctx.fillStyle = 'rgba(255,77,94,.14)'; ctx.strokeStyle = 'rgba(255,77,94,.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(X(z.x), X(z.y), X(z.r), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255,77,94,.35)';
      ctx.beginPath(); ctx.arc(X(z.x), X(z.y), X(z.r * HSS_RADIUS_MULT + HSS_MARGIN), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      text(z.name, z.x, z.y + 4, 'rgba(255,140,150,.95)', 11, 'center');
    }
    // ground strip
    ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(0, X(680), CW, CH - X(680));
    // links
    ctx.setLineDash([2, 6]); ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(59,224,196,.22)'; ctx.beginPath(); ctx.moveTo(X(me.x), X(me.y)); ctx.lineTo(X(GCS.x), X(GCS.y)); ctx.stroke();
    ctx.strokeStyle = 'rgba(177,140,255,.3)'; ctx.beginPath(); ctx.moveTo(X(GCS.x), X(GCS.y)); ctx.lineTo(X(SERVER.x), X(SERVER.y)); ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pulses) {
      const k = (p.t - (p.delay || 0)) / p.dur; if (k < 0 || k > 1) continue;
      const fx = p.from.x, fy = p.from.y, tx = p.to.x, ty = p.to.y;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(X(fx + (tx - fx) * k), X(fy + (ty - fy) * k), Math.max(1.5, 2.6 * S), 0, Math.PI * 2); ctx.fill();
    }
    // trails and aircraft
    RIVALS.forEach(r => trail(r, r.locked ? 'rgba(141,153,168,A)' : 'rgba(177,140,255,A)'));
    trail(me, 'rgba(59,224,196,A)');
    for (const r of RIVALS) {
      const isTarget = r === target && (phase === 'transit' || phase === 'camera');
      plane(r.x, r.y, r.hdg, 26 * Math.max(.8, S), r.locked ? '#59636f' : '#c9b6ff');
      text(r.locked ? `${r.id} ✓` : r.id, r.x, r.y - 22, r.locked ? '#7d8896' : '#c9b6ff', 11, 'center');
      if (isTarget) {
        ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(X(r.x), X(r.y), X(26) + 3 * Math.sin(simT * 6), 0, Math.PI * 2); ctx.stroke();
        if (phase === 'transit') {
          const gx = r.x - Math.cos(r.hdg) * PURSUIT_OFFSET, gy = r.y - Math.sin(r.hdg) * PURSUIT_OFFSET;
          ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(X(gx), X(gy), 3, 0, Math.PI * 2); ctx.fill();
          ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,176,46,.6)';
          ctx.beginPath(); ctx.moveTo(X(me.x), X(me.y)); ctx.lineTo(X(gx), X(gy)); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    // camera cone
    ctx.fillStyle = phase === 'camera' ? 'rgba(255,216,74,.16)' : 'rgba(59,224,196,.1)';
    ctx.beginPath(); ctx.moveTo(X(me.x), X(me.y));
    ctx.arc(X(me.x), X(me.y), X(CAMERA_RANGE), me.hdg - HALF_FOV, me.hdg + HALF_FOV); ctx.closePath(); ctx.fill();
    plane(me.x, me.y, me.hdg, 30 * Math.max(.8, S), '#3be0c4');
    text('ANAFARTA', me.x, me.y + 30, '#3be0c4', 11, 'center', 700);
    // ground station and server
    ctx.fillStyle = '#151b25'; ctx.strokeStyle = '#3be0c4'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(GCS.x - 22), X(GCS.y + 14)); ctx.lineTo(X(GCS.x), X(GCS.y - 14)); ctx.lineTo(X(GCS.x + 22), X(GCS.y + 14)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(GCS.x), X(GCS.y - 14)); ctx.lineTo(X(GCS.x), X(GCS.y - 32)); ctx.stroke();
    text('GROUND STATION', GCS.x + 30, GCS.y + 4, '#cfd8e2', 11);
    ctx.strokeStyle = '#b18cff'; ctx.strokeRect(X(SERVER.x - 12), X(SERVER.y - 14), X(24), X(28));
    [-6, 0, 6].forEach(o => { ctx.beginPath(); ctx.moveTo(X(SERVER.x - 8), X(SERVER.y + o)); ctx.lineTo(X(SERVER.x + 8), X(SERVER.y + o)); ctx.stroke(); });
    text('COMPETITION SERVER', SERVER.x + 22, SERVER.y + 4, '#cfd8e2', 11);
    text(fmtT(simT), 1180, 742, 'rgba(207,216,226,.7)', 11, 'right');
  }

  function updatePanel() {
    const current = hssActive ? 'hss' : phase;
    phaseEls.forEach(li => {
      li.classList.toggle('is-active', li.dataset.phase === phase || (li.dataset.phase === 'hss' && hssActive));
    });
    tele.mode.textContent = hssActive ? MODE.hss : MODE[phase];
    tele.speed.textContent = `${me.v.toFixed(1)} m/s`;
    tele.target.textContent = target && phase !== 'standby' ? target.id : '–';
    tele.range.textContent = target && phase !== 'standby' ? `${dist(me, target).toFixed(0)} m` : '–';
    tele.lock.textContent = phase === 'camera' ? `${lockT.toFixed(1)} / 4.0 s` : phase === 'report' ? '4.0 / 4.0 s ✓' : '–';
    tele.guide.textContent = current === 'hss' ? 'GCS · escape wp' : phase === 'camera' ? 'Jetson · 10 Hz' : phase === 'standby' ? 'Autopilot · AUTO' : 'GCS · reposition';
  }

  // --- loop: transit is fast-forwarded, the camera phase runs close to real time ---
  let running = false, last = 0;
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000); last = now;
    const scale = phase === 'camera' || phase === 'report' ? 1.5 : 6;
    speedBadge.textContent = `time ×${scale}`;
    const n = Math.ceil(scale);
    me.prevHdg = me.hdg;
    for (let i = 0; i < n; i++) step(realDt * scale / n);
    draw(); drawCamera(); updatePanel();
    if (running) requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', () => { resize(); draw(); drawCamera(); });
  log('POST /api/giris → 200 · session token');
  log('GET /api/hss_koordinatlari → 2 zones');
  RIVALS.forEach(r => stepRival(r, 0));
  if (reduceMotion) {
    for (let i = 0; i < 900; i++) step(0.05);
    draw(); drawCamera(); updatePanel(); return;
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    if (!e.isIntersecting) running = false;
  }, { threshold: 0.15 }).observe(canvas);
  draw(); drawCamera(); updatePanel();
})();
