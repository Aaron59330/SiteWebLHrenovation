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
  function onClick(e) { if (e.target.closest && !e.target.closest('.adminbar') && e.target.closest('a,button')) e.preventDefault(); }
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
    var present = {}; $('[data-k]').forEach(function (e) { present[baseKey(e.getAttribute('data-k'))] = 1; });
    var keys = Object.keys(overrides).filter(function (k) {
      if (k === 'blocks.' + PAGE || k.indexOf('seo.' + PAGE + '.') === 0 || k.indexOf('layout.' + PAGE + '.') === 0) return true;
      return !!present[baseKey(k.replace(/^href\./, ''))];
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
