"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import backgroundAUrl from "../game/assets/grid-surreal-memory-a.webp";
import backgroundBUrl from "../game/assets/grid-surreal-memory-b.webp";
import playerUrl from "../game/assets/traveler-run-back.png";
import photoUrl from "../game/assets/grid-memory-photo.webp";
import cartUrl from "../game/assets/grid-memory-cart.webp";
import glitchOverlayUrl from "../game/assets/memory-glitch-overlay.webp";

const W = 1080;
const H = 1920;
const PLAYER_Y = 0.79;

type MemoryVersion = "A" | "B" | "C";
type ItemKind = "photo" | "cart";
type DeviceKind = "touch" | "keyboard" | "gamepad";
type HardwareControl = { wake: () => void; move: (axis: number) => void; press: (pressure?: number) => void; pause: () => void };
declare global { interface Window { MemoryDriftInput?: HardwareControl } }
type Item = { id: number; kind: ItemKind; x: number; y: number; speed: number; hit?: boolean };
type Trail = { x: number; at: number };
type RunStats = { caught: number; missed: number; bumps: number };
type MemoryRecord = RunStats & { score: number; checks: number; version: MemoryVersion; run: number; recalls?: number[] };
type Runtime = {
  clock: number;
  paused: boolean;
  drift: number;
  effectUntil: number;
  recallStage: number;
  recalls: number[];
  started: boolean;
  x: number;
  targetX: number;
  items: Item[];
  nextId: number;
  lastSpawn: number;
  score: number;
  combo: number;
  checks: number;
  memories: number;
  version: MemoryVersion;
  previousVersion: MemoryVersion;
  versionFade: number;
  shakeUntil: number;
  startedAt: number;
  lastInteraction: number;
  idleNotified: boolean;
  stats: RunStats;
  trail: Trail[];
};

const emptyStats = (): RunStats => ({ caught: 0, missed: 0, bumps: 0 });
const makeRuntime = (): Runtime => ({
  clock: 0, paused: false, drift: 0, effectUntil: 0, recallStage: 0, recalls: [],
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, checks: 0, memories: 0, version: "A", previousVersion: "A", versionFade: 0,
  shakeUntil: 0, startedAt: 0, lastInteraction: 0, idleNotified: false,
  stats: emptyStats(),
  trail: [],
});

const feedbackEn = (text: string) => {
  if (text.startsWith("连续记住")) return text.replace("连续记住", "MEMORY CHAIN");
  if (text.startsWith("第 ")) return text.replace("次确认：熟悉感正在增加", " CHECKS · FAMILIARITY IS INCREASING").replace("第 ", "");
  if (text.startsWith("进入 VERSION")) return text.replace("进入", "ENTERED").replace("场景记忆已重排", "SCENE MEMORY REORDERED");
  const table: Record<string, string> = {
    "左右移动收集照片 · 避开干扰 · 稍后回想": "MOVE TO COLLECT PHOTOS · AVOID INTERFERENCE · RECALL LATER",
    "回想已记录 · 继续寻找照片": "RECALL RECORDED · CONTINUE FINDING PHOTOS",
    "一个片段离开了画面": "A FRAGMENT LEFT THE FRAME",
    "过去的你会帮忙补捡": "YOUR PAST ECHO WILL CATCH MISSED PHOTOS",
    "左右拖动接照片 · 轻点相框泡泡": "MOVE LEFT OR RIGHT · TAP FRAME BUBBLES",
    "你主动丢掉一张记忆，换来短暂加速": "ONE MEMORY RELEASED · TEMPORARY DASH",
    "带上新能力，追回剩下的夏天": "ABILITY EQUIPPED · CHASE THE REST OF SUMMER",
    "记忆能力已生效：它也会改变最后留下的版本": "MEMORY ABILITY ACTIVE · IT WILL ALTER THE VERSION YOU LEAVE WITH",
    "残影替你接住了遗漏": "YOUR ECHO CAUGHT A MISSED PHOTO",
    "照片已装入口袋": "PHOTO STORED IN YOUR POCKET",
    "冲刺撞开了记忆柜": "DASH BROKE THROUGH THE MEMORY CART",
    "记忆泡泡替你挡住一次碰撞": "MEMORY BUBBLE BLOCKED THE COLLISION",
    "画面短暂串线，继续寻找照片": "BRIEF SIGNAL DISRUPTION · KEEP LOOKING FOR PHOTOS",
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
    "长按锁定失败：记忆产生新的错位": "LOCK FAILED · A NEW MISALIGNMENT APPEARED",
    "停止触碰：画面正在重新稳定": "NO INPUT · THE IMAGE IS STABILIZING",
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

function drawContained(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * ratio;
  const height = image.naturalHeight * ratio;
  ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
}

function drawSpatialCollage(ctx: CanvasRenderingContext2D, drift: number, now: number, version: MemoryVersion) {
  ctx.save();
  const pulse = Math.sin(now * .0011) * (8 + drift * 24);
  const ink = version === "A" ? "#274d91" : version === "B" ? "#d9d9d9" : "#6542a5";
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

function drawMemoryBackground(ctx: CanvasRenderingContext2D, assets: Record<string, HTMLImageElement>, version: MemoryVersion, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (version === "A") {
    ctx.drawImage(assets.backgroundA, 0, 0, W, H);
  } else if (version === "B") {
    ctx.filter = "grayscale(1) contrast(1.5) brightness(.7)";
    ctx.drawImage(assets.backgroundA, 0, 0, W, H);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(3,8,13,.28)";
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.filter = "hue-rotate(218deg) saturate(1.85) contrast(1.18)";
    ctx.drawImage(assets.backgroundB, 0, 0, W, H);
    ctx.filter = "none";
    const wash = ctx.createLinearGradient(0, 0, W, H);
    wash.addColorStop(0, "rgba(78,18,130,.28)");
    wash.addColorStop(.55, "rgba(0,214,179,.12)");
    wash.addColorStop(1, "rgba(255,43,112,.24)");
    ctx.fillStyle = wash;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

export default function MemoryRushGame() {
  const [awake, setAwake] = useState(false);
  const awakeRef = useRef(false);
  const [booting, setBooting] = useState(false);
  const bootingRef = useRef(false);
  const bootTimerRef = useRef(0);
  const [intro, setIntro] = useState(0);
  const [recallAnswer, setRecallAnswer] = useState(4);
  const [language, setLanguage] = useState<"zh" | "en">(() => {
    if (typeof window === "undefined") return "zh";
    return window.localStorage.getItem("memory-rush-language") === "en" ? "en" : "zh";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);
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
  const [shareMessage, setShareMessage] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const impactRef = useRef<HTMLAudioElement | null>(null);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const unlockAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    void audioRef.current.resume();
    if (soundRef.current && ambienceRef.current) void ambienceRef.current.play().catch(() => undefined);
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
  const [hud, setHud] = useState({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A" as MemoryVersion });
  const shownFeedback = language === "zh" ? feedback : feedbackEn(feedback);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "记忆代谢｜交互实验" : "MEMORY METABOLISM | INTERACTIVE EXPERIMENT";
  }, [language]);

  useEffect(() => {
    const ambience = new Audio(new URL("audio/nostalgic-memories.mp3", document.baseURI).href);
    const impact = new Audio(new URL("audio/impact-thud.mp3", document.baseURI).href);
    ambience.loop = true; ambience.preload = "auto"; ambience.volume = .2;
    impact.preload = "auto"; impact.volume = .95;
    ambienceRef.current = ambience; impactRef.current = impact;
    return () => { ambience.pause(); impact.pause(); ambienceRef.current = null; impactRef.current = null; window.clearTimeout(bootTimerRef.current); };
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadImage(backgroundAUrl), loadImage(backgroundBUrl), loadImage(playerUrl),
      loadImage(photoUrl), loadImage(cartUrl), loadImage(glitchOverlayUrl),
    ]).then(([backgroundA, backgroundB, player, photo, cart, glitchOverlay]) => {
      if (!live) return;
      assetsRef.current = { backgroundA, backgroundB, player, photo, cart, glitchOverlay };
      setReady(true);
    }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      quietRef.current = reduced; setQuiet(reduced);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const begin = useCallback(() => {
    unlockAudio();
    const fresh = makeRuntime();
    fresh.recalls = [recallAnswer];
    fresh.started = true;
    fresh.lastSpawn = 0; fresh.startedAt = 0;
    fresh.items = [{ id: fresh.nextId++, kind: "photo", x: .5, y: .6, speed: .12 }, { id: fresh.nextId++, kind: "photo", x: .38, y: .3, speed: .12 }];
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A" });
    setRecord(null); setStarted(true); setChoice(false); setPaused(false); setSeconds(52);
    setFeedback("左右移动收集照片 · 避开干扰 · 稍后回想");
  }, [recallAnswer, unlockAudio]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, checks: r.checks, version: r.version, run: (previous?.run ?? 0) + 1, recalls: [...r.recalls] };
    try { localStorage.setItem("memory-rush-record", JSON.stringify(next)); } catch { /* optional persistence */ }
    setPrevious(next); setRecord(next); setStarted(false);
    setShareMessage("");
  }, [previous]);

  const playImpact = useCallback(() => {
    if (!soundRef.current) return;
    const impact = impactRef.current;
    if (impact) { impact.currentTime = 0; void impact.play().catch(() => undefined); }
    chime(82, .42, true);
  }, [chime]);

  const movePointer = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, (clientX - rect.left) / rect.width));
    runtimeRef.current.lastInteraction = runtimeRef.current.clock;
    runtimeRef.current.idleNotified = false;
    if (deviceRef.current !== "touch") { deviceRef.current = "touch"; setLastDevice("touch"); }
  }, []);

  const chooseRecall = useCallback((answer: number) => {
    const r = runtimeRef.current;
    if (!r.started || !r.paused || r.recalls.length !== r.recallStage) return;
    r.recalls.push(answer);
    r.checks += 1;
    r.previousVersion = r.version;
    r.version = r.recallStage === 1 ? "B" : "C";
    r.versionFade = 1;
    r.drift = Math.min(1, r.drift + .15);
    r.effectUntil = r.clock + 900;
    r.paused = false; setPaused(false); setChoice(false);
    setFeedback("回想已记录 · 继续寻找照片");
    chime(880);
  }, [chime]);

  const advanceIntro = useCallback(() => {
    unlockAudio(); chime(720, .1);
    if (intro === 0) setIntro(1); else if (intro === 1) setIntro(2); else begin();
  }, [intro, begin, unlockAudio, chime]);

  const restartObservation = useCallback(() => {
    setRecord(null); setIntro(1); setRecallAnswer(4); setShareMessage("");
  }, []);

  const wake = useCallback(() => {
    if (awakeRef.current) return;
    awakeRef.current = true; bootingRef.current = true; setAwake(true); setBooting(true); unlockAudio(); chime(410, .35, true);
    window.clearTimeout(bootTimerRef.current);
    bootTimerRef.current = window.setTimeout(() => { bootingRef.current = false; setBooting(false); chime(760, .28); }, 3200);
  }, [unlockAudio, chime]);

  const sleep = useCallback(() => {
    if (runtimeRef.current.started) return;
    window.clearTimeout(bootTimerRef.current); bootingRef.current = false; setBooting(false);
    awakeRef.current = false; setAwake(false); setIntro(0); setRecord(null); setSettingsOpen(false);
    ambienceRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!awake || started) return;
    const timer = window.setTimeout(sleep, record ? 45000 : 90000);
    return () => window.clearTimeout(timer);
  }, [awake, started, record, sleep, intro, recallAnswer, settingsOpen]);

  useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("button,input,select,textarea")) return;
      const key = event.key.toLowerCase();
      if (!awakeRef.current) { event.preventDefault(); wake(); return; }
      if (bootingRef.current) { event.preventDefault(); return; }
      if (["arrowleft","arrowright","arrowup"," "].includes(key)) event.preventDefault();
      if (deviceRef.current !== "keyboard") { deviceRef.current = "keyboard"; setLastDevice("keyboard"); }
      if (!runtimeRef.current.started && !record) {
        if (["arrowleft","a","j"].includes(key) && intro === 2) { setRecallAnswer(value => Math.max(3, value - 1)); return; }
        if (["arrowright","d","l"].includes(key) && intro === 2) { setRecallAnswer(value => Math.min(5, value + 1)); return; }
        if (key === "enter" || key === " ") { advanceIntro(); return; }
      }
      if (record && ["enter", " ", "z", "x"].includes(key) && !event.repeat) { restartObservation(); return; }
      if (!runtimeRef.current.started) return;
      if (choice) {
        if (["arrowleft","a","j"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 2) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if (["arrowright","d","l"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 1) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if ([" ","enter","z","x"].includes(key)) chooseRecall([3,4,5][choiceIndexRef.current]);
        return;
      }
      if (key === "p" || key === "escape") { const r = runtimeRef.current; if (!choice) { r.paused = !r.paused; setPaused(r.paused); } return; }
      if (runtimeRef.current.paused) return;
      if (key === " " || key === "arrowup" || key === "z" || key === "enter" || key === "x") return;
      if (key === "shift") return;
      if (key === "arrowleft" || key === "a" || key === "j") { inputRef.current.left = true; runtimeRef.current.targetX -= .055; runtimeRef.current.lastInteraction = runtimeRef.current.clock; runtimeRef.current.idleNotified = false; }
      if (key === "arrowright" || key === "d" || key === "l") { inputRef.current.right = true; runtimeRef.current.targetX += .055; runtimeRef.current.lastInteraction = runtimeRef.current.clock; runtimeRef.current.idleNotified = false; }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a" || key === "j") inputRef.current.left = false;
      if (key === "arrowright" || key === "d" || key === "l") inputRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [advanceIntro, record, choice, chooseRecall, wake, intro, restartObservation]);

  useEffect(() => {
    const markHardware = () => { if (deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); } };
    const control: HardwareControl = {
      wake: () => { markHardware(); wake(); },
      move: (axis) => { markHardware(); const direction=Math.sign(axis); if (choice && direction) { choiceIndexRef.current=Math.max(0,Math.min(2,choiceIndexRef.current+direction)); setChoiceIndex(choiceIndexRef.current); return; } if (!runtimeRef.current.started && intro===2 && direction) { setRecallAnswer(value=>Math.max(3,Math.min(5,value+direction))); return; } const r=runtimeRef.current; r.targetX=Math.max(.22,Math.min(.78,r.targetX+Math.max(-1,Math.min(1,axis))*.075)); r.lastInteraction=r.clock; r.idleNotified=false; },
      press: () => { markHardware(); if (!awakeRef.current) wake(); else if (bootingRef.current) return; else if (choice) chooseRecall([3,4,5][choiceIndexRef.current]); else if (runtimeRef.current.started) return; else if (record) restartObservation(); else advanceIntro(); },
      pause: () => { markHardware(); const r=runtimeRef.current; if (r.started && !choice) { r.paused=!r.paused; setPaused(r.paused); } },
    };
    window.MemoryDriftInput = control;
    const onHardware = (event: Event) => { const detail=(event as CustomEvent<{action:string;value?:number}>).detail; if (!detail) return; if (detail.action==="wake") control.wake(); if (detail.action==="move") control.move(detail.value ?? 0); if (detail.action==="press") control.press(detail.value); if (detail.action==="pause") control.pause(); };
    window.addEventListener("memory-control", onHardware);
    return () => { window.removeEventListener("memory-control", onHardware); delete window.MemoryDriftInput; };
  }, [advanceIntro, choice, chooseRecall, record, wake, intro, restartObservation]);

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
        const shortPressed = Boolean(pad.buttons[0]?.pressed);
        const lockPressed = Boolean(pad.buttons[1]?.pressed || pad.buttons[2]?.pressed);
        const actionPressed = shortPressed || lockPressed;
        const startPressed = Boolean(pad.buttons[9]?.pressed);
        if ((stick || actionPressed || startPressed) && deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); }
        if (!r.started && intro===2 && stick && !inputRef.current.gamepadHorizontal) setRecallAnswer(value=>Math.max(3,Math.min(5,value+Math.sign(stick))));
        if (choice && stick && !inputRef.current.gamepadHorizontal) { choiceIndexRef.current = (choiceIndexRef.current + (stick > 0 ? 1 : 2)) % 3; setChoiceIndex(choiceIndexRef.current); chime(680, .07); }
        if (actionPressed && !inputRef.current.gamepadDash) { if (!awakeRef.current) wake(); else if (bootingRef.current) { /* wait for signal loading */ } else if (choice) chooseRecall([3,4,5][choiceIndexRef.current]); else if (r.started) { /* movement is the only in-run control */ } else if (record) restartObservation(); else advanceIntro(); }
        if (startPressed && !inputRef.current.gamepadStart) { if (!awakeRef.current) wake(); else if (choice) { /* keep the choice pause */ } else if (r.started) { r.paused = !r.paused; setPaused(r.paused); } else if (record) restartObservation(); else advanceIntro(); }
        inputRef.current.gamepadDash = actionPressed; inputRef.current.gamepadStart = startPressed; inputRef.current.gamepadHorizontal = stick ? Math.sign(stick) : 0;
      }

      if (r.started && !r.paused && !document.hidden) {
        const digital = (inputRef.current.right ? 1 : 0) - (inputRef.current.left ? 1 : 0);
        const moveAxis = Math.abs(stick) > Math.abs(digital) ? stick : digital;
        if (moveAxis) { r.targetX += moveAxis * dt * .72; r.lastInteraction = now; r.idleNotified = false; }
        r.targetX = Math.max(0.22, Math.min(0.78, r.targetX));
        r.x += (r.targetX - r.x) * Math.min(1, dt * 12);
        r.trail.push({ x: r.x, at: now });
        r.trail = r.trail.filter((p) => now - p.at < 1350);

        const spawnGap = now < 6000 ? 1400 : 1100;
        if (now - r.lastSpawn > spawnGap) {
          const lanes = [0.3, 0.42, 0.58, 0.7];
          const lane = lanes[Math.floor(Math.random() * lanes.length)];
          const roll = Math.random();
          const kind: ItemKind = now < 6000 || roll < .78 ? "photo" : "cart";
          r.items.push({ id: r.nextId++, kind, x: lane, y: 0.08, speed: 0.23 });
          r.lastSpawn = now;
        }

        r.items.forEach((item) => {
          item.y += item.speed * dt;
          if (item.hit || item.y < PLAYER_Y - 0.07 || item.y > PLAYER_Y + 0.09) return;
          const playerHit = Math.abs(item.x - r.x) < (item.kind === "cart" ? 0.115 : 0.08);
          const echoHit = false;
          if (item.kind === "photo" && (playerHit || echoHit)) {
            item.hit = true;
            r.combo += 1;
            r.memories += 1;
            r.score += (echoHit ? 80 : 100) * Math.min(8, r.combo);
            r.stats.caught += 1;
            r.drift = Math.min(1, r.drift + .055); chime(620 + Math.min(r.combo, 8) * 55);
            if (r.stats.caught % 4 === 0) r.effectUntil = now + 750;
            setFeedback(echoHit ? "残影替你接住了遗漏" : r.combo > 2 ? `连续记住 ×${r.combo}` : "照片已装入口袋");
          } else if (item.kind === "cart" && playerHit) {
            item.hit = true;
            r.stats.bumps += 1;
            if (r.memories > 0) r.memories -= 1;
            r.combo = 0; r.shakeUntil = now + 520; r.effectUntil = now + 1150; r.drift = Math.min(1, r.drift + .2);
            setFeedback("碰撞：画面与声音同时断裂"); playImpact();
          }
        });
        r.items.forEach((item) => {
          if (!item.hit && item.kind === "photo" && item.y >= 1.02) {
            item.hit = true; r.stats.missed += 1; r.combo = 0;
            setFeedback("一个片段离开了画面");
          }
        });
        r.items = r.items.filter((item) => !item.hit && item.y < 1.08);
        r.versionFade = Math.max(0, r.versionFade - dt * 3.2);
        if (now - r.lastInteraction > 1100) {
          r.drift = Math.max(0, r.drift - dt * .16);
          r.effectUntil = Math.min(r.effectUntil, now + 120);
          if (!r.idleNotified && r.drift > .04) { r.idleNotified = true; setFeedback("停止触碰：画面正在重新稳定"); }
        }

        if (r.recallStage < 2 && now >= (r.recallStage + 1) * 18000) { r.recallStage += 1; r.paused = true; choiceIndexRef.current = 1; setChoiceIndex(1); setChoice(true); }
        setSeconds((old) => { const value = Math.max(0, Math.ceil((52000 - now) / 1000)); return old === value ? old : value; });

        if (now - r.startedAt >= 52000) finishRun();

        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ score: r.score, combo: r.combo, checks: r.checks, memories: r.memories, drift: r.drift, version: r.version });
        }
      }

      const shake = !quietRef.current && now < r.shakeUntil ? Math.sin(now * .03) * 7 * ((r.shakeUntil - now) / 280) : 0;
      ctx.save();
      ctx.translate(shake, 0);
      drawMemoryBackground(ctx, assets, r.version);
      if (r.versionFade > 0) drawMemoryBackground(ctx, assets, r.previousVersion, r.versionFade);
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
          if (item.kind === "photo" && (item.id % 3 === 0 || r.drift > .65)) ctx.filter = `grayscale(${Math.min(1, r.drift * 1.6)})`;
          const scale = 0.46 + item.y * 0.72;
          if (item.kind === "photo") drawContained(ctx, assets.photo, item.x * W, item.y * H, 148 * scale, 164 * scale);
          if (item.kind === "cart") drawContained(ctx, assets.cart, item.x * W, item.y * H, 250 * scale, 275 * scale);
          ctx.restore();
        });
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
  }, [finishRun, chime, playImpact, advanceIntro, record, choice, chooseRecall, wake, intro, restartObservation]);

  const saveCard = useCallback(() => {
    if (!record) return;
    const card = document.createElement("canvas"); card.width = 1080; card.height = 1440;
    const c = card.getContext("2d")!; const g = c.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, "#5ee0ff"); g.addColorStop(.48, "#fff0a8"); g.addColorStop(1, "#ff8c67"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
    c.fillStyle = "rgba(255,255,255,.84)"; c.roundRect(75, 80, 930, 1280, 52); c.fill(); c.fillStyle = "#173755";
    c.font = "800 34px sans-serif"; c.fillText(`RECONSTRUCTION RECORD · RUN ${String(record.run).padStart(2,"0")}`, 130, 160);
    c.font = "900 76px sans-serif"; c.fillText(tr("忘了自己是什么", "WHAT WAS I AGAIN?"), 130, 280); c.font = "700 38px sans-serif"; c.fillStyle = "#ef704f"; c.fillText(tr("同一段记忆，此刻的版本", "ONE MEMORY · ITS CURRENT VERSION"), 130, 360);
    c.fillStyle = "#173755"; c.font = "800 42px sans-serif";
    [[tr("最初画面","FIRST IMAGE"),4],[tr("第一次回想","FIRST RECALL"),record.recalls?.[0] ?? "—"],[tr("第二次回想","SECOND RECALL"),record.recalls?.[1] ?? "—"],[tr("第三次回想","THIRD RECALL"),record.recalls?.[2] ?? "—"],[tr("保留片段","RETAINED"),record.caught],[tr("受到干扰","INTERRUPTIONS"),record.bumps]].forEach(([label,value],i)=>c.fillText(`${label}  ${value}`,130,500+i*105));
    c.font = "800 38px sans-serif"; c.fillText(`CURRENT VERSION  ${record.version}`,130,1190); c.font = "600 28px sans-serif"; c.fillText(tr("保存图像与记住经历，是两件不同的事。", "STORING AN IMAGE IS NOT THE SAME AS REMEMBERING."),130,1270);
    const a = document.createElement("a"); a.download = `memory-journey-${record.run}.png`; a.href = card.toDataURL("image/png"); a.click();
  }, [record, tr]);

  const shareCard = useCallback(async () => {
    if (!record) return;
    const text = language === "zh" ? `最初画面：4 人｜我的回想：${(record.recalls ?? []).join(" → ")}｜保存图像与记住经历，是两件不同的事。` : `FIRST IMAGE: 4 PEOPLE | MY RECALLS: ${(record.recalls ?? []).join(" → ")} | STORING AN IMAGE IS NOT THE SAME AS REMEMBERING.`;
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

  return (
    <main className="rush-page">
      <section className="rush-game" data-lang={language} aria-label={tr("记忆与遗忘竖屏游戏", "Vertical game about memory and forgetting")}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label={tr("滑动控制旅行者收集记忆照片", "Slide to guide the traveler and collect memory photos")}
          onPointerDown={(event) => { if (!awakeRef.current) { wake(); return; } if (bootingRef.current) return; pointerDown.current = true; event.currentTarget.setPointerCapture(event.pointerId); movePointer(event.clientX); }}
          onPointerMove={(event) => { if (pointerDown.current) movePointer(event.clientX); }}
          onPointerUp={() => { pointerDown.current = false; }}
          onPointerCancel={() => { pointerDown.current = false; }}
        />

        {awake && !booting && <header className="rush-hud">
          <div><span>{tr("叠加层", "LAYERS")}</span><strong>{hud.memories}</strong></div>
          <div className="rush-title"><span>MEMORY METABOLISM</span><strong>VERSION {hud.version}</strong></div>
          <div><span>{tr("重复确认", "RECHECKS")}</span><strong>{String(hud.checks).padStart(2, "0")}</strong></div>
        </header>}

        {awake && !booting && <div className="rush-settings">
          <span className="device-pill">{lastDevice === "gamepad" ? tr("街机", "ARCADE") : lastDevice === "keyboard" ? tr("键盘", "KEYS") : tr("触控", "TOUCH")}</span>
          {started && <button className="pause-quick" onClick={pauseGame} disabled={choice}>{paused ? tr("继续", "RESUME") : tr("暂停", "PAUSE")}</button>}
          <button className="settings-toggle" aria-expanded={settingsOpen} aria-controls="display-controls" onClick={() => setSettingsOpen(!settingsOpen)}>{tr("设置", "SETTINGS")} <span>{settingsOpen ? "×" : "+"}</span></button>
          {settingsOpen && <div className="settings-popover" id="display-controls">
            <button aria-pressed={quiet} onClick={() => { quietRef.current = !quiet; setQuiet(!quiet); }}>{tr("故障强度", "GLITCH")}<strong>{quiet ? tr("柔和", "SOFT") : tr("完整", "FULL")}</strong></button>
            <button aria-pressed={sound} onClick={() => { const next = !soundRef.current; soundRef.current = next; setSound(next); if (next) unlockAudio(); else ambienceRef.current?.pause(); }}>{tr("声音", "SOUND")}<strong>{sound ? tr("开", "ON") : tr("关", "OFF")}</strong></button>
            <button onClick={() => { const next=language === "zh" ? "en" : "zh"; setLanguage(next); localStorage.setItem("memory-rush-language", next); }}>{tr("语言", "LANGUAGE")}<strong>{language === "zh" ? "EN" : "中文"}</strong></button>
          </div>}
        </div>}

        {!awake && <button className="dormant-screen" onClick={wake} aria-label={tr("唤醒装置", "Wake installation")}>
          <span className="dormant-code">MEMORY CHANNEL / 00</span>
          <span className="td-fluid" aria-hidden="true">
            <i /><i /><i /><i />
            {Array.from({ length: 54 }, (_, index) => {
              const t = index / 53;
              const width = 10 + Math.sin(t * Math.PI) * 20;
              const x = 50 + Math.sin(index * 2.19) * width + Math.cos(index * .71) * 4;
              const y = 15 + t * 70 + Math.sin(index * .91) * 4;
              return <b key={index} style={{ "--x": `${x}%`, "--y": `${y}%`, "--delay": `${-(index % 17) * .16}s`, "--size": `${2 + (index % 5) * 1.2}px`, "--tone": index % 4 } as CSSProperties} />;
            })}
          </span>
          <strong>{tr("等待一段记忆靠近", "WAITING FOR A MEMORY")}</strong>
          <small>{tr("靠近 · 触碰 · 按下任意键", "APPROACH · TOUCH · PRESS ANY KEY")}</small>
          <em>{tr("信号未响应", "SIGNAL DORMANT")}</em>
        </button>}
        {awake && booting && <section className="signal-loader" aria-live="polite" aria-label={tr("正在读取观众信号", "Reading visitor signal")}>
          <span className="loader-index">01 / SIGNAL ACQUIRED</span>
          <div className="loader-orbit" aria-hidden="true"><i /><i /><i /></div>
          <strong>{tr("正在读取你的靠近", "READING YOUR APPROACH")}</strong>
          <p>{tr("装置正在把一次触碰转换为记忆入口", "THE INSTALLATION IS TURNING ONE TOUCH INTO A MEMORY ENTRY")}</p>
          <div className="loader-track" aria-hidden="true"><i /></div>
          <small>{tr("约 3 秒", "ABOUT 3 SECONDS")}</small>
        </section>}
        {started && !choice && <aside className="reconstructed-preview"><span>{tr("系统补写的片段", "SYSTEM RECONSTRUCTION")}</span><div className="memory-figures">{Array.from({length: seconds > 34 ? 3 : 5},(_,index)=><img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":.8+(index%2)*.2} as CSSProperties}/>)}</div></aside>}
        {started && <><div className="combo-pill" data-active={hud.checks > 0}>{hud.checks > 0 ? `×${hud.checks} ${tr("重复使它更熟悉", "REPETITION FEELS FAMILIAR")}` : tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</div>
          <div className="rush-journey"><span>{seconds > 42 ? tr("01 / 稳定读取", "01 / STABLE ARCHIVE") : seconds > 32 ? tr("02 / 轻微漂移", "02 / MEMORY DRIFT") : seconds > 20 ? tr("03 / 记忆损坏", "03 / CORRUPTED MEMORY") : seconds > 8 ? tr("04 / 漂移空间", "04 / MEMORY WORLD") : tr("05 / 多版本", "05 / MULTIPLE VERSION")}</span><strong>{tr(`保留 ${hud.memories} 段 · ${seconds}s`, `RETAINED ${hud.memories} · ${seconds}s`)}</strong><progress max={52} value={52-seconds} aria-label={tr("重构进度", "Reconstruction progress")} /></div>
          <div className="run-purpose"><b>{tr("记住最初", "REMEMBER")}</b><span>{tr("左右移动收集照片，避开干扰。稍后再次回想人数。", "MOVE TO COLLECT PHOTOS AND AVOID INTERFERENCE. RECALL THE COUNT LATER.")}</span></div>
          <div className="rush-feedback" data-fault={feedback.includes("串线") || feedback.includes("压缩坏了")} role="status">{shownFeedback}</div>
          <div className="pickup-legend"><span>{tr("照片：留下一个片段", "PHOTO: RETAIN A FRAGMENT")}</span><span>{tr("干扰：短暂打断画面，不结束体验", "INTERFERENCE: BRIEF DISRUPTION, NO GAME OVER")}</span></div></>}

        {awake && !booting && !started && !record && <div className="rush-intro">
          <span>{intro === 0 ? tr("从保存到回想 · 同一段记忆正在被重新写入", "FROM STORAGE TO RECALL · ONE MEMORY IS BEING REWRITTEN") : tr(`观察实验 0${intro} / 02`, `OBSERVATION 0${intro} / 02`)}</span>
          <nav className="experience-route" aria-label={tr("体验流程", "Experience route")}>
            {[tr("靠近", "APPROACH"),tr("观看", "OBSERVE"),tr("回想", "RECALL"),tr("穿行", "JOURNEY"),tr("对照", "COMPARE")].map((label,index) => {
              const active = intro === 0 ? 0 : intro === 1 ? 1 : 2;
              return <i key={label} data-active={index <= active}><b>0{index + 1}</b>{label}</i>;
            })}
          </nav>
          <h1>{intro === 0 ? tr("记忆代谢", "MEMORY METABOLISM") : intro === 1 ? tr("先看一眼这段记忆", "LOOK AT THIS MEMORY") : tr("你刚才看见了几个人？", "HOW MANY PEOPLE DID YOU SEE?")}</h1>
          {intro === 1 && <div className="intro-photo intro-photo-1"><img src={resolveImageUrl(backgroundAUrl)} alt={tr("通往夏日乐园的旧照片", "Old photograph of a road to the summer park")} /><div className="memory-figures" aria-label={tr("照片里有四个人", "Four people are visible in the photograph")}>{[.82,1,.7,.9].map((scale,index) => <img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":scale} as CSSProperties} />)}</div><i /></div>}
          {intro === 2 && <div className="recall-choice" role="group" aria-label={tr("选择记得的人数", "Choose the number you remember")}>
            {[3,4,5].map(value => <button key={value} data-selected={recallAnswer === value} onClick={() => { setRecallAnswer(value); chime(560 + value * 70, .09); }}><strong>{value}</strong><span>{tr("个人", "PEOPLE")}</span></button>)}
          </div>}
          <p>{intro === 0 ? tr("人害怕遗忘，于是不断保存、搜索、回看。但每一次确认，也可能把回忆改写成更熟悉的版本。", "WE FEAR FORGETTING, SO WE SAVE, SEARCH, AND REPLAY. YET EACH ACT OF VERIFICATION MAY REWRITE A MEMORY INTO A MORE FAMILIAR VERSION.") : intro === 1 ? tr("请看几秒。不要寻找答案，只记住你自然注意到的部分。", "Look for a few seconds. Do not hunt for an answer; simply notice what stays with you.") : tr("记住你的判断。接下来左右移动收集照片、避开干扰；同一个问题会再次出现，而世界会从彩色变为黑白，再重构为紫蓝色。", "Keep your answer in mind. Move to collect photos and avoid interference. The same question will return as the world turns from color to black-and-white, then reconstructs itself in violet and blue.")}</p>
          {previous && intro === 0 && <div className="previous-memory"><b>{tr(`上次：VERSION ${previous.version}`, `LAST: VERSION ${previous.version}`)}</b><span>{tr(`保留 ${previous.caught} 个片段 · 本次从原图开始`, `${previous.caught} FRAGMENTS · START AGAIN FROM THE FIRST IMAGE`)}</span></div>}
          <button disabled={!ready} onClick={advanceIntro}>{loadError ? tr("素材加载失败，请刷新页面", "ASSET LOAD FAILED · REFRESH") : !ready ? tr("正在装载记忆…", "LOADING MEMORY…") : intro === 0 ? tr("进入记忆实验", "ENTER THE MEMORY EXPERIMENT") : intro === 1 ? tr("我看过了", "I HAVE SEEN IT") : tr("记下回答，进入旅程", "RECORD ANSWER · BEGIN")}</button>
          {loadError && <button onClick={() => location.reload()}>{tr("重新加载", "RELOAD")}</button>}
          <small>{tr("点击、回车或街机按钮继续", "CLICK · ENTER · OR ARCADE BUTTON")}</small>
          {previous && intro === 0 && <button className="rush-skip" disabled={!ready} onClick={restartObservation}>{tr("直接观察原图", "GO TO THE FIRST IMAGE")}</button>}
        </div>}

        {(choice || paused) && <section className="rush-choice" aria-label={tr("回想停顿", "Recall checkpoint")}>
          <span>{tr("暂时停下 · 回想最初的画面", "PAUSE · RECALL THE FIRST IMAGE")}</span>
          <h2>{choice ? tr("最开始，是几个人？", "HOW MANY PEOPLE WERE THERE AT THE START?") : tr("记忆已暂停", "MEMORY PAUSED")}</h2>
          {choice ? <><p>{tr("回答后继续。这里没有加分或扣分，只记录你的记忆怎样变化。", "Continue after answering. No points are awarded or deducted; only changes in your recall are recorded.")}</p>
          {[3,4,5].map((value,index)=><button key={value} data-selected={choiceIndex === index} onFocus={()=>{choiceIndexRef.current=index;setChoiceIndex(index);}} onClick={()=>chooseRecall(value)}><strong>{value}</strong><span>{tr("个人", "PEOPLE")}</span></button>)}</> : <button onClick={pauseGame}>{tr("继续", "RESUME")}</button>}
        </section>}

        {record && <section className="memory-result" aria-label={tr("记忆重构结语", "Memory reconstruction epilogue")}>
          <div className="result-kicker">ARCHIVE AFTERIMAGE · RUN {String(record.run).padStart(2,"0")} · VERSION {record.version}</div>
          <div className="result-witness" aria-hidden="true"><span /><span /></div>
          <h2>{tr("遗忘，\n也许不是记忆的失败", "FORGETTING MAY NOT BE\nMEMORY'S FAILURE")}</h2>
          <p className="result-thesis">{tr("大脑通过淡化、重组与舍弃过去保护当下；数字系统却让每个版本都能被永久召回。", "The mind protects the present by fading, rebuilding, and releasing the past; digital systems make every version permanently retrievable.")}</p>
          <div className="result-process" aria-label={tr("记忆重构过程", "Memory reconstruction process")}>
            <span><b>01</b>{tr("进入装置", "ENTERED")}</span><i>→</i><span><b>02</b>{tr(`${record.checks ?? 0} 次确认`, `${record.checks ?? 0} RECHECKS`)}</span><i>→</i><span><b>03</b>{tr(`版本 ${record.version}`, `VERSION ${record.version}`)}</span>
          </div>
          <div className="recall-evidence"><div className="intro-photo intro-photo-1"><img src={resolveImageUrl(backgroundAUrl)} alt={tr("最初呈现的场景", "The scene shown at the start")} /><div className="memory-figures">{[.82,1,.7,.9].map((scale,index)=><img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":scale} as CSSProperties}/>)}</div></div><strong>{tr("最初画面：4 人", "FIRST IMAGE: 4 PEOPLE")}</strong><p>{tr("你的三次回想", "YOUR THREE RECALLS")}: {(record.recalls ?? []).join(" → ")}</p><p>{(record.recalls ?? []).some(n=>n!==4) ? tr("你的回答与最初画面出现了差异。熟悉的感觉，是否让你更确信？", "Your answers differed from the first image. Did familiarity make you more certain?") : tr("这一次，你记住了人数。记忆也会保持稳定；这不意味着其他细节从未改变。", "This time you retained the count. Memory can remain stable; other details may still have changed.")}</p></div>
          <blockquote>{tr("当技术替我们保存每一个版本，它是在帮助我们记住，还是让我们逐渐失去遗忘的能力？", "WHEN TECHNOLOGY KEEPS EVERY VERSION FOR US, DOES IT HELP US REMEMBER—OR TEACH US HOW NOT TO FORGET?")}</blockquote>
          <dl className="result-traces">
            <div><dt>{tr("保留", "RETAINED")}</dt><dd>{record.caught}</dd></div><div><dt>{tr("遗漏", "OMITTED")}</dt><dd>{record.missed}</dd></div>
            <div><dt>{tr("回想次数", "RECALLS")}</dt><dd>{record.recalls?.length ?? 0}</dd></div><div><dt>{tr("受到干扰", "INTERRUPTIONS")}</dt><dd>{record.bumps}</dd></div>
          </dl>
          <div className="result-note">{tr("离开装置后，画面会继续存在；但你可以选择，不再把每一次遗忘都当作缺陷。", "THE IMAGE WILL REMAIN AFTER YOU LEAVE. YOU MAY STILL CHOOSE NOT TO TREAT EVERY ACT OF FORGETTING AS A DEFECT.")}</div>
          <p role="status">{shareMessage}</p>
          <div className="result-actions"><button onClick={saveCard}>{tr("保存记忆卡", "SAVE MEMORY CARD")}</button><button onClick={shareCard}>{tr("分享结果", "SHARE RESULT")}</button></div>
          <button className="replay-memory" onClick={restartObservation}>{tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</button>
        </section>}
      </section>
    </main>
  );
}
