(function () {
  var f = document.getElementById('quote-form'), msg = document.getElementById('quote-msg');
  if (!f) return;
  LH.api('GET', '/api/me').then(function (d) { if (d.user) { f.name.value = d.user.name; if (d.user.email) f.email.value = d.user.email; } }).catch(function () {});
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var b = f.querySelector('button'); b.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Envoi en cours…';
    var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
    LH.api('POST', '/api/quotes', data).then(function (r) {
      msg.className = 'form-msg ok'; msg.textContent = r.message; f.reset();
    }).catch(function (err) {
      msg.className = 'form-msg err'; msg.textContent = err.message + ' Vous pouvez aussi nous appeler au 07 86 24 41 54.';
    }).then(function () { b.disabled = false; });
  });
})();
