// Floating accessibility menu (self-hosted, no third party). Settings persist per visitor
// and are applied as classes on <html>; see the "a11y" block in css/site.css.
(() => {
  const OPTS = [
    ['keyboard', 'a11y.keyboard'], ['noanim', 'a11y.noanim'], ['contrast', 'a11y.contrast'],
    ['fontlg', 'a11y.fontlg'], ['fontsm', 'a11y.fontsm'], ['readable', 'a11y.readable'],
    ['headings', 'a11y.headings'], ['links', 'a11y.links']
  ];
  const t = k => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  let set = {};
  try { set = JSON.parse(localStorage.getItem('sway-a11y') || '{}'); } catch (e) {}
  const html = document.documentElement;
  const apply = () => {
    OPTS.forEach(([k]) => html.classList.toggle('a11y-' + k, !!set[k]));
    try { localStorage.setItem('sway-a11y', JSON.stringify(set)); } catch (e) {}
  };
  apply();

  const btn = document.createElement('button');
  btn.id = 'a11y-btn'; btn.type = 'button'; btn.className = 'a11y-btn';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'a11y-panel');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="M20 8.5c-2.4.6-5 .9-8 .9s-5.6-.3-8-.9l-.5 1.9c2 .5 4.2.8 6.5 1V15l-1.8 6.4 1.9.6L12 16.5l1.9 5.5 1.9-.6L14 15v-3.6c2.3-.2 4.5-.5 6.5-1L20 8.5Z"/></svg>';
  const panel = document.createElement('div');
  panel.id = 'a11y-panel'; panel.className = 'a11y-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog');

  function render() {
    btn.setAttribute('aria-label', t('a11y.open'));
    panel.setAttribute('aria-label', t('a11y.title'));
    panel.innerHTML = `<p class="a11y-panel__title">${t('a11y.title')}</p>` +
      OPTS.map(([k, label]) => `<button type="button" role="switch" aria-checked="${!!set[k]}" data-a11y="${k}"><span>${t(label)}</span><i aria-hidden="true"></i></button>`).join('') +
      `<div class="a11y-panel__foot"><button type="button" data-a11y-reset>${t('a11y.reset')}</button><a href="accessibility.html">${t('a11y.statement')}</a></div>`;
  }
  function toggle(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button')?.focus();
  }
  btn.addEventListener('click', () => toggle(panel.hidden));
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-a11y]');
    if (b) {
      const k = b.dataset.a11y;
      set[k] = !set[k];
      if (k === 'fontlg' && set[k]) set.fontsm = false;
      if (k === 'fontsm' && set[k]) set.fontlg = false;
      apply(); render();
      panel.querySelector(`[data-a11y="${k}"]`).focus();
    }
    if (e.target.closest('[data-a11y-reset]')) { set = {}; apply(); render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
  document.addEventListener('mousedown', e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false); });
  document.addEventListener('langchange', render);
  render();
  document.body.append(btn, panel);
})();
