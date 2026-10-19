// Shared page behaviour: active nav link, in-view video playback, metric count-up, reveal on scroll.
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Highlight the nav link of the section in view.
  const links = new Map([...document.querySelectorAll('.topnav a')].map(a => [a.getAttribute('href').slice(1), a]));
  const navObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach(a => a.classList.remove('is-active'));
      const link = links.get(e.target.id);
      if (link) {
        link.classList.add('is-active');
        const nav = link.parentElement;
        nav.scrollTo({ left: link.offsetLeft - nav.offsetLeft - (nav.clientWidth - link.clientWidth) / 2, behavior: 'smooth' });
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => navObserver.observe(document.getElementById(id)));

  // Videos play only while visible.
  const videoObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && !reduceMotion) v.play().catch(() => {});
      else v.pause();
    }
  }, { threshold: 0.35 });
  document.querySelectorAll('.auto-video').forEach(v => videoObserver.observe(v));

  // Count metrics up once.
  const countObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countObserver.unobserve(e.target);
      const el = e.target, target = parseFloat(el.dataset.count);
      if (reduceMotion) continue;
      const t0 = performance.now(), dur = 1400;
      const tick = now => {
        const k = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
        el.textContent = (target * eased).toFixed(3);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));

  // Fade sections in.
  const revealObserver = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealObserver.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll('.section-head, .video-pair, .roi-block, .metrics, .flowline, .hw-card, .arch, .field, .lock-steps, .ops, .feature-grid, .geo, .game, .tools, .about-grid, .skills')
    .forEach(el => { el.classList.add('reveal'); revealObserver.observe(el); });
})();
