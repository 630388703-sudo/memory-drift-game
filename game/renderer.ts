import type { ArchiveAnchorId, GameStage } from "./config";

export type RenderState = {
  stage: GameStage;
  now: number;
  pressure: number;
  scanner: { x: number; y: number };
  scanned: Set<ArchiveAnchorId>;
  read: Set<ArchiveAnchorId>;
  scanPulseUntil: number;
  progress: number;
  lane: number;
  collected: Set<number>;
  doorIndex: number;
  calibrationIndex: number;
  calibrationChoices: ("A" | "B")[];
  puzzleIndex: number;
  puzzleSides: ("A" | "B")[];
  puzzleLocked: boolean[];
  activeVersion: "A" | "B";
  overloads: number;
  selectedVersion: "A" | "B" | null;
};

const C = { paper: "#e9e5da", pale: "#f6f3eb", fog: "#c4c8c6", blue: "#748a94", violet: "#aaa1b0", yellow: "#c6ab63", ink: "#283439" };
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function person(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = 0.45, blur = 0) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = C.ink; ctx.filter = blur ? `blur(${blur}px)` : "none";
  ctx.beginPath(); ctx.ellipse(x, y - s * .35, s * .1, s * .125, 0, 0, Math.PI * 2); ctx.fill();
  rr(ctx, x - s * .15, y - s * .22, s * .3, s * .48, s * .13); ctx.fill(); ctx.restore();
}

function chair(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = .7) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = C.ink; ctx.fillStyle = "rgba(235,231,220,.58)"; ctx.lineWidth = Math.max(1, s * .025);
  rr(ctx, x - s * .22, y - s * .35, s * .44, s * .35, s * .025); ctx.fill(); ctx.stroke();
  rr(ctx, x - s * .25, y, s * .5, s * .11, s * .02); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - s * .18, y + s * .1); ctx.lineTo(x - s * .22, y + s * .44); ctx.moveTo(x + s * .18, y + s * .1); ctx.lineTo(x + s * .22, y + s * .44); ctx.stroke(); ctx.restore();
}

function clock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, late = false) {
  ctx.save(); ctx.strokeStyle = C.ink; ctx.globalAlpha = .72; ctx.lineWidth = Math.max(1.5, r * .08); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  const a = late ? .4 * Math.PI : 1.38 * Math.PI; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * .7, y + Math.sin(a) * r * .7); ctx.moveTo(x, y); ctx.lineTo(x - r * .2, y - r * .46); ctx.stroke(); ctx.restore();
}

function archivePhoto(ctx: CanvasRenderingContext2D, w: number, h: number, s: RenderState) {
  const t = s.now * .001; const x = w * .075; const y = h * .16; const pw = w * .85; const ph = h * .58;
  const parallaxX = (s.scanner.x - .5) * w * .018; const parallaxY = (s.scanner.y - .5) * h * .014;
  ctx.fillStyle = C.paper; ctx.shadowColor = "rgba(34,43,46,.2)"; ctx.shadowBlur = w * .05; rr(ctx, x, y, pw, ph, w * .015); ctx.fill(); ctx.shadowBlur = 0;
  ctx.save(); ctx.beginPath(); ctx.rect(x + w * .025, y + w * .025, pw - w * .05, ph - w * .075); ctx.clip();
  const ix = x + w * .025; const iy = y + w * .025; const iw = pw - w * .05; const ih = ph - w * .075;
  const g = ctx.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, "#8ea0a4"); g.addColorStop(.55, "#c8c3b7"); g.addColorStop(1, "#8d8b83"); ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = "rgba(78,106,116,.63)"; ctx.fillRect(ix + iw * .07 + parallaxX, iy + ih * .1, iw * .5, ih * .48);
  ctx.strokeStyle = "rgba(239,237,228,.68)"; ctx.lineWidth = w * .006; ctx.strokeRect(ix + iw * .07 + parallaxX, iy + ih * .1, iw * .5, ih * .48);
  ctx.beginPath(); ctx.moveTo(ix + iw * .32 + parallaxX, iy + ih * .1); ctx.lineTo(ix + iw * .32 + parallaxX, iy + ih * .58); ctx.stroke();
  ctx.fillStyle = "rgba(230,223,211,.52)"; ctx.beginPath(); ctx.moveTo(ix + iw * .48, iy + ih * .1); ctx.quadraticCurveTo(ix + iw * (.55 + Math.sin(t) * .025), iy + ih * .38, ix + iw * .5, iy + ih * .66); ctx.lineTo(ix + iw * .62, iy + ih * .66); ctx.lineTo(ix + iw * .62, iy + ih * .1); ctx.fill();
  ctx.strokeStyle = "rgba(40,52,56,.65)"; ctx.lineWidth = w * .007; ctx.strokeRect(ix + iw * .72 - parallaxX, iy + ih * .16, iw * .2, ih * .58);
  clock(ctx, ix + iw * .72 - parallaxX, iy + ih * .11, w * .045, s.overloads > 0 && Math.floor(t * 2) % 2 === 0);
  chair(ctx, ix + iw * .34 - parallaxX, iy + ih * .72, w * .2, .88); chair(ctx, ix + iw * .66 + parallaxX, iy + ih * .72, w * .2, .58);
  person(ctx, ix + iw * .5 + parallaxX, iy + ih * .63 + parallaxY, w * .36, .48, w * .006);
  const secondAlpha = .1 + (Math.sin(t * .72) + 1) * .08; person(ctx, ix + iw * .63 - parallaxX, iy + ih * .62, w * .34, secondAlpha, w * .012);
  ctx.fillStyle = "rgba(247,244,236,.9)"; ctx.beginPath(); ctx.moveTo(ix + iw * .42, iy + ih * .38); ctx.lineTo(ix + iw * .58, iy + ih * .3); ctx.lineTo(ix + iw * .61, iy + ih * .64); ctx.lineTo(ix + iw * .46, iy + ih * .72); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(79,86,87,.25)"; ctx.lineWidth = 1; ctx.stroke();
  if (s.overloads) { ctx.save(); ctx.globalAlpha = clamp(s.overloads * .08, 0, .25); ctx.translate(w * .012, 0); person(ctx, ix + iw * .63, iy + ih * .62, w * .34, .7, w * .008); ctx.restore(); }
  ctx.restore();
  ctx.fillStyle = "rgba(45,56,59,.65)"; ctx.font = `${Math.max(11, w * .022)}px ui-monospace, monospace`; ctx.fillText(`${s.overloads && Math.floor(t) % 2 ? "18:12 · A-307" : "17:42 · B-307"} · 07`, x + w * .05, y + ph - w * .018);

  if (["tutorial", "archive"].includes(s.stage)) {
    const sx = s.scanner.x * w; const sy = s.scanner.y * h; const pulsing = s.scanPulseUntil > s.now;
    ctx.save(); ctx.strokeStyle = pulsing ? C.yellow : "rgba(247,244,236,.92)"; ctx.lineWidth = w * .005; ctx.setLineDash([w * .022, w * .014]); ctx.beginPath(); ctx.arc(sx, sy, w * .105, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(247,244,236,.06)"; ctx.beginPath(); ctx.arc(sx, sy, w * .1, 0, Math.PI * 2); ctx.fill();
    if (pulsing) { const r = w * (.12 + ((s.scanPulseUntil - s.now) / 1200) * .58); ctx.globalAlpha = clamp((s.scanPulseUntil - s.now) / 800); ctx.strokeStyle = C.pale; ctx.lineWidth = w * .004; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    const anchors: [ArchiveAnchorId, number, number][] = [["clock", .72, .31], ["name", .43, .66], ["figure", .63, .48]];
    for (const [id, ax, ay] of anchors) if (s.scanned.has(id) || pulsing) { ctx.save(); ctx.globalAlpha = s.read.has(id) ? .9 : .48; ctx.strokeStyle = s.read.has(id) ? C.yellow : C.pale; ctx.lineWidth = w * .004; ctx.beginPath(); ctx.arc(ax * w, ay * h, w * .035, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
}

function laneX(w: number, y: number, lane: number, horizon: number, floor: number) { const q = clamp((y - horizon) / (floor - horizon)); return w / 2 + (lane - 1) * w * .27 * q; }

function corridor(ctx: CanvasRenderingContext2D, w: number, h: number, s: RenderState) {
  const horizon = h * .28; const floor = h * .89; const scan = s.scanPulseUntil > s.now; const t = s.now * .001;
  const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#aebbbe"); bg.addColorStop(.48, "#d4d1c8"); bg.addColorStop(1, "#8f9492"); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(232,228,218,.72)"; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,0); ctx.lineTo(w*.65,horizon); ctx.lineTo(w*.35,horizon); ctx.fill();
  ctx.fillStyle = "rgba(111,124,127,.25)"; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w*.35,horizon); ctx.lineTo(w*.2,floor); ctx.lineTo(0,h); ctx.fill(); ctx.beginPath(); ctx.moveTo(w,0); ctx.lineTo(w*.65,horizon); ctx.lineTo(w*.8,floor); ctx.lineTo(w,h); ctx.fill();
  const fg = ctx.createLinearGradient(0,horizon,0,floor); fg.addColorStop(0,"rgba(175,175,168,.72)"); fg.addColorStop(1,"rgba(121,126,124,.9)"); ctx.fillStyle=fg; ctx.beginPath(); ctx.moveTo(w*.35,horizon); ctx.lineTo(w*.65,horizon); ctx.lineTo(w*.8,floor); ctx.lineTo(w*.2,floor); ctx.fill();
  ctx.strokeStyle="rgba(43,55,58,.17)"; ctx.lineWidth=1;
  for(let i=0;i<11;i++){const z=((i/10+s.progress*.45)%1)**2; const y=horizon+z*(floor-horizon); ctx.beginPath();ctx.moveTo(w/2-w*(.15+z*.32),y);ctx.lineTo(w/2+w*(.15+z*.32),y);ctx.stroke();}
  for(let l=0;l<3;l++){ctx.setLineDash([w*.012,w*.024]);ctx.beginPath();ctx.moveTo(w/2,horizon);ctx.lineTo(laneX(w,floor,l,horizon,floor),floor);ctx.stroke();}ctx.setLineDash([]);
  for(let i=0;i<8;i++){const side=i%2?-1:1;const z=((i/8+s.progress*.7)%1)**1.65;const y=horizon+z*(floor-horizon)*.88;const x=w/2+side*w*(.21+z*.3);const dw=w*(.035+z*.1),dh=h*(.055+z*.17);ctx.save();ctx.globalAlpha=.28+z*.55;ctx.strokeStyle=C.ink;ctx.lineWidth=w*.004;ctx.strokeRect(x-dw/2,y-dh,dw,dh);ctx.font=`${Math.max(8,w*(.012+z*.015))}px ui-monospace`;ctx.fillStyle=C.paper;ctx.fillText((i+Math.floor(s.progress*12))%4===0?"A-307":"B-307",x-dw*.45,y-dh*.83);ctx.restore();}
  const blankLane=Math.floor((s.progress*8)%3); if(s.progress>.12&&s.progress<.27){ctx.fillStyle="rgba(247,245,239,.9)";const bx=laneX(w,h*.64,blankLane,horizon,floor);rr(ctx,bx-w*.1,h*.48,w*.2,h*.27,w*.015);ctx.fill();}
  for(let i=0;i<3;i++) chair(ctx,laneX(w,h*(.53+i*.08),(i+1)%3,horizon,floor),h*(.53+i*.08),w*(.08+i*.035),.18+i*.13);
  if(s.progress>.45&&s.progress<.62) person(ctx,laneX(w,h*.58,1,horizon,floor),h*.58,w*.2,scan?.58:.18,w*.012);
  const fs=[{id:4,lane:0,at:.32},{id:5,lane:2,at:.72}];
  for(const f of fs){if(s.collected.has(f.id))continue;let d=f.at-s.progress;if(d<-.08)d+=1;if(d>.55||d<-.08)continue;const c=1-clamp((d+.08)/.63);const y=horizon+c**1.45*(floor-horizon)*.82;const x=laneX(w,y,f.lane,horizon,floor);const size=w*(.025+c*.08);ctx.save();ctx.shadowBlur=size*1.6;ctx.shadowColor=scan?C.pale:C.violet;ctx.fillStyle=scan?"rgba(247,241,213,.95)":"rgba(170,159,177,.72)";ctx.translate(x,y);ctx.rotate(t+f.id);ctx.fillRect(-size/2,-size/2,size,size);ctx.restore();}
  if(scan){ctx.strokeStyle="rgba(247,244,236,.58)";ctx.lineWidth=w*.006;ctx.beginPath();ctx.arc(w/2,h*.72,w*(.2+Math.sin(t*4)*.035),0,Math.PI*2);ctx.stroke();}
  const px=laneX(w,h*.82,s.lane,horizon,floor);ctx.save();ctx.shadowColor=C.pale;ctx.shadowBlur=w*.04;person(ctx,px,h*.8,w*.3,.9);ctx.globalCompositeOperation="source-atop";ctx.fillStyle=C.pale;ctx.fillRect(px-w*.09,h*.65,w*.18,h*.23);ctx.restore();
}

function doors(ctx: CanvasRenderingContext2D,w:number,h:number,s:RenderState){
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#9dacaf");g.addColorStop(1,"#d8d3c8");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle="rgba(235,231,221,.6)";ctx.fillRect(0,h*.28,w,h*.58);
  const labels=["A-307","B-307","—-307"];for(let i=0;i<3;i++){const x=w*(.09+i*.29),y=h*.36,dw=w*.24,dh=h*.4;ctx.save();ctx.globalAlpha=i===s.doorIndex?1:.42;ctx.strokeStyle=i===s.doorIndex?C.yellow:C.ink;ctx.lineWidth=i===s.doorIndex?w*.01:w*.004;ctx.strokeRect(x,y,dw,dh);ctx.fillStyle="rgba(238,233,222,.76)";ctx.fillRect(x+w*.02,y+h*.03,dw-w*.04,h*.055);ctx.fillStyle=C.ink;ctx.font=`${w*.038}px ui-monospace`;ctx.textAlign="center";ctx.fillText(labels[i],x+dw/2,y+h*.067);ctx.restore();}
}

function classroom(ctx:CanvasRenderingContext2D,w:number,h:number,s:RenderState){
  const late=s.calibrationChoices[s.calibrationIndex]==="B";const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,late?"#aaa4b1":"#9caeb0");g.addColorStop(1,"#d8d3c8");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="rgba(41,52,55,.48)";ctx.lineWidth=w*.008;for(let i=0;i<3;i++){const ox=(i-1)*w*.045*Math.sin(s.now*.001+i);ctx.strokeRect(w*.12+ox,h*(.22+i*.16),w*.76,h*.34);}
  clock(ctx,w*.72,h*.26,w*.06,late);chair(ctx,w*.33,h*.63,w*.24,.65);chair(ctx,w*.68,h*.63,w*.24,late?.18:.55);person(ctx,w*.56,h*.56,w*.36,late?.16:.35,w*.012);
  ctx.fillStyle="rgba(247,244,237,.72)";ctx.fillRect(0,h*.77,w,h*.23);
}

function workbench(ctx:CanvasRenderingContext2D,w:number,h:number,s:RenderState){
  ctx.fillStyle="#b9b8b1";ctx.fillRect(0,0,w,h);const g=ctx.createRadialGradient(w/2,h*.48,0,w/2,h*.48,w*.65);g.addColorStop(0,"rgba(241,237,226,.9)");g.addColorStop(1,"rgba(98,108,109,.38)");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(w*.5,h*.48);ctx.rotate(-.025);ctx.fillStyle=C.paper;ctx.shadowColor="rgba(30,40,43,.24)";ctx.shadowBlur=w*.05;ctx.fillRect(-w*.32,-h*.25,w*.64,h*.5);ctx.restore();
  const pts=[[.18,.31],[.76,.27],[.16,.62],[.78,.62],[.5,.77]];for(let i=0;i<5;i++){const active=i===s.puzzleIndex;const locked=s.puzzleLocked[i];const [px,py]=pts[i];ctx.save();ctx.translate(w*px,h*py);ctx.rotate((s.puzzleSides[i]==="A"?-.08:.08)+(active?Math.sin(s.now*.004)*.025:0));ctx.fillStyle=locked?"rgba(240,231,195,.92)":"rgba(236,231,220,.82)";ctx.strokeStyle=active?C.yellow:"rgba(45,55,57,.42)";ctx.lineWidth=active?w*.009:w*.003;ctx.fillRect(-w*.075,-w*.06,w*.15,w*.12);ctx.strokeRect(-w*.075,-w*.06,w*.15,w*.12);ctx.fillStyle=C.ink;ctx.font=`${w*.028}px ui-monospace`;ctx.textAlign="center";ctx.fillText(`${i+1}${s.puzzleSides[i]}`,0,w*.01);if(locked){ctx.globalAlpha=.28;ctx.fillRect(w*.012,-w*.05,w*.15,w*.12);}ctx.restore();}
}

function versionPhoto(ctx:CanvasRenderingContext2D,w:number,h:number,s:RenderState){
  const a=(s.stage==="finale"?s.selectedVersion:s.activeVersion)!=="B";const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,a?"#aab9bb":"#aaa5b0");g.addColorStop(1,"#dfd9ce");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);const x=w*.08,y=h*.19,pw=w*.84,ph=h*.5;ctx.fillStyle=C.paper;rr(ctx,x,y,pw,ph,w*.015);ctx.fill();ctx.fillStyle="rgba(102,123,129,.35)";ctx.fillRect(x+w*.03,y+w*.03,pw-w*.06,ph-w*.08);ctx.strokeStyle="rgba(40,52,55,.55)";ctx.lineWidth=w*.006;ctx.strokeRect(x+pw*.68,y+ph*.16,pw*.2,ph*.58);clock(ctx,x+pw*.73,y+ph*.12,w*.045,!a);chair(ctx,x+pw*.35,y+ph*.72,w*.2,.72);if(a)chair(ctx,x+pw*.66,y+ph*.72,w*.2,.56);person(ctx,x+pw*.48,y+ph*.64,w*.36,.42,w*.01);if(a)person(ctx,x+pw*.62,y+ph*.64,w*.34,.21,w*.014);else{ctx.fillStyle="rgba(246,243,235,.66)";ctx.fillRect(x+pw*.56,y+ph*.24,pw*.16,ph*.5);}if(s.overloads){ctx.save();ctx.globalAlpha=clamp(s.overloads*.05,0,.2);ctx.translate(w*.018,0);person(ctx,x+pw*.62,y+ph*.64,w*.34,.5,w*.01);ctx.restore();}
}

function grain(ctx:CanvasRenderingContext2D,w:number,h:number,now:number){ctx.save();ctx.globalAlpha=.035;ctx.fillStyle=C.ink;const step=Math.max(8,Math.floor(w/110));for(let y=(now*.012)%step;y<h;y+=step)for(let x=0;x<w;x+=step){const n=Math.sin(x*12.2+y*3.7+Math.floor(now/90))*43758.5;if(n-Math.floor(n)>.75)ctx.fillRect(x,y,1.2,1.2);}ctx.restore();}

export function renderFrame(ctx:CanvasRenderingContext2D,w:number,h:number,s:RenderState){
  ctx.clearRect(0,0,w,h);
  if(["dormant","tutorial","archive"].includes(s.stage)){const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,"#bbc6c6");g.addColorStop(.5,"#ded9ce");g.addColorStop(1,"#aaa9aa");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);archivePhoto(ctx,w,h,s);}
  else if(s.stage==="corridor")corridor(ctx,w,h,s);
  else if(s.stage==="doors")doors(ctx,w,h,s);
  else if(s.stage==="classroom")classroom(ctx,w,h,s);
  else if(s.stage==="reconstruct")workbench(ctx,w,h,s);
  else versionPhoto(ctx,w,h,s);
  grain(ctx,w,h,s.now);
}
