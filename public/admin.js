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
    [['quotes', 'Demandes de devis'], ['reviews', 'Avis'], ['users', 'Clients']].forEach(function (t) {
      var b = button(t[1], t[0] === tab ? 'on' : '', function () { tab = t[0]; dash(); }); tabs.appendChild(b);
    });
    bar.appendChild(tabs);
    bar.appendChild(button('Déconnexion', '', function () { LH.api('POST', '/api/admin/logout', {}).then(login); }));
    area.appendChild(bar);
    area.appendChild(el('div', { id: 'admin-body' }));
    show();
  }
  function show() {
    var body = document.getElementById('admin-body'); if (!body) return;
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
  LH.api('GET', '/api/admin/session').then(function (d) { d.admin ? dash() : login(); }).catch(login);
})();
