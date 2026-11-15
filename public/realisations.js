(function () {
  var el = LH.el, box = document.getElementById('real-gallery');
  if (!box) return;
  var items = [], overlay = null, cur = 0, idx = 0, lastFocus = null, touchX = null;

  /* Texte de présentation : paragraphes, sous-titres (ligne finissant par « : ») et listes à puces (* - •) */
  function richText(target, text) {
    var ul = null;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var l = raw.trim(); if (!l) { ul = null; return; }
      var m = /^[*•\-–—]\s+(.*)$/.exec(l);
      if (m) { if (!ul) { ul = el('ul', { class: 'rv-list' }); target.appendChild(ul); } ul.appendChild(el('li', { text: m[1] })); return; }
      ul = null; target.appendChild(el('p', { class: /:$/.test(l) ? 'rv-sub' : 'rv-p', text: l }));
    });
  }

  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null; document.removeEventListener('keydown', onKey);
    document.body.classList.remove('noscroll'); if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); }
  function go(d) { var n = items[cur].images.length; if (n < 2) return; idx = (idx + d + n) % n; paint(); }
  function paint() {
    var it = items[cur], n = it.images.length, img = overlay.querySelector('.rv-img');
    img.classList.remove('in'); img.onload = function () { img.classList.add('in'); };
    img.src = it.images[idx]; img.alt = it.title + ' – photo ' + (idx + 1);
    if (img.complete) img.classList.add('in');
    overlay.querySelector('.rv-count').textContent = n > 1 ? (idx + 1) + ' / ' + n : '';
    overlay.querySelectorAll('.rv-thumb').forEach(function (t, k) { t.classList.toggle('on', k === idx); if (k === idx && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    [1, -1].forEach(function (d) { if (n > 1) new Image().src = it.images[(idx + d + n) % n]; });   // précharge les voisines
  }
  function open(i) {
    close(); lastFocus = document.activeElement; cur = i; idx = 0; var it = items[i], n = it.images.length;
    var prev = el('button', { class: 'rv-nav rv-prev', type: 'button', 'aria-label': 'Photo précédente', text: '‹' });
    var next = el('button', { class: 'rv-nav rv-next', type: 'button', 'aria-label': 'Photo suivante', text: '›' });
    var x = el('button', { class: 'rv-close', type: 'button', 'aria-label': 'Fermer', text: '✕' });
    prev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    x.addEventListener('click', close);
    var stage = el('div', { class: 'rv-stage' }, el('span', { class: 'rv-count' }), el('img', { class: 'rv-img', alt: '' }), n > 1 ? prev : null, n > 1 ? next : null);
    stage.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) { if (touchX === null) return; var dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); }, { passive: true });
    var thumbs = null;
    if (n > 1) {
      thumbs = el('div', { class: 'rv-thumbs' });
      it.images.forEach(function (src, k) {
        var t = el('button', { class: 'rv-thumb', type: 'button', 'aria-label': 'Voir la photo ' + (k + 1) }, el('img', { src: src, alt: '', loading: 'lazy' }));
        t.addEventListener('click', function () { idx = k; paint(); }); thumbs.appendChild(t);
      });
    }
    var desc = el('div', { class: 'rv-desc' }); richText(desc, it.description);
    var panel = el('div', { class: 'rv-panel' },
      it.work_type ? el('span', { class: 'rv-type', text: it.work_type }) : null,
      el('h3', { class: 'rv-title', text: it.title }), desc,
      el('div', { class: 'rv-cta' }, el('a', { class: 'btn', href: 'contact.html', text: 'Demander un devis similaire' })));
    overlay = el('div', { class: 'rv-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': it.title },
      el('div', { class: 'rv-box' }, x, el('div', { class: 'rv-media' }, stage, thumbs), panel));
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay); document.body.classList.add('noscroll'); document.addEventListener('keydown', onKey); paint(); x.focus();
  }

  /* ---------- gestion directe par l'administrateur ---------- */
  function modal(title, content) {
    var ov = el('div', { class: 'lightbox rf-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    var x = el('button', { type: 'button', class: 'cms-btn', text: 'Fermer' }); x.addEventListener('click', function () { ov.remove(); });
    ov.appendChild(el('div', { class: 'ip-box' }, el('h3', { text: title }), content, el('div', { class: 'ip-actions' }, x)));
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov); return ov;
  }
  function openForm(item) {
    var ov = modal(item ? 'Modifier la réalisation' : 'Ajouter une réalisation', LH.realForm(item, function () { location.reload(); }));
    var h = ov.querySelector('.rform > h3'); if (h) h.remove();
  }
  function editIntro(d) {
    var t = prompt('Titre de la section :', d.intro.title); if (t === null) return;
    var x = prompt('Texte d\'introduction :', d.intro.text); if (x === null) return;
    LH.api('PUT', '/api/admin/realisations-text', { title: t, text: x }).then(function () { location.reload(); }).catch(function (e) { alert(e.message); });
  }
  function adminBar(d) {
    var add = el('button', { type: 'button', class: 'btn', text: '➕ Ajouter une réalisation (photos + texte)' });
    add.addEventListener('click', function () { openForm(null); });
    var intro = el('button', { type: 'button', class: 'btn btn-ghost-w', text: '✏️ Titre et texte de la section' });
    intro.addEventListener('click', function () { editIntro(d); });
    box.parentNode.insertBefore(el('div', { class: 'rl-admin' }, add, intro), box);
  }
  function tileTools(it, fig) {
    function b(txt, fn) { var x = el('button', { type: 'button', text: txt }); x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }); return x; }
    fig.appendChild(el('div', { class: 'rl-tools' },
      b('✎ Modifier', function () { openForm(it); }),
      b('✕ Supprimer', function () { if (confirm('Supprimer « ' + it.title + ' » et ses photos ?')) LH.api('DELETE', '/api/admin/realisations/' + it.id).then(function () { location.reload(); }).catch(function (e) { alert(e.message); }); })));
  }

  Promise.all([LH.api('GET', '/api/realisations'), LH.api('GET', '/api/me').catch(function () { return {}; })]).then(function (res) {
    var d = res[0], isAdmin = !!res[1].admin;
    var t = document.getElementById('real-title'), x = document.getElementById('real-text');
    if (t) t.textContent = d.intro.title; if (x) x.textContent = d.intro.text;
    var max = parseInt(box.getAttribute('data-limit'), 10) || 100, canManage = isAdmin && !!LH.realForm && max > 10;   // gestion sur la page Réalisations (pas sur l'accueil)
    items = d.items; box.textContent = '';
    if (canManage) adminBar(d);
    if (!items.length) {
      box.className = 'center muted';
      box.appendChild(el('p', { text: canManage ? 'Aucune réalisation pour le moment : cliquez sur « Ajouter une réalisation » ci-dessus.' : 'Nos réalisations arrivent bientôt.' }));
      return;
    }
    items.slice(0, max).forEach(function (it, i) {
      var f = el('figure', { class: 'tile', tabindex: '0', role: 'button', 'aria-label': 'Voir ' + it.title },
        el('img', { src: it.images[0], alt: it.title, loading: 'lazy' }),
        it.images.length > 1 ? el('span', { class: 'tile-count', text: it.images.length + ' photos' }) : null,
        el('figcaption', {}, el('b', { text: it.title }), it.work_type || ''));
      if (canManage) tileTools(it, f);
      f.addEventListener('click', function () { open(i); });
      f.addEventListener('keydown', function (e) { if (e.target === f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(i); } });
      box.appendChild(f);
    });
  }).catch(function () { box.textContent = ''; });
})();
