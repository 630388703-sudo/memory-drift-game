"use client";

import { useEffect, useRef, type RefObject } from "react";

const WIDTH = 720;
const HEIGHT = 840;
const PALETTE = ["#c7e9e1", "#87c8d3", "#a9b5e2", "#e5d4c2", "#c7d5e8"];
const grain = Array.from({length:220}, (_, index) => ({
  x: ((index * 137.508) % WIDTH),
  y: ((index * 97.371) % HEIGHT),
  phase: index * 2.39996,
}));

// A rectangular image surface that bends, loses its edges, and comes back.
// No image answers are revealed here. All geometry is deterministic.
function surface(u: number, v: number, time: number, dissolve: number, develop = 0) {
  const fold = .58 + .42 * Math.sin(time * .19);
  let x = u * 216 + Math.sin(v * 3.1 + time * .22) * 54 * fold;
  let y = v * 245 + Math.sin(u * 2.7 + v * 1.1 + time * .24) * 46 * fold;
  const z = Math.sin(u * 2.5 + v * 2.2 + time * .26) * 105 * fold;
  const turn = -.28 + Math.sin(time * .14) * .26;
  const rotatedX = x * Math.cos(turn) + z * Math.sin(turn);
  const depth = z * Math.cos(turn) - x * Math.sin(turn);
  const perspective = 800 / (800 - depth);
  x = rotatedX * perspective;
  y *= perspective;
  const tear = Math.sin(v * 8 + time * .3) * Math.cos(u * 3.2 - time * .2);
  x += dissolve * tear * (35 + Math.abs(u) * 70);
  y += dissolve * Math.sin(u * 7 + v * 4 + time * .26) * 31;
  // Tilt the entire sheet, without rotating it like a loading spinner.
  return {
    x: (360 + x * .98 - y * .18) * (1-develop) + (360 + u*216) * develop,
    y: (405 + x * .18 + y * .98) * (1-develop) + (405 + v*245) * develop,
    z: depth * (1-develop),
  };
}

export default function DormantVisual({ developing = false, sharedTime }: { developing?: boolean; sharedTime?: RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", {alpha:true});
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(WIDTH * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let time = sharedTime?.current ?? 5;
    const enteredAt = performance.now();
    let disposed = false;

    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const elapsed = Math.max(0, performance.now()-enteredAt);
      const progress = developing ? (media.matches ? 1 : Math.min(1, Math.max(0, (elapsed-180)/2650))) : 0;
      const develop = progress * progress * (3-2*progress);
      const dissolve = Math.pow((1 + Math.sin(time * .24 - 1)) / 2, 2) * (1-develop);
      const pointAt = (u: number, v: number, offset = 0) => surface(u,v,time+offset,dissolve,develop);
      const haze = ctx.createRadialGradient(360,390,25,360,390,340);
      haze.addColorStop(0, "rgba(117,153,174,.13)");
      haze.addColorStop(.55, "rgba(94,124,163,.045)");
      haze.addColorStop(1, "rgba(30,44,57,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0,0,WIDTH,HEIGHT);
      ctx.globalCompositeOperation = "screen";

      // An empty photographic sheet appears only during the wake transition.
      // It contains no people or details from the actual recall task.
      if(developing) {
        const paper = ctx.createLinearGradient(130,150,570,660);
        paper.addColorStop(0,"rgba(229,231,214,.20)");
        paper.addColorStop(.6,"rgba(184,210,211,.08)");
        paper.addColorStop(1,"rgba(213,195,171,.16)");
        ctx.globalAlpha=develop;
        ctx.fillStyle=paper;
        ctx.beginPath();
        for(let edge=0;edge<4;edge++)for(let step=0;step<=32;step++){
          const n=step/32*2-1;
          const p=pointAt(edge===0?n:edge===1?1:edge===2?-n:-1,edge===0?-1:edge===1?n:edge===2?1:-n);
          if(edge===0&&step===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
        }
        ctx.closePath();ctx.fill();
        ctx.strokeStyle="#e5ddd0";ctx.lineWidth=1.2;ctx.stroke();
        ctx.globalAlpha=1;
      }

      // Long hairline strokes keep a coherent fabric; gaps make it feel eroded.
      for (let row=0;row<68;row++) {
        const v=row/67*2-1;
        ctx.strokeStyle=PALETTE[Math.floor(row/14)%PALETTE.length];
        ctx.lineWidth=row%9===0?1.15:.7;
        ctx.globalAlpha=(.32 + .34 * (1-Math.abs(v))) * (1-dissolve*.35)*(1-develop*.7);
        ctx.beginPath();
        let connected=false;
        for (let col=0;col<=104;col++) {
          const u=col/104*2-1;
          const point=pointAt(u,v);
          const gap=Math.sin(col*.38+row*.7)+Math.cos(row*.31-col*.13);
          if (gap>dissolve*-.4+1.62 || (Math.abs(u)>.85 && Math.sin(row*2.17+col)> .5)) {connected=false;continue;}
          if(connected)ctx.lineTo(point.x,point.y);else ctx.moveTo(point.x,point.y);
          connected=true;
        }
        ctx.stroke();
      }

      // A few displaced color seams suggest a misregistered photographic print.
      for (let seam=0;seam<7;seam++) {
        ctx.beginPath();ctx.strokeStyle=seam%2?"#78d8cd":"#e9b9a2";
        ctx.lineWidth=seam%3===0?1.1:.6;ctx.globalAlpha=.18*(1-develop*.65);
        for(let step=0;step<=96;step++){
          const v=step/96*2-1;
          const p=pointAt(-.94+seam*.31,v,.13);
          if(step===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();
      }

      // Fine grains collect on the surface, then drift away at its edges.
      for(let row=0;row<42;row++){
        const v=row/41*2-1;
        for(let col=0;col<59;col++){
          const u=col/58*2-1;
          const phase=row*13.17+col*4.31;
          const p=pointAt(u,v);
          const edge=Math.pow(Math.abs(u),3)+Math.pow(Math.abs(v),3);
          const drift=dissolve*edge;
          const x=p.x+Math.cos(phase+time*.17)*drift*64;
          const y=p.y+Math.sin(phase*.7+time*.14)*drift*52;
          const light=.5+.5*Math.sin(phase);
          ctx.globalAlpha=(.2+light*.56)*(1-drift*.25)*(1-develop*.55);
          ctx.fillStyle=PALETTE[(row+col)%PALETTE.length];
          const size=col%17===0&&row%5===0?1.8:.6+light*.45;
          ctx.fillRect(x,y,size,size);
        }
      }
      // A broad, soft band crosses the sheet like light in a darkroom; no flashes.
      if(developing && progress>0 && progress<1 && !media.matches) {
        ctx.save();
        ctx.beginPath();ctx.rect(143,159,434,492);ctx.clip();
        const y=120+progress*580;
        const exposure=ctx.createLinearGradient(0,y-100,0,y+100);
        exposure.addColorStop(0,"rgba(232,223,190,0)");
        exposure.addColorStop(.5,"rgba(232,223,190,.13)");
        exposure.addColorStop(1,"rgba(232,223,190,0)");
        ctx.fillStyle=exposure;ctx.globalAlpha=develop;ctx.fillRect(143,y-100,434,200);
        ctx.restore();
      }
      grain.forEach((p,index)=>{
        ctx.globalAlpha=(.035+(.5+.5*Math.sin(p.phase+time*.25))*.13)*(1-develop*.7);
        ctx.fillStyle=index%7===0?"#edcbb5":"#afcdd7";
        ctx.fillRect(p.x+Math.sin(time*.12+p.phase)*12,p.y+Math.cos(time*.1+p.phase)*16,index%11===0?1.3:.65,.85);
      });
      ctx.globalAlpha=1;
      ctx.globalCompositeOperation="source-over";
    };

    const tick = (now: number) => {
      if(disposed || document.hidden || media.matches) return;
      if(!previous || now-previous>=1000/30) {
        if(previous)time+=Math.min((now-previous)/1000,.08);
        previous=now;
        if(sharedTime)sharedTime.current=time;
        draw();
      }
      frame=requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      previous=0;
      if(disposed || document.hidden) return;
      draw();
      if(!media.matches)frame=requestAnimationFrame(tick);
    };
    media.addEventListener("change",resume);
    document.addEventListener("visibilitychange",resume);
    resume();
    return () => {
      disposed=true;
      cancelAnimationFrame(frame);
      media.removeEventListener("change",resume);
      document.removeEventListener("visibilitychange",resume);
    };
  }, [developing, sharedTime]);

  return <canvas ref={canvasRef} className="memory-afterimage" data-developing={developing} aria-hidden="true" />;
}
