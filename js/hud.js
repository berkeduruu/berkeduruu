// Hero canvas: a scripted replay of the onboard lock-on overlay (scan → detect → ROI track → 4 s lock → report → target escapes).
(() => {
  const canvas = document.getElementById('hud');
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOOP = 12;
  const DETECT_FROM = 2.0, LOCK_FROM = 3.0, LOCK_NEEDED = 4.0, ESCAPE_AT = 9.0, LOST_AT = 10.35;
  // [time, x, y, size] in frame units; size in px at 640 wide.
  const KEYS = [
    [0, 1.25, 0.36, 12], [1.6, 1.08, 0.38, 14], [2.4, 0.8, 0.42, 16], [3.4, 0.6, 0.47, 19],
    [4.6, 0.45, 0.4, 22], [5.8, 0.55, 0.55, 24], [7.0, 0.48, 0.46, 26], [8.2, 0.42, 0.5, 27],
    [9.0, 0.47, 0.44, 26], [9.8, 0.24, 0.3, 20], [10.5, -0.12, 0.17, 15], [12, -0.3, 0.1, 12],
  ];
  const ZONE = { x: 0.25, y: 0.1, w: 0.5, h: 0.8 };
  let W = 0, H = 0, dpr = 1, roi = null, visible = true, start = performance.now();

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  const smooth = k => k * k * (3 - 2 * k);
  function targetAt(t) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = smooth(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))));
    const wob = Math.sin(t * 7.3) * 0.004 + Math.sin(t * 3.1) * 0.006;
    return { x: a[1] + (b[1] - a[1]) * k + wob, y: a[2] + (b[2] - a[2]) * k + wob * 0.8, s: a[3] + (b[3] - a[3]) * k };
  }

  const rollAt = t => Math.sin(t * 0.45) * 0.14 + Math.sin(t * 1.3) * 0.02;
  const headingAt = t => (274 + Math.sin(t * 0.45) * 14 + 360) % 360;

  function drawWorld(t) {
    const roll = rollAt(t);
    const horizon = H * (0.62 + Math.sin(t * 0.3) * 0.04);
    ctx.save();
    ctx.translate(W / 2, horizon);
    ctx.rotate(roll);
    const R = Math.hypot(W, H);
    const sky = ctx.createLinearGradient(0, -H, 0, 0);
    sky.addColorStop(0, '#0f1d29'); sky.addColorStop(1, '#2c4049');
    ctx.fillStyle = sky; ctx.fillRect(-R, -R, 2 * R, R);
    const ground = ctx.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, '#1b2a22'); ground.addColorStop(1, '#0a120d');
    ctx.fillStyle = ground; ctx.fillRect(-R, 0, 2 * R, R);
    // field lines converging to the horizon, drifting with forward motion
    ctx.strokeStyle = 'rgba(120, 170, 130, .13)'; ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(i * 8, 0); ctx.lineTo(i * W * 0.22, R); ctx.stroke(); }
    const phase = (t * 0.6) % 1;
    for (let j = 0; j < 9; j++) {
      const y = Math.pow((j + phase) / 9, 2.2) * H * 0.9;
      ctx.globalAlpha = Math.min(1, y / 40) * 0.5;
      ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(200, 225, 235, .25)';
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
    // haze clouds
    for (let c = 0; c < 4; c++) {
      const cx = ((c * 0.31 + t * 0.012) % 1.4 - 0.7) * W, cy = -H * (0.18 + c * 0.09);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.22);
      g.addColorStop(0, 'rgba(180, 205, 215, .10)'); g.addColorStop(1, 'rgba(180, 205, 215, 0)');
      ctx.fillStyle = g; ctx.fillRect(cx - W * 0.3, cy - W * 0.3, W * 0.6, W * 0.6);
    }
    ctx.restore();
  }

  function drawPlane(x, y, size, heading) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading); ctx.scale(size / 20, size / 20);
    ctx.fillStyle = '#dfe7ee'; ctx.strokeStyle = '#33424e'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(4, -1.2); ctx.lineTo(1, -10); ctx.lineTo(-1.5, -10); ctx.lineTo(-0.5, -1.4);
    ctx.lineTo(-7, -1.2); ctx.lineTo(-9, -4.5); ctx.lineTo(-10.5, -4.5); ctx.lineTo(-9.5, 0);
    ctx.lineTo(-10.5, 4.5); ctx.lineTo(-9, 4.5); ctx.lineTo(-7, 1.2); ctx.lineTo(-0.5, 1.4);
    ctx.lineTo(-1.5, 10); ctx.lineTo(1, 10); ctx.lineTo(4, 1.2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Heading tape (bottom centre) and bank scale (above the crosshair), drawn faintly like a real HUD.
  function drawAttitude(t, k) {
    const hdg = headingAt(t), roll = rollAt(t);
    const tw = Math.min(250, W * 0.42), tx = W / 2 - tw / 2, ty = H - 62, th = 22, pxPerDeg = tw / 60;
    ctx.save();
    ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, .35)'; ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = 'rgba(231, 237, 244, .55)'; ctx.fillStyle = 'rgba(231, 237, 244, .75)';
    ctx.font = `600 ${Math.max(9, 10 * Math.min(1.2, k))}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
    for (let d = Math.floor(hdg - 32); d <= hdg + 32; d++) {
      if (d % 5) continue;
      const x = W / 2 + (d - hdg) * pxPerDeg, major = d % 10 === 0;
      ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x, ty + (major ? 7 : 4)); ctx.stroke();
      if (d % 30 === 0) {
        const v = ((d % 360) + 360) % 360;
        ctx.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[v] ?? String(v / 10).padStart(2, '0'), x, ty + th - 3);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#3be0c4';
    ctx.beginPath(); ctx.moveTo(W / 2 - 5, ty - 6); ctx.lineTo(W / 2 + 5, ty - 6); ctx.lineTo(W / 2, ty + 1); ctx.closePath(); ctx.fill();
    label(`${hdg.toFixed(0).padStart(3, '0')}°`, W / 2 - 14, ty - 9, '#3be0c4', Math.max(10, Math.round(11 * Math.min(1.2, k))));

    // bank scale
    const r = H * 0.2, cx = W / 2, cy = H / 2;
    ctx.strokeStyle = 'rgba(231, 237, 244, .4)'; ctx.lineWidth = 1;
    for (const a of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
      const rad = (a - 90) * Math.PI / 180, len = a % 30 === 0 ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
      ctx.lineTo(cx + Math.cos(rad) * (r - len), cy + Math.sin(rad) * (r - len));
      ctx.stroke();
    }
    const pr = -roll - Math.PI / 2;
    ctx.fillStyle = 'rgba(231, 237, 244, .8)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(pr) * (r - 10), cy + Math.sin(pr) * (r - 10));
    ctx.lineTo(cx + Math.cos(pr + 0.04) * (r - 18), cy + Math.sin(pr + 0.04) * (r - 18));
    ctx.lineTo(cx + Math.cos(pr - 0.04) * (r - 18), cy + Math.sin(pr - 0.04) * (r - 18));
    ctx.closePath(); ctx.fill();
  }

  function label(text, x, y, color, size = 12) {
    ctx.font = `600 ${size}px "JetBrains Mono", monospace`;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0, 0, 0, .72)'; ctx.fillRect(x - 4, y - size - 2, w + 8, size + 7);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    return w;
  }

  function clock(now) {
    const d = new Date(now);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${p(d.getMilliseconds(), 3)}]`;
  }

  function frame(now) {
    const t = reduceMotion ? 6.2 : ((now - start) / 1000) % LOOP;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWorld(t);

    const k = W / 640;
    const tg = targetAt(t), tg2 = targetAt(t + 0.05);
    const px = tg.x * W, py = tg.y * H, size = tg.s * k;
    const heading = Math.atan2((tg2.y - tg.y) * H, (tg2.x - tg.x) * W);
    const inFrame = tg.x > -0.05 && tg.x < 1.05 && tg.y > -0.05 && tg.y < 1.05;
    if (inFrame) drawPlane(px, py, size, heading);

    const detected = inFrame && t >= DETECT_FROM && t < LOST_AT;
    const locking = detected && t >= LOCK_FROM && t < LOCK_FROM + LOCK_NEEDED;
    const confirmed = t >= LOCK_FROM + LOCK_NEEDED && t < ESCAPE_AT + 0.6;
    const lockTime = Math.max(0, Math.min(LOCK_NEEDED, t - LOCK_FROM));
    const coverage = 2.6 + (tg.s - 12) / 15 * 4.2;

    // lock zone
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ZONE.x * W, ZONE.y * H, ZONE.w * W, ZONE.h * H);

    // dynamic ROI follows the target, wide 16:9 box
    if (detected) {
      const rw = W * 0.5, rh = rw * 9 / 16;
      const goal = { x: Math.min(W - rw / 2, Math.max(rw / 2, px)), y: Math.min(H - rh / 2, Math.max(rh / 2, py)) };
      roi = roi ? { x: roi.x + (goal.x - roi.x) * 0.12, y: roi.y + (goal.y - roi.y) * 0.12 } : goal;
      ctx.strokeStyle = '#3b5cff'; ctx.lineWidth = 2;
      ctx.strokeRect(roi.x - rw / 2, roi.y - rh / 2, rw, rh);
    } else roi = null;

    // crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, .55)'; ctx.lineWidth = 1;
    const c = 10 * k + 6;
    ctx.beginPath();
    ctx.moveTo(W / 2 - c, H / 2); ctx.lineTo(W / 2 - c / 3, H / 2); ctx.moveTo(W / 2 + c / 3, H / 2); ctx.lineTo(W / 2 + c, H / 2);
    ctx.moveTo(W / 2, H / 2 - c); ctx.lineTo(W / 2, H / 2 - c / 3); ctx.moveTo(W / 2, H / 2 + c / 3); ctx.lineTo(W / 2, H / 2 + c);
    ctx.stroke();

    if (detected) {
      // line of sight from frame centre to target, then the detection box
      ctx.strokeStyle = 'rgba(255, 255, 255, .8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(px, py); ctx.stroke();
      const bw = size * 2.3, bh = size * 1.25;
      ctx.strokeStyle = confirmed ? '#45d97e' : '#ff3b3b'; ctx.lineWidth = 2;
      ctx.strokeRect(px - bw / 2, py - bh / 2, bw, bh);
      label(`aircraft 0.9${Math.floor(t * 7) % 7 + 2}`, px - bw / 2, py - bh / 2 - 6, '#ff8a8a', 10);
    }

    // OSD
    const fs = Math.max(10, Math.round(12 * Math.min(1.2, k)));
    const mode = detected || confirmed ? 'YOLO' : 'TRANSIT';
    let x = 14, y = 14 + fs;
    x += label(clock(Date.now()), x, y, '#ffffff', fs) + 12;
    label(`FPS: 59 | MODE: ${mode}`, x, y, mode === 'YOLO' ? '#45d97e' : '#ff9f40', fs);
    y += fs + 10;
    if (locking) label(`LOCKING... ${lockTime.toFixed(2)}s | TARGET: ${coverage.toFixed(1)}%`, 14, y, '#ffd84a', fs);
    else if (confirmed) label(`LOCK CONFIRMED  ${LOCK_NEEDED.toFixed(2)}s`, 14, y, '#45d97e', fs);
    else if (!detected) label('SCANNING FULL FRAME', 14, y, '#9fb0c0', fs);

    // lock progress bar
    if (locking || confirmed) {
      const bx = 14, by = y + 10, bw = Math.min(220, W * 0.4);
      ctx.fillStyle = 'rgba(0, 0, 0, .6)'; ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = confirmed ? '#45d97e' : '#ffd84a'; ctx.fillRect(bx, by, bw * lockTime / LOCK_NEEDED, 6);
    }
    if (confirmed) label('POST /api/kilitlenme_bilgisi → 200', 14, y + fs + 22, '#3be0c4', fs);

    drawAttitude(t, k);

    // telemetry, and the steering the line of sight asks for (22.2° × 16.8° camera)
    const alt = 142 + Math.sin(t * 0.7) * 6, spd = detected ? 25 - (coverage - 2.6) / 4.2 * 12 : 22;
    label(`ALT ${alt.toFixed(0)} m  SPD ${spd.toFixed(1)} m/s`, 14, H - 14, '#cfd8e2', fs);
    if (detected) {
      const turn = (px - W / 2) / W * 22.2, climb = (H / 2 - py) / H * 16.8;
      const cmd = `CMD ${turn >= 0 ? 'R' : 'L'} ${Math.abs(turn).toFixed(1)}°  ${climb >= 0 ? 'UP' : 'DN'} ${Math.abs(climb).toFixed(1)}°`;
      ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
      label(cmd, W - 18 - ctx.measureText(cmd).width, H - 14, '#3be0c4', fs);
      // chevron beside the crosshair pointing the way the aircraft is being turned
      const dir = Math.sign(turn) || 1, gx = W / 2 + dir * (c + 8);
      ctx.strokeStyle = '#3be0c4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx, H / 2 - 5); ctx.lineTo(gx + dir * 5, H / 2); ctx.lineTo(gx, H / 2 + 5); ctx.stroke();
    }

    if (!reduceMotion && visible) requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', () => { resize(); if (reduceMotion || !visible) requestAnimationFrame(frame); });
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(canvas);
  requestAnimationFrame(frame);
})();
