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
