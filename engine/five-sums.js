/* Pure shared engine for Star Sums. No DOM, theme, audio, or animation belongs here. */
export const FIVE_SUMS_TITLE = 'Star Sums';
export const FIVE_SUMS_MODES = Object.freeze({
  make5: { id:'make5', label:'Make 5', size:7, targets:[5], maxLine:7 },
  make10:{ id:'make10',label:'Make 10',size:7,targets:[10],maxLine:7 },
  family:{ id:'family',label:'Five Family',size:7,targets:[5,10,15,20],maxLine:7 },
  challenge:{ id:'challenge',label:'Challenge',size:7,targets:null,maxLine:5 }
});

export function seeded(seed=1){ let s=(seed>>>0)||1; return ()=>((s=Math.imul(s^s>>>15,1|s),s^=s+Math.imul(s^s>>>7,61|s),((s^s>>>14)>>>0)/4294967296)); }
/* The highest tile value that can ever contribute to this mode's target. A
 * lone tile can never satisfy a target on its own (every valid line is 2+
 * tiles), so for Make 5 -- the only mode whose target is smaller than the
 * biggest single-digit tile -- values 5-9 are dead weight a child can never
 * place: 5 needs a 0 partner that does not exist, and 6-9 already exceed the
 * target. Restrict the bag to 1-4 there; every other mode's target is large
 * enough that every 1-9 tile can take part in some valid line. */
export function tileMax(modeId){ return modeId==='make5' ? 4 : 9; }
export function makeBag(seed=1,count=80,modeId='make5'){ const r=seeded(seed), max=tileMax(modeId), a=[]; for(let i=0;i<count;i++)a.push(1+Math.floor(r()*max)); return a; }
export function draw(bag,n){ return {tiles:bag.slice(0,n),bag:bag.slice(n)}; }
export function key(r,c){return r+','+c;}
export function emptyBoard(size=7){return {size,cells:{}};}
export function valueAt(board,r,c,placed={}){ const k=key(r,c); return Object.prototype.hasOwnProperty.call(placed,k)?placed[k]:board.cells[k]; }

function lineAt(board,placed,r,c,dr,dc){
  let sr=r,sc=c; while(valueAt(board,sr-dr,sc-dc,placed)!=null){sr-=dr;sc-=dc;}
  const cells=[]; for(let rr=sr,cc=sc; valueAt(board,rr,cc,placed)!=null;rr+=dr,cc+=dc){cells.push({r:rr,c:cc,value:valueAt(board,rr,cc,placed)});}
  return cells;
}
export function formedLines(board,placements){
  const placed={}; placements.forEach(p=>{placed[key(p.r,p.c)]=p.value;});
  const seen=new Set(), lines=[];
  placements.forEach(p=>[[0,1],[1,0]].forEach(([dr,dc])=>{
    const cells=lineAt(board,placed,p.r,p.c,dr,dc); if(cells.length<2)return;
    const id=cells.map(x=>key(x.r,x.c)).join('|'); if(seen.has(id))return; seen.add(id);
    lines.push({direction:dr?'vertical':'horizontal',cells,sum:cells.reduce((s,x)=>s+x.value,0)});
  }));
  return lines;
}
function modeAllows(mode,line){return line.cells.length<=mode.maxLine&&(mode.targets?mode.targets.includes(line.sum):line.sum%5===0);}
export function explainInvalid(code,detail={}){
  const m={empty:'Place at least one tile.',occupied:'That square already has a number.',bounds:'Keep every tile on the board.',duplicate:'Use each square once.',straight:'Tiles in one turn must make one straight line.',gap:'Fill every square between your tiles.',connect:'Join the growing number path.',noLine:'Make a line with at least two numbers.',sum:`That line makes ${detail.sum}. Make ${detail.targets||'a multiple of 5'}.`,tooLong:'Challenge lines can have no more than 5 tiles.'};
  return m[code]||'Try another place.';
}
export function validateMove(board,placements,modeId='make5'){
  const mode=FIVE_SUMS_MODES[modeId]||FIVE_SUMS_MODES.make5;
  if(!placements.length)return {ok:false,code:'empty',message:explainInvalid('empty')};
  const seen=new Set();
  for(const p of placements){const k=key(p.r,p.c);if(p.r<0||p.c<0||p.r>=board.size||p.c>=board.size)return {ok:false,code:'bounds',message:explainInvalid('bounds')};if(board.cells[k]!=null)return {ok:false,code:'occupied',message:explainInvalid('occupied')};if(seen.has(k))return {ok:false,code:'duplicate',message:explainInvalid('duplicate')};seen.add(k);}
  const sameR=placements.every(p=>p.r===placements[0].r),sameC=placements.every(p=>p.c===placements[0].c);
  if(!sameR&&!sameC)return {ok:false,code:'straight',message:explainInvalid('straight')};
  const axis=placements.map(p=>sameR?p.c:p.r),lo=Math.min(...axis),hi=Math.max(...axis);
  for(let n=lo;n<=hi;n++){const r=sameR?placements[0].r:n,c=sameR?n:placements[0].c;if(valueAt(board,r,c,Object.fromEntries(placements.map(p=>[key(p.r,p.c),p.value])))==null)return {ok:false,code:'gap',message:explainInvalid('gap')};}
  const first=Object.keys(board.cells).length===0;
  if(first&&!placements.some(p=>p.r===Math.floor(board.size/2)&&p.c===Math.floor(board.size/2)))return {ok:false,code:'connect',message:'Start on the glowing middle square.'};
  if(!first&&!placements.some(p=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>board.cells[key(p.r+dr,p.c+dc)]!=null)))return {ok:false,code:'connect',message:explainInvalid('connect')};
  const lines=formedLines(board,placements);
  if(!lines.length)return {ok:false,code:'noLine',message:explainInvalid('noLine')};
  for(const line of lines){if(line.cells.length>mode.maxLine)return {ok:false,code:'tooLong',line,message:explainInvalid('tooLong')};if(!modeAllows(mode,line))return {ok:false,code:'sum',line,message:explainInvalid('sum',{sum:line.sum,targets:mode.targets&&mode.targets.join(', ')})};}
  return {ok:true,lines,score:lines.reduce((n,l)=>n+l.sum,0)*lines.length,celebration:lines.length>=3?'grand':lines.length===2?'double':'line'};
}
export function applyMove(board,placements){const cells={...board.cells};placements.forEach(p=>{cells[key(p.r,p.c)]=p.value;});return {...board,cells};}
export function arithmetic(line){return line.cells.map(c=>c.value).join(' + ')+' = '+line.sum;}
export function hintFor(misses,validMove){if(misses<2)return null;if(misses===2)return {level:2,text:'Build one straight line. Add the numbers to reach the target.'};return {level:3,text:'Try this glowing move.',placements:validMove?validMove.map(x=>({...x})):[]};}
export function findMove(board,rack,modeId){
  const mode=FIVE_SUMS_MODES[modeId]||FIVE_SUMS_MODES.make5,c=Math.floor(board.size/2),starts=Object.keys(board.cells).length?[...Array(board.size)].flatMap((_,r)=>[...Array(board.size)].map((__,col)=>({r,c:col}))).filter(p=>board.cells[key(p.r,p.c)]==null):[{r:c,c}];
  for(const p of starts)for(let i=0;i<rack.length;i++)for(let j=0;j<rack.length;j++){if(i===j)continue;for(const [dr,dc] of [[0,1],[1,0]]){const ps=[{...p,value:rack[i],rackIndex:i},{r:p.r+dr,c:p.c+dc,value:rack[j],rackIndex:j}];const v=validateMove(board,ps,mode.id);if(v.ok)return ps;}}
  return null;
}
export function isDeadBoard(board,rack,modeId){return findMove(board,rack,modeId)===null;}
