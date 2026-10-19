(function () {
  var el = LH.el, box = document.getElementById('real-gallery');
  if (!box) return;
  var items = [], overlay = null, cur = 0, idx = 0;

  function close() { if (overlay) { overlay.remove(); overlay = null; document.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll'); } }
  function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }
  function go(d) { var n = items[cur].images.length; idx = (idx + d + n) % n; paint(); }
  function paint() {
    var it = items[cur], img = overlay.querySelector('.lb-img');
    img.src = it.images[idx]; img.alt = it.title;
    overlay.querySelector('.lb-count').textContent = it.images.length > 1 ? (idx + 1) + ' / ' + it.images.length : '';
    overlay.querySelectorAll('.lb-nav').forEach(function (b) { b.style.display = it.images.length > 1 ? '' : 'none'; });
  }
  function open(i) {
    close(); cur = i; idx = 0; var it = items[i];
    var prev = el('button', { class: 'lb-nav lb-prev', type: 'button', 'aria-label': 'Photo précédente', text: '‹' });
    var next = el('button', { class: 'lb-nav lb-next', type: 'button', 'aria-label': 'Photo suivante', text: '›' });
    var x = el('button', { class: 'lb-close', type: 'button', 'aria-label': 'Fermer', text: '×' });
    prev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    x.addEventListener('click', close);
    overlay = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': it.title },
      el('div', { class: 'lb-box' }, x, el('div', { class: 'lb-stage' }, prev, el('img', { class: 'lb-img', alt: '' }), next),
        el('div', { class: 'lb-info' }, el('span', { class: 'lb-count' }), el('h3', { text: it.title }),
          it.work_type ? el('p', { class: 'lb-type', text: it.work_type }) : null,
          it.description ? el('p', { class: 'lb-desc', text: it.description }) : null)));
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey); paint();
  }

  LH.api('GET', '/api/realisations').then(function (d) {
    var t = document.getElementById('real-title'), x = document.getElementById('real-text');
    if (t) t.textContent = d.intro.title; if (x) x.textContent = d.intro.text;
    var max = parseInt(box.getAttribute('data-limit'), 10) || 100;
    items = d.items; box.textContent = '';
    if (!items.length) { box.className = 'center muted'; box.appendChild(el('p', { text: 'Nos réalisations arrivent bientôt.' })); return; }
    items.slice(0, max).forEach(function (it, i) {
      var f = el('figure', { class: 'tile', tabindex: '0', role: 'button', 'aria-label': 'Voir ' + it.title },
        el('img', { src: it.images[0], alt: it.title, loading: 'lazy' }),
        it.images.length > 1 ? el('span', { class: 'tile-count', text: it.images.length + ' photos' }) : null,
        el('figcaption', {}, el('b', { text: it.title }), it.work_type || ''));
      f.addEventListener('click', function () { open(i); });
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
      box.appendChild(f);
    });
  }).catch(function () { box.textContent = ''; });
})();
