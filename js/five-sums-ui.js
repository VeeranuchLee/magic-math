import {FIVE_SUMS_TITLE,FIVE_SUMS_MODES,makeBag,draw,emptyBoard,validateMove,applyMove,formedLines,arithmetic,hintFor,findMove,key} from '../engine/five-sums.js';

const q=new URLSearchParams(location.search);
const theme=q.get('theme')==='garden'?'garden':'space';
const SEED=Number(q.get('seed'))||20260929;

const state={
  // Five Family is the default mode (owner 2026-09-30: "make this the default setting pls.").
  theme,mode:'family',help:'learn',
  board:emptyBoard(),bag:makeBag(SEED,200,'family'),
  rack:[],pending:[],selected:null,misses:0,score:0,
  message:'Place tiles to make 5, 10, 15, 20.',celebration:'',reveal:null,lastReturn:null
};

/* Help-scaffold labels are deliberately different words from the mode names
 * (Make 5 / Make 10 / Five Family / Challenge) even though the "challenge"
 * help tier and the "Challenge" mode share the same THRESHOLD BEHAVIOUR --
 * two buttons must never show the same word on screen at once. The stored
 * id stays 'challenge' so engine/help-level logic is unchanged. */
const HELP_LABELS={learn:'Learn',normal:'Normal',challenge:'Expert'};
const VOICE={start:'Place number tiles in one line. Make the target sum.',hint:'Add the numbers in your line. What number do you still need?',reveal:'Try the glowing square and tile.',win:'Great sum!'};

function sfx(kind){
  const A=window.AudioContext||window.webkitAudioContext; if(!A)return;
  const a=sfx.a||(sfx.a=new A), o=a.createOscillator(), g=a.createGain(), now=a.currentTime;
  o.type=kind==='wrong'?'sawtooth':'sine';
  o.frequency.setValueAtTime(kind==='wrong'?180:kind==='tap'?360:620,now);
  if(kind==='win')o.frequency.exponentialRampToValueAtTime(1100,now+.28);
  g.gain.setValueAtTime(.12,now); g.gain.exponentialRampToValueAtTime(.001,now+.3);
  o.connect(g).connect(a.destination); o.start(); o.stop(now+.31);
}

function targetText(){const m=FIVE_SUMS_MODES[state.mode];return m.targets?'make '+m.targets.join(', '):'make a multiple of 5';}

function resetBagForMode(){state.bag=makeBag(SEED+state.mode.length,200,state.mode);}

function deal(){
  const d=draw(state.bag,5);
  state.rack=d.tiles;
  state.bag=d.bag.length<15?d.bag.concat(makeBag(state.score+17,80,state.mode)):d.bag;
  state.pending=[]; state.selected=null; state.misses=0; state.reveal=null; state.lastReturn=null;
  state.message='Place tiles to '+targetText()+'.';
  render();
}

function currentArithmetic(){
  if(!state.pending.length)return '';
  const lines=formedLines(state.board,state.pending);
  if(lines.length)return lines.map(arithmetic).join('  •  ');
  return state.pending.map(p=>p.value).join(' + ')+' = '+state.pending.reduce((n,p)=>n+p.value,0);
}

function place(index,r,c){
  if(index==null||state.rack[index]==null||state.pending.some(p=>p.r===r&&p.c===c)||state.board.cells[key(r,c)]!=null){
    sfx('wrong'); state.message='Choose a free tile and an empty square.'; render(); return;
  }
  const value=state.rack[index];
  state.pending.push({r,c,value,rackIndex:index});
  state.rack[index]=null; // Tile leaves its own tray slot, lives on the board as pending
  state.selected=null; state.lastReturn=null; sfx('tap');
  state.message=state.help==='learn'?currentArithmetic()+' — '+targetText()+'.':currentArithmetic();
  render();
}

// Tapping a tile you placed THIS turn (pending, not committed) sends it back to
// the tray — to its original slot if that slot is free, else the first free slot.
// Tiles already committed by earlier turns live in state.board.cells, not
// state.pending, so they never match here and produce no sound.
function removePlacement(r,c){
  const idx=state.pending.findIndex(p=>p.r===r&&p.c===c);
  if(idx===-1)return; // Not a pending tile — silent no-op (committed tiles)
  const p=state.pending[idx];
  state.pending.splice(idx,1);
  const slot=p.rackIndex;
  if(state.rack[slot]==null){state.rack[slot]=p.value;}
  else{const free=state.rack.findIndex(n=>n==null);if(free!==-1)state.rack[free]=p.value;}
  state.lastReturn=slot;
  sfx('tap');
  state.message=state.pending.length?currentArithmetic()+' — '+targetText()+'.':'Returned to your tray.';
  state.selected=null;
  render();
  setTimeout(()=>{state.lastReturn=null;render();},400);
}

function submit(){
  const v=validateMove(state.board,state.pending,state.mode);
  if(!v.ok){
    state.misses++; state.message=v.message;
    // For hint-finding, treat pending cells as occupied (so the hint never
    // suggests placing on top of a tile the child just laid down this turn)
    // and restore pending tile values to the rack (so findMove can suggest
    // a complete new line even when some tray slots are blanked by place()).
    const hintBoard=applyMove(state.board,state.pending);
    const hintRack=state.rack.map((n,i)=>{if(n!=null)return n;const p=state.pending.find(p=>p.rackIndex===i);return p?p.value:null;});
    const h=hintFor(state.misses,findMove(hintBoard,hintRack,state.mode));
    if(h){state.message+=' '+h.text; if(h.level===3)state.reveal=h.placements;}
    sfx('wrong'); render(); return;
  }
  state.board=applyMove(state.board,state.pending);
  state.score+=v.score;
  state.lastReturn=null;
  state.pending.forEach(p=>state.rack[p.rackIndex]=null);
  state.message=v.lines.map(arithmetic).join('  •  ');
  state.celebration=v.celebration;
  sfx('win'); render();
  setTimeout(()=>{state.celebration=''; if(state.rack.filter(Boolean).length<2)deal(); else render();},900);
}

function undo(){
  sfx('tap');
  // Restore every pending tile to its original tray slot (place() blanks the
  // slot when a tile is placed, so undo must give it back).
  state.pending.forEach(p=>{if(state.rack[p.rackIndex]==null)state.rack[p.rackIndex]=p.value;});
  state.lastReturn=null;
  state.pending=[]; state.reveal=null;
  state.message='Undone — choose again.';
  render();
}

function replay(){
  sfx('tap');
  const bubble=state.misses>=3?VOICE.reveal:state.misses>=2?VOICE.hint:VOICE.start;
  state.message=bubble+' '+(currentArithmetic()||'');
  render();
}

const CORNER_ART={space:'assets/space/icons/rainbow-star.png',garden:'assets/unicorn/icons/flower-pink.png'};
const CELEBRATION_ART={
  space:{double:['assets/space/icons/sparkle-blue.png','assets/space/icons/sparkle-purple.png'],grand:['assets/space/icons/glowstar-gold.png','assets/space/icons/glowstar-purple.png','assets/space/icons/trophy.png'],line:['assets/space/icons/sparkle-green.png']},
  garden:{double:['assets/unicorn/icons/flower-blue.png','assets/unicorn/icons/flower-coral.png'],grand:['assets/unicorn/icons/bouquet.png','assets/unicorn/icons/rainbow.png','assets/unicorn/icons/flower-purple.png'],line:['assets/unicorn/icons/sparkle.png']}
};
function spritesRow(theme,celebration){
  const art=CELEBRATION_ART[theme][celebration]||[];
  return art.length?`<div class="sprites-row">${art.map(src=>`<img src="${src}" alt="" aria-hidden="true">`).join('')}</div>`:'';
}

function render(){
  const mode=FIVE_SUMS_MODES[state.mode];
  const boardEmpty=Object.keys(state.board.cells).length===0 && !state.pending.length;
  const h=[];
  for(let r=0;r<7;r++)for(let c=0;c<7;c++){
    const fixed=state.board.cells[key(r,c)];
    const p=state.pending.find(x=>x.r===r&&x.c===c);
    const rev=state.reveal&&state.reveal.some(x=>x.r===r&&x.c===c);
    const isCenter=r===3&&c===3;
    const cue=isCenter&&boardEmpty;
    h.push(`<button class="cell ${isCenter?'center ':''}${p?'pending ':''}${rev?'reveal ':''}${cue?'cue':''}" data-r="${r}" data-c="${c}" aria-label="row ${r+1}, column ${c+1}${fixed!=null?', '+fixed:''}">${p?p.value:fixed??''}</button>`);
  }
  const tiles=state.rack.map((n,i)=>`<button class="tile ${state.selected===i?'selected ':''}${n==null?'used':''}${i===state.lastReturn?' returning':''}" data-tile="${i}" draggable="${n!=null}" aria-label="number ${n??'used'}">${n??''}</button>`).join('');
  const corner=CORNER_ART[state.theme];
  const modeRow=Object.values(FIVE_SUMS_MODES).map(m=>`<button data-mode="${m.id}" aria-pressed="${m.id===state.mode}">${m.label}</button>`).join('');
  const helpRow=Object.keys(HELP_LABELS).map(x=>`<button data-help="${x}" aria-pressed="${x===state.help}">${HELP_LABELS[x]}</button>`).join('');
  const firstMoveHint=boardEmpty&&state.help==='learn'?`<div class="first-move-hint" aria-hidden="true">👆 Tap the glowing square first</div>`:'';
  document.querySelector('#app').innerHTML=`<section class="game ${state.theme}">
    <header class="top">
      <a class="round" href="${state.theme==='space'?'space-math.html':'unicorn-math.html'}" aria-label="Back">←</a>
      <h1 class="title">${FIVE_SUMS_TITLE}</h1>
      <button class="round speaker" id="speaker" aria-label="Hear the instruction">🔊</button>
    </header>
    <div class="controls-group">
      <div class="controls-row"><span class="row-caption">Game</span><nav class="controls" aria-label="Choose a game">${modeRow}</nav></div>
      <div class="controls-row help"><span class="row-caption">Help</span><nav class="controls small" aria-label="Choose how much help">${helpRow}</nav></div>
    </div>
    <div class="status"><span>${state.message}</span><strong class="equation">${currentArithmetic()}</strong></div>
    <div class="play">
      <div class="board-area">
        ${firstMoveHint}
        <div class="board-wrap">
          <div class="backdrop"></div>
          <img class="corner tl" src="${corner}" alt="" aria-hidden="true"><img class="corner tr" src="${corner}" alt="" aria-hidden="true">
          <img class="corner bl" src="${corner}" alt="" aria-hidden="true"><img class="corner br" src="${corner}" alt="" aria-hidden="true">
          <div class="board">${h.join('')}</div>
        </div>
      </div>
      <aside class="side">
        <div class="target">${mode.label}<br>Score ${state.score}</div>
        <div class="rack">${tiles}</div>
        <div class="actions">
          <button class="clear" id="clear" aria-label="Undo this placement">↺ Undo</button>
          <button class="submit" id="submit">Play line</button>
        </div>
      </aside>
    </div>
    ${state.celebration?`<div class="celebrate"><span>${state.celebration==='double'?(state.theme==='space'?'Double Orbit!':'Double Bloom!'):state.celebration==='grand'?'Super Star Sums!':'Great sum!'}</span>${spritesRow(state.theme,state.celebration)}</div>`:''}
  </section>`;
  bind();
  fitBoard();
  window.__fiveSums={state,place,submit,undo,removePlacement,render,validateMove,fitBoard};
}

/* Sizes the square board to whatever room .board-area actually has, so the
 * 7x7 grid can never run past the bottom of the viewport (or the side, in
 * portrait) the way a pure-CSS aspect-ratio box can when the surrounding
 * chrome's real height is not known in advance. Recomputed after every
 * render and on resize/orientation change. */
function fitBoard(){
  const area=document.querySelector('.board-area');
  const wrap=document.querySelector('.board-wrap');
  if(!area||!wrap)return;
  const w=area.clientWidth, hgt=area.clientHeight;
  if(w<=0||hgt<=0)return;
  const size=Math.max(320,Math.min(w,hgt));
  wrap.style.width=size+'px';
  wrap.style.height=size+'px';
}
window.addEventListener('resize',fitBoard);
window.addEventListener('orientationchange',()=>setTimeout(fitBoard,50));

function bind(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    sfx('tap'); state.mode=b.dataset.mode; state.board=emptyBoard(); resetBagForMode(); deal();
  });
  document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{
    sfx('tap'); state.help=b.dataset.help; state.message=HELP_LABELS[b.dataset.help]+' help is on.'; render();
  });
  document.querySelectorAll('[data-tile]').forEach(b=>{
    b.onclick=()=>{if(state.rack[+b.dataset.tile]==null)return sfx('wrong'); sfx('tap'); state.selected=+b.dataset.tile; render();};
    b.ondragstart=e=>e.dataTransfer.setData('text/plain',b.dataset.tile);
  });
  document.querySelectorAll('.cell').forEach(b=>{
    b.onclick=()=>{
      const r=+b.dataset.r, c=+b.dataset.c;
      if(state.pending.some(p=>p.r===r&&p.c===c)){
        removePlacement(r,c);
      }else{
        place(state.selected,r,c);
      }
    };
    b.ondragover=e=>e.preventDefault();
    b.ondrop=e=>{e.preventDefault(); place(+e.dataTransfer.getData('text/plain'),+b.dataset.r,+b.dataset.c);};
  });
  document.querySelector('#submit').onclick=submit;
  document.querySelector('#clear').onclick=undo;
  document.querySelector('#speaker').onclick=replay;
}

deal();
