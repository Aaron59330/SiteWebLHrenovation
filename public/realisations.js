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
