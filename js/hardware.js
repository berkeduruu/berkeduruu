// Hardware cards: hovering a legend item or a part highlights the same component in the cutaway.
(() => {
  const root = document.getElementById('hw');
  const select = part => {
    root.querySelectorAll('[data-part]').forEach(el => el.classList.toggle('is-on', el.dataset.part === part));
  };
  root.querySelectorAll('[data-part]').forEach(el => {
    el.addEventListener('mouseenter', () => select(el.dataset.part));
    el.addEventListener('click', () => select(el.dataset.part));
  });
  root.addEventListener('mouseleave', () => select(null));
})();
