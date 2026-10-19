/* Textes du site : affiche les textes modifiés par l'administrateur et fournit le mode « Modifier les textes ». */
(function () {
  var root = document.documentElement, overrides = null, domReady = false, applied = false, editing = false, dirty = {}, saving = false;
  root.classList.add('cms-loading');                       // masque brièvement les textes pour éviter un clignotement
  var failsafe = setTimeout(function () { root.classList.remove('cms-loading'); }, 1500);

  function phoneHref(t) { var d = t.replace(/[^0-9+]/g, ''); if (/^0\d{9}$/.test(d)) d = '+33' + d.slice(1); return 'tel:' + d; }
  function syncLinks() {
    var p = document.querySelector('[data-k="contact.phone"]'), m = document.querySelector('[data-k="contact.email"]');
    if (p && p.textContent.trim()) document.querySelectorAll('a[href^="tel:"]').forEach(function (a) { a.setAttribute('href', phoneHref(p.textContent)); });
    if (m && /^[^\s@]+@[^\s@]+$/.test(m.textContent.trim())) document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) { a.setAttribute('href', 'mailto:' + m.textContent.trim()); });
  }
  function apply() {
    if (applied || !domReady || overrides === null) return;
    applied = true;
    document.querySelectorAll('[data-k]').forEach(function (e) { var v = overrides[e.getAttribute('data-k')]; if (v != null) e.textContent = v; });
    syncLinks(); clearTimeout(failsafe); root.classList.remove('cms-loading');
  }
  fetch('/api/content', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (d) { overrides = d || {}; apply(); });
  document.addEventListener('DOMContentLoaded', function () { domReady = true; apply(); });

  /* ---------- Mode édition (administrateur) ---------- */
  var keyOf = function (el) { return el.getAttribute('data-k'); };
  function onInput(e) {
    var el = e.target.closest && e.target.closest('[data-k]'); if (!el) return;
    var k = keyOf(el), v = el.textContent; dirty[k] = v;
    document.querySelectorAll('[data-k="' + k + '"]').forEach(function (o) { if (o !== el) o.textContent = v; });
    if (k === 'contact.phone' || k === 'contact.email') syncLinks();
    refresh();
  }
  function onKey(e) { if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-k]')) e.preventDefault(); }
  function onPaste(e) {
    if (!(e.target.closest && e.target.closest('[data-k]'))) return;
    e.preventDefault(); var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  }
  function onClick(e) { if (e.target.closest && !e.target.closest('.adminbar') && e.target.closest('a,button')) e.preventDefault(); }
  function onSubmit(e) { e.preventDefault(); }
  function beforeUnload(e) { if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; } }

  var ui = {};
  function refresh() { if (ui.save) { var n = Object.keys(dirty).length; ui.save.textContent = n ? 'Enregistrer (' + n + ')' : 'Enregistrer'; ui.save.disabled = !n || saving; } }
  function start() {
    editing = true; document.body.classList.add('cms-editing');
    document.querySelectorAll('[data-k]').forEach(function (e) { e.setAttribute('contenteditable', 'true'); e.setAttribute('spellcheck', 'false'); });
    document.addEventListener('input', onInput); document.addEventListener('keydown', onKey); document.addEventListener('paste', onPaste);
    document.addEventListener('click', onClick, true); document.addEventListener('submit', onSubmit, true); window.addEventListener('beforeunload', beforeUnload);
    ui.start.style.display = 'none'; ui.edit.style.display = ''; refresh();
  }
  function save() {
    var n = Object.keys(dirty).length; if (!n || saving) return;
    saving = true; refresh(); ui.msg.textContent = 'Enregistrement…';
    LH.api('PUT', '/api/admin/content', { values: dirty }).then(function () { dirty = {}; ui.msg.textContent = 'Enregistré ✓'; setTimeout(function () { location.reload(); }, 500); })
      .catch(function (err) { saving = false; ui.msg.textContent = 'Erreur : ' + err.message; refresh(); });
  }
  function cancel() { if (Object.keys(dirty).length && !confirm('Annuler vos modifications non enregistrées ?')) return; dirty = {}; location.reload(); }
  function reset() {
    if (!confirm('Rétablir les textes d\'origine de cette page (menu et pied de page compris) ? Vos modifications seront perdues.')) return;
    var keys = []; document.querySelectorAll('[data-k]').forEach(function (e) { var k = keyOf(e); if (keys.indexOf(k) < 0) keys.push(k); });
    LH.api('POST', '/api/admin/content/reset', { keys: keys }).then(function () { dirty = {}; location.reload(); }).catch(function (err) { ui.msg.textContent = 'Erreur : ' + err.message; });
  }
  document.addEventListener('lh-adminbar', function (ev) {
    if (!document.querySelector('[data-k]')) return;
    var el = LH.el, inner = ev.detail.inner, before = ev.detail.link;
    function btn(t, cls, fn) { var b = el('button', { type: 'button', class: 'cms-btn ' + (cls || ''), text: t }); b.addEventListener('click', fn); return b; }
    ui.start = btn('✏️ Modifier les textes', '', start);
    ui.save = btn('Enregistrer', 'primary', save);
    ui.msg = el('span', { class: 'cms-msg' });
    ui.edit = el('span', { class: 'cms-edit' }, el('span', { class: 'cms-hint', text: 'Cliquez sur un texte pour le modifier.' }), ui.save, btn('Annuler', '', cancel), btn('Rétablir cette page', '', reset), ui.msg);
    ui.edit.style.display = 'none';
    inner.insertBefore(ui.start, before); inner.insertBefore(ui.edit, before);
  });
})();
