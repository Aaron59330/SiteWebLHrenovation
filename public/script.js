/* Outils communs : appels API et création d'éléments (le texte est toujours inséré en textContent) */
window.LH = {
  api: function (method, url, body) {
    var o = { method: method, headers: {}, credentials: 'same-origin' };
    if (body === undefined && method !== 'GET') body = {};
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(url, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Erreur'); e.status = r.status; throw e; } return d; });
    });
  },
  el: function (tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  },
  stars: function (n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); },
  date: function (d) { return new Date(d.replace(' ', 'T') + (d.length <= 10 ? 'T00:00:00' : 'Z')).toLocaleDateString('fr-FR'); }
};
(function () {
  var a = document.getElementById('nav-account');
  LH.api('GET', '/api/me').then(function (d) {
    if (a && d.user) a.textContent = d.user.name.split(' ')[0];
    if (!d.admin) return;
    document.body.classList.add('is-admin');
    var menu = document.querySelector('.menu');
    if (menu && a) menu.insertBefore(LH.el('a', { href: 'admin.html', class: 'admin-link', text: 'Administration' }), a);
    var bar = LH.el('div', { class: 'adminbar' }, LH.el('div', { class: 'container adminbar-in' },
      LH.el('strong', { text: 'Mode administrateur' }), LH.el('span', { id: 'ab-info', text: '' }),
      LH.el('a', { href: 'admin.html', text: 'Ouvrir l\'administration →' })));
    document.body.insertBefore(bar, document.body.firstChild);
    document.dispatchEvent(new CustomEvent('lh-adminbar', { detail: { inner: bar.firstChild, link: bar.firstChild.lastChild } }));
    LH.api('GET', '/api/admin/summary').then(function (c) {
      document.getElementById('ab-info').textContent = c.newQuotes + ' devis à traiter · ' + c.pendingReviews + ' avis à valider · ' + c.users + ' client' + (c.users > 1 ? 's' : '');
    }).catch(function () {});
  }).catch(function () {});
})();

(function(){
  var b=document.querySelector('.burger'),m=document.querySelector('.menu');
  if(b)b.addEventListener('click',function(){var o=m.classList.toggle('open');b.setAttribute('aria-expanded',o)});
  document.querySelectorAll('.menu a').forEach(function(a){a.addEventListener('click',function(){m.classList.remove('open')})});
  var y=document.getElementById('y');if(y)y.textContent=new Date().getFullYear();
  var els=document.querySelectorAll('.card,.tile,.steps li,.checks li,.head');
  els.forEach(function(e){e.classList.add('reveal')});
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.12});
    els.forEach(function(e){io.observe(e)});
  }else els.forEach(function(e){e.classList.add('in')});
  document.querySelectorAll('[data-count]').forEach(function(el){
    var t=+el.dataset.count,s=el.dataset.suffix||'',n=0,step=Math.max(1,Math.round(t/60));
    var io2=new IntersectionObserver(function(es){if(es[0].isIntersecting){io2.disconnect();var i=setInterval(function(){n=Math.min(t,n+step);el.textContent=n+s;if(n>=t)clearInterval(i)},25)}});
    io2.observe(el);
  });
})();
