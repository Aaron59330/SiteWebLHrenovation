/* Contenu du site : applique les modifications de l'administrateur (textes, blocs, liens, sections)
   et fournit le mode « Modifier la page ». Les textes sont toujours insérés en textContent. */
(function () {
  var root = document.documentElement, overrides = null, domReady = false, applied = false;
  var editing = false, saving = false, dirty = {}, colDirty = {}, blocks = [], blocksDirty = false, ui = {}, lastA = null;
  var PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  root.classList.add('cms-loading');
  var failsafe = setTimeout(function () { root.classList.remove('cms-loading'); }, 1500);
  var $ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var el = function () { return LH.el.apply(null, arguments); };
  var SAFE_HREF = /^(https?:\/\/|\/|#|[a-z0-9_-]+\.html|tel:|mailto:)/i;
  var baseKey = function (k) { return k.split('@')[0]; };


  /* ---------- bibliothèque d'icônes ---------- */
  var ICONS = {
    'Peinture': 'M4 4h12v5H4z M16 6.5h3v6H11v3 M11 15.5V21',
    'Pinceau': 'M18 3l3 3-9 9-3-3z M9 12c-3 0-4 2-4 4 0 2-1 3-2 4 3 1 7 0 7-4',
    'Maison': 'M3 20h18 M5 20V9l7-5 7 5v11 M9 20v-6h6v6',
    'Toiture': 'M2 12l10-8 10 8 M5 10v10h14V10',
    'Plâtrerie': 'M3 5l7 7 M8 3l-5 5 13 13 5-5z M14 9l1.5 1.5',
    'Carrelage': 'M3 3h18v18H3z M3 12h18 M12 3v18',
    'Parquet': 'M3 7l9-4 9 4-9 4z M3 12l9 4 9-4 M3 17l9 4 9-4',
    'Salle de bain': 'M4 12h16v4a4 4 0 01-4 4H8a4 4 0 01-4-4z M6 12V6a2 2 0 014 0 M7 20v2 M17 20v2',
    'Cuisine': 'M4 3h16v18H4z M4 10h16 M8 6h1 M8 14v3',
    'Plomberie': 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
    'Électricité': 'M13 2L4 14h7l-1 8 9-12h-7z',
    'Ampoule': 'M9 18h6 M10 21h4 M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z',
    'Fenêtre': 'M4 4h16v14H4z M12 4v14 M4 11h16 M2 21h20',
    'Porte': 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17 M3 21h18 M14 12h.01',
    'Escalier': 'M3 21h6v-6h6v-6h6V3',
    'Marteau': 'M14 4l6 6-3 3-6-6z M13 8L4 17l3 3 9-9',
    'Clé à molette': 'M14.5 5.5a4 4 0 00-5 5L3 17l4 4 6.5-6.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z',
    'Mètre': 'M3 15l12-12 6 6-12 12z M7 11l2 2 M10 8l2 2 M13 5l2 2',
    'Clé': 'M8 15a4 4 0 110-8 4 4 0 010 8z M11 11h10 M18 11v4 M21 11v3',
    'Garantie': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
    'Validé': 'M5 12l4 4 10-10',
    'Étoile': 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
    'Téléphone': 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
    'E-mail': 'M3 5h18v14H3z M3 7l9 6 9-6',
    'Euro / prix': 'M17 6a7 7 0 100 12 M4 10h9 M4 14h9',
    'Horloge / délai': 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5l3 2',
    'Calendrier': 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
    'Camion': 'M2 6h12v10H2z M14 9h4l4 4v3h-8z M6 19a2 2 0 100-4 2 2 0 000 4z M17 19a2 2 0 100-4 2 2 0 000 4z',
    'Personne': 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0',
    'Adresse': 'M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z M12 11a2 2 0 100-4 2 2 0 000 4z',
    'Photo': 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6'
  };
  var IMG_OK = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;
  function setIcon(box, v) {
    if (!box) return;
    if (box.__orig === undefined) box.__orig = box.innerHTML;
    if (!v) { box.innerHTML = box.__orig; box.removeAttribute('data-icn'); return; }
    var ns = 'http://www.w3.org/2000/svg';
    if (ICONS[v]) {
      var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
      ICONS[v].split(' M').forEach(function (d, i) { var p = document.createElementNS(ns, 'path'); p.setAttribute('d', (i ? 'M' : '') + d); svg.appendChild(p); });
      box.textContent = ''; box.appendChild(svg);
    } else if (IMG_OK.test(v)) { box.textContent = ''; box.appendChild(el('img', { src: v, alt: '' })); }
    else return;
    box.setAttribute('data-icn', v);
  }
  function openPicker(box) {
    var key = box.getAttribute('data-ic'), ov = el('div', { class: 'lightbox icon-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choisir une icône' });
    function close() { ov.remove(); }
    function choose(v) { dirty['icon.' + key] = v; setIcon(box, v); refresh(); close(); }
    var grid = el('div', { class: 'ip-grid' });
    Object.keys(ICONS).forEach(function (name) {
      var tile = el('div', { class: 'ico' }); setIcon(tile, name);
      var b = el('button', { type: 'button', class: 'ip-item', title: name }, tile, el('span', { text: name }));
      b.addEventListener('click', function () { choose(name); }); grid.appendChild(b);
    });
    var file = el('input', { type: 'file', accept: 'image/*', class: 'cb-file' });
    var msg = el('p', { class: 'form-msg' });
    file.addEventListener('change', function () {
      if (!file.files[0]) return; msg.textContent = 'Envoi de l\'image…';
      resize(file.files[0]).then(function (d) { return LH.api('POST', '/api/admin/upload', { image: d }); })
        .then(function (r) { choose(r.url); }).catch(function (e) { msg.className = 'form-msg err'; msg.textContent = e.message; });
    });
    var up = el('button', { type: 'button', class: 'cms-btn', text: '📁 Importer ma propre image' }); up.addEventListener('click', function () { file.click(); });
    var rs = el('button', { type: 'button', class: 'cms-btn', text: 'Icône d\'origine' }); rs.addEventListener('click', function () { choose(''); });
    var cl = el('button', { type: 'button', class: 'cms-btn primary', text: 'Fermer' }); cl.addEventListener('click', close);
    ov.appendChild(el('div', { class: 'ip-box' }, el('h3', { text: 'Choisir une icône' }), grid, el('div', { class: 'ip-actions' }, up, rs, cl), msg, file));
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  /* ---------- liens téléphone / e-mail ---------- */
  function phoneHref(t) { var d = t.replace(/[^0-9+]/g, ''); if (/^0\d{9}$/.test(d)) d = '+33' + d.slice(1); return 'tel:' + d; }
  function syncLinks() {
    var p = document.querySelector('[data-k="contact.phone"]'), m = document.querySelector('[data-k="contact.email"]');
    if (p && p.textContent.trim()) $('a[href^="tel:"]').forEach(function (a) { a.setAttribute('href', phoneHref(p.textContent)); });
    if (m && /^[^\s@]+@[^\s@]+$/.test(m.textContent.trim())) $('a[href^="mailto:"]').forEach(function (a) { a.setAttribute('href', 'mailto:' + m.textContent.trim()); });
  }

  /* ---------- blocs répétables (cartes, étapes, listes…) ---------- */
  function showNow(n) { n.classList.add('in'); $('.reveal', n).forEach(function (x) { x.classList.add('in'); }); }
  function makeClone(src, cid, fromId) {
    var n = src.cloneNode(true);
    $('.cms-tools', n).forEach(function (t) { t.remove(); });
    n.removeAttribute('contenteditable'); n.setAttribute('data-item', cid); n.setAttribute('data-from', fromId);
    $('[data-k]', n).forEach(function (e) { e.setAttribute('data-k', baseKey(e.getAttribute('data-k')) + '@' + cid); if (editing) e.setAttribute('contenteditable', 'true'); });
    $('[data-ic]', n).forEach(function (e) { e.setAttribute('data-ic', baseKey(e.getAttribute('data-ic')) + '@' + cid); });
    showNow(n); return n;
  }
  function applyLayout(col) {
    var raw = overrides['layout.' + col.getAttribute('data-col')]; if (!raw) return;
    var lay; try { lay = JSON.parse(raw); } catch (e) { return; }
    if (!lay || !Array.isArray(lay.o)) return;
    var map = {}; Array.prototype.slice.call(col.children).forEach(function (c) { map[c.getAttribute('data-item')] = c; });
    var out = []; lay.o.forEach(function (id) {
      if (map[id]) out.push(map[id]);
      else if (lay.c && map[lay.c[id]]) { var c = makeClone(map[lay.c[id]], id, lay.c[id]); map[id] = c; out.push(c); }
    });
    Array.prototype.slice.call(col.children).forEach(function (c) { c.remove(); });
    out.forEach(function (c) { col.appendChild(c); });
  }
  function layoutOf(col) {
    var ids = [], c = {};
    Array.prototype.slice.call(col.children).forEach(function (x) { var id = x.getAttribute('data-item'); if (!id) return; ids.push(id); if (x.getAttribute('data-from')) c[id] = x.getAttribute('data-from'); });
    return { o: ids, c: c };
  }
  function isDefaultLayout(col, lay) {
    var n = parseInt(col.getAttribute('data-n'), 10), def = []; for (var i = 0; i < n; i++) def.push(String(i));
    return Object.keys(lay.c).length === 0 && lay.o.join(',') === def.join(',');
  }

  /* ---------- sections ajoutées (titre + texte + photo) ---------- */
  function blockAnchor() { return document.querySelector('main > .band') || null; }
  function renderBlocks() {
    $('.custom-block').forEach(function (b) { b.remove(); });
    var main = document.querySelector('main'); if (!main) return;
    var anchor = blockAnchor();
    blocks.forEach(function (b, i) {
      var h = el('h2', { text: b.t || '' }), p = el('p', { class: 'cb-text', text: b.p || '' });
      var txt = el('div', { class: 'cb-body' }, h, p), img = null;
      if (b.im && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(b.im)) img = el('img', { src: b.im, alt: b.t || '', loading: 'lazy' });
      var inner = img ? el('div', { class: 'container split cb-split' + (b.s === 'r' ? ' cb-right' : '') }, img, txt) : el('div', { class: 'container narrow' }, txt);
      var sec = el('section', { class: 'section custom-block' + (i % 2 ? ' sand' : '') }, inner);
      if (editing) {
        h.setAttribute('contenteditable', 'true'); p.setAttribute('contenteditable', 'true'); p.setAttribute('data-multiline', '1');
        h.addEventListener('input', function () { b.t = h.textContent; markBlocks(); });
        p.addEventListener('input', function () { b.p = p.innerText; markBlocks(); });
        sec.appendChild(blockTools(b, i));
      }
      main.insertBefore(sec, anchor); showNow(sec);
    });
  }
  function markBlocks() { blocksDirty = true; refresh(); }
  function blockTools(b, i) {
    function t(txt, fn, title) { var x = el('button', { type: 'button', title: title || txt, text: txt }); x.addEventListener('click', function (e) { e.preventDefault(); fn(); }); return x; }
    var file = el('input', { type: 'file', accept: 'image/*', class: 'cb-file' });
    file.addEventListener('change', function () {
      if (!file.files[0]) return;
      resize(file.files[0]).then(function (d) { return LH.api('POST', '/api/admin/upload', { image: d }); })
        .then(function (r) { b.im = r.url; markBlocks(); renderBlocks(); }).catch(function (e) { alert(e.message); });
    });
    return el('div', { class: 'cms-tools cb-tools' },
      t('↑', function () { if (i > 0) { blocks.splice(i - 1, 0, blocks.splice(i, 1)[0]); markBlocks(); renderBlocks(); } }, 'Monter'),
      t('↓', function () { if (i < blocks.length - 1) { blocks.splice(i + 1, 0, blocks.splice(i, 1)[0]); markBlocks(); renderBlocks(); } }, 'Descendre'),
      t(b.im ? '🖼 Changer la photo' : '🖼 Ajouter une photo', function () { file.click(); }),
      b.im ? t('Retirer la photo', function () { b.im = ''; markBlocks(); renderBlocks(); }) : null,
      b.im ? t('⇄ Photo ' + (b.s === 'r' ? 'à gauche' : 'à droite'), function () { b.s = b.s === 'r' ? '' : 'r'; markBlocks(); renderBlocks(); }) : null,
      t('✕ Supprimer la section', function () { if (confirm('Supprimer cette section ?')) { blocks.splice(i, 1); markBlocks(); renderBlocks(); } }), file);
  }
  function resize(file) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader(); fr.onerror = function () { ko(new Error('Lecture impossible.')); };
      fr.onload = function () {
        var im = new Image(); im.onerror = function () { ko(new Error('Format non pris en charge (utilisez JPEG, PNG ou WebP).')); };
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85));
        }; im.src = fr.result;
      }; fr.readAsDataURL(file);
    });
  }

  /* ---------- application au chargement ---------- */
  function apply() {
    if (applied || !domReady || overrides === null) return; applied = true;
    $('[data-col]').forEach(applyLayout);
    $('[data-k]').forEach(function (e) {
      var k = e.getAttribute('data-k'), v = overrides[k]; if (v != null) e.textContent = v;
      var h = overrides['href.' + k]; if (h && SAFE_HREF.test(h) && e.tagName === 'A') e.setAttribute('href', h);
    });
    $('[data-ic]').forEach(function (e) { var v = overrides['icon.' + e.getAttribute('data-ic')]; if (v) setIcon(e, v); });
    syncLinks();
    try { var b = JSON.parse(overrides['blocks.' + PAGE] || '[]'); blocks = Array.isArray(b) ? b.slice(0, 30) : []; } catch (e) { blocks = []; }
    renderBlocks();
    var st = overrides['seo.' + PAGE + '.title']; if (st) document.title = st;
    clearTimeout(failsafe); root.classList.remove('cms-loading');
  }
  fetch('/api/content', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (d) { overrides = d || {}; apply(); });
  document.addEventListener('DOMContentLoaded', function () { domReady = true; apply(); });

  /* ---------- mode édition (administrateur) ---------- */
  function refresh() { if (ui.save) { var n = Object.keys(dirty).length + Object.keys(colDirty).length + (blocksDirty ? 1 : 0); ui.save.textContent = n ? 'Enregistrer (' + n + ')' : 'Enregistrer'; ui.save.disabled = !n || saving; } }
  function onInput(e) {
    var t = e.target.closest && e.target.closest('[data-k]'); if (!t) return;
    var k = t.getAttribute('data-k'), v = t.textContent; dirty[k] = v;
    $('[data-k="' + k + '"]').forEach(function (o) { if (o !== t) o.textContent = v; });
    if (k === 'contact.phone' || k === 'contact.email') syncLinks();
    refresh();
  }
  function onKey(e) { if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-k],.cb-body h2')) e.preventDefault(); }
  function onPaste(e) {
    var t = e.target.closest && e.target.closest('[data-k],.cb-body'); if (!t) return;
    e.preventDefault(); var txt = ((e.clipboardData || window.clipboardData).getData('text') || '');
    if (!e.target.closest('.cb-text')) txt = txt.replace(/\s+/g, ' ');
    document.execCommand('insertText', false, txt);
  }
  function onClick(e) {
    var t = e.target; if (!t.closest || t.closest('.adminbar') || t.closest('.icon-picker')) return;
    var ic = t.closest('.ico[data-ic]'); if (ic) { e.preventDefault(); openPicker(ic); return; }
    if (t.closest('a,button')) e.preventDefault();
  }
  function onFocus(e) { var a = e.target.closest && e.target.closest('a[data-k]'); if (a) lastA = a; }
  function beforeUnload(e) { if (Object.keys(dirty).length || Object.keys(colDirty).length || blocksDirty) { e.preventDefault(); e.returnValue = ''; } }

  function itemTools(item, col) {
    function t(txt, fn, title) { var x = el('button', { type: 'button', title: title, 'aria-label': title, text: txt }); x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }); return x; }
    return el('div', { class: 'cms-tools', contenteditable: 'false' },
      t('↑', function () { var p = item.previousElementSibling; if (p && p.hasAttribute('data-item')) { col.insertBefore(item, p); colDirty[col.getAttribute('data-col')] = 1; refresh(); } }, 'Monter'),
      t('↓', function () { var n = item.nextElementSibling; if (n && n.hasAttribute('data-item')) { col.insertBefore(n, item); colDirty[col.getAttribute('data-col')] = 1; refresh(); } }, 'Descendre'),
      t('⧉', function () { duplicate(item, col); }, 'Dupliquer'),
      t('✕', function () {
        if (col.children.length <= 1) { alert('Il faut garder au moins un élément (vous pouvez le modifier).'); return; }
        if (!confirm('Supprimer cet élément ?')) return;
        $('[data-k]', item).forEach(function (e) { delete dirty[e.getAttribute('data-k')]; });
        item.remove(); colDirty[col.getAttribute('data-col')] = 1; refresh();
      }, 'Supprimer'));
  }
  function decorate(item, col) { if (!item.querySelector(':scope > .cms-tools')) item.appendChild(itemTools(item, col)); }
  function duplicate(item, col) {
    var from = item.getAttribute('data-from') || item.getAttribute('data-item');
    var src = item.getAttribute('data-from') ? col.querySelector('[data-item="' + from + '"]') || item : item;
    var cid = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 99);
    var n = makeClone(item, cid, from); n.setAttribute('data-from', from);
    $('[data-k]', n).forEach(function (e) { dirty[e.getAttribute('data-k')] = e.textContent; e.setAttribute('contenteditable', 'true'); });
    $('[data-ic]', n).forEach(function (e) { var v = e.getAttribute('data-icn'); if (v) dirty['icon.' + e.getAttribute('data-ic')] = v; });
    decorate(n, col); item.parentNode.insertBefore(n, item.nextSibling); colDirty[col.getAttribute('data-col')] = 1; refresh();
  }

  function start() {
    editing = true; document.body.classList.add('cms-editing');
    $('[data-k]').forEach(function (e) { e.setAttribute('contenteditable', 'true'); e.setAttribute('spellcheck', 'false'); });
    $('[data-col]').forEach(function (col) {
      Array.prototype.slice.call(col.children).forEach(function (it) { if (it.hasAttribute('data-item')) decorate(it, col); });
      var add = el('button', { type: 'button', class: 'cms-add', text: '+ Ajouter un élément' });
      add.addEventListener('click', function (e) { e.preventDefault(); var last = col.lastElementChild; if (last) duplicate(last, col); });
      col.parentNode.insertBefore(add, col.nextSibling);
    });
    renderBlocks();
    document.addEventListener('input', onInput); document.addEventListener('keydown', onKey); document.addEventListener('paste', onPaste);
    document.addEventListener('click', onClick, true); document.addEventListener('focusin', onFocus);
    document.addEventListener('submit', function (e) { e.preventDefault(); }, true); window.addEventListener('beforeunload', beforeUnload);
    ui.start.style.display = 'none'; ui.edit.style.display = ''; refresh();
  }
  function save() {
    if (saving) return; var values = {}, k;
    for (k in dirty) values[k] = dirty[k];
    Object.keys(colDirty).forEach(function (id) {
      var col = document.querySelector('[data-col="' + id + '"]'); if (!col) return;
      var lay = layoutOf(col); values['layout.' + id] = isDefaultLayout(col, lay) ? '' : JSON.stringify(lay);
    });
    if (blocksDirty) values['blocks.' + PAGE] = blocks.length ? JSON.stringify(blocks) : '';
    if (!Object.keys(values).length) return;
    saving = true; refresh(); ui.msg.textContent = 'Enregistrement…';
    LH.api('PUT', '/api/admin/content', { values: values }).then(function () { dirty = {}; colDirty = {}; blocksDirty = false; ui.msg.textContent = 'Enregistré ✓'; setTimeout(function () { location.reload(); }, 500); })
      .catch(function (err) { saving = false; ui.msg.textContent = 'Erreur : ' + err.message; refresh(); });
  }
  function cancel() { if ((Object.keys(dirty).length || Object.keys(colDirty).length || blocksDirty) && !confirm('Annuler vos modifications non enregistrées ?')) return; dirty = {}; colDirty = {}; blocksDirty = false; location.reload(); }
  function reset() {
    if (!confirm('Rétablir cette page à son contenu d\'origine (textes, éléments ajoutés/supprimés, sections, liens, titre Google) ? Le menu et le pied de page sont aussi concernés.')) return;
    var present = {}; $('[data-k]').forEach(function (e) { present[baseKey(e.getAttribute('data-k'))] = 1; }); $('[data-ic]').forEach(function (e) { present[baseKey(e.getAttribute('data-ic'))] = 1; });
    var keys = Object.keys(overrides).filter(function (k) {
      if (k === 'blocks.' + PAGE || k.indexOf('seo.' + PAGE + '.') === 0 || k.indexOf('layout.' + PAGE + '.') === 0) return true;
      return !!present[baseKey(k.replace(/^(href|icon)\./, ''))];
    });
    LH.api('POST', '/api/admin/content/reset', { keys: keys }).then(function () { dirty = {}; colDirty = {}; blocksDirty = false; location.reload(); }).catch(function (err) { ui.msg.textContent = 'Erreur : ' + err.message; });
  }
  function editLink() {
    if (!lastA) { alert('Cliquez d\'abord dans le texte du bouton ou du lien à modifier, puis cliquez sur « Lien ».'); return; }
    var k = lastA.getAttribute('data-k');
    if (k === 'contact.phone' || k === 'contact.email') { alert('Pour le téléphone et l\'e-mail, modifiez simplement le texte : le lien suit automatiquement.'); return; }
    var cur = lastA.getAttribute('href') || '', v = prompt('Adresse du lien\n(ex. contact.html, https://…, tel:+33…, mailto:…)', cur);
    if (v === null) return; v = v.trim();
    if (!SAFE_HREF.test(v)) { alert('Adresse non valable. Elle doit commencer par https://, /, #, tel:, mailto: ou être une page du site (ex. contact.html).'); return; }
    dirty['href.' + k] = v; $('[data-k="' + k + '"]').forEach(function (a) { if (a.tagName === 'A') a.setAttribute('href', v); }); refresh();
  }
  function editSeo() {
    var metaD = document.querySelector('meta[name="description"]');
    var t = prompt('Titre de la page (onglet du navigateur et Google) :', document.title); if (t === null) return;
    var d = prompt('Description de la page (texte affiché sous le titre dans Google, ~150 caractères) :', metaD ? metaD.getAttribute('content') : ''); if (d === null) return;
    var vals = {}; vals['seo.' + PAGE + '.title'] = t.trim(); vals['seo.' + PAGE + '.desc'] = d.trim();
    LH.api('PUT', '/api/admin/content', { values: vals }).then(function () { ui.msg.textContent = 'Titre Google enregistré ✓'; setTimeout(function () { location.reload(); }, 500); }).catch(function (e) { alert(e.message); });
  }

  document.addEventListener('lh-adminbar', function (ev) {
    if (!document.querySelector('[data-k]')) return;
    var inner = ev.detail.inner, before = ev.detail.link;
    function btn(t, cls, fn, title) { var b = el('button', { type: 'button', class: 'cms-btn ' + (cls || ''), text: t, title: title || t }); b.addEventListener('click', fn); return b; }
    ui.start = btn('✏️ Modifier la page', '', start);
    ui.save = btn('Enregistrer', 'primary', save);
    ui.msg = el('span', { class: 'cms-msg' });
    ui.edit = el('span', { class: 'cms-edit' }, el('span', { class: 'cms-hint', text: 'Cliquez sur un texte pour le modifier.' }), ui.save, btn('Annuler', '', cancel),
      btn('➕ Section', '', function () { blocks.push({ i: 'b' + Date.now().toString(36), t: 'Nouveau titre', p: 'Votre texte ici…', im: '', s: '' }); markBlocks(); renderBlocks(); var last = $('.custom-block').pop(); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 'Ajouter une section avec titre, texte et photo'),
      btn('🔗 Lien', '', editLink, 'Changer l\'adresse du bouton ou du lien sélectionné'), btn('🔍 Titre Google', '', editSeo, 'Titre et description de la page pour Google'),
      btn('Rétablir cette page', '', reset), ui.msg);
    ui.edit.style.display = 'none';
    inner.insertBefore(ui.start, before); inner.insertBefore(ui.edit, before);
  });
})();
