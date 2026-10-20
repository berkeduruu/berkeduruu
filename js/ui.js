// Operations section: a guided tour of the PrintOS screens. Each screen is a scaled-down mock of the real layout, driven by a scripted cursor.
(() => {
  const root = document.getElementById('ui-tour');
  const viewport = root.querySelector('.ui-viewport');
  const win = root.querySelector('.ui-win');
  const stage = root.querySelector('.ui-stage');
  const tabsEl = root.querySelector('.ui-tabs');
  const titleEl = root.querySelector('.ui-wtitle');
  const cursor = root.querySelector('.ui-cursor');
  const capRole = root.querySelector('.ui-cap-role');
  const capTitle = root.querySelector('.ui-cap-title');
  const capText = root.querySelector('.ui-cap-text');
  const capChips = root.querySelector('.ui-cap-chips');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 960, HOLD_MS = 2600, STALE = Symbol('stale');

  // scale the fixed 960 × 600 window to the column width
  let scale = 1;
  new ResizeObserver(() => {
    scale = viewport.clientWidth / W;
    win.style.transform = `scale(${scale})`;
  }).observe(viewport);

  // --- scripting helpers ---
  let token = 0, screenEl = null;
  const sleep = (ms, t) => new Promise((res, rej) => setTimeout(() => (t === token ? res() : rej(STALE)), ms));
  const q = sel => (typeof sel === 'string' ? screenEl.querySelector(sel) : sel);
  const pos = (sel, dx = 0, dy = 0) => {
    const r = q(sel).getBoundingClientRect(), w = win.getBoundingClientRect();
    return [(r.left - w.left + r.width / 2) / scale + dx, (r.top - w.top + r.height / 2) / scale + dy];
  };
  const moveTo = async (sel, t, { dur = 650, dx = 0, dy = 0 } = {}) => {
    const [x, y] = pos(sel, dx, dy);
    cursor.style.transitionDuration = `${dur}ms`;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    await sleep(dur + 60, t);
  };
  const click = async (sel, t, opts) => {
    await moveTo(sel, t, opts);
    const el = q(sel);
    cursor.classList.add('down');
    el.classList.add('ui-press');
    const ring = document.createElement('i');
    ring.className = 'ui-ripple';
    cursor.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
    await sleep(170, t);
    cursor.classList.remove('down');
    el.classList.remove('ui-press');
  };
  const phase = (p) => { screenEl.firstElementChild.dataset.phase = p; };
  const money = v => '₺' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const countTo = (sel, from, to, dur = 900, fmt = money) => {
    const el = q(sel), t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const printer = (paper) => `<svg viewBox="0 0 120 90" class="k-printer" aria-hidden="true">
    <rect x="34" y="6" width="52" height="26" rx="2" fill="#f4f6f9" stroke="#cdd5df"/>
    <rect x="14" y="26" width="92" height="34" rx="7" fill="#e9edf2" stroke="#c4ccd6"/>
    <rect x="14" y="48" width="92" height="22" rx="5" fill="#2c3543"/>
    <rect x="80" y="32" width="16" height="6" rx="2" fill="#2c3543"/><circle cx="84" cy="35" r="1.5" fill="#3be0c4"/>
    <g transform="translate(26 56) skewX(-14)">${paper}</g></svg>`;
  const PAPER = {
    bw: '<rect width="58" height="28" fill="#fff" stroke="#ccc"/><path d="M6 22L22 6l10 10 8-8 12 14z" fill="#333"/><circle cx="46" cy="9" r="4" fill="#777"/>',
    col: '<rect width="58" height="28" fill="#fff"/><path d="M0 28L28 0h10L10 28z" fill="#00b4d8"/><path d="M10 28L38 0h10L20 28z" fill="#e5398f"/><path d="M20 28L48 0h10L30 28z" fill="#ffc21a"/><path d="M30 28L58 0v10L40 28z" fill="#ff7b29"/>',
    heavy: '<rect y="6" width="58" height="22" fill="#ff7b29"/><rect y="3" width="58" height="22" fill="#00b4d8"/><rect width="58" height="22" fill="#fff"/><path d="M0 22L22 0h10L10 22z" fill="#e5398f"/><path d="M10 22L32 0h10L20 22z" fill="#ffc21a"/><path d="M20 22L42 0h10L30 22z" fill="#00b4d8"/>',
  };

  const SCREENS = [
    {
      tab: 'Kiosk', title: 'PrintOS · Kiosk',
      role: 'Self-service kiosk · touch screen',
      head: 'From file to priced order in three steps',
      text: 'Customers pick a product, drop their files, choose print options and see exactly how the price was worked out. Office files are converted to PDF on the spot, and the order goes straight to the cashier.',
      chips: ['15+ file formats', 'Office → PDF', 'WhatsApp file import', 'Price breakdown', 'AI design panel'],
      html: `<div class="k" data-phase="home">
        <header class="k-head">
          <span class="k-logo"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><b class="k-brand">PRINT SHOP</b>
          <div class="k-prod"><button class="k-btn ghost">‹ Back</button><div><small>PRODUCT SCREEN</small><b>Black &amp; white print</b></div></div>
          <span class="sp"></span>
          <button class="k-btn wa">WhatsApp</button><button class="k-btn ghost">Help ?</button><button class="k-btn yellow k-neworder">New order</button>
        </header>
        <div class="k-home">
          <div class="k-grid">
            <div class="k-card k-bw">${printer(PAPER.bw)}<b>Black &amp; white print</b></div>
            <div class="k-card">${printer(PAPER.col)}<b>Colour print</b></div>
            <div class="k-card">${printer(PAPER.heavy)}<b>Heavy-paper colour</b></div>
          </div>
          <div class="k-design"><span class="k-spark">✦</span><b>Prepare your design here</b><p>Create an image and send it to print.</p><button class="k-btn yellow">Create design →</button></div>
        </div>
        <div class="k-flow">
          <ol class="k-steps"><li class="s1"><i>1</i>Upload your file</li><li class="s2"><i>2</i>Print options</li><li class="s3"><i>3</i>Review order</li></ol>
          <div class="k-panes">
            <div class="k-pane k-p1">
              <div class="k-files">
                <div class="k-files-h"><b>Uploaded files</b><span><button class="k-btn wa sm">From WhatsApp</button><button class="k-btn outline sm">+ Add file</button></span></div>
                <div class="k-file f1"><span class="ic pdf">PDF</span><div><b>thesis_final.pdf</b><small>84 pages · A4</small></div><em>Ready</em></div>
                <div class="k-file f2"><span class="ic ppt">PPT</span><div><b>slides.pptx</b><small class="k-f2s">converting…</small></div><em class="k-conv">Converting to PDF</em></div>
              </div>
              <div class="k-drop"><div><span class="k-up">⬆</span><b>Drop your file here</b><small>PDF, Word, PowerPoint, JPEG, PNG, TIFF, HEIC, SVG, UDF…</small><button class="k-btn yellow k-choose">Choose file</button></div></div>
            </div>
            <div class="k-pane k-p2">
              <div class="k-opt"><small>Paper size</small><div class="k-seg"><span class="on">A4</span><span>A3</span></div></div>
              <div class="k-opt"><small>Sides</small><div class="k-seg k-sides"><span class="on">Single-sided</span><span class="k-dbl">Double-sided</span></div></div>
              <div class="k-opt"><small>Copies</small><div class="k-copies"><span>−</span><b class="k-cn">1</b><span class="k-plus">+</span></div></div>
              <div class="k-opt"><small>Finishing</small><div class="k-seg"><span class="on">None</span><span>Staple</span><span class="k-spiral">Spiral binding</span></div></div>
              <div class="k-preview"><div class="k-sheet"><i></i><i></i><i></i><i></i><i></i></div><small>Preview · page 1 of 89</small></div>
            </div>
            <div class="k-pane k-p3">
              <div class="k-review">
                <div class="k-line"><span>thesis_final.pdf · 84 pp</span><span>A4 · B/W · double · ×2</span></div>
                <div class="k-line"><span>slides.pdf · 5 pp</span><span>A4 · B/W · double · ×2</span></div>
                <div class="k-line"><span>Spiral binding</span><span>×2</span></div>
                <button class="k-how">How was the price calculated? <i>▾</i></button>
                <div class="k-explain">
                  <p><span>Same product group</span><b>84 + 5 = 89 pages</b></p>
                  <p><span>× 2 copies</span><b>178 printed pages</b></p>
                  <p><span>Tier 100–499 pages</span><b>₺1.25 / page</b></p>
                  <p><span>Spiral binding × 2</span><b>₺80.00</b></p>
                </div>
                <div class="k-total"><span>Total</span><b class="k-tv">₺0.00</b></div>
              </div>
            </div>
          </div>
          <footer class="k-foot"><button class="k-btn ghost">‹ Back</button><span class="sp"></span><button class="k-btn yellow k-next">Print options →</button></footer>
          <div class="k-toast">✓ Order <b>K-2041</b> sent to the cashier</div>
        </div>
      </div>`,
      async play(t) {
        await sleep(700, t);
        await click('.k-bw', t);
        phase('p1');
        await sleep(700, t);
        await click('.k-choose', t);
        q('.f1').classList.add('in');
        await sleep(600, t);
        q('.f2').classList.add('in');
        await sleep(1300, t);
        q('.k-conv').textContent = 'PDF ✓'; q('.k-conv').classList.add('ok'); q('.k-f2s').textContent = '5 pages · converted';
        await sleep(700, t);
        await click('.k-next', t);
        phase('p2'); q('.k-next').textContent = 'Review order →';
        await sleep(600, t);
        await click('.k-dbl', t);
        q('.k-sides .on').classList.remove('on'); q('.k-dbl').classList.add('on'); q('.k-sheet').classList.add('dbl');
        await click('.k-plus', t);
        q('.k-cn').textContent = '2';
        await click('.k-spiral', t);
        q('.k-spiral').parentElement.querySelector('.on').classList.remove('on'); q('.k-spiral').classList.add('on');
        await sleep(400, t);
        await click('.k-next', t);
        phase('p3'); q('.k-next').textContent = 'Send to cashier →';
        countTo('.k-tv', 0, 302.5, 1100);
        await sleep(1100, t);
        await click('.k-how', t);
        q('.k-review').classList.add('open');
        await sleep(2200, t);
        await click('.k-next', t);
        q('.k-flow').classList.add('sent');
      },
    },
    {
      tab: 'Design desk', title: 'PrintOS · Design desk',
      role: 'Design desk · staff workstation',
      head: 'A prepress desk built around the PDF',
      text: 'Staff open files from every channel, crop, resize, imposition with N-up, booklet and step-and-repeat, then queue jobs to a printer profile. Every send goes through the print-safety gates, so a double click never prints twice.',
      chips: ['N-up · booklet', 'Step & repeat', 'Crop · page size', 'Favourite jobs', 'Print queue'],
      html: `<div class="g" data-phase="empty">
        <div class="g-top"><span class="g-wa">WhatsApp</span><b>Design Desk Workspace</b><span class="sp"></span><button>Orders</button><button>Order history (12)</button><button>Price lookup</button><button class="g-arc">Archive</button></div>
        <div class="g-tools"><button>Crop</button><button>Page size</button><button>Step &amp; Repeat</button><button class="g-nup">N-up</button><button>Booklet</button><button class="dim">A4 do</button><button class="dim">A6 do</button><button>Quick print</button><span class="g-tag">Active file</span></div>
        <div class="g-fav"><small>Favourites</small><button>24×33 cross</button><button>Business cards</button><button>A6 4-up</button><button>A4 colour</button><button>Fuji HOLD</button><i></i><small>Quick queue</small><button>75 new</button><button>Versant</button><button class="g-fuji">Fuji PRINT</button></div>
        <div class="g-main">
          <aside class="g-src">
            <div class="g-src-h"><b>Source files</b><small>3 waiting · 3 total</small></div>
            <div class="g-f g-f1"><span class="ic pdf">PDF</span><div><b>menu_autumn.pdf</b><small>4 pp · A5 · WhatsApp W-1047</small></div></div>
            <div class="g-f"><span class="ic jpg">JPG</span><div><b>logo_print.jpg</b><small>1 pp · e-mail draft</small></div></div>
            <div class="g-f"><span class="ic doc">DOC</span><div><b>form_v2.docx</b><small>2 pp · counter</small></div></div>
          </aside>
          <section class="g-view">
            <div class="g-vbar"><button>Save as</button><span>Page <b class="g-pg">0</b> / <b class="g-pt">0</b></span><span class="sp"></span><span class="g-mode">Original PDF</span></div>
            <div class="g-vbody">
              <div class="g-thumbs"><small>Pages</small><i>1</i><i>2</i><i>3</i><i>4</i></div>
              <div class="g-rail"><i></i><i></i><i></i><i></i><i></i><i></i></div>
              <div class="g-canvas">
                <div class="g-empty">No PDF</div>
                <div class="g-sheet"><span>1</span><span>2</span><span>3</span><span>4</span></div>
                <div class="g-pop"><small>Pages per sheet</small><div><button>2</button><button class="g-4">4</button><button>8</button></div></div>
                <span class="g-size">A4 · 210 × 297 mm</span>
              </div>
            </div>
          </section>
        </div>
        <div class="g-queue">
          <div class="g-qh"><b>Print queue</b><small class="g-qc">0 files · 0 jobs</small></div>
          <div class="g-qrow"><span class="ic pdf">PDF</span><b>menu_autumn.pdf</b><small>A4 · 4-up · 1 sheet × 40 · Fuji PRINT</small><em class="g-qs">Queued</em></div>
          <div class="g-qempty">Queue empty. Pick a file and use a printer button above.</div>
          <button class="g-send">Send queue</button>
        </div>
      </div>`,
      async play(t) {
        await sleep(600, t);
        await click('.g-f1', t);
        q('.g-f1').classList.add('on'); phase('loaded');
        q('.g-pg').textContent = '1'; q('.g-pt').textContent = '4';
        await sleep(1100, t);
        await click('.g-nup', t);
        q('.g-pop').classList.add('open');
        await sleep(500, t);
        await click('.g-4', t);
        q('.g-pop').classList.remove('open'); phase('nup');
        q('.g-mode').textContent = 'N-up · 4 per sheet'; q('.g-size').textContent = 'A4 · 4 × A6 · 1 sheet';
        await sleep(1600, t);
        await click('.g-fuji', t);
        phase('queued'); q('.g-qc').textContent = '1 file · 1 job';
        await sleep(900, t);
        await click('.g-send', t);
        const s = q('.g-qs');
        for (const [txt, cls] of [['Center authorize…', 'wait'], ['Claim ✓', 'wait'], ['Dispatching…', 'wait'], ['Spool accepted', 'ok']]) {
          s.textContent = txt; s.className = `g-qs ${cls}`;
          await sleep(650, t);
        }
        phase('sent');
      },
    },
    {
      tab: 'Cashier', title: 'PrintOS · Cashier',
      role: 'Cashier · shop center',
      head: 'Every order lands here, with its payment state',
      text: 'Kiosk, design desk, WhatsApp and mobile orders arrive live in one list with their source. Staff collect cash or card, run customer credit accounts and monthly invoicing, and the day’s totals update as they go.',
      chips: ['Live order list', 'Cash · card · wallet', 'Credit accounts', 'Monthly invoicing', 'Quick entry'],
      html: `<div class="c" data-phase="list">
        <div class="c-title">PrintOS Cashier</div>
        <div class="c-quick">
          <div class="c-qh"><b>Quick entry</b><span>Default customer: Walk-in</span></div>
          <div class="c-qrow"><label>Customer<i>Walk-in</i></label><label>Phone<i class="ph">Phone</i></label><label>Product / job<i class="ph">Search products or type a job</i></label><label>Qty<i>1</i></label><label>Payment<i>Cash ▾</i></label><button>+ Add</button></div>
        </div>
        <div class="c-stats">
          <div><small>Cash</small><b class="c-cash">₺1,240.00</b></div>
          <div><small>Card</small><b class="c-card">₺860.00</b></div>
          <div><small>Mobile balance</small><b>₺312.60</b></div>
          <div><small>Today’s takings</small><b class="c-today">₺2,412.60</b></div>
          <div><small>Open credit</small><b>₺450.00</b></div>
          <div><small>Pending</small><b class="c-pend">0 jobs</b></div>
        </div>
        <div class="c-list">
          <div class="c-lh"><div><b>Pending jobs</b><small class="c-count">0 / 0 records</small></div><span class="sp"></span><button>Refresh orders</button><button>Price list</button></div>
          <div class="c-tabs"><span class="on">New</span><span>Completed</span><span>Credit</span><span>Closed history</span><span>Invoiced</span><span>All</span></div>
          <div class="c-table">
            <div class="c-th"><span>Order</span><span>Source</span><span>Customer</span><span>Job</span><span>Amount</span><span>Status</span><span></span></div>
            <div class="c-tr r1"><b>W-1043</b><i class="src wa">WhatsApp</i><span>Elif K.</span><span>Thesis 84 pp ×2 · spiral</span><b>₺310.00</b><em class="st due">Awaiting payment</em><button>Collect</button></div>
            <div class="c-tr r2"><b>K-2041</b><i class="src k">Kiosk</i><span>Walk-in</span><span>B/W 89 pp ×2 · spiral</span><b>₺302.50</b><em class="st due c-st2">Awaiting payment</em><button class="c-collect">Collect</button></div>
            <div class="c-tr r3"><b>U-000128</b><i class="src u">Mobile</i><span>Can D.</span><span>A4 B/W · 3 faces</span><b>₺9.00</b><em class="st paid">Paid · wallet</em><button class="ghost">Details</button></div>
            <div class="c-tr r4"><b>G-0388</b><i class="src g">Design desk</i><span>Cafe Lima</span><span>Menu A6 4-up ×40</span><b>₺240.00</b><em class="st credit">Credit account</em><button class="ghost">Details</button></div>
          </div>
        </div>
        <div class="c-modal">
          <div class="c-mbox">
            <small>Collect payment · K-2041</small><b class="c-amt">₺302.50</b>
            <div class="c-methods"><span>Cash</span><span class="c-cardbtn">Card</span><span>Credit account</span></div>
            <button class="c-ok">Confirm payment</button>
          </div>
        </div>
      </div>`,
      async play(t) {
        const rows = ['.r1', '.r2', '.r3', '.r4'];
        for (let i = 0; i < rows.length; i++) {
          await sleep(450, t);
          q(rows[i]).classList.add('in');
          q('.c-count').textContent = `${i + 1} / ${i + 1} records`;
          q('.c-pend').textContent = `${[1, 2, 2, 2][i]} jobs`;
        }
        await sleep(700, t);
        await click('.c-collect', t);
        phase('modal');
        await sleep(600, t);
        await click('.c-cardbtn', t);
        q('.c-cardbtn').classList.add('on');
        await click('.c-ok', t);
        phase('list');
        const st = q('.c-st2'); st.textContent = 'Paid · card'; st.className = 'st paid c-st2';
        q('.r2').classList.add('flash');
        const btn = q('.c-collect'); btn.textContent = 'Details'; btn.className = 'ghost';
        q('.c-pend').textContent = '1 job';
        countTo('.c-card', 860, 1162.5);
        countTo('.c-today', 2412.6, 2715.1);
        await sleep(1200, t);
      },
    },
    {
      tab: 'Admin', title: 'PrintOS · Admin',
      role: 'Admin · back office',
      head: 'Products, prices and the system, in one place',
      text: 'Admin manages customers, mobile accounts, recipes, production rules, printers and storage. Price changes are drafted, validated and published as one package, which every workstation picks up live.',
      chips: ['Product factory', 'Price packages', 'Mobile customers', 'Printers', 'Storage & cleanup'],
      html: `<div class="a" data-phase="overview">
        <div class="a-title">PrintOS Admin</div>
        <div class="a-body">
          <nav class="a-nav">
            <span class="a-ov on">Overview</span><span>Customers</span><span>Mobile customers</span><span>Users</span><span>Recipes</span><span>Product factory</span><span>Production rules</span><span class="a-pk">Product &amp; price packages</span><span>Storage &amp; cleanup</span><span>App versions &amp; maintenance</span><span>Terminal updates</span><span>Printers</span><span>Price lists</span><span>Corporate archive</span><span>Activity log</span>
          </nav>
          <section class="a-main">
            <div class="a-overview">
              <div class="a-h"><div><b>Overview</b><small>Live records from the shop center</small></div></div>
              <div class="a-kpis"><div><small>Orders today</small><b>48</b></div><div><small>Takings</small><b>₺2,715</b></div><div><small>Terminals online</small><b>4 / 4</b></div><div><small>Mobile orders</small><b>9</b></div></div>
              <div class="a-bars">${[38, 52, 30, 64, 72, 58, 80, 46, 66, 90, 74, 60].map(h => `<i style="--h:${h}%"></i>`).join('')}</div>
              <small class="a-bars-l">Orders per hour</small>
            </div>
            <div class="a-pack">
              <div class="a-h"><div><b>Product &amp; price packages</b><small>Draft → validate → publish</small></div><span class="a-ver">Live: v41</span></div>
              <div class="a-diff">
                <div class="a-dh"><span>Product</span><span>Tier</span><span>Live</span><span>Draft</span></div>
                <div class="a-dr"><span>A4 B/W double-sided</span><span>100–499</span><s>₺1.40</s><b>₺1.25</b></div>
                <div class="a-dr"><span>A4 colour</span><span>1–49</span><s>₺10.00</s><b>₺9.00</b></div>
                <div class="a-dr"><span>Spiral binding</span><span>per item</span><s>₺35.00</s><b>₺40.00</b></div>
              </div>
              <div class="a-act"><button class="a-val">Validate</button><button class="a-pub">Publish v42</button></div>
              <div class="a-checks"><span>Rules consistent</span><span>No conflicting edits</span><span>Printer mappings intact</span></div>
              <div class="a-roll">
                <div><span>Kiosk</span><i></i><b>v42 ✓</b></div><div><span>Design desk</span><i></i><b>v42 ✓</b></div><div><span>Cashier</span><i></i><b>v42 ✓</b></div><div><span>Mobile service</span><i></i><b>v42 ✓</b></div>
              </div>
            </div>
          </section>
        </div>
        <div class="a-foot"><span>Active section: <b class="a-sec">Overview</b></span><span>Product and price source: <b>verified by server</b></span></div>
      </div>`,
      async play(t) {
        await sleep(1400, t);
        await click('.a-pk', t);
        q('.a-ov').classList.remove('on'); q('.a-pk').classList.add('on');
        phase('pack'); q('.a-sec').textContent = 'Product & price packages';
        await sleep(1500, t);
        await click('.a-val', t);
        q('.a-checks').classList.add('in');
        await sleep(1300, t);
        await click('.a-pub', t);
        q('.a-roll').classList.add('in');
        await sleep(1600, t);
        q('.a-ver').textContent = 'Live: v42'; q('.a-ver').classList.add('ok');
      },
    },
    {
      tab: 'Mobile app', title: 'Mobile app · customer phone',
      role: 'Mobile app · customer’s phone',
      head: 'Prepare on the phone, pay from a balance',
      text: 'Customers edit their files on the phone: delete, reorder, rotate, crop and fit 1, 2 or 4 pages per sheet. They confirm the final preview and price, the order is paid from a balance loaded at the shop and lands in the cashier as paid.',
      chips: ['PWA', 'On-device PDF editing', 'Wallet balance', 'Working hours', 'Share → app'],
      html: `<div class="m" data-phase="edit">
        <div class="m-side">
          <p class="m-k">Customer phone</p>
          <ul class="m-list"><li>Word &amp; PowerPoint converted to PDF</li><li>Nothing is sent before the final confirm</li><li>One atomic checkout: order, payment and print job</li><li>A dropped connection never charges twice</li></ul>
        </div>
        <div class="m-phone"><div class="m-notch"></div>
          <div class="m-scr">
            <div class="m-top"><b>Prepare file</b><span class="m-wal">₺150.00</span></div>
            <small class="m-file">lab_report.pdf · <b class="m-pc">6</b> pages</small>
            <div class="m-pages">${[1, 2, 3, 4, 5, 6].map(n => `<span class="mp${n}"><i>${n}</i></span>`).join('')}</div>
            <div class="m-tools"><button class="m-del">Delete</button><button class="m-rot">Rotate</button><button>Crop</button><button class="m-2up">2 / sheet</button></div>
            <div class="m-sum"><span class="m-spec">A4 · B/W · 6 faces</span><b class="m-price">₺18.00</b></div>
            <button class="m-order">Confirm &amp; order</button>
            <div class="m-done"><span>✓</span><b>Order U-000128</b><small>₺9.00 paid from balance<br>Sent to the shop</small></div>
          </div>
        </div>
        <div class="m-side m-admin">
          <p class="m-k">Admin → Mobile customers</p>
          <div class="m-acc"><b>Can D.</b><small>can.d@…</small><span>Balance <b class="m-bal">₺150.00</b></span></div>
          <div class="m-acc dim"><b>Print approval</b><small>auto for eligible jobs · slip over 5 pages</small></div>
          <div class="m-acc dim"><b>Order hours</b><small>Mon–Sat 08:30–19:00</small></div>
        </div>
      </div>`,
      async play(t) {
        await sleep(800, t);
        await click('.mp6', t);
        q('.mp6').classList.add('sel');
        await click('.m-del', t);
        q('.mp6').classList.add('gone');
        q('.m-pc').textContent = '5'; q('.m-spec').textContent = 'A4 · B/W · 5 faces'; countTo('.m-price', 18, 15, 500);
        await sleep(600, t);
        await click('.mp3', t);
        await click('.m-rot', t);
        q('.mp3').classList.add('rot');
        await sleep(500, t);
        await click('.m-2up', t);
        phase('nup');
        q('.m-spec').textContent = 'A4 · B/W · 2 per sheet · 3 faces'; countTo('.m-price', 15, 9, 600);
        await sleep(1300, t);
        await click('.m-order', t);
        phase('done');
        countTo('.m-wal', 150, 141, 800); countTo('.m-bal', 150, 141, 800);
        await sleep(1400, t);
      },
    },
  ];

  // --- tabs ---
  const tabs = SCREENS.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-tab';
    b.textContent = s.tab;
    b.addEventListener('click', () => show(i));
    tabsEl.appendChild(b);
    return b;
  });

  let current = -1, visible = false;

  const show = i => {
    const t = ++token;
    const s = SCREENS[i];
    const back = i < current;
    current = i;
    tabs.forEach((b, k) => b.classList.toggle('on', k === i));
    titleEl.textContent = s.title;

    // caption
    root.querySelector('.ui-cap').classList.remove('in');
    void root.offsetWidth;
    capRole.textContent = s.role;
    capTitle.textContent = s.head;
    capText.textContent = s.text;
    capChips.innerHTML = s.chips.map((c, k) => `<li style="--k:${k}">${c}</li>`).join('');
    root.querySelector('.ui-cap').classList.add('in');

    // screen transition
    const old = screenEl;
    if (old) {
      old.classList.remove('is-in');
      old.classList.add(back ? 'is-out-r' : 'is-out');
      setTimeout(() => old.remove(), 900);
    }
    const el = document.createElement('div');
    el.className = `ui-screen ${old ? (back ? 'is-from-l' : 'is-from-r') : 'is-first'}`;
    el.innerHTML = s.html;
    stage.appendChild(el);
    screenEl = el;
    void el.offsetWidth;
    el.classList.add('is-in');
    win.classList.remove('sweep'); void win.offsetWidth; win.classList.add('sweep');

    if (reduceMotion) return;
    cursor.classList.add('on');
    cursor.style.transitionDuration = '0ms';
    cursor.style.transform = 'translate(880px, 560px)';
    s.play(t)
      .then(() => sleep(HOLD_MS, t))
      .then(() => { if (visible) show((i + 1) % SCREENS.length); })
      .catch(e => { if (e !== STALE) throw e; });
  };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) show(current < 0 ? 0 : current);
    else { token++; cursor.classList.remove('on'); }
  }, { threshold: 0.35 }).observe(root);
})();
