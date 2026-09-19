(function(global){
  'use strict';

  function randomInt(min,max){
    return Math.floor(Math.random()*(max-min+1))+min;
  }

  function initBgDeco(target,options){
    if(!target||typeof target.appendChild!=='function'){
      throw new TypeError('initBgDeco target must be a DOM element');
    }
    options=options||{};
    var icons=options.icons||[];
    var count=options.count==null?icons.length:options.count;
    var topMax=options.topMax==null?92:options.topMax;
    var sizeMax=options.sizeMax==null?34:options.sizeMax;
    var text=options.type==='text';
    var items=[];
    target.classList.add('bg-deco');
    target.setAttribute('aria-hidden','true');
    target.style.setProperty('--deco-glow',options.glow||'transparent');
    target.style.setProperty('--deco-glow-radius',(options.glowRadius==null?6:options.glowRadius)+'px');

    for(var i=0;i<count&&icons.length;i++){
      var item=target.ownerDocument.createElement(text?'span':'img');
      var icon=icons[i%icons.length];
      var left=randomInt(2,95);
      var top=randomInt(2,topMax);
      var duration=randomInt(14,34)/10;
      var delay=randomInt(0,30)/10;
      var size=randomInt(16,sizeMax);
      var opacity=(randomInt(28,58)/100).toFixed(2);
      item.className='bg-deco-item';
      if(text){
        item.textContent=icon;
        item.style.fontSize=size+'px';
      }else{
        item.src=icon;
        item.alt='';
        item.style.width=size+'px';
        item.style.height=size+'px';
      }
      item.style.left=left+'%';
      item.style.top=top+'%';
      item.style.setProperty('--deco-opacity',opacity);
      item.style.animation='twinkleDeco '+duration+'s -'+delay+'s ease-in-out infinite alternate';
      target.appendChild(item);
      items.push(item);
    }

    return function(){
      items.forEach(function(item){
        if(item.parentNode===target)target.removeChild(item);
      });
      target.classList.remove('bg-deco');
      target.removeAttribute('aria-hidden');
      target.style.removeProperty('--deco-glow');
      target.style.removeProperty('--deco-glow-radius');
    };
  }

  global.initBgDeco=initBgDeco;
})(typeof window!=='undefined'?window:this);
