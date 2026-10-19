(function () {
  var el = LH.el, area = document.getElementById('account-area');
  function field(label, name, type, extra) {
    var i = el('input', Object.assign({ name: name, type: type, required: 'required', maxlength: '200' }, extra || {}));
    return { wrap: el('label', {}, label, i), input: i };
  }
  function authForm(mode) {
    area.textContent = '';
    var reg = mode === 'register';
    var msg = el('p', { class: 'form-msg', role: 'status' });
    var n = reg ? field('Nom et prénom', 'name', 'text', { autocomplete: 'name' }) : null;
    var m = field('E-mail', 'email', 'email', { autocomplete: 'email' });
    var p = field('Mot de passe' + (reg ? ' (8 caractères minimum)' : ''), 'password', 'password', { autocomplete: reg ? 'new-password' : 'current-password', minlength: reg ? '8' : '1' });
    var btn = el('button', { class: 'btn', type: 'submit', text: reg ? 'Créer mon compte' : 'Me connecter' });
    var sw = el('button', { class: 'linklike', type: 'button', text: reg ? 'J\'ai déjà un compte' : 'Créer un compte client' });
    sw.addEventListener('click', function () { authForm(reg ? 'login' : 'register'); });
    var form = el('form', { class: 'form', novalidate: 'novalidate' }, el('h2', { text: reg ? 'Créer un compte' : 'Connexion' }), n && n.wrap, m.wrap, p.wrap, btn, msg, sw);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); btn.disabled = true; msg.className = 'form-msg'; msg.textContent = '…';
      var body = { email: m.input.value, password: p.input.value }; if (n) body.name = n.input.value;
      LH.api('POST', reg ? '/api/register' : '/api/login', body).then(function (d) { location.reload(); })
        .catch(function (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; });
    });
    area.appendChild(form);
  }
  function home(user) {
    area.textContent = '';
    var out = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Me déconnecter' });
    out.addEventListener('click', function () { LH.api('POST', '/api/logout', {}).then(function () { location.reload(); }); });
    area.appendChild(el('div', { class: 'form center' }, el('h2', { text: 'Bonjour ' + user.name.split(' ')[0] + ' 👋' }),
      el('p', { text: 'Vous êtes connecté avec ' + user.email + '.' }),
      el('a', { class: 'btn', href: 'avis.html#deposer', text: 'Laisser un avis sur mes travaux' }),
      el('a', { class: 'btn', href: 'contact.html', text: 'Demander un devis' }), out));
  }
  LH.api('GET', '/api/me').then(function (d) { d.user ? home(d.user) : authForm('login'); }).catch(function () { authForm('login'); });
})();
