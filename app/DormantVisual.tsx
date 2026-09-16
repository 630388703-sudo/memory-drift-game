import type { CSSProperties } from "react";

// Six animated layers, not hundreds of independent animation loops.
// Deterministic sampling avoids hydration differences and random flicker.
export default function DormantVisual() {
  return <svg className="memory-nebula" viewBox="0 0 600 640" aria-hidden="true">
    <defs>
      <radialGradient id="memory-halo"><stop stopColor="#607cff" stopOpacity=".24"/><stop offset="1" stopColor="#263f75" stopOpacity="0"/></radialGradient>
      <linearGradient id="memory-thread"><stop stopColor="#59dbc8" stopOpacity="0"/><stop offset=".5" stopColor="#d0eaff" stopOpacity=".7"/><stop offset="1" stopColor="#b699ff" stopOpacity="0"/></linearGradient>
    </defs>
    <ellipse className="nebula-halo" cx="300" cy="320" rx="280" ry="280" fill="url(#memory-halo)"/>
    {[0,1,2,3,4,5].map(layer => <g key={layer} className="nebula-layer" style={{"--layer":layer,"--phase":`${-layer*2.4}s`} as CSSProperties}>
      {Array.from({length:76},(_,i) => {
        const t=i/75*Math.PI*2;
        const radius=130+layer*12+Math.sin(t*3+layer*.4)*25;
        const x=300+Math.cos(t)*radius+Math.sin(i*12.3+layer)*9;
        const y=320+Math.sin(t)*radius*.83+Math.sin(t*2+layer*.55)*72;
        return <circle key={i} cx={x} cy={y} r={i%9===0?2.1:.7+(i%4)*.24} opacity={.25+(i%6)*.12} fill={layer%3===0?"#b8f6e9":layer%3===1?"#b8caff":"#dac8ff"}/>;
      })}
    </g>)}
    <g className="nebula-traces" fill="none" stroke="url(#memory-thread)" strokeWidth=".8">
      <ellipse cx="300" cy="320" rx="215" ry="135" transform="rotate(-28 300 320)"/>
      <ellipse cx="300" cy="320" rx="175" ry="230" transform="rotate(32 300 320)"/>
      <path d="M70 386 Q300 125 530 286 M130 470 Q400 470 465 160"/>
    </g>
    <g className="nebula-core" fill="none" stroke="#d5e9ff" strokeWidth="1.2">
      <path d="M279 275h-18v18m60-18h18v18m0 54v18h-18m-60-18v18h18" opacity=".6"/>
      <circle cx="300" cy="320" r="3" fill="#e8fbff" stroke="none"/>
    </g>
  </svg>;
}
