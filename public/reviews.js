(function () {
  var el = LH.el;
  var list = document.getElementById('reviews-list');
  if (list) LH.api('GET', '/api/reviews').then(function (d) {
    list.textContent = '';
    if (!d.reviews.length) {
      list.className = 'center';
      list.appendChild(el('p', { text: 'Aucun avis pour le moment. Soyez le premier à partager votre expérience !' }));
      return;
    }
    var max = parseInt(list.getAttribute('data-limit'), 10) || 50;
    d.reviews.slice(0, max).forEach(function (r) {
      list.appendChild(el('blockquote', { class: 'card quote' },
        el('div', { class: 'stars', 'aria-label': r.rating + ' sur 5', text: LH.stars(r.rating) }),
        el('p', { text: '« ' + r.comment + ' »' }),
        el('cite', { text: r.name + (r.work_type ? ' – ' + r.work_type : '') })));
    });
  }).catch(function () { list.textContent = ''; });

  var area = document.getElementById('review-area');
  if (!area) return;
  function loginPrompt() {
    area.textContent = '';
    area.appendChild(el('div', { class: 'form center' },
      el('p', { text: 'Seuls les clients disposant d\'un compte peuvent déposer un avis.' }),
      el('a', { class: 'btn', href: 'compte.html', text: 'Me connecter / créer un compte' })));
  }
  function adminNote() {
    area.textContent = '';
    area.appendChild(el('div', { class: 'form center' }, el('p', { text: 'Les avis sont déposés par les clients depuis leur compte. Vous les validez dans l\'administration.' }),
      el('a', { class: 'btn', href: 'admin.html', text: 'Gérer les avis' })));
  }
  function render(user) {
    area.textContent = '';
    var msg = el('p', { class: 'form-msg', role: 'status' });
    var rating = el('input', { type: 'hidden', name: 'rating', value: '0' });
    var starsBox = el('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': 'Note' });
    for (var i = 1; i <= 5; i++) (function (n) {
      var b = el('button', { type: 'button', class: 'star', 'aria-label': n + ' sur 5', text: '★' });
      b.addEventListener('click', function () { rating.value = n; Array.prototype.forEach.call(starsBox.children, function (c, k) { c.classList.toggle('on', k < n); }); });
      starsBox.appendChild(b);
    })(i);
    var sel = el('select', { name: 'work_type' });
    ['Peinture', 'Rénovation complète', 'Plâtrerie', 'Sols / carrelage', 'Salle de bain', 'Cuisine', 'Autre'].forEach(function (t) { sel.appendChild(el('option', { text: t })); });
    var ta = el('textarea', { name: 'comment', rows: '4', maxlength: '1500', required: 'required', placeholder: 'Racontez votre expérience : qualité du travail, propreté, délais…' });
    var btn = el('button', { class: 'btn', type: 'submit', text: 'Publier mon avis' });
    var form = el('form', { class: 'form', novalidate: 'novalidate' },
      el('p', { text: 'Connecté en tant que ' + user.name }),
      el('label', {}, 'Votre note', starsBox, rating),
      el('label', {}, 'Type de travaux', sel),
      el('label', {}, 'Votre avis', ta), btn, msg);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Envoi…';
      LH.api('POST', '/api/reviews', { rating: rating.value, work_type: sel.value, comment: ta.value }).then(function (r) {
        msg.className = 'form-msg ok'; msg.textContent = r.message; ta.value = ''; loadMine(box);
      }).catch(function (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }).then(function () { btn.disabled = false; });
    });
    var box = el('div', { class: 'mine' });
    area.appendChild(form); area.appendChild(box); loadMine(box);
  }
  function loadMine(box) {
    LH.api('GET', '/api/my-reviews').then(function (rows) {
      box.textContent = '';
      if (!rows.length) return;
      box.appendChild(el('h3', { text: 'Mes avis envoyés' }));
      var labels = { pending: 'En attente de validation', approved: 'Publié', rejected: 'Non publié' };
      rows.forEach(function (r) {
        box.appendChild(el('div', { class: 'mine-row' }, el('span', { class: 'stars', text: LH.stars(r.rating) }),
          el('span', { class: 'badge ' + r.status, text: labels[r.status] }), el('p', { text: r.comment })));
      });
    }).catch(function () {});
  }
  LH.api('GET', '/api/me').then(function (d) { d.user ? render(d.user) : (d.admin ? adminNote() : loginPrompt()); }).catch(loginPrompt);
})();
