(function () {
  var el = LH.el, area = document.getElementById('admin-area'), tab = 'quotes';
  function login() {
    area.textContent = '';
    var msg = el('p', { class: 'form-msg', role: 'status' });
    var m = el('input', { type: 'email', required: 'required', autocomplete: 'username' });
    var p = el('input', { type: 'password', required: 'required', autocomplete: 'current-password' });
    var btn = el('button', { class: 'btn', type: 'submit', text: 'Connexion' });
    var form = el('form', { class: 'form admin-login' }, el('h2', { text: 'Espace administrateur' }), el('label', {}, 'E-mail', m), el('label', {}, 'Mot de passe', p), btn, msg);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); btn.disabled = true;
      LH.api('POST', '/api/admin/login', { email: m.value, password: p.value }).then(dash)
        .catch(function (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; });
    });
    area.appendChild(form);
  }
  function act(method, url, body) { return LH.api(method, url, body).then(function () { show(); }).catch(function (e) { if (e.status === 401) login(); else alert(e.message); }); }
  function button(text, cls, fn) { var b = el('button', { type: 'button', class: 'abtn ' + (cls || ''), text: text }); b.addEventListener('click', fn); return b; }
  function dash() {
    area.textContent = '';
    var bar = el('div', { class: 'admin-bar' }, el('h2', { text: 'Administration' }));
    var tabs = el('div', { class: 'tabs' });
    var tabBtns = {};
    [['quotes', 'Demandes de devis'], ['reviews', 'Avis'], ['realisations', 'Réalisations'], ['users', 'Clients']].forEach(function (t) {
      var b = button(t[1], t[0] === tab ? 'on' : '', function () { tab = t[0]; dash(); }); tabs.appendChild(b); tabBtns[t[0]] = [b, t[1]];
    });
    LH.api('GET', '/api/admin/summary').then(function (c) {
      if (c.newQuotes) tabBtns.quotes[0].textContent = tabBtns.quotes[1] + ' (' + c.newQuotes + ' nouvelle' + (c.newQuotes > 1 ? 's' : '') + ')';
      if (c.pendingReviews) tabBtns.reviews[0].textContent = tabBtns.reviews[1] + ' (' + c.pendingReviews + ' à valider)';
    }).catch(function () {});
    bar.appendChild(tabs);
    bar.appendChild(button('Déconnexion', '', function () { LH.api('POST', '/api/logout', {}).then(function () { location.href = 'index.html'; }); }));
    area.appendChild(bar);
    area.appendChild(el('div', { id: 'admin-body' }));
    show();
  }
  function show() {
    var body = document.getElementById('admin-body'); if (!body) return;
    if (tab === 'realisations') return showReal(body);
    LH.api('GET', '/api/admin/' + tab).then(function (rows) {
      body.textContent = '';
      if (!rows.length) { body.appendChild(el('p', { class: 'center', text: 'Rien à afficher pour le moment.' })); return; }
      rows.forEach(function (r) {
        var head, acts = el('div', { class: 'acts' }), text;
        if (tab === 'quotes') {
          head = el('strong', { text: r.name + ' – ' + (r.work_type || '') });
          text = el('p', { text: r.message });
          var contact = el('p', { class: 'meta' }, el('a', { href: 'tel:' + r.phone.replace(/[^0-9+]/g, ''), text: r.phone }), r.email ? ' · ' : '', r.email ? el('a', { href: 'mailto:' + r.email, text: r.email }) : null, ' · ' + LH.date(r.created_at));
          acts.appendChild(button(r.status === 'new' ? 'Marquer traité' : 'Rouvrir', '', function () { act('PATCH', '/api/admin/quotes/' + r.id, { status: r.status === 'new' ? 'done' : 'new' }); }));
          acts.appendChild(button('Supprimer', 'danger', function () { if (confirm('Supprimer cette demande ?')) act('DELETE', '/api/admin/quotes/' + r.id); }));
          body.appendChild(el('div', { class: 'arow ' + r.status }, el('div', { class: 'ahead' }, head, el('span', { class: 'badge ' + r.status, text: r.status === 'new' ? 'Nouveau' : 'Traité' })), contact, text, acts));
        } else if (tab === 'reviews') {
          head = el('strong', { text: r.user_name + ' – ' + (r.work_type || '') });
          var lab = { pending: 'À valider', approved: 'Publié', rejected: 'Refusé' };
          if (r.status !== 'approved') acts.appendChild(button('Publier', '', function () { act('PATCH', '/api/admin/reviews/' + r.id, { status: 'approved' }); }));
          if (r.status !== 'rejected') acts.appendChild(button('Refuser', '', function () { act('PATCH', '/api/admin/reviews/' + r.id, { status: 'rejected' }); }));
          acts.appendChild(button('Supprimer', 'danger', function () { if (confirm('Supprimer cet avis ?')) act('DELETE', '/api/admin/reviews/' + r.id); }));
          body.appendChild(el('div', { class: 'arow ' + r.status }, el('div', { class: 'ahead' }, head, el('span', { class: 'stars', text: LH.stars(r.rating) }), el('span', { class: 'badge ' + r.status, text: lab[r.status] })),
            el('p', { class: 'meta', text: r.user_email + ' · ' + LH.date(r.created_at) }), el('p', { text: r.comment }), acts));
        } else {
          acts.appendChild(button('Supprimer le compte', 'danger', function () { if (confirm('Supprimer ce compte et ses avis ?')) act('DELETE', '/api/admin/users/' + r.id); }));
          body.appendChild(el('div', { class: 'arow' }, el('div', { class: 'ahead' }, el('strong', { text: r.name })), el('p', { class: 'meta', text: r.email + ' · inscrit le ' + LH.date(r.created_at) }), acts));
        }
      });
    }).catch(function (e) { if (e.status === 401) login(); });
  }

  /* ----- Réalisations : photos + textes ----- */
  var TYPES = ['Peinture', 'Rénovation complète', 'Plâtrerie', 'Sols / carrelage', 'Salle de bain', 'Cuisine', 'Autre'];
  function resize(file) {   // réduit la photo (1600 px max) avant l'envoi : plus rapide, et accepte les photos de téléphone
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onerror = function () { ko(new Error('Lecture impossible : ' + file.name)); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { ko(new Error('Format non pris en charge : ' + file.name + ' (utilisez JPEG, PNG ou WebP).')); };
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.85));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function realForm(item, done) {
    var st = { keep: item ? item.images.slice() : [], add: [] };
    var title = el('input', { type: 'text', maxlength: '120', required: 'required', value: item ? item.title : '', placeholder: 'Ex. Rénovation salle de bain – Hautmont' });
    var sel = el('select', {}); TYPES.forEach(function (t) { var o = el('option', { text: t }); if (item && item.work_type === t) o.selected = true; sel.appendChild(o); });
    var desc = el('textarea', { rows: '4', maxlength: '2000', placeholder: 'Décrivez les travaux réalisés…' }); desc.value = item ? (item.description || '') : '';
    var thumbs = el('div', { class: 'thumbs' });
    var file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', multiple: 'multiple' });
    var msg = el('p', { class: 'form-msg', role: 'status' });
    var btn = el('button', { class: 'btn', type: 'submit', text: item ? 'Enregistrer les modifications' : 'Publier la réalisation' });
    function drawThumbs() {
      thumbs.textContent = '';
      var all = st.keep.map(function (u, i) { return { src: u, rm: function () { st.keep.splice(i, 1); drawThumbs(); } }; })
        .concat(st.add.map(function (u, i) { return { src: u, rm: function () { st.add.splice(i, 1); drawThumbs(); } }; }));
      all.forEach(function (t, i) {
        var x = el('button', { type: 'button', 'aria-label': 'Retirer cette photo', text: '×' }); x.addEventListener('click', t.rm);
        thumbs.appendChild(el('div', { class: 'thumb' + (i === 0 ? ' first' : '') }, el('img', { src: t.src, alt: '' }), x));
      });
    }
    file.addEventListener('change', function () {
      var files = Array.prototype.slice.call(file.files); msg.className = 'form-msg'; msg.textContent = 'Préparation des photos…';
      Promise.all(files.map(resize)).then(function (urls) { st.add = st.add.concat(urls); file.value = ''; msg.textContent = ''; drawThumbs(); })
        .catch(function (e) { msg.className = 'form-msg err'; msg.textContent = e.message; });
    });
    var form = el('form', { class: 'rform', novalidate: 'novalidate' },
      el('h3', { text: item ? 'Modifier la réalisation' : 'Ajouter une réalisation' }),
      el('label', {}, 'Titre', title), el('label', {}, 'Type de travaux', sel), el('label', {}, 'Texte de présentation', desc),
      el('label', {}, 'Photos (la première sert de couverture, 8 maximum)', file), thumbs, btn, msg);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Envoi en cours…';
      var body = { title: title.value, work_type: sel.value, description: desc.value, keep: st.keep, add: st.add };
      LH.api(item ? 'PUT' : 'POST', '/api/admin/realisations' + (item ? '/' + item.id : ''), body)
        .then(function () { done(); }).catch(function (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; });
    });
    drawThumbs();
    return form;
  }
  function showReal(body) {
    body.textContent = '';
    var list = el('div', {}), addBox = el('div', {});
    // texte d'introduction de la page
    LH.api('GET', '/api/realisations').then(function (d) {
      var t = el('input', { type: 'text', maxlength: '150', value: d.intro.title }), x = el('textarea', { rows: '2', maxlength: '500' }); x.value = d.intro.text;
      var b = el('button', { class: 'btn', type: 'submit', text: 'Enregistrer le texte' }), m = el('p', { class: 'form-msg', role: 'status' });
      var f = el('form', { class: 'rform' }, el('h3', { text: 'Texte de la page Réalisations' }), el('label', {}, 'Titre', t), el('label', {}, 'Texte d\'introduction', x), b, m);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        LH.api('PUT', '/api/admin/realisations-text', { title: t.value, text: x.value })
          .then(function () { m.className = 'form-msg ok'; m.textContent = 'Texte enregistré.'; }).catch(function (er) { m.className = 'form-msg err'; m.textContent = er.message; });
      });
      body.insertBefore(f, body.firstChild);
    }).catch(function () {});
    var addBtn = button('+ Ajouter une réalisation', 'on', function () {
      addBox.textContent = ''; addBox.appendChild(realForm(null, function () { showReal(body); }));
    });
    body.appendChild(el('div', { class: 'addwrap' }, addBtn)); body.appendChild(addBox); body.appendChild(list);
    LH.api('GET', '/api/admin/realisations').then(function (rows) {
      if (!rows.length) { list.appendChild(el('p', { class: 'center', text: 'Aucune réalisation pour le moment. Ajoutez la première !' })); return; }
      rows.forEach(function (r) {
        var holder = el('div', { class: 'arow' });
        var acts = el('div', { class: 'acts' });
        acts.appendChild(button('Modifier', '', function () { holder.textContent = ''; holder.appendChild(realForm(r, function () { showReal(body); })); }));
        acts.appendChild(button('Supprimer', 'danger', function () { if (confirm('Supprimer cette réalisation et ses photos ?')) act('DELETE', '/api/admin/realisations/' + r.id); }));
        holder.appendChild(el('div', { class: 'rrow' }, el('img', { class: 'cover', src: r.images[0], alt: '' }),
          el('div', { class: 'info' }, el('strong', { text: r.title }), el('span', { class: 'badge', text: r.work_type || '' }),
            el('p', { text: r.description || '' }), el('p', { class: 'meta', text: r.images.length + ' photo' + (r.images.length > 1 ? 's' : '') }), acts)));
        list.appendChild(holder);
      });
    }).catch(function (e) { if (e.status === 401) login(); });
  }
  LH.api('GET', '/api/admin/session').then(function (d) { d.admin ? dash() : login(); }).catch(login);
})();
