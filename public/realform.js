/* Formulaire « réalisation » (titre, type, texte, photos) partagé entre la page Réalisations et l'administration. */
(function () {
  var el = LH.el;
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
  LH.realForm = realForm; LH.resizeImage = resize;
})();
