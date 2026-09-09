"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import backgroundAUrl from "../game/assets/grid-surreal-memory-a.webp";
import backgroundBUrl from "../game/assets/grid-surreal-memory-b.webp";
import playerUrl from "../game/assets/traveler-run-back.png";
import photoUrl from "../game/assets/grid-memory-photo.webp";
import cartUrl from "../game/assets/grid-memory-cart.webp";
import riftUrl from "../game/assets/grid-memory-rift.webp";
import bubbleUrl from "../game/assets/grid-memory-bubble.webp";
import cassetteUrl from "../game/assets/grid-memory-cassette.webp";
import ticketUrl from "../game/assets/grid-memory-ticket.webp";
import clockUrl from "../game/assets/grid-memory-clock.webp";
import staticUrl from "../game/assets/grid-memory-static.webp";
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
type MemoryRecord = RunStats & { score: number; checks: number; version: "A" | "B"; run: number; source?: MemorySource };
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
  checks: number;
  memories: number;
  version: "A" | "B";
  versionFade: number;
  dashUntil: number;
  shakeUntil: number;
  portalQueued: boolean;
  startedAt: number;
  shield: number;
  bonusTime: number;
  lastInteraction: number;
  idleNotified: boolean;
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
  score: 0, combo: 0, checks: 0, memories: 0, version: "A", versionFade: 0,
  dashUntil: 0, shakeUntil: 0, portalQueued: false, startedAt: 0, shield: 0,
  bonusTime: 0, lastInteraction: 0, idleNotified: false, source,
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

const getMemoryTitle = (record: MemoryRecord, language: "zh" | "en") => {
  if (record.checks >= 8) return language === "zh" ? "反复确认者" : "THE RECHECKER";
  if (record.echoed >= 3) return language === "zh" ? "残影合作者" : "ECHO COLLABORATOR";
  if (record.dashes >= 2) return language === "zh" ? "主动遗忘者" : "VOLUNTARY FORGETTER";
  if (record.missed > record.caught / 2) return language === "zh" ? "遗漏收藏家" : "COLLECTOR OF OMISSIONS";
  return language === "zh" ? "记忆携带者" : "MEMORY CARRIER";
};

const getMemoryBadges = (record: MemoryRecord, language: "zh" | "en") => [
  record.checks >= 5 && (language === "zh" ? "熟悉不等于真实" : "FAMILIAR ≠ TRUE"),
  record.echoed >= 2 && (language === "zh" ? "被过去补回" : "RESTORED BY ECHO"),
  record.missed >= 3 && (language === "zh" ? "为遗漏留位" : "ROOM FOR OMISSION"),
  record.bumps === 0 && (language === "zh" ? "无碰撞读取" : "UNBROKEN READING"),
  record.dashes > 0 && (language === "zh" ? "主动放下一段" : "CHOSE TO RELEASE"),
  record.version === "B" && (language === "zh" ? "接受版本 B" : "ACCEPTED VERSION B"),
].filter(Boolean).slice(0, 3) as string[];

const feedbackEn = (text: string) => {
  if (text.startsWith("连续记住")) return text.replace("连续记住", "MEMORY CHAIN");
  if (text.startsWith("第 ")) return text.replace("次确认：熟悉感正在增加", " CHECKS · FAMILIARITY IS INCREASING").replace("第 ", "");
  if (text.startsWith("进入 VERSION")) return text.replace("进入", "ENTERED").replace("场景记忆已重排", "SCENE MEMORY REORDERED");
  const table: Record<string, string> = {
    "过去的你会帮忙补捡": "YOUR PAST ECHO WILL CATCH MISSED PHOTOS",
    "左右拖动接照片 · 轻点相框泡泡": "MOVE LEFT OR RIGHT · TAP FRAME BUBBLES",
    "你主动丢掉一张记忆，换来短暂加速": "ONE MEMORY RELEASED · TEMPORARY DASH",
    "带上新能力，追回剩下的夏天": "ABILITY EQUIPPED · CHASE THE REST OF SUMMER",
    "记忆能力已生效：它也会改变最后留下的版本": "MEMORY ABILITY ACTIVE · IT WILL ALTER THE VERSION YOU LEAVE WITH",
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
  const [recallAnswer, setRecallAnswer] = useState(4);
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
  const [hud, setHud] = useState({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A" as "A" | "B" });
  const shownFeedback = language === "zh" ? feedback : feedbackEn(feedback);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "忘了自己是什么｜记忆漂移游戏" : "WHAT WAS I AGAIN? | MEMORY DRIFT GAME";
  }, [language]);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadImage(backgroundAUrl), loadImage(backgroundBUrl), loadImage(playerUrl),
      loadImage(photoUrl), loadImage(cartUrl), loadImage(riftUrl), loadImage(bubbleUrl),
      loadImage(cassetteUrl), loadImage(ticketUrl), loadImage(clockUrl), loadImage(staticUrl), loadImage(glitchOverlayUrl),
    ]).then(([backgroundA, backgroundB, player, photo, cart, rift, bubble, cassette, ticket, clock, staticToken, glitchOverlay]) => {
      if (!live) return;
      assetsRef.current = { backgroundA, backgroundB, player, photo, cart, rift, bubble, cassette, ticket, clock, static: staticToken, glitchOverlay };
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
    const fresh = makeRuntime(previous, memorySource);
    fresh.started = true;
    fresh.lastSpawn = 0; fresh.startedAt = 0;
    fresh.items = [{ id: fresh.nextId++, kind: "photo", x: .5, y: .6, speed: .12 }, { id: fresh.nextId++, kind: "bubble", x: .38, y: .3, speed: .12 }];
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A" });
    setRecord(null); setStarted(true); setChoice(false); setPaused(false); setSeconds(52);
    setFeedback("左右拖动接照片 · 轻点相框泡泡");
  }, [previous, memorySource, unlockAudio]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, checks: r.checks, version: r.version, run: (previous?.run ?? 0) + 1, source: r.source };
    try { localStorage.setItem("memory-rush-record", JSON.stringify(next)); } catch { /* optional persistence */ }
    setPrevious(next); setRecord(next); setStarted(false);
    setShareMessage("");
  }, [previous]);

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

  const confirmMemory = useCallback((locked = false) => {
    const r = runtimeRef.current;
    if (!r.started || r.paused) return;
    r.lastInteraction = r.clock;
    r.idleNotified = false;
    r.checks += 1;
    if (locked) {
      r.drift = Math.min(1, r.drift + .2);
      r.effectUntil = r.clock + 1450;
      r.shakeUntil = r.clock + 180;
      setFeedback("长按锁定失败：记忆产生新的错位");
      chime(165, .2, true);
    } else {
      r.drift = Math.min(1, r.drift + .075);
      r.effectUntil = r.clock + 520;
      setFeedback(`第 ${r.checks} 次确认：熟悉感正在增加`);
      chime(690 + Math.min(r.checks, 6) * 38, .1);
    }
  }, [chime]);

  const movePointer = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, (clientX - rect.left) / rect.width));
    runtimeRef.current.lastInteraction = runtimeRef.current.clock;
    runtimeRef.current.idleNotified = false;
    if (deviceRef.current !== "touch") { deviceRef.current = "touch"; setLastDevice("touch"); }
  }, []);

  const chooseUpgrade = useCallback((upgrade: "magnet" | "echo" | "shield") => {
    const r = runtimeRef.current; r.upgrade = upgrade;
    if (upgrade === "shield") { r.shield = 3; r.drift = 0; r.combo = 0; }
    r.paused = false; setPaused(false); setChoice(false);
    setFeedback("记忆能力已生效：它也会改变最后留下的版本"); chime(880);
  }, [chime]);

  const advanceIntro = useCallback(() => {
    unlockAudio(); chime(720, .1);
    if (intro < 6) setIntro(intro + 1); else begin();
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
      if (!runtimeRef.current.started && !record) {
        if (["arrowleft","a","j"].includes(key) && intro === 2) { setRecallAnswer(value => Math.max(3, value - 1)); return; }
        if (["arrowright","d","l"].includes(key) && intro === 2) { setRecallAnswer(value => Math.min(5, value + 1)); return; }
        if (["arrowleft","a","j","arrowright","d","l"].includes(key) && intro === 4) {
          const sources: MemorySource[] = ["phone","search","self"];
          setMemorySource(current => sources[(sources.indexOf(current) + (["arrowleft","a","j"].includes(key) ? 2 : 1)) % 3]); return;
        }
        if (key === "enter" || key === " ") { advanceIntro(); return; }
      }
      if (!runtimeRef.current.started) return;
      if (choice) {
        if (["arrowleft","a","j"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 2) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if (["arrowright","d","l"].includes(key)) { choiceIndexRef.current = (choiceIndexRef.current + 1) % 3; setChoiceIndex(choiceIndexRef.current); }
        else if ([" ","enter","z","x"].includes(key)) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]);
        return;
      }
      if (key === "p" || key === "escape") { const r = runtimeRef.current; if (!choice) { r.paused = !r.paused; setPaused(r.paused); } return; }
      if (runtimeRef.current.paused) return;
      if (key === " " || key === "arrowup" || key === "z" || key === "enter") { if (!event.repeat) confirmMemory(false); return; }
      if (key === "x") { if (!event.repeat) confirmMemory(true); return; }
      if (key === "shift") { if (!event.repeat) dash(); return; }
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
  }, [dash, confirmMemory, advanceIntro, record, choice, chooseUpgrade, wake, intro]);

  useEffect(() => {
    const markHardware = () => { if (deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); } };
    const control: HardwareControl = {
      wake: () => { markHardware(); wake(); },
      move: (axis) => { markHardware(); const r=runtimeRef.current; r.targetX=Math.max(.22,Math.min(.78,r.targetX+Math.max(-1,Math.min(1,axis))*.075)); r.lastInteraction=r.clock; r.idleNotified=false; },
      press: (pressure = 0) => { markHardware(); if (!awakeRef.current) wake(); else if (choice) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]); else if (runtimeRef.current.started) confirmMemory(pressure >= .5); else if (!record) advanceIntro(); },
      pause: () => { markHardware(); const r=runtimeRef.current; if (r.started && !choice) { r.paused=!r.paused; setPaused(r.paused); } },
    };
    window.MemoryDriftInput = control;
    const onHardware = (event: Event) => { const detail=(event as CustomEvent<{action:string;value?:number}>).detail; if (!detail) return; if (detail.action==="wake") control.wake(); if (detail.action==="move") control.move(detail.value ?? 0); if (detail.action==="press") control.press(detail.value); if (detail.action==="pause") control.pause(); };
    window.addEventListener("memory-control", onHardware);
    return () => { window.removeEventListener("memory-control", onHardware); delete window.MemoryDriftInput; };
  }, [advanceIntro, choice, chooseUpgrade, confirmMemory, record, wake]);

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
        if (choice && stick && !inputRef.current.gamepadHorizontal) { choiceIndexRef.current = (choiceIndexRef.current + (stick > 0 ? 1 : 2)) % 3; setChoiceIndex(choiceIndexRef.current); chime(680, .07); }
        if (actionPressed && !inputRef.current.gamepadDash) { if (!awakeRef.current) wake(); else if (choice) chooseUpgrade((["magnet","echo","shield"] as const)[choiceIndexRef.current]); else if (r.started) confirmMemory(lockPressed); else if (!record) advanceIntro(); }
        if (startPressed && !inputRef.current.gamepadStart) { if (!awakeRef.current) wake(); else if (choice) { /* keep the choice pause */ } else if (r.started) { r.paused = !r.paused; setPaused(r.paused); } else if (!record) advanceIntro(); }
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
            r.drift = Math.min(1, r.drift + .055 + (r.upgrade === "magnet" ? .035 : 0)); chime(620 + Math.min(r.combo, 8) * 55);
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
        if (now - r.lastInteraction > 1100) {
          r.drift = Math.max(0, r.drift - dt * .16);
          r.effectUntil = Math.min(r.effectUntil, now + 120);
          if (!r.idleNotified && r.drift > .04) { r.idleNotified = true; setFeedback("停止触碰：画面正在重新稳定"); }
        }

        if (now >= 18000 && !r.offered) { r.offered = true; r.paused = true; choiceIndexRef.current = 0; setChoiceIndex(0); setChoice(true); }
        setSeconds((old) => { const value = Math.max(0, Math.ceil((52000 + r.bonusTime - now) / 1000)); return old === value ? old : value; });

        if (now - r.startedAt >= 52000 + r.bonusTime || r.stats.rifts >= 3) finishRun();

        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ score: r.score, combo: r.combo, checks: r.checks, memories: r.memories, drift: r.drift, version: r.version });
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
          if (item.kind === "photo") drawContained(ctx, assets.photo, item.x * W, item.y * H, 148 * scale, 164 * scale);
          if (item.kind === "cart") drawContained(ctx, assets.cart, item.x * W, item.y * H, 250 * scale, 275 * scale);
          if (item.kind === "bubble") {
            ctx.save(); ctx.globalCompositeOperation = "screen";
            drawContained(ctx, assets.bubble, item.x * W, item.y * H, 192 * scale, 192 * scale); ctx.restore();
          }
          if (item.kind === "rift") {
            drawContained(ctx, assets.rift, item.x * W, item.y * H, 205 * scale, 342 * scale);
          }
          if (item.kind === "cassette") drawContained(ctx, assets.cassette, item.x * W, item.y * H, 194 * scale, 164 * scale);
          if (item.kind === "ticket") drawContained(ctx, assets.ticket, item.x * W, item.y * H, 182 * scale, 150 * scale);
          if (item.kind === "clock") drawContained(ctx, assets.clock, item.x * W, item.y * H, 168 * scale, 168 * scale);
          if (item.kind === "static") drawContained(ctx, assets.static, item.x * W, item.y * H, 150 * scale, 188 * scale);
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
  }, [finishRun, chime, dash, confirmMemory, advanceIntro, record, choice, chooseUpgrade, wake]);

  const saveCard = useCallback(() => {
    if (!record) return;
    const card = document.createElement("canvas"); card.width = 1080; card.height = 1440;
    const c = card.getContext("2d")!; const g = c.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, "#5ee0ff"); g.addColorStop(.48, "#fff0a8"); g.addColorStop(1, "#ff8c67"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
    c.fillStyle = "rgba(255,255,255,.84)"; c.roundRect(75, 80, 930, 1280, 52); c.fill(); c.fillStyle = "#173755";
    c.font = "800 34px sans-serif"; c.fillText(`RECONSTRUCTION RECORD · RUN ${String(record.run).padStart(2,"0")}`, 130, 160);
    c.font = "900 76px sans-serif"; c.fillText(tr("忘了自己是什么", "WHAT WAS I AGAIN?"), 130, 280); c.font = "700 38px sans-serif"; c.fillStyle = "#ef704f"; c.fillText(tr("同一段记忆，此刻的版本", "ONE MEMORY · ITS CURRENT VERSION"), 130, 360);
    c.fillStyle = "#173755"; c.font = "800 42px sans-serif";
    [[tr("重复确认","RECHECKS"),record.checks ?? 0],[tr("保留","RETAINED"),record.caught],[tr("由残影补回","ECHO RESTORED"),record.echoed],[tr("遗漏","MISSED"),record.missed],[tr("碰撞","COLLISIONS"),record.bumps],[tr("主动放下","RELEASED"),record.dashes]].forEach(([label,value],i)=>c.fillText(`${label}  ${value}`,130,500+i*105));
    c.font = "800 38px sans-serif"; c.fillText(`CURRENT VERSION  ${record.version}`,130,1190); c.font = "600 28px sans-serif"; c.fillText(tr("原始版本无法验证；下一次读取会继承本次偏差。", "ORIGINAL UNVERIFIABLE · THE NEXT READING INHERITS THIS DRIFT."),130,1270);
    const a = document.createElement("a"); a.download = `memory-journey-${record.run}.png`; a.href = card.toDataURL("image/png"); a.click();
  }, [record, tr]);

  const shareCard = useCallback(async () => {
    if (!record) return;
    const text = language === "zh" ? `同一段记忆，此刻是 Version ${record.version}｜重复确认 ${record.checks ?? 0} 次｜原始版本无法验证` : `ONE MEMORY · CURRENT VERSION ${record.version} | ${record.checks ?? 0} RECHECKS | ORIGINAL UNVERIFIABLE`;
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
          <div><span>{tr("重复确认", "RECHECKS")}</span><strong>{String(hud.checks).padStart(2, "0")}</strong></div>
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
        {started && <><div className="combo-pill" data-active={hud.checks > 0}>{hud.checks > 0 ? `×${hud.checks} ${tr("重复使它更熟悉", "REPETITION FEELS FAMILIAR")}` : tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</div>
          <div className="rush-journey"><span>{seconds > 42 ? tr("01 / 稳定读取", "01 / STABLE ARCHIVE") : seconds > 32 ? tr("02 / 轻微漂移", "02 / MEMORY DRIFT") : seconds > 20 ? tr("03 / 记忆损坏", "03 / CORRUPTED MEMORY") : seconds > 8 ? tr("04 / 漂移空间", "04 / MEMORY WORLD") : tr("05 / 多版本", "05 / MULTIPLE VERSION")}</span><strong>{tr(`记忆分 ${String(hud.score).padStart(5,"0")} · 偏差 ${Math.round(hud.drift*100)}% · ${seconds}s`, `SCORE ${String(hud.score).padStart(5,"0")} · DRIFT ${Math.round(hud.drift*100)}% · ${seconds}s`)}</strong><progress max={52} value={52-seconds} aria-label={tr("重构进度", "Reconstruction progress")} /></div>
          <div className="run-purpose"><b>{tr("本次任务", "YOUR TASK")}</b><span>{tr("留下 6 段记忆；每次确认都会提高熟悉感，也会增加偏差。", "RETAIN 6 FRAGMENTS. EVERY RECHECK ADDS FAMILIARITY — AND DRIFT.")}</span></div>
          <div className="rush-feedback" data-fault={feedback.includes("串线") || feedback.includes("压缩坏了")} role="status">{shownFeedback}</div>
          <div className="pickup-legend" aria-label={tr("奖惩规则", "Reward and penalty rules")}><span>▣ {tr("照片 +分/+层", "PHOTO +SCORE/+LAYER")}</span><span>◯ {tr("泡泡 修复/+护盾", "BUBBLE REPAIR/+SHIELD")}</span><span>▤ {tr("磁带 +连击", "TAPE +CHAIN")}</span><span>⌁ {tr("票根 +2层", "TICKET +2 LAYERS")}</span><span>◷ {tr("时钟 +5秒", "CLOCK +5 SEC")}</span><span className="danger">▥ {tr("碰撞 清连击/+偏差", "HIT RESET CHAIN/+DRIFT")}</span></div></>}

        {awake && !started && !record && <div className="rush-intro">
          <span>{intro === 0 ? tr("从保存到回想 · 同一段记忆正在被重新写入", "FROM STORAGE TO RECALL · ONE MEMORY IS BEING REWRITTEN") : `MEMORY PRELUDE 0${intro} / 06`}</span>
          <nav className="experience-route" aria-label={tr("体验流程", "Experience route")}>
            {[tr("靠近", "APPROACH"),tr("观看", "OBSERVE"),tr("回想", "RECALL"),tr("发现偏差", "NOTICE DRIFT"),tr("介入", "INTERVENE")].map((label,index) => {
              const active = intro === 0 ? 0 : intro === 1 ? 1 : intro === 2 ? 2 : intro <= 5 ? 3 : 4;
              return <i key={label} data-active={index <= active}><b>0{index + 1}</b>{label}</i>;
            })}
          </nav>
          <h1>{intro === 0 ? tr("忘了自己是什么", "WHAT WAS I AGAIN?") : intro === 1 ? tr("先看一眼这段记忆", "LOOK AT THIS MEMORY") : intro === 2 ? tr("你刚才看见了几个人？", "HOW MANY PEOPLE DID YOU SEE?") : intro === 3 ? tr("系统说：与你记得的一致", "THE SYSTEM SAYS: IT MATCHES") : intro === 4 ? tr("你把记忆放在哪里？", "WHERE DO YOU KEEP A MEMORY?") : intro === 5 ? (language === "zh" ? sourceCopy[memorySource].title : memorySource === "phone" ? "EXTENDED MEMORY" : memorySource === "search" ? "THE GOOGLE EFFECT" : "FALSE MEMORY") : tr("学习如何干预记忆", "LEARN TO INTERVENE")}</h1>
          {![2,4,6].includes(intro) && <div className={`intro-photo intro-photo-${intro}`} data-contradiction={intro === 3}><img src={resolveImageUrl(photoUrl)} alt={tr("通往夏日乐园的旧照片", "Old photograph of a road to the summer park")} /><i /></div>}
          {intro === 2 && <div className="recall-choice" role="group" aria-label={tr("选择记得的人数", "Choose the number you remember")}>
            {[3,4,5].map(value => <button key={value} data-selected={recallAnswer === value} onClick={() => { setRecallAnswer(value); chime(560 + value * 70, .09); }}><strong>{value}</strong><span>{tr("个人", "PEOPLE")}</span></button>)}
          </div>}
          {intro === 4 && <div className="memory-source-grid" role="group" aria-label={tr("选择本局记忆来源", "Choose this run's memory source")}>
            {(Object.keys(sourceCopy) as MemorySource[]).map((source) => <button key={source} data-selected={memorySource === source} onClick={() => { unlockAudio(); setMemorySource(source); chime(source === "phone" ? 620 : source === "search" ? 780 : 940, .12); }}><strong>{language === "zh" ? sourceCopy[source].label : source === "phone" ? "PHONE" : source === "search" ? "SEARCH" : "MYSELF"}</strong><span>{language === "zh" ? sourceCopy[source].title : source === "phone" ? "Extended Memory" : source === "search" ? "Google Effect" : "False Memory"}</span></button>)}
          </div>}
          {intro === 6 && <div className="calibration-strip"><span>↔<b>{tr("移动", "MOVE")}</b></span><span>●<b>{tr("短按确认", "TAP VERIFY")}</b></span><span>◉<b>{tr("长按锁定", "HOLD LOCK")}</b></span></div>}
          <p>{intro === 0 ? tr("你越确认一段记忆，它就越真实吗？靠近并交出一次判断，装置会把你的观看变成下一版记忆。", "DOES A MEMORY BECOME TRUER THE MORE YOU VERIFY IT? OFFER ONE JUDGMENT; THE MACHINE WILL TURN YOUR VIEWING INTO ITS NEXT VERSION.") : intro === 1 ? tr("请看几秒。不要寻找答案，只记住你自然注意到的部分。", "Look for a few seconds. Do not hunt for an answer; simply notice what stays with you.") : intro === 2 ? tr("没有标准答案。你的选择会成为系统随后解释这张照片的依据。", "There is no correct answer. Your choice will become the system's basis for interpreting the image.") : intro === 3 ? tr(`你回答了 ${recallAnswer}。照片再次出现时，局部已经被替换，但系统仍把熟悉感称为“准确”。`, `YOU ANSWERED ${recallAnswer}. Parts were replaced when the photo returned, yet the system still calls familiarity “accuracy”.`) : intro === 4 ? tr("选择的不是难度，而是这次偏差从哪里开始。左右移动可以选择，确认键继续。", "You are not choosing difficulty, but where the drift begins. Move left or right to choose, then verify.") : intro === 5 ? tr(sourceCopy[memorySource].text + " 第一次读取看起来完整，但它已经是被观看过的版本。", memorySource === "phone" ? "Your phone kept the time and place, but not how the moment felt. The first reading is already a viewed version." : memorySource === "search" ? "You remember where the answer can be found. The first reading already privileges access over recall." : "Every recollection edits the memory. Certainty is not the same as truth.") : tr("目标：留下 6 段记忆。移动决定保留什么；短按会增加熟悉感和偏差；长按试图锁定，却制造更强错位。停止触碰，画面才会暂时稳定。", "GOAL: RETAIN 6 FRAGMENTS. MOVE TO CHOOSE WHAT STAYS; TAP TO ADD FAMILIARITY AND DRIFT; HOLD TO LOCK, CREATING STRONGER MISALIGNMENT. RELEASE TO LET THE IMAGE SETTLE.")}</p>
          {previous && intro === 0 && <div className="previous-memory"><b>{tr(`上次：VERSION ${previous.version}`, `LAST: VERSION ${previous.version}`)}</b><span>{tr(`读取 ${previous.caught} 次 · 原始版本未知`, `${previous.caught} READINGS · ORIGINAL UNKNOWN`)}</span></div>}
          <button disabled={!ready} onClick={advanceIntro}>{loadError ? tr("素材加载失败，请刷新页面", "ASSET LOAD FAILED · REFRESH") : !ready ? tr("正在装载记忆…", "LOADING MEMORY…") : intro === 0 ? tr("把这段记忆交给装置", "GIVE THIS MEMORY TO THE MACHINE") : intro === 1 ? tr("我看过了", "I HAVE SEEN IT") : intro === 2 ? tr("提交我的回想", "SUBMIT MY RECALL") : intro === 3 ? tr("继续查看偏差", "CONTINUE INTO THE DRIFT") : intro === 4 ? tr("确认记忆入口", "CONFIRM MEMORY INPUT") : intro === 5 ? tr("进行第一次读取", "BEGIN THE FIRST READING") : tr("进入这段记忆", "ENTER THIS MEMORY")}</button>
          {loadError && <button onClick={() => location.reload()}>{tr("重新加载", "RELOAD")}</button>}
          <small>{intro === 6 ? (lastDevice === "gamepad" ? tr("摇杆移动 · A 短按确认 · B 长按锁定 · START 暂停", "STICK MOVE · A VERIFY · B LOCK · START PAUSE") : lastDevice === "keyboard" ? tr("方向键 / A D / J L 移动 · Z 确认 · X 锁定 · SHIFT 遗忘冲刺", "ARROWS / A D / J L MOVE · Z VERIFY · X LOCK · SHIFT FORGET DASH") : tr("拖动移动 · 点泡泡 · 短按确认 · 长按锁定", "DRAG TO MOVE · TAP BUBBLES · TAP VERIFY · HOLD TO LOCK")) : tr("点击、回车或街机按钮继续", "CLICK · ENTER · OR ARCADE BUTTON")}</small>
          {previous && <button className="rush-skip" disabled={!ready} onClick={begin}>{tr("跳过故事，直接出发", "SKIP STORY · START RUN")}</button>}
        </div>}

        {(choice || paused) && <section className="rush-choice" aria-label={choice ? tr("选择记忆能力", "Choose a memory ability") : tr("游戏已暂停", "Game paused")}>
          <span>{choice ? tr("记忆能力升级 · 三选一", "MEMORY ABILITY UPGRADE · CHOOSE ONE") : tr("记忆已暂停", "MEMORY PAUSED")}</span><h2>{choice ? tr("你希望系统怎样帮你记住？", "HOW SHOULD THE SYSTEM HELP YOU REMEMBER?") : tr("等你回来再继续", "RETURN WHEN READY")}</h2>
          {choice ? <><p>{tr("能力会让接下来的游戏更爽，也会成为这段记忆被改写的原因。", "The ability makes the next passage more playful—and becomes a reason this memory is rewritten.")}</p>
            <button data-selected={choiceIndex === 0} onFocus={() => { choiceIndexRef.current=0; setChoiceIndex(0); }} onClick={() => chooseUpgrade("magnet")}><strong>{tr("吸附归档", "MAGNETIC ARCHIVE")}</strong><span>{tr("更容易接住照片；每次收集额外增加偏差", "Catch items more easily; every pickup adds extra drift")}</span></button>
            <button data-selected={choiceIndex === 1} onFocus={() => { choiceIndexRef.current=1; setChoiceIndex(1); }} onClick={() => chooseUpgrade("echo")}><strong>{tr("残影补写", "ECHO RECONSTRUCTION")}</strong><span>{tr("残影范围扩大；代接照片得到较少分数", "Echo range expands; echo pickups score less")}</span></button>
            <button data-selected={choiceIndex === 2} onFocus={() => { choiceIndexRef.current=2; setChoiceIndex(2); }} onClick={() => chooseUpgrade("shield")}><strong>{tr("色彩隔离", "COLOR ISOLATION")}</strong><span>{tr("清除偏差并抵挡三次噪点；当前连击归零", "Clear drift and block three noise events; reset the chain")}</span></button></> : <button onClick={pauseGame}>{tr("继续读取", "RESUME READING")}</button>}
        </section>}

        {started && <button className="forget-dash" onPointerDown={(event) => { event.currentTarget.dataset.held = String(performance.now()); }} onPointerUp={(event) => { const began=Number(event.currentTarget.dataset.held || performance.now()); confirmMemory(performance.now()-began >= 500); delete event.currentTarget.dataset.held; }}>
          <span>{tr("短按确认 · 长按锁定", "TAP VERIFY · HOLD TO LOCK")}</span><strong>{tr("查看", "RECHECK")}</strong>
        </button>}

        {record && <section className="memory-result" aria-label={tr("本局记忆旅程卡", "Memory journey result card")}>
          <div className="result-kicker">RECONSTRUCTION RECORD · RUN {String(record.run).padStart(2,"0")}</div>
          <h2>{tr("重构后的记忆", "RECONSTRUCTED MEMORY")}</h2>
          <p>{tr("你没有恢复它。读取、遗漏、碰撞与折返共同生成了当前版本。", "You did not restore it. Reading, missing, colliding and returning produced the current version together.")}</p>
          <div className="result-score"><span>{tr("记忆分数 · 衡量介入，不衡量真实", "MEMORY SCORE · MEASURES INTERVENTION, NOT TRUTH")}</span><strong>{String(record.score).padStart(5,"0")}</strong><i>VERSION {record.version}</i></div>
          <div className="result-identity"><span>{tr("系统为你生成的临时身份", "A TEMPORARY IDENTITY GENERATED BY THE SYSTEM")}</span><strong>{getMemoryTitle(record, language)}</strong><small>{tr("下一次读取后，它可能改变。", "IT MAY CHANGE AFTER THE NEXT READING.")}</small></div>
          <div className="result-badges" aria-label={tr("本次记忆章", "Memory badges from this reading")}>
            {getMemoryBadges(record, language).map((badge, index) => <span key={badge}><i>{String(index + 1).padStart(2,"0")}</i>{badge}</span>)}
          </div>
          <dl>
            <div><dt>{tr("记住", "CAUGHT")}</dt><dd>{record.caught}</dd></div><div><dt>{tr("残影补捡", "ECHO CATCH")}</dt><dd>{record.echoed}</dd></div>
            <div><dt>{tr("遗漏", "MISSED")}</dt><dd>{record.missed}</dd></div><div><dt>{tr("碰撞", "COLLISIONS")}</dt><dd>{record.bumps}</dd></div>
            <div><dt>{tr("主动遗忘", "RELEASED")}</dt><dd>{record.dashes}</dd></div><div><dt>{tr("重复确认", "RECHECKS")}</dt><dd>{record.checks ?? 0}</dd></div>
          </dl>
          <div className="result-note">{language === "zh" ? <>记忆入口：{sourceCopy[record.source ?? "phone"].label} · 当前版本：{record.version} · 原始版本：无法验证</> : <>MEMORY INPUT: {(record.source ?? "phone").toUpperCase()} · CURRENT VERSION: {record.version} · ORIGINAL: UNVERIFIABLE</>}<br />
            {tr(`本次留下：确认 ${record.checks ?? 0} 次，保留 ${record.caught} 段，遗漏 ${record.missed} 段，发生 ${record.bumps} 次碰撞。`, `THIS READING LEFT ${record.checks ?? 0} RECHECKS, ${record.caught} RETAINED FRAGMENTS, ${record.missed} OMISSIONS AND ${record.bumps} COLLISIONS.`)}<br />
            {tr("再次进入时，这些痕迹会成为下一次重构的条件。", "On re-entry, these traces become conditions for the next reconstruction.")}</div>
          <p role="status">{shareMessage}</p>
          <div className="result-actions"><button onClick={saveCard}>{tr("保存记忆卡", "SAVE MEMORY CARD")}</button><button onClick={shareCard}>{tr("分享结果", "SHARE RESULT")}</button></div>
          <button className="replay-memory" onClick={begin}>{tr("再次查看同一段记忆", "RECHECK THE SAME MEMORY")}</button>
        </section>}
      </section>
    </main>
  );
}

