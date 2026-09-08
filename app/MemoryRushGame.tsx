"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import backgroundAUrl from "../game/assets/sunny-memory-corridor.webp";
import backgroundBUrl from "../game/assets/sunny-memory-corridor-b.webp";
import playerUrl from "../game/assets/traveler-run-back.png";
import photoUrl from "../game/assets/memory-photo.png";
import cartUrl from "../game/assets/memory-cart.png";
import riftUrl from "../game/assets/memory-rift.webp";
import bubbleUrl from "../game/assets/memory-bubble.webp";
import glitchOverlayUrl from "../game/assets/memory-glitch-overlay.webp";

const W = 1080;
const H = 1920;
const PLAYER_Y = 0.79;

type ItemKind = "photo" | "cart" | "bubble" | "rift" | "cassette" | "ticket" | "clock" | "static";
type DeviceKind = "touch" | "keyboard" | "gamepad";
type MemorySource = "phone" | "search" | "self";
type HardwareControl = { wake: () => void; move: (axis: number) => void; press: (pressure?: number) => void; pause: () => void };
declare global { interface Window { MemoryDriftInput?: HardwareControl } }
type Item = { id: number; kind: ItemKind; x: number; y: number; speed: number; hit?: boolean };
type Trail = { x: number; at: number };
type RunStats = { caught: number; echoed: number; missed: number; bumps: number; dashes: number; rifts: number; maxCombo: number };
type MemoryRecord = RunStats & { score: number; version: "A" | "B"; tendency: string; run: number; source?: MemorySource };
type Runtime = {
  clock: number;
  paused: boolean;
  drift: number;
  effectUntil: number;
  upgrade: "magnet" | "echo" | "shield" | null;
  offered: boolean;
  started: boolean;
  x: number;
  targetX: number;
  items: Item[];
  nextId: number;
  lastSpawn: number;
  score: number;
  combo: number;
  memories: number;
  version: "A" | "B";
  versionFade: number;
  dashUntil: number;
  shakeUntil: number;
  portalQueued: boolean;
  startedAt: number;
  shield: number;
  bonusTime: number;
  source: MemorySource;
  stats: RunStats;
  photoWeight: number;
  cartWeight: number;
  bubbleWeight: number;
  trail: Trail[];
};

const emptyStats = (): RunStats => ({ caught: 0, echoed: 0, missed: 0, bumps: 0, dashes: 0, rifts: 0, maxCombo: 0 });
const makeRuntime = (previous?: MemoryRecord | null, source: MemorySource = "phone"): Runtime => ({
  clock: 0, paused: false, drift: 0, effectUntil: 0, upgrade: null, offered: false,
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, memories: 0, version: "A", versionFade: 0,
  dashUntil: 0, shakeUntil: 0, portalQueued: false, startedAt: 0, shield: 0,
  bonusTime: 0, source,
  stats: emptyStats(),
  photoWeight: previous?.missed ? Math.min(.75, .55 + previous.missed * .025) : .58,
  cartWeight: previous?.bumps ? Math.max(.12, .27 - previous.bumps * .018) : .26,
  bubbleWeight: previous?.bumps ? Math.min(.4, .28 + previous.bumps * .018) : .28,
  trail: [],
});

const sourceCopy: Record<MemorySource, { label: string; title: string; text: string }> = {
  phone: { label: "交给手机", title: "外置记忆", text: "手机替你保存了时间与地点，却没保存当时的感觉。" },
  search: { label: "交给搜索", title: "谷歌效应", text: "你记得答案随时能找到，于是只记住了去哪里找。" },
  self: { label: "留给自己", title: "虚假记忆", text: "每次回想都会重新编辑它。确信，不一定等于真实。" },
};

const getTendency = (stats: RunStats) => {
  if (stats.echoed >= 4) return "残影收藏家";
  if (stats.dashes >= 4) return "主动遗忘者";
  if (stats.bumps >= 3) return "跌撞考古员";
  if (stats.missed <= 2) return "记忆守门人";
  return "漂移旅行者";
};
const getTendencyEn = (stats: RunStats) => {
  if (stats.echoed >= 4) return "ECHO COLLECTOR";
  if (stats.dashes >= 4) return "ACTIVE FORGETTER";
  if (stats.bumps >= 3) return "BUMP ARCHAEOLOGIST";
  if (stats.missed <= 2) return "MEMORY KEEPER";
  return "DRIFT TRAVELER";
};

const feedbackEn = (text: string) => {
  if (text.startsWith("连续记住")) return text.replace("连续记住", "MEMORY CHAIN");
  if (text.startsWith("进入 VERSION")) return text.replace("进入", "ENTERED").replace("场景记忆已重排", "SCENE MEMORY REORDERED");
  const table: Record<string, string> = {
    "过去的你会帮忙补捡": "YOUR PAST ECHO WILL CATCH MISSED PHOTOS",
    "左右拖动接照片 · 轻点相框泡泡": "MOVE LEFT OR RIGHT · TAP FRAME BUBBLES",
    "你主动丢掉一张记忆，换来短暂加速": "ONE MEMORY RELEASED · TEMPORARY DASH",
    "带上新能力，追回剩下的夏天": "ABILITY EQUIPPED · CHASE THE REST OF SUMMER",
    "残影替你接住了遗漏": "YOUR ECHO CAUGHT A MISSED PHOTO",
    "照片已装入口袋": "PHOTO STORED IN YOUR POCKET",
    "冲刺撞开了记忆柜": "DASH BROKE THROUGH THE MEMORY CART",
    "记忆泡泡替你挡住一次碰撞": "MEMORY BUBBLE BLOCKED THE COLLISION",
    "画面串线了！接泡泡能找回颜色": "SIGNAL CROSSED · CATCH A BUBBLE TO RESTORE COLOR",
    "相框泡泡：照片 +1，颜色回来了": "FRAME BUBBLE · PHOTO +1 · COLOR RESTORED",
    "旧磁带：下一段回声提前响起 · 连击 +2": "OLD TAPE · EARLY ECHO · CHAIN +2",
    "褪色票根：一次带回 2 格记忆": "FADED TICKET · MEMORY +2",
    "停摆时钟：展厅时间 +5 秒": "STOPPED CLOCK · TIME +5 SEC",
    "冲刺穿过了坏掉的像素": "DASHED THROUGH CORRUPTED PIXELS",
    "保护泡泡隔开了静电噪点": "COLOR SHELL BLOCKED SIGNAL NOISE",
    "记忆被压缩坏了：物体暂时失去颜色": "MEMORY COMPRESSION ERROR · COLOR TEMPORARILY LOST",
    "错过入口也没关系，再接一张就能重开": "RIFT MISSED · CATCH ONE MORE PHOTO TO REOPEN IT",
    "漏掉的照片，下轮更容易再次出现": "MISSED PHOTO · MORE LIKELY TO RETURN NEXT RUN",
    "啪！记忆 +1 · 恢复颜色 · 保护 +1": "POP · MEMORY +1 · COLOR RESTORED · SHIELD +1",
  };
  return table[text] ?? text;
};

const resolveImageUrl = (source: unknown) => typeof source === "string"
  ? source
  : typeof source === "object" && source !== null && "src" in source
    ? String((source as { src: unknown }).src)
    : "";

const loadImage = (source: unknown) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = resolveImageUrl(source);
});

function cropDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  crop: [number, number, number, number],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.drawImage(image, crop[0], crop[1], crop[2], crop[3], x - width / 2, y - height / 2, width, height);
}

function drawMemoryToken(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.shadowColor = "rgba(42,105,152,.22)"; ctx.shadowBlur = 22;
  const box = (fill: string) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(-size / 2, -size / 2, size, size, size * .22); ctx.fill(); };
  if (kind === "cassette") {
    box("#6a68c9"); ctx.fillStyle = "#fff0bc"; ctx.beginPath(); ctx.roundRect(-size*.34,-size*.22,size*.68,size*.28,size*.06); ctx.fill();
    ctx.fillStyle="#32436f"; [-.17,.17].forEach(px=>{ctx.beginPath();ctx.arc(size*px,-size*.08,size*.085,0,Math.PI*2);ctx.fill();});
    ctx.strokeStyle="#ff936f";ctx.lineWidth=size*.065;ctx.beginPath();ctx.moveTo(-size*.22,size*.25);ctx.lineTo(size*.22,size*.25);ctx.stroke();
  } else if (kind === "ticket") {
    ctx.rotate(-.14); box("#ffd66f"); ctx.strokeStyle="#ef765f";ctx.lineWidth=size*.06;ctx.setLineDash([size*.1,size*.07]);ctx.beginPath();ctx.moveTo(-size*.05,-size*.38);ctx.lineTo(-size*.05,size*.38);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#ef765f";ctx.font=`900 ${size*.28}px sans-serif`;ctx.textAlign="center";ctx.fillText("2×",size*.18,size*.1);
  } else if (kind === "clock") {
    ctx.fillStyle="#76dfe4";ctx.beginPath();ctx.arc(0,0,size*.48,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff9dc";ctx.beginPath();ctx.arc(0,0,size*.35,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#355d84";ctx.lineWidth=size*.055;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-size*.2);ctx.moveTo(0,0);ctx.lineTo(size*.17,size*.1);ctx.stroke();
  } else if (kind === "static") {
    box("#263247"); ["#79e6e7","#ff816d","#f7df75","#a892e8"].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(-size*.36+i*size*.18,-size*.34,size*.11,size*.68);});
    ctx.strokeStyle="#fff";ctx.globalAlpha=.72;ctx.lineWidth=size*.035;ctx.beginPath();ctx.moveTo(-size*.4,size*.12);ctx.lineTo(size*.38,-size*.18);ctx.stroke();
  }
  ctx.restore();
}

function drawSpatialCollage(ctx: CanvasRenderingContext2D, drift: number, now: number, version: "A" | "B") {
  ctx.save();
  const pulse = Math.sin(now * .0011) * (8 + drift * 24);
  const ink = version === "A" ? "#274d91" : "#6542a5";
  ctx.globalAlpha = .19 + drift*.22;
  const planes = [
    {p:[[0,540],[310,470],[350,820],[0,900]],c:"#72d9e4"},
    {p:[[800,420],[1080,500],[1080,970],[750,820]],c:"#ff7192"},
    {p:[[85,1040],[360,900],[475,1110],[180,1280]],c:"#f4dd45"},
    {p:[[700,1030],[1015,920],[1080,1260],[770,1330]],c:"#7c64db"},
  ];
  planes.forEach((plane,index)=>{
    ctx.fillStyle=plane.c;ctx.strokeStyle=ink;ctx.beginPath();plane.p.forEach(([x,y],j)=>j?ctx.lineTo(x+pulse*(index-1.5),y):ctx.moveTo(x+pulse*(index-1.5),y));ctx.closePath();ctx.fill();ctx.stroke();
    ctx.globalAlpha*=.94;
  });
  ctx.restore();
}

export default function MemoryRushGame() {
  const [awake, setAwake] = useState(false);
  const awakeRef = useRef(false);
  const [intro, setIntro] = useState(0);
  const [language, setLanguage] = useState<"zh" | "en">(() => {
    if (typeof window === "undefined") return "zh";
    return window.localStorage.getItem("memory-rush-language") === "en" ? "en" : "zh";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);
  const [memorySource, setMemorySource] = useState<MemorySource>("phone");
  const [lastDevice, setLastDevice] = useState<DeviceKind>("touch");
  const deviceRef = useRef<DeviceKind>("touch");
  const [choice, setChoice] = useState(false);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const choiceIndexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(52);
  const [quiet, setQuiet] = useState(false);
  const quietRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [album, setAlbum] = useState<string[]>([]);
  const [best, setBest] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const unlockAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    void audioRef.current.resume();
  }, []);
  const chime = useCallback((frequency = 640, duration = .18, rough = false) => {
    if (!soundRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.resume();
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.connect(gain); gain.connect(audio.destination); osc.type = rough ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(frequency, audio.currentTime);
    if (!rough) osc.frequency.exponentialRampToValueAtTime(frequency * 1.16, audio.currentTime + duration);
    gain.gain.setValueAtTime(rough ? .025 : .035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.start(); osc.stop(audio.currentTime + duration + .02);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime());
  const assetsRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const pointerDown = useRef(false);
  const inputRef = useRef({ left: false, right: false, gamepadDash: false, gamepadStart: false, gamepadHorizontal: 0 });
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [record, setRecord] = useState<MemoryRecord | null>(null);
  const [previous, setPrevious] = useState<MemoryRecord | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem("memory-rush-record");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [feedback, setFeedback] = useState("过去的你会帮忙补捡");
  const [hud, setHud] = useState({ score: 0, combo: 0, memories: 0, version: "A" as "A" | "B" });
  const shownFeedback = language === "zh" ? feedback : feedbackEn(feedback);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "忘了自己是什么｜记忆漂移游戏" : "WHAT WAS I AGAIN? | MEMORY DRIFT GAME";
  }, [language]);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadImage(backgroundAUrl), loadImage(backgroundBUrl), loadImage(playerUrl),
      loadImage(photoUrl), loadImage(cartUrl), loadImage(riftUrl), loadImage(bubbleUrl), loadImage(glitchOverlayUrl),
    ]).then(([backgroundA, backgroundB, player, photo, cart, rift, bubble, glitchOverlay]) => {
      if (!live) return;
      assetsRef.current = { backgroundA, backgroundB, player, photo, cart, rift, bubble, glitchOverlay };
      setReady(true);
    }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const data = JSON.parse(localStorage.getItem("memory-rush-album") || "{}");
        setAlbum(Array.isArray(data.album) ? data.album.filter((v: unknown) => typeof v === "string") : []);
        setBest(Number.isFinite(data.best) ? data.best : 0);
      } catch { /* optional collection */ }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      quietRef.current = reduced; setQuiet(reduced);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const begin = useCallback(() => {
    unlockAudio();
    const fresh = makeRuntime(previous, memorySource);
    fresh.started = true;
    fresh.lastSpawn = 0; fresh.startedAt = 0;
    fresh.items = [{ id: fresh.nextId++, kind: "photo", x: .5, y: .6, speed: .12 }, { id: fresh.nextId++, kind: "bubble", x: .38, y: .3, speed: .12 }];
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, memories: 0, version: "A" });
    setRecord(null); setStarted(true); setChoice(false); setPaused(false); setSeconds(52);
    setFeedback("左右拖动接照片 · 轻点相框泡泡");
  }, [previous, memorySource, unlockAudio]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, version: r.version, tendency: getTendency(r.stats), run: (previous?.run ?? 0) + 1, source: r.source };
    try { localStorage.setItem("memory-rush-record", JSON.stringify(next)); } catch { /* optional persistence */ }
    setPrevious(next); setRecord(next); setStarted(false);
    const earned = ["第一张回忆", ...(next.caught >= 12 ? ["满载而归"] : []), ...(next.echoed >= 3 ? ["过去的帮手"] : []), ...(next.dashes >= 3 ? ["轻装上路"] : []), ...(next.rifts >= 1 ? ["另一个夏天"] : []), ...(next.maxCombo >= 5 ? ["连成一段"] : [])];
    const collection = [...new Set([...album, ...earned])];
    const high = Math.max(best, next.score);
    setAlbum(collection); setBest(high);
    try { localStorage.setItem("memory-rush-album", JSON.stringify({ album: collection, best: high })); } catch { /* optional collection */ }
    setShareMessage("");
  }, [previous, album, best]);

  const dash = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || r.paused || r.memories <= 0 || r.clock < r.dashUntil) return;
    r.memories -= 1;
    r.dashUntil = r.clock + 1000;
    r.drift = Math.max(0, r.drift - .25); r.effectUntil = r.clock + 550;
    r.score += 25;
    r.stats.dashes += 1;
    setFeedback("你主动丢掉一张记忆，换来短暂加速");
    chime(320);
  }, [chime]);

  const movePointer = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, (clientX - rect.left) / rect.width));
    if (deviceRef.current !== "touch") { deviceRef.current = "touch"; setLastDevice("touch"); }
  }, []);

  const chooseUpgrade = useCallback((upgrade: "magnet" | "echo" | "shield") => {
    const r = runtimeRef.current; r.upgrade = upgrade;
    if (upgrade === "shield") { r.shield = 3; r.drift = 0; }
    r.paused = false; setPaused(false); setChoice(false);
    setFeedback("带上新能力，追回剩下的夏天"); chime(880);
  }, [chime]);

  const advanceIntro = useCallback(() => {
    unlockAudio(); chime(720, .1);
    if (intro < 3) setIntro(intro + 1); else begin();
  }, [intro, begin, unlockAudio, chime]);

  const wake = useCallback(() => {
    if (awakeRef.current) return;
    awakeRef.current = true; setAwake(true); unlockAudio(); chime(410, .35, true);
  }, [unlockAudio, chime]);

  const sleep = useCallback(() => {
    if (runtimeRef.current.started) return;
    awakeRef.current = false; setAwake(false); setIntro(0); setRecord(null); setSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (!awake || started) return;
    const timer = window.setTimeout(sleep, record ? 45000 : 90000);
    return () => window.clearTimeout(timer);
  }, [awake, started, record, sleep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("button,input,select,textarea")) return;
      const key = event.key.toLowerCase();
      if (!awakeRef.current) { event.preventDefault(); wake(); return; }
      if (["arrowleft","arrowright","arrowup"," "].includes(key)) event.preventDefault();
      if (deviceRef.current !== "keyboard") { deviceRef.current = "keyboard"; setLastDevice("keyboard"); }
      if (!runtimeRef.current.started && !record && (key === "enter" || key === " ")) { advanceIntro(); return; }
      if (!runtimeRef.current.started) return;
      if (choice) {
        if (["arrowleft","a","j"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 2) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if (["arrowright","d","l"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 1) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if ([" ","enter","z","x"].includes(key)) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]);
        return;
      }
      if (key === "p" || key === "escape") { const r = runtimeRef.current; if (!choice) { r.paused = !r.paused; setPaused(r.paused); } return; }
      if (runtimeRef.current.paused) return;
      if (key === " " || key === "arrowup" || key === "z" || key === "x" || key === "enter") { dash(); return; }
      if (key === "arrowleft" || key === "a" || key === "j") { inputRef.current.left = true; runtimeRef.current.targetX -= .055; }
      if (key === "arrowright" || key === "d" || key === "l") { inputRef.current.right = true; runtimeRef.current.targetX += .055; }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a" || key === "j") inputRef.current.left = false;
      if (key === "arrowright" || key === "d" || key === "l") inputRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [dash, advanceIntro, record, choice, chooseUpgrade, wake]);

  useEffect(() => {
    const markHardware = () => { if (deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); } };
    const control: HardwareControl = {
      wake: () => { markHardware(); wake(); },
      move: (axis) => { markHardware(); const r=runtimeRef.current; r.targetX=Math.max(.22,Math.min(.78,r.targetX+Math.max(-1,Math.min(1,axis))*.075)); },
      press: () => { markHardware(); if (!awakeRef.current) wake(); else if (choice) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]); else if (runtimeRef.current.started) dash(); else if (!record) advanceIntro(); },
      pause: () => { markHardware(); const r=runtimeRef.current; if (r.started && !choice) { r.paused=!r.paused; setPaused(r.paused); } },
    };
    window.MemoryDriftInput = control;
    const onHardware = (event: Event) => { const detail=(event as CustomEvent<{action:string;value?:number}>).detail; if (!detail) return; if (detail.action==="wake") control.wake(); if (detail.action==="move") control.move(detail.value ?? 0); if (detail.action==="press") control.press(detail.value); if (detail.action==="pause") control.pause(); };
    window.addEventListener("memory-control", onHardware);
    return () => { window.removeEventListener("memory-control", onHardware); delete window.MemoryDriftInput; };
  }, [advanceIntro, choice, chooseUpgrade, dash, record, wake]);

  useEffect(() => {
    let frame = 0;
    let active = true;
    let previous = performance.now();
    let hudAt = 0;

    const tick = (wallNow: number) => {
      if (!active) return;
      const canvas = canvasRef.current;
      const assets = assetsRef.current;
      if (!canvas || !assets) { frame = requestAnimationFrame(tick); return; }
      const ctx = canvas.getContext("2d")!;
      const r = runtimeRef.current;
      const dt = Math.min(0.05, (wallNow - previous) / 1000);
      previous = wallNow;
      if (r.started && !r.paused && !document.hidden) r.clock += dt * 1000;
      const now = r.clock;

      const pad = Array.from(navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected);
      let stick = 0;
      if (pad) {
        const raw = pad.axes[0] || 0; stick = Math.abs(raw) > .18 ? raw : 0;
        if (pad.buttons[14]?.pressed) stick = -1;
        if (pad.buttons[15]?.pressed) stick = 1;
        const actionPressed = Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[2]?.pressed);
        const startPressed = Boolean(pad.buttons[9]?.pressed);
        if ((stick || actionPressed || startPressed) && deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); }
        if (choice && stick && !inputRef.current.gamepadHorizontal) { choiceIndexRef.current = (choiceIndexRef.current + (stick > 0 ? 1 : 2)) % 3; setChoiceIndex(choiceIndexRef.current); chime(680, .07); }
        if (actionPressed && !inputRef.current.gamepadDash) { if (!awakeRef.current) wake(); else if (choice) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]); else if (r.started) dash(); else if (!record) advanceIntro(); }
        if (startPressed && !inputRef.current.gamepadStart) { if (!awakeRef.current) wake(); else if (choice) { /* keep the choice pause */ } else if (r.started) { r.paused = !r.paused; setPaused(r.paused); } else if (!record) advanceIntro(); }
        inputRef.current.gamepadDash = actionPressed; inputRef.current.gamepadStart = startPressed; inputRef.current.gamepadHorizontal = stick ? Math.sign(stick) : 0;
      }

      if (r.started && !r.paused && !document.hidden) {
        const digital = (inputRef.current.right ? 1 : 0) - (inputRef.current.left ? 1 : 0);
        const moveAxis = Math.abs(stick) > Math.abs(digital) ? stick : digital;
        if (moveAxis) r.targetX += moveAxis * dt * .72;
        r.targetX = Math.max(0.22, Math.min(0.78, r.targetX));
        r.x += (r.targetX - r.x) * Math.min(1, dt * 12);
        r.trail.push({ x: r.x, at: now });
        r.trail = r.trail.filter((p) => now - p.at < 1350);

        const spawnGap = now < 6000 ? 1400 : Math.max(650, 950 - r.score / 40);
        if (now - r.lastSpawn > spawnGap && !r.portalQueued) {
          const lanes = [0.3, 0.42, 0.58, 0.7];
          const lane = lanes[Math.floor(Math.random() * lanes.length)];
          const roll = Math.random();
          const total = r.photoWeight + r.cartWeight + r.bubbleWeight;
          const photoEdge = r.photoWeight / total;
          const cartEdge = photoEdge + r.cartWeight / total;
          let kind: ItemKind = now < 6000 ? "photo" : roll < photoEdge ? "photo" : roll < cartEdge ? "cart" : "bubble";
          if (now > 7000 && Math.random() < .2) {
            const specials: ItemKind[] = r.source === "phone" ? ["cassette", "clock", "bubble", "static"] : r.source === "search" ? ["clock", "ticket", "ticket", "static"] : ["cassette", "bubble", "ticket", "static"];
            kind = specials[Math.floor(Math.random() * specials.length)];
          }
          r.items.push({ id: r.nextId++, kind, x: lane, y: 0.08, speed: 0.21 + Math.min(0.11, r.score / 30000) });
          r.lastSpawn = now;
          if (r.nextId % 4 === 0) r.items.push({ id: r.nextId++, kind: "bubble", x: lane < .5 ? .68 : .32, y: .04, speed: .14 });
        }

        if (r.memories >= 6 && !r.portalQueued) {
          r.items = r.items.filter((item) => item.kind !== "cart");
          r.items.push({ id: r.nextId++, kind: "rift", x: 0.5, y: 0.06, speed: 0.14 });
          r.portalQueued = true;
        }

        const echoes = [540, 1020].map((delay) => {
          const candidates = r.trail.filter((point) => point.at <= now - delay);
          return candidates.length ? candidates[candidates.length - 1].x : r.x;
        });

        r.items.forEach((item) => {
          item.y += item.speed * dt * (now < r.dashUntil ? 1.8 : 1);
          if (r.upgrade === "magnet" && (item.kind === "photo" || item.kind === "bubble") && item.y > .55 && Math.abs(item.x - r.x) < .19) item.x += (r.x - item.x) * dt * 3;
          if (item.hit || item.y < PLAYER_Y - 0.07 || item.y > PLAYER_Y + 0.09) return;
          const playerHit = Math.abs(item.x - r.x) < (item.kind === "cart" ? 0.115 : 0.08);
          const echoHit = !playerHit && item.kind === "photo" && echoes.some((x) => Math.abs(item.x - x) < (r.upgrade === "echo" ? .14 : .065));
          if (item.kind === "photo" && (playerHit || echoHit)) {
            item.hit = true;
            r.combo += 1;
            r.memories = Math.min(6, r.memories + 1);
            r.score += (echoHit ? 80 : 100) * Math.min(8, r.combo);
            r.stats.caught += 1; if (echoHit) r.stats.echoed += 1;
            r.drift = Math.min(1, r.drift + .055); chime(620 + Math.min(r.combo, 8) * 55);
            if (r.stats.caught % 4 === 0) r.effectUntil = now + 750;
            r.stats.maxCombo = Math.max(r.stats.maxCombo, r.combo);
            r.photoWeight = Math.max(.42, r.photoWeight - .012);
            setFeedback(echoHit ? "残影替你接住了遗漏" : r.combo > 2 ? `连续记住 ×${r.combo}` : "照片已装入口袋");
          } else if (item.kind === "cart" && playerHit) {
            item.hit = true;
            if (now < r.dashUntil) { r.score += 180; setFeedback("冲刺撞开了记忆柜"); }
            else if (r.shield > 0) { r.shield -= 1; r.score += 60; setFeedback("记忆泡泡替你挡住一次碰撞"); }
            else {
              r.stats.bumps += 1; r.bubbleWeight = Math.min(.25, r.bubbleWeight + .025); r.cartWeight = Math.max(.12, r.cartWeight - .018);
              if (r.memories > 0) r.memories -= 1;
              r.combo = 0; r.shakeUntil = now + 280; r.effectUntil = now + 900; r.drift = Math.min(1, r.drift + .12); setFeedback("画面串线了！接泡泡能找回颜色"); chime(180);
            }
          } else if (item.kind === "bubble" && playerHit) {
            item.hit = true; r.shield = Math.min(3, r.shield + 1); r.score += 120; r.stats.caught += 1;
            r.memories = Math.min(6, r.memories + 1); r.drift = Math.max(0, r.drift - .18);
            setFeedback("相框泡泡：照片 +1，颜色回来了"); chime(980);
          } else if (item.kind === "cassette" && playerHit) {
            item.hit = true; r.combo += 2; r.score += 260; r.memories = Math.min(6, r.memories + 1); r.stats.caught += 1;
            r.effectUntil = now + 480; r.drift = Math.max(0, r.drift - .08); setFeedback("旧磁带：下一段回声提前响起 · 连击 +2"); chime(520, .25);
          } else if (item.kind === "ticket" && playerHit) {
            item.hit = true; r.combo += 1; r.score += 180; r.memories = Math.min(6, r.memories + 2); r.stats.caught += 1;
            setFeedback("褪色票根：一次带回 2 格记忆"); chime(840, .28);
          } else if (item.kind === "clock" && playerHit) {
            item.hit = true; r.bonusTime = Math.min(12000, r.bonusTime + 5000); r.score += 150; r.stats.caught += 1;
            setFeedback("停摆时钟：展厅时间 +5 秒"); chime(1180, .32);
          } else if (item.kind === "static" && playerHit) {
            item.hit = true;
            if (now < r.dashUntil) { r.score += 140; setFeedback("冲刺穿过了坏掉的像素"); chime(400, .08, true); }
            else if (r.shield > 0) { r.shield -= 1; setFeedback("保护泡泡隔开了静电噪点"); chime(720, .1); }
            else { r.stats.bumps += 1; r.combo = 0; r.drift = Math.min(1, r.drift + .18); r.effectUntil = now + 1100; r.shakeUntil = now + 240; setFeedback("记忆被压缩坏了：物体暂时失去颜色"); chime(120, .22, true); }
          } else if (item.kind === "rift" && playerHit) {
            item.hit = true;
            r.version = r.version === "A" ? "B" : "A";
            r.versionFade = 1;
            r.memories = 0;
            r.combo += 3;
            r.score += 1000;
            r.stats.rifts += 1;
            r.portalQueued = false;
            r.items = [];
            r.lastSpawn = now + 400;
            setFeedback(`进入 VERSION ${r.version} · 场景记忆已重排`);
          }
        });
        r.items.forEach((item) => {
          if (!item.hit && item.kind === "rift" && item.y >= 1.02) { item.hit = true; r.portalQueued = false; r.memories = 5; setFeedback("错过入口也没关系，再接一张就能重开"); }
          if (!item.hit && item.kind === "photo" && item.y >= 1.02) {
            item.hit = true; r.stats.missed += 1; r.combo = 0;
            r.photoWeight = Math.min(.75, r.photoWeight + .024);
            setFeedback("漏掉的照片，下轮更容易再次出现");
          }
        });
        r.items = r.items.filter((item) => !item.hit && item.y < 1.08);
        r.versionFade = Math.max(0, r.versionFade - dt * 1.7);

        if (now >= 18000 && !r.offered) { r.offered = true; r.paused = true; choiceIndexRef.current = 0; setChoiceIndex(0); setChoice(true); }
        setSeconds((old) => { const value = Math.max(0, Math.ceil((52000 + r.bonusTime - now) / 1000)); return old === value ? old : value; });

        if (now - r.startedAt >= 52000 + r.bonusTime || r.stats.rifts >= 3) finishRun();

        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ score: r.score, combo: r.combo, memories: r.memories, version: r.version });
        }
      }

      const shake = !quietRef.current && now < r.shakeUntil ? Math.sin(now * .03) * 7 * ((r.shakeUntil - now) / 280) : 0;
      ctx.save();
      ctx.translate(shake, 0);
      const current = r.version === "A" ? assets.backgroundA : assets.backgroundB;
      const previousBg = r.version === "A" ? assets.backgroundB : assets.backgroundA;
      ctx.drawImage(current, 0, 0, W, H);
      if (r.versionFade > 0) { ctx.globalAlpha = r.versionFade; ctx.drawImage(previousBg, 0, 0, W, H); ctx.globalAlpha = 1; }
      const shade = ctx.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, "rgba(30,91,139,.08)"); shade.addColorStop(.56, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(86,43,20,.13)");
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      drawSpatialCollage(ctx, r.drift, now, r.version);

      if (!awakeRef.current) {
        const blink = Math.sin(wallNow * .0017) > .78 ? .28 : .07;
        ctx.save(); ctx.globalAlpha = quietRef.current ? .035 : blink; ctx.globalCompositeOperation = "screen";
        ctx.drawImage(assets.glitchOverlay, 0, 0, W, H); ctx.restore();
        ctx.fillStyle = "rgba(10,24,39,.58)"; ctx.fillRect(0, 0, W, H);
      }

      if (r.started) {
        const echoes = [540, 1020].map((delay) => {
          const candidates = r.trail.filter((point) => point.at <= now - delay);
          return candidates.length ? candidates[candidates.length - 1].x : r.x;
        });
        echoes.reverse().forEach((x, index) => {
          ctx.save(); ctx.globalAlpha = index ? 0.25 : 0.14; ctx.filter = "hue-rotate(125deg) saturate(1.8) brightness(1.35)";
          cropDraw(ctx, assets.player, [312, 99, 680, 1015], x * W, PLAYER_Y * H + 10, 155, 232);
          ctx.restore();
        });

        r.items.sort((a, b) => a.y - b.y).forEach((item) => {
          ctx.save();
          if (item.kind !== "bubble" && item.kind !== "rift" && (item.id % 3 === 0 || r.drift > .65)) ctx.filter = `grayscale(${Math.min(1, r.drift * 1.6)})`;
          const scale = 0.46 + item.y * 0.72;
          if (item.kind === "photo") cropDraw(ctx, assets.photo, [284, 232, 742, 758], item.x * W, item.y * H, 112 * scale, 115 * scale);
          if (item.kind === "cart") cropDraw(ctx, assets.cart, [203, 190, 862, 882], item.x * W, item.y * H, 238 * scale, 244 * scale);
          if (item.kind === "bubble") {
            cropDraw(ctx, assets.photo, [284, 232, 742, 758], item.x * W, item.y * H, 95 * scale, 98 * scale);
            ctx.save(); ctx.globalCompositeOperation = "screen";
            ctx.drawImage(assets.bubble, item.x * W - 78 * scale, item.y * H - 78 * scale, 156 * scale, 156 * scale); ctx.restore();
          }
          if (item.kind === "rift") {
            ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.95;
            ctx.drawImage(assets.rift, item.x * W - 220 * scale, item.y * H - 220 * scale, 440 * scale, 440 * scale);
            ctx.restore();
          }
          if (["cassette", "ticket", "clock", "static"].includes(item.kind)) drawMemoryToken(ctx, item.kind, item.x * W, item.y * H, 132 * scale);
          ctx.restore();
        });

        if (r.shield > 0) {
          const pulse = 1 + Math.sin(now * 0.008) * 0.025;
          ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.62 + r.shield * 0.12;
          ctx.drawImage(assets.bubble, r.x * W - 188 * pulse, PLAYER_Y * H - 220 * pulse, 376 * pulse, 376 * pulse);
          ctx.restore();
        }
        if (now < r.dashUntil) {
          ctx.fillStyle = "rgba(93,227,255,.28)";
          for (let i = 0; i < 5; i += 1) { ctx.beginPath(); ctx.roundRect(r.x * W - 65 - i * 16, PLAYER_Y * H + 70 + i * 22, 130 + i * 32, 18, 9); ctx.fill(); }
        }
        const bob = Math.sin(now * 0.012) * 5;
        cropDraw(ctx, assets.player, [312, 99, 680, 1015], r.x * W, PLAYER_Y * H + bob, 188, 280);
      }
      ctx.restore();
      if (r.started && now < r.effectUntil) {
        ctx.save();
        const fade = Math.min(1, (r.effectUntil - now) / 500);
        const strength = (quietRef.current ? .05 : .28) * fade;
        ctx.globalAlpha = strength * 1.2; ctx.globalCompositeOperation = "screen";
        ctx.drawImage(assets.glitchOverlay, 0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
        for (let band = 0; band < 8; band++) {
          const sy = 210 + ((band * 233 + Math.floor(now / 90) * 71) % 1320); const bh = 16 + (band % 3) * 18; const offset = quietRef.current ? 2 : (band % 2 ? 34 : -26) * fade;
          ctx.globalAlpha = strength; ctx.drawImage(canvas, 0, sy, W, bh, offset, sy, W, bh);
          ctx.fillStyle = band % 3 === 0 ? "#20e6d0" : band % 3 === 1 ? "#ff4f7d" : "#fff16c"; ctx.globalCompositeOperation = "screen"; ctx.fillRect(offset, sy, W, Math.max(2,bh*.16));
        }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = strength * .75;
        const signalColors = ["#20e6d0", "#3b8cff", "#ff3fb4", "#ff7658", "#f7dc55", "#9a6cff"];
        for (let strip = 0; strip < 15; strip++) { const x=(strip*83+Math.floor(now/90)*29)%W;ctx.fillStyle=signalColors[strip%signalColors.length];ctx.globalAlpha=strength*(.45+(strip%3)*.18);ctx.fillRect(x,230+(strip%5)*36,strip%4===0?4:2,1050-(strip%4)*90); }
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [finishRun, chime, dash, advanceIntro, record, choice, chooseUpgrade, wake]);

  const saveCard = useCallback(() => {
    if (!record) return;
    const card = document.createElement("canvas"); card.width = 1080; card.height = 1440;
    const c = card.getContext("2d")!; const g = c.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, "#5ee0ff"); g.addColorStop(.48, "#fff0a8"); g.addColorStop(1, "#ff8c67"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
    c.fillStyle = "rgba(255,255,255,.84)"; c.roundRect(75, 80, 930, 1280, 52); c.fill(); c.fillStyle = "#173755";
    c.font = "800 34px sans-serif"; c.fillText(`MEMORY JOURNEY · RUN ${String(record.run).padStart(2,"0")}`, 130, 160);
    c.font = "900 76px sans-serif"; c.fillText(tr("忘了自己是什么", "WHAT WAS I AGAIN?"), 130, 280); c.font = "700 38px sans-serif"; c.fillStyle = "#ef704f"; c.fillText(language === "zh" ? record.tendency : getTendencyEn(record), 130, 360);
    c.fillStyle = "#173755"; c.font = "800 42px sans-serif";
    [["SCORE",record.score],[tr("记住","CAUGHT"),record.caught],[tr("残影补捡","ECHO CATCH"),record.echoed],[tr("遗漏","MISSED"),record.missed],[tr("碰撞","COLLISIONS"),record.bumps],[tr("主动遗忘","RELEASED"),record.dashes]].forEach(([label,value],i)=>c.fillText(`${label}  ${value}`,130,500+i*105));
    c.font = "800 38px sans-serif"; c.fillText(`CURRENT VERSION  ${record.version}`,130,1190); c.font = "600 28px sans-serif"; c.fillText(tr("下一次奔跑会继承这一次留下的偏差。", "THE NEXT RUN WILL INHERIT THIS DRIFT."),130,1270);
    const a = document.createElement("a"); a.download = `memory-journey-${record.run}.png`; a.href = card.toDataURL("image/png"); a.click();
  }, [record, language, tr]);

  const shareCard = useCallback(async () => {
    if (!record) return;
    const text = language === "zh" ? `我的记忆身份：${record.tendency}｜${record.score} 分｜Version ${record.version}` : `MY MEMORY IDENTITY: ${getTendencyEn(record)} | ${record.score} POINTS | VERSION ${record.version}`;
    try {
      if (navigator.share) await navigator.share({ title: tr("忘了自己是什么", "WHAT WAS I AGAIN?"), text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); setShareMessage(tr("结算文字和网址已复制", "RESULT AND LINK COPIED")); }
    } catch { setShareMessage(tr("分享未完成，可以用保存记忆卡下载图片。", "SHARE NOT COMPLETED · SAVE THE MEMORY CARD INSTEAD")); }
  }, [record, language, tr]);

  const pauseGame = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || choice) return;
    r.paused = !r.paused; setPaused(r.paused);
  }, [choice]);

  useEffect(() => {
    const hide = () => { if (document.hidden && runtimeRef.current.started) { runtimeRef.current.paused = true; setPaused(true); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  const popBubble = (clientX: number, clientY: number) => {
    const r = runtimeRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !r.started || r.paused) return false;
    const x = (clientX - rect.left) / rect.width; const y = (clientY - rect.top) / rect.height;
    const bubble = r.items.find(item => !item.hit && item.kind === "bubble" && Math.abs(item.x - x) < .1 && Math.abs(item.y - y) < .065);
    if (!bubble) return false;
    bubble.hit = true; r.shield = Math.min(3, r.shield + 1); r.memories = Math.min(6, r.memories + 1);
    r.stats.caught++; r.score += 150; r.drift = Math.max(0, r.drift - .2);
    chime(1080); setFeedback("啪！记忆 +1 · 恢复颜色 · 保护 +1"); return true;
  };

  return (
    <main className="rush-page">
      <section className="rush-game" data-lang={language} aria-label={tr("记忆与遗忘竖屏游戏", "Vertical game about memory and forgetting")}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label={tr("滑动控制旅行者收集记忆照片", "Slide to guide the traveler and collect memory photos")}
          onPointerDown={(event) => { if (!awakeRef.current) { wake(); return; } if (popBubble(event.clientX, event.clientY)) return; pointerDown.current = true; event.currentTarget.setPointerCapture(event.pointerId); movePointer(event.clientX); }}
          onPointerMove={(event) => { if (pointerDown.current) movePointer(event.clientX); }}
          onPointerUp={() => { pointerDown.current = false; }}
          onPointerCancel={() => { pointerDown.current = false; }}
        />

        {awake && <header className="rush-hud">
          <div><span>{tr("叠加层", "LAYERS")}</span><strong>{hud.memories}/6</strong></div>
          <div className="rush-title"><span>WHAT WAS I AGAIN?</span><strong>VERSION {hud.version}</strong></div>
          <div><span>{tr("重复确认", "RECHECKS")}</span><strong>{String(hud.combo).padStart(2, "0")}</strong></div>
        </header>}

        {awake && <div className="rush-settings">
          <span className="device-pill">{lastDevice === "gamepad" ? tr("街机", "ARCADE") : lastDevice === "keyboard" ? tr("键盘", "KEYS") : tr("触控", "TOUCH")}</span>
          {started && <button className="pause-quick" onClick={pauseGame} disabled={choice}>{paused ? tr("继续", "RESUME") : tr("暂停", "PAUSE")}</button>}
          <button className="settings-toggle" aria-expanded={settingsOpen} aria-controls="display-controls" onClick={() => setSettingsOpen(!settingsOpen)}>{tr("设置", "SETTINGS")} <span>{settingsOpen ? "×" : "+"}</span></button>
          {settingsOpen && <div className="settings-popover" id="display-controls">
            <button aria-pressed={quiet} onClick={() => { quietRef.current = !quiet; setQuiet(!quiet); }}>{tr("故障强度", "GLITCH")}<strong>{quiet ? tr("柔和", "SOFT") : tr("完整", "FULL")}</strong></button>
            <button aria-pressed={sound} onClick={() => { unlockAudio(); soundRef.current = !sound; setSound(!sound); }}>{tr("声音", "SOUND")}<strong>{sound ? tr("开", "ON") : tr("关", "OFF")}</strong></button>
            <button onClick={() => { const next=language === "zh" ? "en" : "zh"; setLanguage(next); localStorage.setItem("memory-rush-language", next); }}>{tr("语言", "LANGUAGE")}<strong>{language === "zh" ? "EN" : "中文"}</strong></button>
          </div>}
        </div>}

        {!awake && <button className="dormant-screen" onClick={wake} aria-label={tr("唤醒装置", "Wake installation")}>
          <span className="dormant-code">MEMORY CHANNEL / 00</span>
          <span className="dormant-mark" aria-hidden="true"><i /><i /><i /></span>
          <strong>{tr("等待一段记忆靠近", "WAITING FOR A MEMORY")}</strong>
          <small>{tr("靠近 · 触碰 · 按下任意键", "APPROACH · TOUCH · PRESS ANY KEY")}</small>
          <em>{tr("信号未响应", "SIGNAL DORMANT")}</em>
        </button>}
        {started && <><div className="combo-pill" data-active={hud.combo > 1}>{hud.combo > 1 ? `×${hud.combo} ${tr("重复使它更熟悉", "REPETITION FEELS FAMILIAR")}` : tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</div>
          <div className="rush-journey"><span>{seconds > 42 ? tr("01 / 稳定读取", "01 / STABLE ARCHIVE") : seconds > 32 ? tr("02 / 轻微漂移", "02 / MEMORY DRIFT") : seconds > 20 ? tr("03 / 记忆损坏", "03 / CORRUPTED MEMORY") : seconds > 8 ? tr("04 / 漂移空间", "04 / MEMORY WORLD") : tr("05 / 多版本", "05 / MULTIPLE VERSION")}</span><strong>{seconds}s</strong><progress max={52} value={52-seconds} aria-label={tr("重构进度", "Reconstruction progress")} /></div>
          <div className="rush-feedback" data-fault={feedback.includes("串线") || feedback.includes("压缩坏了")} role="status">{shownFeedback}</div>
          <div className="pickup-legend" aria-label={tr("可收集物提示", "Collectible guide")}><span>▣ {tr("照片", "PHOTO")}</span><span>▤ {tr("磁带", "TAPE")}</span><span>⌁ {tr("票根", "TICKET")}</span><span>◷ {tr("加时", "TIME")}</span><span className="danger">▥ {tr("坏像素", "BAD PIXEL")}</span></div></>}

        {awake && !started && !record && <div className="rush-intro">
          <span>{intro === 0 ? tr("展览的数字后果 · 同一记忆将被重复读取", "DIGITAL CONSEQUENCE · ONE MEMORY, READ REPEATEDLY") : `MEMORY INPUT 0${intro} / 03`}</span>
          <h1>{intro === 0 ? tr("忘了自己是什么", "WHAT WAS I AGAIN?") : intro === 1 ? tr("你把记忆放在哪里？", "WHERE DO YOU KEEP A MEMORY?") : intro === 2 ? (language === "zh" ? sourceCopy[memorySource].title : memorySource === "phone" ? "EXTENDED MEMORY" : memorySource === "search" ? "THE GOOGLE EFFECT" : "FALSE MEMORY") : tr("接住正在逃跑的记忆", "CATCH THE MEMORIES ESCAPING")}</h1>
          {intro !== 1 && <div className={`intro-photo intro-photo-${intro}`}><img src={resolveImageUrl(photoUrl)} alt={tr("通往夏日乐园的旧照片", "Old photograph of a road to the summer park")} /><i /></div>}
          {intro === 1 && <div className="memory-source-grid" role="group" aria-label={tr("选择本局记忆来源", "Choose this run's memory source")}>
            {(Object.keys(sourceCopy) as MemorySource[]).map((source) => <button key={source} data-selected={memorySource === source} onClick={() => { unlockAudio(); setMemorySource(source); chime(source === "phone" ? 620 : source === "search" ? 780 : 940, .12); }}><strong>{language === "zh" ? sourceCopy[source].label : source === "phone" ? "PHONE" : source === "search" ? "SEARCH" : "MYSELF"}</strong><span>{language === "zh" ? sourceCopy[source].title : source === "phone" ? "Extended Memory" : source === "search" ? "Google Effect" : "False Memory"}</span></button>)}
          </div>}
          <p>{intro === 0 ? tr("前面的展览讨论了数字失忆、谷歌效应与平台如何反复召回过去。这里呈现它的后果：你越频繁确认同一段记忆，它越熟悉，也越可能偏离。停止触碰时，系统反而会暂时稳定。", "The exhibition traced digital amnesia, the Google effect, and platforms that repeatedly resurface the past. Here is the consequence: the more often you verify one memory, the more familiar—and less reliable—it becomes. Stop touching it, and the system briefly stabilizes.") : intro === 1 ? tr("照片、搜索与个人回想都是外置或重构记忆的入口。选择的不是难度，而是这次偏差从哪里开始。", "Photos, search and personal recall are different entrances into external or reconstructed memory. You are not choosing difficulty; you are choosing where this drift begins.") : intro === 2 ? tr(sourceCopy[memorySource].text + " 第一次读取看起来完整，但它已经不是未经观看的版本。", memorySource === "phone" ? "Your phone kept the time and place, but not how the moment felt. The first reading looks complete, yet it is already a viewed version." : memorySource === "search" ? "You remember that the answer can be found, so you remember where to look. The first reading already privileges access over recall." : "Every recollection edits the memory again. Certainty is not the same as truth. The first reading is already a reconstruction.") : tr("移动、再次查看、错过和折返都会留下可见后果。收集物是同一段记忆的证据；它们不会证明原本，只会增加叠加层。", "Moving, rechecking, missing and returning all leave visible consequences. Collectibles are evidence from the same memory; they do not prove an original, they only add another layer.")}</p>
          {previous && intro === 0 && <div className="previous-memory"><b>{tr(`上次：VERSION ${previous.version}`, `LAST: VERSION ${previous.version}`)}</b><span>{tr(`读取 ${previous.caught} 次 · 原始版本未知`, `${previous.caught} READINGS · ORIGINAL UNKNOWN`)}</span></div>}
          <button disabled={!ready} onClick={advanceIntro}>{loadError ? tr("素材加载失败，请刷新页面", "ASSET LOAD FAILED · REFRESH") : !ready ? tr("正在装载记忆…", "LOADING MEMORY…") : intro === 0 ? tr("读取展览留下的痕迹", "READ THE EXHIBITION TRACE") : intro === 1 ? tr("选择记忆入口", "SELECT MEMORY INPUT") : intro === 2 ? tr("进行第一次确认", "CONFIRM THE FIRST READING") : tr("进入同一段记忆", "ENTER THE SAME MEMORY")}</button>
          {loadError && <button onClick={() => location.reload()}>{tr("重新加载", "RELOAD")}</button>}
          <small>{intro === 3 ? (lastDevice === "gamepad" ? tr("摇杆移动 · 任意动作按钮冲刺 · START 暂停", "STICK MOVE · ACTION DASH · START PAUSE") : lastDevice === "keyboard" ? tr("方向键 / A D / J L 移动 · 空格 / Z / X 冲刺", "ARROWS / A D / J L MOVE · SPACE / Z / X DASH") : tr("拖动移动 · 点泡泡 · 点击冲刺", "DRAG TO MOVE · TAP BUBBLES · TAP DASH")) : tr("点击、回车或街机按钮继续", "CLICK · ENTER · OR ARCADE BUTTON")}</small>
          {previous && <button className="rush-skip" disabled={!ready} onClick={begin}>{tr("跳过故事，直接出发", "SKIP STORY · START RUN")}</button>}
        </div>}

        {(choice || paused) && <section className="rush-choice" aria-label={choice ? tr("选择记忆能力", "Choose a memory ability") : tr("游戏已暂停", "Game paused")}>
          <span>{choice ? tr("口袋里腾出了一点空间", "A little space opened in your pocket") : tr("记忆已暂停", "MEMORY PAUSED")}</span><h2>{choice ? tr("这次，带走什么？", "WHAT WILL YOU KEEP?") : tr("等你回来再出发", "RETURN WHEN READY")}</h2>
          {choice ? <><p>{tr("选择一个本局能力。时间已暂停。", "Choose one ability for this run. Time is paused.")}</p>
            <button data-selected={choiceIndex === 0} onFocus={() => { choiceIndexRef.current=0; setChoiceIndex(0); }} onClick={() => chooseUpgrade("magnet")}><strong>{tr("照片磁铁", "PHOTO MAGNET")}</strong><span>{tr("附近的照片和泡泡会靠过来", "Nearby photos and bubbles drift toward you")}</span></button>
            <button data-selected={choiceIndex === 1} onFocus={() => { choiceIndexRef.current=1; setChoiceIndex(1); }} onClick={() => chooseUpgrade("echo")}><strong>{tr("更清晰的昨天", "CLEARER YESTERDAY")}</strong><span>{tr("残影的补捡范围扩大", "Echoes catch memories from farther away")}</span></button>
            <button data-selected={choiceIndex === 2} onFocus={() => { choiceIndexRef.current=2; setChoiceIndex(2); }} onClick={() => chooseUpgrade("shield")}><strong>{tr("彩色保护壳", "COLOR SHELL")}</strong><span>{tr("恢复颜色，获得 3 次保护", "Restore color and gain three shields")}</span></button></> : <button onClick={pauseGame}>{tr("继续旅程", "RESUME JOURNEY")}</button>}
        </section>}

        {started && <button className="forget-dash" disabled={hud.memories < 1} onClick={dash}>
          <span>{tr("遗忘 1 张", "RELEASE 1")}</span><strong>{tr("冲刺", "DASH")}</strong>
        </button>}

        {record && <section className="memory-result" aria-label={tr("本局记忆旅程卡", "Memory journey result card")}>
          <div className="result-kicker">RECONSTRUCTION RECORD · RUN {String(record.run).padStart(2,"0")}</div>
          <h2>{tr("重构后的记忆", "RECONSTRUCTED MEMORY")}</h2>
          <p>{tr("你没有恢复它。读取、遗漏、碰撞与折返共同生成了当前版本。", "You did not restore it. Reading, missing, colliding and returning produced the current version together.")}</p>
          <div className="result-score"><span>ORIGINAL MEMORY</span><strong>{tr("未知", "UNKNOWN")}</strong><i>VERSION {record.version}</i></div>
          <dl>
            <div><dt>{tr("记住", "CAUGHT")}</dt><dd>{record.caught}</dd></div><div><dt>{tr("残影补捡", "ECHO CATCH")}</dt><dd>{record.echoed}</dd></div>
            <div><dt>{tr("遗漏", "MISSED")}</dt><dd>{record.missed}</dd></div><div><dt>{tr("碰撞", "COLLISIONS")}</dt><dd>{record.bumps}</dd></div>
            <div><dt>{tr("主动遗忘", "RELEASED")}</dt><dd>{record.dashes}</dd></div><div><dt>{tr("最高连击", "BEST CHAIN")}</dt><dd>×{record.maxCombo}</dd></div>
          </dl>
          <div className="result-note">{language === "zh" ? <>记忆入口：{sourceCopy[record.source ?? "phone"].label} · 当前版本：{record.version} · 原始版本：无法验证</> : <>MEMORY INPUT: {(record.source ?? "phone").toUpperCase()} · CURRENT VERSION: {record.version} · ORIGINAL: UNVERIFIABLE</>}<br />
            {["第一张回忆", "满载而归", "过去的帮手", "轻装上路", "另一个夏天", "连成一段"].map((name,index) => <span className="album-stamp" key={name} data-earned={album.includes(name)}>{album.includes(name) ? "✓ " : "○ "}{language === "zh" ? name : ["FIRST MEMORY","FULL RETURN","PAST HELPER","TRAVEL LIGHT","ANOTHER SUMMER","ONE THREAD"][index]}</span>)}<br />
            {tr("再次进入时，这些痕迹会成为下一次重构的条件。", "On re-entry, these traces become conditions for the next reconstruction.")}</div>
          <p role="status">{shareMessage}</p>
          <div className="result-actions"><button onClick={saveCard}>{tr("保存记忆卡", "SAVE MEMORY CARD")}</button><button onClick={shareCard}>{tr("分享结果", "SHARE RESULT")}</button></div>
          <button className="replay-memory" onClick={begin}>{tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</button>
        </section>}
      </section>
    </main>
  );
}

