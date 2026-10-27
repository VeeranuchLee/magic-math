(function(root){
'use strict';

const WORLDS={
  length:{title:'Length',unit:'cm',big:'m',fact:100,summary:'1 m = 100 cm',rungs:['Longer?','1 m','Halves','Ruler','mm','km','Hard','Mix']},
  mass:{title:'Mass',unit:'g',big:'kg',fact:1000,summary:'1 kg = 1,000 g',rungs:['Heavier?','1 kg','Parts','Scale','Mix']},
  capacity:{title:'Capacity',unit:'ml',big:'l',fact:1000,summary:'1 l = 1,000 ml',rungs:['More?','1 l','Parts','Jug','Mix']}
};
/* Owner, 2026-10-25: "we also need the mix". Every world's LAST tab is Mix, which
   deals from all of that world's other rungs; the world picker's fourth card, ALL,
   deals from every rung of every world. Mix has no bank of its own. */
const MIX_LABEL='Mix';
const ALL='all';
function mixRung(world){return WORLDS[world].rungs.length;}
function isMix(world,rung){return world===ALL||rung===mixRung(world);}

const BANK={
  length:[
    [
      {prompt:'Which is longer?',answer:'1 m stick',choices:['1 m stick','10 cm ruler','50 cm string'],art:'length-compare',values:{'1 m stick':100,'10 cm ruler':10,'50 cm string':50}},
      {prompt:'Which is longer?',answer:'80 cm ribbon',choices:['20 cm pencil','80 cm ribbon','40 cm brush'],art:'length-compare',values:{'20 cm pencil':20,'80 cm ribbon':80,'40 cm brush':40}}
    ],
    [
      {prompt:'How many centimetres make 1 metre?',answer:'100',choices:['10','100','1,000'],art:'length-blocks',count:1},
      {prompt:'This ribbon is 2 metres. How many centimetres?',answer:'200',choices:['2','20','200'],art:'length-blocks',count:2}
    ],
    [
      {prompt:'Half a metre is how many centimetres?',answer:'50',choices:['5','50','500'],art:'half-stick',fill:.5},
      {prompt:'One and a half metres is how many centimetres?',answer:'150',choices:['15','150','1,500'],art:'half-stick',fill:1.5},
      {prompt:'Two and a half metres is how many centimetres?',answer:'250',choices:['25','250','2,500'],art:'half-stick',fill:2.5}
    ],
    [20,40,60,80,100].map(n=>({prompt:'How long is the ribbon?',answer:String(n),choices:[String(n),String(n===100?80:n+10),String(n===20?40:n-10)],art:'ruler',level:n})),
    /* mm (owner, 2026-10-25). A ruler zoomed until every millimetre is a finger-wide
       gap: `span` whole centimetres across the picture, `level` is where the thing ends
       in millimetres, and the 2-miss count steps by `step`. */
    [
      {prompt:'How many millimetres make 1 centimetre?',answer:'10',choices:['1','10','100'],art:'mm-ruler',thing:'cm',span:2,level:10,step:1},
      {prompt:'This bead is 3 centimetres. How many millimetres?',answer:'30',choices:['3','30','300'],art:'mm-ruler',thing:'bead',span:4,level:30,step:10},
      ...[6,8,12,14].map(n=>({prompt:'How long is the ladybug in millimetres?',answer:String(n),choices:[String(n),String(n+2),String(n-2)],art:'mm-ruler',thing:'ladybug',span:2,level:n,step:1}))
    ],
    /* km: a road with a sign at every kilometre; `span` kilometres of road, the flag at
       `level` metres. The count steps by 100 m up to 1 km, by whole km beyond. */
    [
      {prompt:'How many metres make 1 kilometre?',answer:'1,000',choices:['10','100','1,000'],art:'km-road',span:1,level:1000,step:100},
      {prompt:'Half a kilometre is how many metres?',answer:'500',choices:['50','500','5,000'],art:'km-road',span:1,level:500,step:100},
      {prompt:'Two kilometres is how many metres?',answer:'2,000',choices:['200','2,000','20,000'],art:'km-road',span:2,level:2000,step:1000}
    ],
    /* Hard: convert first, then compare. Every row is a list of centimetre parts laid
       end to end; before the 2-miss help the parts lie stacked, so the eye cannot add
       them, and the help lays them end to end with a running total. The answer is
       checked against the parts in the tests, never trusted. */
    [
      {prompt:'Which is longer: half a metre, or two 30 centimetre rulers?',answer:'two 30 cm rulers',choices:['half a metre','two 30 cm rulers','the same'],art:'hard-compare',
        rows:[{name:'half a metre',parts:[50]},{name:'two 30 cm rulers',parts:[30,30]}]},
      {prompt:'Which is longer: 1 metre, or three 30 centimetre rulers?',answer:'1 m stick',choices:['1 m stick','three 30 cm rulers','the same'],art:'hard-compare',
        rows:[{name:'1 m stick',parts:[100]},{name:'three 30 cm rulers',parts:[30,30,30]}]},
      {prompt:'Which is longer: half a metre, or three 15 centimetre rulers?',answer:'half a metre',choices:['half a metre','three 15 cm rulers','the same'],art:'hard-compare',
        rows:[{name:'half a metre',parts:[50]},{name:'three 15 cm rulers',parts:[15,15,15]}]},
      {prompt:'Which is longer: the measuring tape, or five 30 centimetre rulers?',answer:'the same',choices:['the tape','five 30 cm rulers','the same'],art:'hard-compare',
        rows:[{name:'the tape',parts:[150]},{name:'five 30 cm rulers',parts:[30,30,30,30,30]}]},
      {prompt:'Which is longer: the measuring tape, or a metre stick and a 30 centimetre ruler?',answer:'the tape',choices:['the tape','1 m stick + 30 cm ruler','the same'],art:'hard-compare',
        rows:[{name:'the tape',parts:[150]},{name:'1 m stick + 30 cm ruler',parts:[100,30]}]},
      {prompt:'How many 30 centimetre rulers make the 150 centimetre tape?',answer:'5',choices:['3','5','15'],art:'tape-rulers',tape:150,tile:30,show:[30]},
      {prompt:'How many 15 centimetre rulers make the 150 centimetre tape?',answer:'10',choices:['5','10','15'],art:'tape-rulers',tape:150,tile:15,show:[15]},
      {prompt:'Which ruler fits along the tape exactly five times?',answer:'30 cm ruler',choices:['15 cm ruler','30 cm ruler','1 m stick'],art:'tape-rulers',tape:150,tile:30,show:[15,30,100],
        names:{15:'15 cm ruler',30:'30 cm ruler',100:'1 m stick'}}
    ]
  ],
  mass:[
    [
      {prompt:'Which is heavier?',answer:'small rock',choices:['big pillow','small rock','book'],art:'balance',heavy:'rock'},
      {prompt:'Which is heavier?',answer:'small apple',choices:['big balloon','small apple','toy block'],art:'balance',heavy:'apple'}
    ],
    [{prompt:'How many grams make 1 kilogram?',answer:'1,000',choices:['100','1,000','10'],art:'mass-weights',count:4}],
    [
      {prompt:'Half a kilogram is how many grams?',answer:'500',choices:['50','500','5,000'],art:'mass-part',fill:.5},
      {prompt:'One quarter of a kilogram is how many grams?',answer:'250',choices:['25','250','2,500'],art:'mass-part',fill:.25},
      {prompt:'Three quarters of a kilogram is how many grams?',answer:'750',choices:['75','750','7,500'],art:'mass-part',fill:.75}
    ],
    [250,500,750,1000].map(n=>({prompt:'What does the scale show?',answer:n===1000?'1,000':String(n),choices:[n===1000?'1,000':String(n),String(n===1000?500:n+250),String(n===250?750:n-250)],art:'dial',level:n}))
  ],
  capacity:[
    [
      {prompt:'Which has more juice?',answer:'the same',choices:['tall glass','wide glass','the same'],art:'same-glasses'},
      {prompt:'Which holds more?',answer:'bucket',choices:['bucket','cup','bowl'],art:'vessels'}
    ],
    [{prompt:'How many millilitres make 1 litre?',answer:'1,000',choices:['100','1,000','10'],art:'litre-cups',count:4}],
    [
      {prompt:'Half a litre is how many millilitres?',answer:'500',choices:['50','500','5,000'],art:'litre-part',fill:.5},
      {prompt:'One quarter of a litre is how many millilitres?',answer:'250',choices:['25','250','2,500'],art:'litre-part',fill:.25},
      {prompt:'Three quarters of a litre is how many millilitres?',answer:'750',choices:['75','750','7,500'],art:'litre-part',fill:.75}
    ],
    [250,500,750,1000].map(n=>({prompt:'How much water is in the jug?',answer:n===1000?'1,000':String(n),choices:[n===1000?'1,000':String(n),String(n===1000?500:n+250),String(n===250?750:n-250)],art:'jug',level:n}))
  ]
};

const ART_KINDS=new Set([
  'length-compare','length-blocks','half-stick','ruler','balance','mass-weights',
  'mass-part','dial','same-glasses','vessels','litre-cups','litre-part','jug',
  'mm-ruler','km-road','hard-compare','tape-rulers'
]);
/* Choices on these cards are words, not one object's picture: a card drawn to scale
   would answer a convert-then-compare question for the child. */
const TEXT_CARD_ARTS=new Set(['hard-compare','tape-rulers']);

function shuffle(rng,a){
  a=a.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

/* The (world, rung) pairs a tab deals from: itself, or for Mix every real rung of the
   world, or for ALL every real rung of every world. */
function sources(world,rung){
  const worlds=world===ALL?Object.keys(WORLDS):[world];
  if(world!==ALL&&!isMix(world,rung))return[{world,rung}];
  return worlds.flatMap(w=>BANK[w].map((_,i)=>({world:w,rung:i+1})));
}

/* Mix picks a RUNG first and then a question in it, so every rung comes up as often
   as every other -- Hard's eight questions do not crowd out mm's six or 1 m's two. */
function question(rng,world,rung,avoid){
  const from=sources(world,rung);
  let s=from[Math.floor(rng()*from.length)];
  let list=BANK[s.world][s.rung-1];
  let i=Math.floor(rng()*list.length);
  if(avoid&&list[i].prompt===avoid.prompt){
    /* Step on to the next question whose words differ -- in this rung if it has one,
       else in the next rung of the mix -- so Next never repeats the prompt. */
    const pool=from.flatMap(f=>BANK[f.world][f.rung-1].map(q=>({q,s:f})));
    const at=pool.findIndex(p=>p.q===list[i]);
    for(let k=1;k<pool.length;k++){
      const p=pool[(at+k)%pool.length];
      if(p.q.prompt!==avoid.prompt){s=p.s;list=[p.q];i=0;break;}
    }
  }
  const q=list[i];
  return Object.assign({},q,{world:s.world,rung:s.rung,tab:{world,rung},choices:shuffle(rng,q.choices)});
}

/* Hard-rung answers, worked from the parts -- the tests hold the bank to these. */
function rowLength(row){return row.parts.reduce((a,b)=>a+b,0);}
function hardAnswer(q){
  if(q.art==='hard-compare'){
    const [a,b]=q.rows.map(rowLength);
    return a===b?'the same':a>b?q.rows[0].name:q.rows[1].name;
  }
  if(q.art==='tape-rulers'){
    if(q.show.length===1)return String(q.tape/q.tile);
    const fits=q.show.filter(cm=>q.tape/cm===5);
    return fits.length===1?q.names[fits[0]]:null;
  }
  return null;
}

function missState(misses){return{teach:misses>=2,reveal:misses>=3};}

/* Shared drawing coordinates keep the question data, SVG, and tests in lockstep. */
function polarPoint(cx,cy,radius,angle){
  const radians=angle*Math.PI/180;
  return{x:cx+radius*Math.cos(radians),y:cy+radius*Math.sin(radians)};
}

function levelGeometry(kind,level){
  if(kind==='ruler')return{x:70+(level/100)*460};
  if(kind==='dial'){
    /* SVG angles increase clockwise because screen y increases downwards. */
    const angle=135+(level/1000)*270;
    return{angle,...polarPoint(300,132,88,angle)};
  }
  if(kind==='jug')return{y:202-(level/1000)*142};
  throw new Error(`No level geometry for ${kind}`);
}

/* The zoomed millimetre ruler: `span` centimetres across x 60..540. */
const MM={left:60,width:480};
function mmGeometry(mm,span){return{x:MM.left+mm*MM.width/(span*10)};}
/* The road: `span` kilometres across x 50..550, `m` metres along it. */
const ROAD={left:50,width:500};
function roadGeometry(m,span){return{x:ROAD.left+m*ROAD.width/(span*1000)};}
/* The Hard rung's centimetre scale: the longest row of the question fills x 40..560,
   and every row in that picture is drawn at its true length on the same scale. */
const HARD={left:40,width:520,max:150};
function hardMax(q){
  if(q.art==='tape-rulers')return Math.max(q.tape,...q.show);
  return Math.max(...q.rows.map(rowLength));
}
function hardGeometry(cm,max=HARD.max){return{x:HARD.left+cm*HARD.width/max};}

function dialMarkGeometry(level){
  const angle=levelGeometry('dial',level).angle;
  return{
    angle,
    inner:polarPoint(300,132,96,angle),
    outer:polarPoint(300,132,108,angle),
    label:polarPoint(300,132,126,angle)
  };
}

/* The pan balance, in a 600 x 280 picture. The beam pivots on the post top and tips
   13 degrees towards the heavy side; each pan hangs a fixed string length below its
   beam end, so the heavy pan is LOWER on screen. The string is long enough for a big
   balloon or pillow to stand in the high pan without reaching the top edge. */
const BALANCE={pivot:{x:300,y:50},halfBeam:150,tilt:13,string:130,panHalf:70};

function balanceGeometry(heavy){
  /* 'level' is the 1 kg rung: a bag of flour balanced by four 250 g weights. */
  const heavySide=heavy==='level'?null:heavy==='rock'||heavy==='apple'?'right':'left';
  const angle=!heavySide?0:heavySide==='right'?BALANCE.tilt:-BALANCE.tilt;
  const {x,y}=BALANCE.pivot;
  const left=polarPoint(x,y,BALANCE.halfBeam,180+angle);
  const right=polarPoint(x,y,BALANCE.halfBeam,angle);
  return{
    angle,
    pivot:BALANCE.pivot,
    panHalf:BALANCE.panHalf,
    left:{beam:left,panY:left.y+BALANCE.string},
    right:{beam:right,panY:right.y+BALANCE.string},
    heavySide
  };
}

function teachingSteps(q){
  if(q.step){
    const answer=Number(String(q.level).replace(',',''));
    return Array.from({length:Math.ceil(answer/q.step)},(_,i)=>Math.min((i+1)*q.step,answer));
  }
  if(q.art==='hard-compare'){
    /* The running total along each row of more than one part. */
    return q.rows.filter(r=>r.parts.length>1).flatMap(r=>r.parts.map((_,i)=>rowLength({parts:r.parts.slice(0,i+1)})));
  }
  if(q.art==='tape-rulers')return Array.from({length:q.tape/q.tile},(_,i)=>(i+1)*q.tile);
  if(q.art==='length-blocks'||q.art==='half-stick'||q.art==='ruler'){
    const answer=Number(q.answer.replace(',',''));
    return Array.from({length:Math.ceil(answer/10)},(_,i)=>Math.min((i+1)*10,answer));
  }
  if(['mass-weights','mass-part','dial','litre-cups','litre-part','jug'].includes(q.art)){
    const answer=Number(q.answer.replace(',',''));
    return Array.from({length:Math.ceil(answer/250)},(_,i)=>Math.min((i+1)*250,answer));
  }
  return[q.answer];
}

/* The juice-conservation pour. Straight-sided glasses, so juice area = width x height
   and the three amounts are honestly equal (tested): 70x80 = 40x140 = 140x40. */
const GLASSES={
  floor:250,
  first:{w:70,juice:80,h:104},
  tall:{x:180,w:40,juice:140,h:160},
  wide:{x:420,w:140,juice:40,h:62}
};

function hasRenderer(kind){return ART_KINDS.has(kind);}

root.BigSmallUnits={
  WORLDS,BANK,ART_KINDS,TEXT_CARD_ARTS,MIX_LABEL,ALL,question,sources,isMix,mixRung,
  missState,levelGeometry,dialMarkGeometry,balanceGeometry,teachingSteps,hasRenderer,
  GLASSES,MM,ROAD,HARD,mmGeometry,roadGeometry,hardGeometry,hardMax,rowLength,hardAnswer
};
if(typeof module!=='undefined')module.exports=root.BigSmallUnits;
})(typeof window!=='undefined'?window:globalThis);
