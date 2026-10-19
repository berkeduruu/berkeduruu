// Operations section: an illustrative order board. Orders arrive from four channels and move through the shared workflow.
(() => {
  const board = document.getElementById('ops-board');
  const stacks = [...board.querySelectorAll('.ops-stack')];
  const log = board.querySelector('.ops-log');
  const roles = Object.fromEntries([...board.querySelectorAll('[data-role]')].map(r => [r.dataset.role, r]));
  const channels = Object.fromEntries([...board.querySelectorAll('[data-ch]')].map(c => [c.dataset.ch, c]));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CH = { counter: 'STORE', web: 'WEB', whatsapp: 'WA', email: 'MAIL' };
  const JOBS = [
    ['Thesis · 84 pp · A4 · B/W', 310], ['Business cards ×500', 450], ['Poster · A2 · colour', 180],
    ['Lecture notes · 120 pp', 240], ['Invitations ×150', 520], ['CV · 2 pp · colour', 30],
    ['Banner · 2×1 m', 650], ['Report · spiral binding', 140], ['Photo prints ×24', 120], ['Menu cards ×40 · laminated', 380],
  ];
  const STAGE_EVENT = [
    (t) => ['service', `Customer service · order <b>${t.id}</b> created from ${CH[t.ch]}`],
    (t) => ['prep', `Document prep · files checked for <b>${t.id}</b>`],
    (t) => { t.tags.push(['price', `₺${t.price}`]); return ['service', `Pricing · quote ₺${t.price} sent for <b>${t.id}</b>`]; },
    (t) => { t.tags.push(['paid', 'paid']); return ['cashier', `Cashier · payment received for <b>${t.id}</b>`]; },
    (t) => { const p = `P${1 + (t.n % 3)}`; t.tags.push(['', p]); return ['prep', `Production · <b>${t.id}</b> sent to printer ${p}`]; },
    (t) => { t.tags.push(['done', 'ready']); return ['service', `Dispatch · <b>${t.id}</b> ready for pickup`]; },
  ];

  let tickets = [], serial = 1040, timer = null;

  const render = t => {
    t.el.innerHTML = `<span class="id">#${t.id}</span><span class="ch">${CH[t.ch]}</span><span class="job">${t.job}</span>` +
      (t.tags.length ? `<span class="tags">${t.tags.map(([c, v]) => `<i class="${c}">${v}</i>`).join('')}</span>` : '');
  };

  const moveWithFlip = (t, stack) => {
    const others = tickets.filter(x => x !== t);
    const before = new Map([t, ...others].map(x => [x, x.el.getBoundingClientRect()]));
    stack.appendChild(t.el);
    for (const [x, r] of before) {
      const now = x.el.getBoundingClientRect();
      const dx = r.left - now.left, dy = r.top - now.top;
      if (!dx && !dy) continue;
      x.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  };

  const clock = () => new Date().toTimeString().slice(0, 8);
  const event = ([role, html]) => {
    const li = document.createElement('li');
    li.innerHTML = `<time>${clock()}</time>${html}`;
    log.prepend(li);
    while (log.children.length > 4) log.lastChild.remove();
    for (const r of [role, 'admin']) {
      roles[r].classList.remove('flash'); void roles[r].offsetWidth; roles[r].classList.add('flash');
      setTimeout(() => roles[r].classList.remove('flash'), 700);
    }
    updateCounts();
  };

  const updateCounts = () => {
    const count = s => tickets.filter(t => s.includes(t.stage)).length;
    roles.service.querySelector('b').textContent = count([0, 2, 5]);
    roles.prep.querySelector('b').textContent = count([1, 4]);
    roles.cashier.querySelector('b').textContent = count([3]);
    roles.admin.querySelector('b').textContent = tickets.length;
  };

  const spawn = () => {
    const ch = Object.keys(CH)[Math.floor(Math.random() * 4)];
    const [job, price] = JOBS[serial % JOBS.length];
    const t = { id: `A-${serial}`, n: serial++, ch, job, price, stage: 0, tags: [], age: 0, el: document.createElement('div') };
    t.el.className = 'ticket enter'; t.el.dataset.ch = ch;
    render(t);
    stacks[0].appendChild(t.el);
    tickets.push(t);
    channels[ch].classList.add('ping'); setTimeout(() => channels[ch].classList.remove('ping'), 800);
    event(STAGE_EVENT[0](t));
  };

  const advance = t => {
    t.stage++; t.age = 0;
    const ev = STAGE_EVENT[t.stage](t);
    render(t);
    moveWithFlip(t, stacks[t.stage]);
    event(ev);
  };

  const finish = t => {
    t.el.classList.add('leave');
    tickets = tickets.filter(x => x !== t);
    setTimeout(() => t.el.remove(), 520);
  };

  const step = () => {
    tickets.forEach(t => t.age++);
    const done = tickets.find(t => t.stage === 5 && t.age > 2);
    if (done) return finish(done);
    const laneCount = s => tickets.filter(t => t.stage === s).length;
    const movable = tickets.filter(t => t.stage < 5 && laneCount(t.stage + 1) < 3 && t.age > 0).sort((a, b) => b.age - a.age);
    if ((tickets.length < 8 && laneCount(0) < 3 && Math.random() < 0.42) || !movable.length) {
      if (laneCount(0) < 3) spawn();
      return;
    }
    advance(movable[0]);
  };

  // seed a board that already looks busy
  for (let i = 0; i < 6; i++) spawn();
  [[0, 5], [1, 4], [2, 3], [3, 2], [4, 1]].forEach(([i, s]) => {
    const t = tickets[i];
    while (t.stage < s) { t.stage++; STAGE_EVENT[t.stage](t); }
    render(t); stacks[t.stage].appendChild(t.el);
  });
  log.innerHTML = '';
  updateCounts();

  if (reduceMotion) return;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !timer) timer = setInterval(step, 1300);
    if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
  }, { threshold: 0.2 }).observe(board);
})();
