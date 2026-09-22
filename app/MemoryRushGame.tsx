"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import DormantVisual from "./DormantVisual";
import { addMemoryGesture, drawMemoryGestures, GESTURE_DURATION, type MemoryGesture } from "./memory-feedback";
import { drawPhotoFault, photoFaultStrength } from "./photo-fault";
import { COUNT_OPTIONS, moveCount, moveChoiceIndex, recallLabel, comparisonState } from "./memory-recall";
import { MemoryAudio, type MemoryCue } from "./memory-audio";
import backgroundAUrl from "../game/assets/grid-surreal-memory-a.webp";
import backgroundBUrl from "../game/assets/grid-surreal-memory-b.webp";
import playerUrl from "../game/assets/traveler-run-back.png";
import photoUrl from "../game/assets/grid-memory-photo.webp";
import cartUrl from "../game/assets/grid-memory-cart.webp";
import bubbleUrl from "../game/assets/grid-memory-bubble.webp";
import glitchOverlayUrl from "../game/assets/memory-glitch-overlay.webp";

const W = 1080;
const H = 1920;
// Keep the traveler inside the unobstructed play corridor above the bottom HUD dock.
const PLAYER_Y = 0.65;
const RUN_DURATION_MS = 24000;
const RECALL_AT_MS = [6500, 15000] as const;
const SAVE_SLOT_COUNT = 5;
const HOLD_TO_PROTECT_MS = 700;
const PROTECTION_MS = 4200;

type MemoryVersion = "A" | "B" | "C";
type ItemKind = "photo" | "cart" | "bubble";
type DeviceKind = "touch" | "keyboard" | "gamepad";
type CheckpointPhase = "count" | "detail";
type SharedMemoryEvent = "people" | "sky";
const GAME_SPEEDS = [0.8, 1, 1.25] as const;
type GameSpeed = (typeof GAME_SPEEDS)[number];
type HardwareControl = { wake: () => void; move: (axis: number) => void; press: (pressure?: number) => void; release?: () => void; pause: () => void };
declare global { interface Window { MemoryDriftInput?: HardwareControl } }
type Item = { id: number; kind: ItemKind; x: number; y: number; speed: number; size: number; hit?: boolean };
type Trail = { x: number; at: number };
type RunStats = { caught: number; missed: number; bumps: number };
type MemoryRecord = RunStats & { score: number; checks: number; version: MemoryVersion; run: number; recalls?: number[]; details?: string[]; retained?: number; overwritten?: number; protections?: number; sharedMemories?: SharedMemoryEvent[] };
type Runtime = {
  clock: number;
  paused: boolean;
  drift: number;
  effectUntil: number;
  impactUntil: number;
  recallStage: number;
  recalls: number[];
  details: string[];
  sharedMemories: SharedMemoryEvent[];
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
  shield: number;
  overwritten: number;
  protections: number;
  holdActive: boolean;
  holdStartedAt: number;
  holdTriggered: boolean;
  protectUntil: number;
  startedAt: number;
  lastInteraction: number;
  idleNotified: boolean;
  stats: RunStats;
  trail: Trail[];
  gestures: MemoryGesture[];
};

const emptyStats = (): RunStats => ({ caught: 0, missed: 0, bumps: 0 });
const makeRuntime = (): Runtime => ({
  clock: 0, paused: false, drift: 0, effectUntil: 0, impactUntil: 0, recallStage: 0, recalls: [], details: [], sharedMemories: [],
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, checks: 0, memories: 0, version: "A", previousVersion: "A", versionFade: 0,
  shakeUntil: 0, shield: 0, overwritten: 0, protections: 0, holdActive: false, holdStartedAt: 0, holdTriggered: false, protectUntil: 0,
  startedAt: 0, lastInteraction: 0, idleNotified: false,
  stats: emptyStats(),
  trail: [], gestures: [],
});

const feedbackEn = (text: string) => {
  if (text.startsWith("连续接住")) return text.replace("连续接住", "Caught in a row");
  const table: Record<string, string> = {
    "左右移动，接住照片。": "Move left and right to catch photos.",
    "存满了，最早的一张被换掉了。": "Full. The oldest photo was replaced.",
    "护好了，能挡住一次干扰。": "Protected. You can block one hit.",
    "再按久一点。": "Hold a little longer.",
    "先接一张照片。": "Catch a photo first.",
    "挡住泡泡了，照片没变。": "Bubble blocked. Your photos are unchanged.",
    "挡住了，照片还在。": "Hit blocked. You kept your photos.",
    "碰到泡泡，混进了一段假记忆。": "You hit a bubble. A false memory was added.",
    "人数记下了，再选一个细节。": "Answer saved. One more detail.",
    "记下了，继续接照片。": "Answer saved. Keep catching photos.",
    "漏掉了一张。": "Missed a photo.",
    "接住一张照片。": "Caught a photo.",
    "撞到了，少了一张照片。": "You hit an obstacle and lost a photo.",
    "撞到了，画面晃了一下。": "You hit an obstacle.",
    "停一会儿，画面会慢慢恢复。": "Stay still for a moment. The picture will settle.",
  };
  return table[text] ?? text;
};

const checkpointOptions = (phase: CheckpointPhase, stage: number): Array<number | string> => {
  if (phase === "count") return [...COUNT_OPTIONS];
  return stage === 1 ? ["left", "center", "right", "unknown"] : ["blue", "white", "pink", "unknown"];
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
    ctx.filter = "grayscale(.78) contrast(1.22) brightness(.82)";
    ctx.drawImage(assets.backgroundB, 0, 0, W, H);
    ctx.filter = "none";
    const wash = ctx.createLinearGradient(0, 0, W, H);
    wash.addColorStop(0, "#43218f");
    wash.addColorStop(.5, "#1759b8");
    wash.addColorStop(1, "#742778");
    ctx.fillStyle = wash;
    ctx.globalAlpha = .82 * alpha;
    ctx.globalCompositeOperation = "color";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .16 * alpha;
    ctx.globalCompositeOperation = "screen";
    const light = ctx.createLinearGradient(W, 0, 0, H);
    light.addColorStop(0, "#6d8cff");
    light.addColorStop(.55, "#4d2ea8");
    light.addColorStop(1, "#cf4fc5");
    ctx.fillStyle = light;
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
  const memoryVisualTime = useRef(5);
  const [intro, setIntro] = useState(0);
  const [recallAnswer, setRecallAnswer] = useState(-1);
  // Each launch starts in English; the language switch applies to this visit.
  const [language, setLanguage] = useState<"zh" | "en">("en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);
  const answerLabel = useCallback((value: number | string | undefined) => recallLabel(value, language), [language]);
  const [lastDevice, setLastDevice] = useState<DeviceKind>("touch");
  const deviceRef = useRef<DeviceKind>("touch");
  const [choice, setChoice] = useState(false);
  const [choicePhase, setChoicePhase] = useState<CheckpointPhase>("count");
  const [choiceStage, setChoiceStage] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(-1);
  const choiceIndexRef = useRef(-1);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(RUN_DURATION_MS / 1000);
  const [gameSpeed, setGameSpeed] = useState<GameSpeed>(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(window.localStorage.getItem("memory-rush-speed"));
    return GAME_SPEEDS.includes(saved as GameSpeed) ? saved as GameSpeed : 1;
  });
  const gameSpeedRef = useRef<GameSpeed>(gameSpeed);
  const [quiet, setQuiet] = useState(false);
  const quietRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const audioRef = useRef<MemoryAudio | null>(null);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(true);
  const unlockAudio = useCallback(() => {
    if (!soundRef.current) return;
    try {
      if (!audioRef.current) audioRef.current = new MemoryAudio(new AudioContext(), document.baseURI);
      audioRef.current.setActive(!document.hidden && awakeRef.current);
      audioRef.current.unlock();
    } catch { /* Audio support is optional; the installation remains playable. */ }
  }, []);
  const playCue = useCallback((cue: MemoryCue) => {
    if (!soundRef.current) return;
    audioRef.current?.play(cue);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime());
  const assetsRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const pointerDown = useRef(false);
  const inputRef = useRef({ left: false, right: false, gamepadDash: false, gamepadStart: false, gamepadHorizontal: 0 });
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [record, setRecord] = useState<MemoryRecord | null>(null);
  const recordRef = useRef<MemoryRecord | null>(null);
  const resultShownAtRef = useRef(0);
  const [previous, setPrevious] = useState<MemoryRecord | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem("memory-rush-record");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [feedback, setFeedback] = useState("左右移动，接住照片。");
  const [memoryEvent, setMemoryEvent] = useState<SharedMemoryEvent | null>(null);
  const memoryEventRef = useRef<SharedMemoryEvent | null>(null);
  const [impactPulse, setImpactPulse] = useState<"a" | "b" | null>(null);
  const [versionPulse, setVersionPulse] = useState<MemoryVersion | null>(null);
  const [versionCause, setVersionCause] = useState<{ recall: number; detail: string }>({ recall: 4, detail: "" });
  const versionTimerRef = useRef(0);
  const transitionRef = useRef(false);
  const idleActivityRef = useRef<() => void>(() => {});
  const [hud, setHud] = useState({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A" as MemoryVersion, overwritten: 0, protections: 0, hold: 0, protected: false });
  const shownFeedback = language === "zh" ? feedback : feedbackEn(feedback);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "忘了自己是什么｜交互实验" : "What Was I Again?";
  }, [language]);

  useEffect(() => {
    const onVisibility = () => audioRef.current?.setActive(!document.hidden && awakeRef.current);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      audioRef.current?.dispose(); audioRef.current = null;
      window.clearTimeout(bootTimerRef.current); window.clearTimeout(versionTimerRef.current);
    };
  }, []);

  useEffect(() => { audioRef.current?.setScene(hud.version, paused); }, [hud.version, paused, awake, sound]);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadImage(backgroundAUrl), loadImage(backgroundBUrl), loadImage(playerUrl),
      loadImage(photoUrl), loadImage(cartUrl), loadImage(bubbleUrl), loadImage(glitchOverlayUrl),
    ]).then(([backgroundA, backgroundB, player, photo, cart, bubble, glitchOverlay]) => {
      if (!live) return;
      assetsRef.current = { backgroundA, backgroundB, player, photo, cart, bubble, glitchOverlay };
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
    if (!COUNT_OPTIONS.some(value => value === recallAnswer)) return;
    transitionRef.current = false;
    unlockAudio();
    const fresh = makeRuntime();
    fresh.recalls = [recallAnswer];
    fresh.started = true;
    fresh.lastSpawn = 0; fresh.startedAt = 0;
    fresh.items = [{ id: fresh.nextId++, kind: "photo", x: .5, y: .6, speed: .12, size: 1.28 }, { id: fresh.nextId++, kind: "bubble", x: .38, y: .3, speed: .12, size: 1 }];
    runtimeRef.current = fresh;
    memoryEventRef.current = null; setMemoryEvent(null);
    recordRef.current = null;
    resultShownAtRef.current = 0;
    setHud({ score: 0, combo: 0, checks: 0, memories: 0, drift: 0, version: "A", overwritten: 0, protections: 0, hold: 0, protected: false });
    window.clearTimeout(versionTimerRef.current);
    setRecord(null); setStarted(true); setChoice(false); setChoicePhase("count"); setChoiceStage(0); setPaused(false); setVersionPulse(null); setVersionCause({ recall: recallAnswer, detail: "" }); setSeconds(RUN_DURATION_MS / 1000);
    setFeedback("左右移动，接住照片。");
  }, [recallAnswer, unlockAudio]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, checks: r.checks, version: r.version, run: (previous?.run ?? 0) + 1, recalls: [...r.recalls], details: [...r.details], retained: r.memories, overwritten: r.overwritten, protections: r.protections, sharedMemories: [...r.sharedMemories] };
    try { localStorage.setItem("memory-rush-record", JSON.stringify(next)); } catch { /* optional persistence */ }
    recordRef.current = next;
    resultShownAtRef.current = performance.now();
    setPrevious(next); setRecord(next); setStarted(false);
    setShareMessage("");
    playCue("finish");
  }, [previous, playCue]);

  const movePointer = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || runtimeRef.current.paused) return;
    runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, (clientX - rect.left) / rect.width));
    runtimeRef.current.lastInteraction = runtimeRef.current.clock;
    runtimeRef.current.idleNotified = false;
    if (deviceRef.current !== "touch") { deviceRef.current = "touch"; setLastDevice("touch"); }
  }, []);

  const beginProtectHold = useCallback((pressure = 0) => {
    const r = runtimeRef.current;
    if (!r.started || r.paused || r.holdActive) return;
    if (r.memories < 1) {
      setFeedback("先接一张照片。");
      playCue("warning");
      return;
    }
    r.holdActive = true;
    r.holdTriggered = false;
    r.holdStartedAt = r.clock - (pressure >= .72 ? HOLD_TO_PROTECT_MS : 0);
    r.lastInteraction = r.clock;
  }, [playCue]);

  const endProtectHold = useCallback(() => {
    const r = runtimeRef.current;
    if (r.holdActive && !r.holdTriggered && r.clock - r.holdStartedAt < HOLD_TO_PROTECT_MS) {
      setFeedback("再按久一点。");
      playCue("warning");
    }
    r.holdActive = false;
    r.holdTriggered = false;
  }, [playCue]);

  const engageProtection = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || r.paused || r.holdTriggered || r.memories < 1) return;
    r.holdTriggered = true;
    r.holdActive = false;
    r.shield = 1;
    r.protections += 1;
    r.protectUntil = r.clock + PROTECTION_MS;
    addMemoryGesture(r.gestures, { kind: "protect", x: r.x * W, y: PLAYER_Y * H, at: r.clock, seed: r.protections });
    r.effectUntil = r.clock + 560;
    setFeedback("护好了，能挡住一次干扰。");
    playCue("protect");
  }, [playCue]);

  const chooseCheckpointOption = useCallback((answer: number | string | undefined) => {
    const r = runtimeRef.current;
    if (!r.started || !r.paused || transitionRef.current || answer === undefined) return;
    if (!checkpointOptions(choicePhase, r.recallStage).includes(answer)) return;
    if (choicePhase === "count") {
      if (typeof answer !== "number" || r.recalls.length !== r.recallStage) return;
      r.recalls.push(answer);
      choiceIndexRef.current = -1;
      setChoiceIndex(-1);
      setChoicePhase("detail");
      setFeedback("人数记下了，再选一个细节。");
      playCue("confirm");
      return;
    }
    if (typeof answer !== "string") return;
    r.details.push(answer);
    r.checks += 1;
    r.previousVersion = r.version;
    const nextVersion: MemoryVersion = r.recallStage === 1 ? "B" : "C";
    r.version = nextVersion;
    r.versionFade = 1;
    r.drift = Math.min(1, r.drift + .15);
    r.effectUntil = r.clock + 1650;
    transitionRef.current = true;
    r.paused = true; r.holdActive = false;
    inputRef.current.left = false; inputRef.current.right = false;
    setPaused(false); setChoice(false); setChoicePhase("count");
    setVersionCause({ recall: r.recalls[r.recalls.length - 1] ?? recallAnswer, detail: answer });
    setVersionPulse(nextVersion);
    window.clearTimeout(versionTimerRef.current);
    versionTimerRef.current = window.setTimeout(() => {
      transitionRef.current = false;
      setVersionPulse(null);
      if (runtimeRef.current !== r || !r.started) return;
      r.versionFade = 0;
      r.paused = document.hidden;
      setPaused(document.hidden);
    }, 2200);
    setFeedback("记下了，继续接照片。");
    playCue("transition");
  }, [choicePhase, playCue, recallAnswer]);

  const advanceIntro = useCallback(() => {
    if (intro === 2 && recallAnswer < 0) return;
    unlockAudio(); playCue("confirm");
    if (intro === 2) setIntro(4);
    else if (intro < 4) setIntro(intro + 1); else begin();
  }, [intro, recallAnswer, begin, unlockAudio, playCue]);

  const restartObservation = useCallback(() => {
    recordRef.current = null;
    resultShownAtRef.current = 0;
    setRecord(null); setIntro(1); setRecallAnswer(-1); setShareMessage("");
  }, []);

  const wake = useCallback(() => {
    if (awakeRef.current) return;
    awakeRef.current = true; bootingRef.current = true; setAwake(true); setBooting(true); unlockAudio(); playCue("wake");
    window.clearTimeout(bootTimerRef.current);
    bootTimerRef.current = window.setTimeout(() => { bootingRef.current = false; setBooting(false); playCue("ready"); }, 3200);
  }, [unlockAudio, playCue]);

  const sleep = useCallback(() => {
    if (runtimeRef.current.started) return;
    window.clearTimeout(bootTimerRef.current); bootingRef.current = false; setBooting(false);
    recordRef.current = null; resultShownAtRef.current = 0;
    awakeRef.current = false; setAwake(false); setIntro(0); setRecallAnswer(-1); setRecord(null); setSettingsOpen(false);
    audioRef.current?.setActive(false);
  }, []);

  useEffect(() => {
    if (!awake || started) return;
    let timer = 0;
    const renew = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sleep, record ? 45000 : 90000);
    };
    idleActivityRef.current = renew;
    const events = ["pointerdown", "keydown", "wheel", "scroll"] as const;
    events.forEach(name => window.addEventListener(name, renew, { capture: true, passive: true }));
    renew();
    return () => {
      window.clearTimeout(timer);
      idleActivityRef.current = () => {};
      events.forEach(name => window.removeEventListener(name, renew, true));
    };
  }, [awake, started, record, sleep, intro, recallAnswer, settingsOpen]);

  useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("button,input,select,textarea,summary,a,[contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (!awakeRef.current) { event.preventDefault(); wake(); return; }
      if (bootingRef.current) { event.preventDefault(); return; }
      if (transitionRef.current) return;
      if (event.repeat && ["enter", " ", "z", "x", "p", "escape"].includes(key)) return;
      if (["arrowleft","arrowright","arrowup"," "].includes(key)) event.preventDefault();
      if (deviceRef.current !== "keyboard") { deviceRef.current = "keyboard"; setLastDevice("keyboard"); }
      if (!runtimeRef.current.started && !record) {
        if (["arrowleft","a","j"].includes(key) && intro === 2) { setRecallAnswer(value => moveCount(value, -1)); return; }
        if (["arrowright","d","l"].includes(key) && intro === 2) { setRecallAnswer(value => moveCount(value, 1)); return; }
        if (key === "enter" || key === " ") { advanceIntro(); return; }
      }
      if (record) return;
      if (!runtimeRef.current.started) return;
      if (choice) {
        if (["arrowleft","a","j"].includes(key)) { choiceIndexRef.current = moveChoiceIndex(choiceIndexRef.current, -1); setChoiceIndex(choiceIndexRef.current); }
        else if (["arrowright","d","l"].includes(key)) { choiceIndexRef.current = moveChoiceIndex(choiceIndexRef.current, 1); setChoiceIndex(choiceIndexRef.current); }
        else if ([" ","enter","z","x"].includes(key)) chooseCheckpointOption(checkpointOptions(choicePhase, runtimeRef.current.recallStage)[choiceIndexRef.current]);
        return;
      }
      if (key === "p" || key === "escape") { const r = runtimeRef.current; if (!choice) { r.paused = !r.paused; setPaused(r.paused); } return; }
      if (runtimeRef.current.paused) return;
      if ([" ","arrowup","z","enter","x"].includes(key)) { if (!event.repeat) beginProtectHold(); return; }
      if (key === "shift") return;
      if (key === "arrowleft" || key === "a" || key === "j") { inputRef.current.left = true; runtimeRef.current.targetX -= .055; runtimeRef.current.lastInteraction = runtimeRef.current.clock; runtimeRef.current.idleNotified = false; }
      if (key === "arrowright" || key === "d" || key === "l") { inputRef.current.right = true; runtimeRef.current.targetX += .055; runtimeRef.current.lastInteraction = runtimeRef.current.clock; runtimeRef.current.idleNotified = false; }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a" || key === "j") inputRef.current.left = false;
      if (key === "arrowright" || key === "d" || key === "l") inputRef.current.right = false;
      if ([" ","arrowup","z","enter","x"].includes(key)) endProtectHold();
    };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [advanceIntro, record, choice, choicePhase, chooseCheckpointOption, wake, intro, restartObservation, beginProtectHold, endProtectHold]);

  useEffect(() => {
    const markHardware = () => { idleActivityRef.current(); if (deviceRef.current !== "gamepad") { deviceRef.current = "gamepad"; setLastDevice("gamepad"); } };
    const control: HardwareControl = {
      wake: () => { markHardware(); wake(); },
      move: (axis) => { markHardware(); if (transitionRef.current) return; const direction=Math.sign(axis); if (choice && direction) { choiceIndexRef.current=moveChoiceIndex(choiceIndexRef.current,direction); setChoiceIndex(choiceIndexRef.current); return; } if (!runtimeRef.current.started && intro===2 && direction) { setRecallAnswer(value=>moveCount(value,direction)); return; } const r=runtimeRef.current; r.targetX=Math.max(.22,Math.min(.78,r.targetX+Math.max(-1,Math.min(1,axis))*.075)); r.lastInteraction=r.clock; r.idleNotified=false; },
      press: (pressure = 0) => { markHardware(); if (!awakeRef.current) wake(); else if (bootingRef.current || transitionRef.current) return; else if (choice) chooseCheckpointOption(checkpointOptions(choicePhase, runtimeRef.current.recallStage)[choiceIndexRef.current]); else if (runtimeRef.current.started) beginProtectHold(pressure); else if (record) restartObservation(); else advanceIntro(); },
      release: () => { markHardware(); endProtectHold(); },
      pause: () => { markHardware(); const r=runtimeRef.current; if (r.started && !choice && !transitionRef.current) { r.paused=!r.paused; setPaused(r.paused); } },
    };
    window.MemoryDriftInput = control;
    const onHardware = (event: Event) => { const detail=(event as CustomEvent<{action:string;value?:number}>).detail; if (!detail) return; if (detail.action==="wake") control.wake(); if (detail.action==="move") control.move(detail.value ?? 0); if (detail.action==="press") control.press(detail.value); if (detail.action==="release") control.release?.(); if (detail.action==="pause") control.pause(); };
    window.addEventListener("memory-control", onHardware);
    return () => { window.removeEventListener("memory-control", onHardware); delete window.MemoryDriftInput; };
  }, [advanceIntro, choice, choicePhase, chooseCheckpointOption, record, wake, intro, restartObservation, beginProtectHold, endProtectHold]);

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
      const dt = Math.min(0.05, (wallNow - previous) / 1000) * gameSpeedRef.current;
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
        if ((stick && !inputRef.current.gamepadHorizontal) || (actionPressed && !inputRef.current.gamepadDash) || (startPressed && !inputRef.current.gamepadStart)) idleActivityRef.current();
        if (!r.started && intro===2 && stick && !inputRef.current.gamepadHorizontal) setRecallAnswer(value=>moveCount(value,stick));
        if (choice && stick && !inputRef.current.gamepadHorizontal) { choiceIndexRef.current = moveChoiceIndex(choiceIndexRef.current, stick); setChoiceIndex(choiceIndexRef.current); playCue("confirm"); }
        if (actionPressed && !inputRef.current.gamepadDash && !transitionRef.current) { if (!awakeRef.current) wake(); else if (bootingRef.current) { /* wait for signal loading */ } else if (choice) chooseCheckpointOption(checkpointOptions(choicePhase, r.recallStage)[choiceIndexRef.current]); else if (r.started) beginProtectHold(); else if (record) restartObservation(); else advanceIntro(); }
        if (!actionPressed && inputRef.current.gamepadDash && r.started) endProtectHold();
        if (startPressed && !inputRef.current.gamepadStart && !transitionRef.current) { if (!awakeRef.current) wake(); else if (choice) { /* keep the choice pause */ } else if (r.started) { r.paused = !r.paused; setPaused(r.paused); } else if (record) restartObservation(); else advanceIntro(); }
        inputRef.current.gamepadDash = actionPressed; inputRef.current.gamepadStart = startPressed; inputRef.current.gamepadHorizontal = stick ? Math.sign(stick) : 0;
      }

      if (r.started && !r.paused && !document.hidden) {
        // Scripted social cues, never presented as actual visitor testimony or statistics.
        const nextEvent: SharedMemoryEvent | null = now >= 2500 && now < 6000 ? "people" : now >= 10000 && now < 14000 ? "sky" : null;
        if (memoryEventRef.current !== nextEvent) {
          memoryEventRef.current = nextEvent;
          setMemoryEvent(nextEvent);
          if (nextEvent && !r.sharedMemories.includes(nextEvent)) r.sharedMemories.push(nextEvent);
        }
        if (r.holdActive && !r.holdTriggered && now - r.holdStartedAt >= HOLD_TO_PROTECT_MS) engageProtection();
        if (r.shield > 0 && r.protectUntil > 0 && now >= r.protectUntil) { r.shield = 0; r.protectUntil = 0; }
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
          const photoChance = r.version === "A" ? .7 : r.version === "B" ? .52 : .46;
          const bubbleChance = r.version === "A" ? .12 : r.version === "B" ? .3 : .38;
          const kind: ItemKind = now < 3200 || roll < photoChance ? "photo" : roll < photoChance + bubbleChance ? "bubble" : "cart";
          const photoSizes = [.72, .96, 1.28];
          const size = kind === "photo" ? photoSizes[Math.floor(Math.random() * photoSizes.length)] : 1;
          r.items.push({ id: r.nextId++, kind, x: lane, y: 0.08, speed: 0.23, size });
          r.lastSpawn = now;
        }

        r.items.forEach((item) => {
          item.y += item.speed * dt;
          if (item.hit || item.y < PLAYER_Y - 0.07 || item.y > PLAYER_Y + 0.09) return;
          const playerHit = Math.abs(item.x - r.x) < (item.kind === "cart" ? 0.135 : 0.08 + item.size * 0.035);
          const echoHit = false;
          if (item.kind === "photo" && (playerHit || echoHit)) {
            item.hit = true;
            r.combo += 1;
            const storageWasFull = r.memories >= SAVE_SLOT_COUNT;
            if (storageWasFull) r.overwritten += 1;
            else r.memories += 1;
            r.score += (echoHit ? 80 : 100) * Math.min(8, r.combo);
            r.stats.caught += 1;
            r.drift = Math.min(1, r.drift + (storageWasFull ? .11 : .055)); playCue(storageWasFull ? "overwrite" : "collect");
            addMemoryGesture(r.gestures, { kind: storageWasFull ? "replace" : "collect", x: item.x * W, y: item.y * H, at: now, seed: item.id });
            setFeedback(storageWasFull ? "存满了，最早的一张被换掉了。" : echoHit ? "接住一张照片。" : r.combo > 2 ? `连续接住 ×${r.combo}` : "接住一张照片。");
          } else if (item.kind === "bubble" && playerHit && r.shield > 0) {
            item.hit = true;
            r.shield = 0;
            r.protectUntil = 0;
            r.effectUntil = now + 460;
            addMemoryGesture(r.gestures, { kind: "block", x: item.x * W, y: item.y * H, at: now, seed: item.id });
            setFeedback("挡住泡泡了，照片没变。"); playCue("block");
          } else if (item.kind === "bubble" && playerHit) {
            item.hit = true;
            r.overwritten += 1;
            r.stats.bumps += 1;
            r.combo = 0;
            r.shakeUntil = now + 430; r.effectUntil = now + 980; r.impactUntil = now + 480; r.drift = Math.min(1, r.drift + .14);
            setImpactPulse(value => value === "a" ? "b" : "a");
            addMemoryGesture(r.gestures, { kind: "bubble", x: item.x * W, y: item.y * H, at: now, seed: item.id });
            setFeedback("碰到泡泡，混进了一段假记忆。"); playCue("bubble");
          } else if (item.kind === "cart" && playerHit && r.shield > 0) {
            item.hit = true;
            r.shield = 0;
            r.protectUntil = 0;
            r.effectUntil = now + 460;
            addMemoryGesture(r.gestures, { kind: "block", x: item.x * W, y: item.y * H, at: now, seed: item.id });
            setFeedback("挡住了，照片还在。"); playCue("block");
          } else if (item.kind === "cart" && playerHit) {
            item.hit = true;
            r.stats.bumps += 1;
            const lostPhoto = r.memories > 0;
            if (lostPhoto) r.memories -= 1;
            r.combo = 0; r.shakeUntil = now + 760; r.effectUntil = now + 1250; r.impactUntil = now + 840; r.drift = Math.min(1, r.drift + .2);
            setImpactPulse(value => value === "a" ? "b" : "a");
            addMemoryGesture(r.gestures, { kind: "hit", x: item.x * W, y: item.y * H, at: now, seed: item.id });
            setFeedback(lostPhoto ? "撞到了，少了一张照片。" : "撞到了，画面晃了一下。"); playCue("collision");
          }
        });
        r.items.forEach((item) => {
          if (!item.hit && item.kind === "photo" && item.y >= 1.02) {
            item.hit = true; r.stats.missed += 1; r.combo = 0;
            setFeedback("漏掉了一张。");
          }
        });
        r.gestures = r.gestures.filter(event => now - event.at < GESTURE_DURATION);
        r.items = r.items.filter((item) => !item.hit && item.y < 1.08);
        r.versionFade = Math.max(0, r.versionFade - dt * .58);
        if (now - r.lastInteraction > 1100) {
          r.drift = Math.max(0, r.drift - dt * .16);
          r.effectUntil = Math.min(r.effectUntil, now + 120);
          if (!r.idleNotified && r.drift > .04) { r.idleNotified = true; setFeedback("停一会儿，画面会慢慢恢复。"); }
        }

        if (r.recallStage < RECALL_AT_MS.length && now >= RECALL_AT_MS[r.recallStage]) { r.recallStage += 1; r.paused = true; choiceIndexRef.current = -1; setChoiceIndex(-1); setChoicePhase("count"); setChoiceStage(r.recallStage); setChoice(true); }
        setSeconds((old) => { const value = Math.max(0, Math.ceil((RUN_DURATION_MS - now) / 1000)); return old === value ? old : value; });

        if (now - r.startedAt >= RUN_DURATION_MS) finishRun();

        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ score: r.score, combo: r.combo, checks: r.checks, memories: r.memories, drift: r.drift, version: r.version, overwritten: r.overwritten, protections: r.protections, hold: r.holdActive ? Math.min(1, (now - r.holdStartedAt) / HOLD_TO_PROTECT_MS) : 0, protected: r.shield > 0 && now < r.protectUntil });
        }
      }

      const shakeRemaining = !quietRef.current && now < r.shakeUntil ? Math.max(0, Math.min(1, (r.shakeUntil - now) / 760)) : 0;
      const trauma = shakeRemaining * shakeRemaining;
      const shakeX = trauma * (Math.sin(now * .091) * 27 + Math.sin(now * .037) * 11);
      const shakeY = trauma * (Math.cos(now * .077) * 16 + Math.sin(now * .049) * 7);
      const shakeRoll = trauma * Math.sin(now * .063) * .012;
      const shakeScale = 1 + trauma * .024;
      ctx.save();
      ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
      ctx.rotate(shakeRoll);
      ctx.scale(shakeScale, shakeScale);
      ctx.translate(-W / 2, -H / 2);
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
          cropDraw(ctx, assets.player, [312, 99, 680, 1015], x * W, PLAYER_Y * H + 10, 194, 290);
          ctx.restore();
        });

        r.items.sort((a, b) => a.y - b.y).forEach((item) => {
          ctx.save();
          if (item.kind === "photo" && (item.id % 3 === 0 || r.drift > .65)) ctx.filter = `grayscale(${Math.min(1, r.drift * 1.6)})`;
          const scale = 0.46 + item.y * 0.72;
          if (item.kind === "photo") {
            // Tilt only the drawing; the collection lane and hit box remain unchanged.
            if (!quietRef.current) {
              ctx.translate(item.x * W, item.y * H);
              ctx.rotate(Math.sin(now * .0018 + item.id * 1.7) * .075);
              ctx.translate(-item.x * W, -item.y * H);
            }
            const photoWidth = 148 * scale * item.size;
            const photoHeight = 164 * scale * item.size;
            drawContained(ctx, assets.photo, item.x * W, item.y * H, photoWidth, photoHeight);
            const fault = photoFaultStrength(now, item.id, r.version, r.impactUntil, quietRef.current || r.paused);
            drawPhotoFault(ctx, assets.photo, item.x * W, item.y * H, photoWidth, photoHeight, fault);
          }
          if (item.kind === "cart") drawContained(ctx, assets.cart, item.x * W, item.y * H, 250 * scale, 275 * scale);
          if (item.kind === "bubble") {
            const pulse = quietRef.current ? 1 : 1 + Math.sin(now * .008 + item.id) * .045;
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = .88;
            ctx.shadowColor = "#58e8ff";
            ctx.shadowBlur = 24 * scale;
            drawContained(ctx, assets.bubble, item.x * W, item.y * H, 214 * scale * pulse, 214 * scale * pulse);
          }
          ctx.restore();
        });
        if (r.shield > 0) {
          const pulse = 1 + Math.sin(now * .008) * .025;
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = .55 + r.shield * .09;
          ctx.drawImage(assets.bubble, r.x * W - 198 * pulse, PLAYER_Y * H - 232 * pulse, 396 * pulse, 396 * pulse);
          ctx.restore();
        }
        const bob = quietRef.current ? 0 : Math.sin(now * 0.012) * 5;
        cropDraw(ctx, assets.player, [312, 99, 680, 1015], r.x * W, PLAYER_Y * H + bob, 242, 360);
        if (!r.paused) drawMemoryGestures(ctx, assets.photo, r.gestures, now, quietRef.current);
      }
      ctx.restore();
      if (r.started && r.version === "B" && r.versionFade <= .02) {
        ctx.save();
        ctx.filter = "grayscale(1) contrast(1.34) brightness(.72)";
        ctx.drawImage(canvas, 0, 0, W, H);
        ctx.filter = "none";
        ctx.fillStyle = "rgba(4,7,11,.2)";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
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
      if (r.started && !quietRef.current && now < r.impactUntil) {
        ctx.save();
        const remaining = Math.max(0, Math.min(1, (r.impactUntil - now) / 840));
        const punch = remaining * remaining;
        const flash = remaining > .82 ? (remaining - .82) / .18 : 0;
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = .16 + punch * .24;
        ctx.filter = "hue-rotate(155deg) saturate(2.2) contrast(1.25)";
        ctx.drawImage(canvas, -18 * punch, 0, W, H);
        ctx.filter = "hue-rotate(-70deg) saturate(2.4) contrast(1.2)";
        ctx.drawImage(canvas, 18 * punch, 0, W, H);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        for (let band = 0; band < 15; band++) {
          const sy = 90 + ((band * 127 + Math.floor(now / 38) * 59) % 1690);
          const bh = 7 + (band % 5) * 9;
          const direction = band % 2 ? 1 : -1;
          const offset = direction * (22 + (band % 4) * 17) * punch;
          ctx.globalAlpha = .22 + punch * .42;
          ctx.drawImage(canvas, 0, sy, W, bh, offset, sy, W, bh);
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = band % 3 === 0 ? "#20e6d0" : band % 3 === 1 ? "#ff3f77" : "#4a7dff";
          ctx.fillRect(offset, sy, W, band % 4 === 0 ? 4 : 2);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = .35 + punch * .45;
        ctx.fillStyle = "#f7f2dd";
        ctx.fillRect(0, PLAYER_Y * H - 3, W, 6 + punch * 10);
        ctx.globalAlpha = flash * .5;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [finishRun, playCue, advanceIntro, record, choice, choicePhase, chooseCheckpointOption, wake, intro, restartObservation, beginProtectHold, endProtectHold, engageProtection]);

  const saveCard = useCallback(() => {
    if (!record) return;
    const card = document.createElement("canvas"); card.width = 1080; card.height = 1440;
    const c = card.getContext("2d")!; const g = c.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, "#5ee0ff"); g.addColorStop(.48, "#fff0a8"); g.addColorStop(1, "#ff8c67"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
    c.fillStyle = "rgba(255,255,255,.84)"; c.roundRect(75, 80, 930, 1280, 52); c.fill(); c.fillStyle = "#173755";
    c.font = "800 34px sans-serif"; c.fillText(`YOUR ANSWERS · VISIT ${String(record.run).padStart(2,"0")}`, 130, 160);
    c.font = "900 76px sans-serif"; c.fillText(tr("忘了自己是什么", "WHAT WAS I AGAIN?"), 130, 280); c.font = "700 38px sans-serif"; c.fillStyle = "#ef704f"; c.fillText(tr("本次回答", "Your answers"), 130, 360);
    c.fillStyle = "#173755"; c.font = "800 42px sans-serif";
    [[tr("最初画面","FIRST IMAGE"),4],[tr("第一次回想","FIRST RECALL"),answerLabel(record.recalls?.[0])],[tr("第二次回想","SECOND RECALL"),answerLabel(record.recalls?.[1])],[tr("第三次回想","THIRD RECALL"),answerLabel(record.recalls?.[2])],[tr("留下的照片","PHOTOS KEPT"),record.retained ?? Math.min(SAVE_SLOT_COUNT, record.caught)],[tr("受到干扰","INTERRUPTIONS"),record.bumps]].forEach(([label,value],i)=>c.fillText(`${label}  ${value}`,130,500+i*105));
    c.font = "800 38px sans-serif"; c.fillText(`CURRENT VERSION  ${record.version}`,130,1190); c.font = "600 28px sans-serif"; c.fillText(tr("原图与本次回答", "The original photo and your answers"),130,1270);
    const a = document.createElement("a"); a.download = `memory-journey-${record.run}.png`; a.href = card.toDataURL("image/png"); a.click();
  }, [record, tr, answerLabel]);

  const shareCard = useCallback(async () => {
    if (!record) return;
    const text = language === "zh" ? `最初画面：4 人｜我的回想：${(record.recalls ?? []).map(answerLabel).join(" → ")}｜本次回答记录` : `FIRST IMAGE: 4 PEOPLE | MY RECALLS: ${(record.recalls ?? []).map(answerLabel).join(" → ")} | My answers`;
    try {
      if (navigator.share) await navigator.share({ title: tr("忘了自己是什么", "WHAT WAS I AGAIN?"), text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); setShareMessage(tr("结果和链接已复制", "Result and link copied")); }
    } catch { setShareMessage(tr("没能分享出去，可以先保存图片。", "Sharing did not work. Try saving the image instead.")); }
  }, [record, language, tr, answerLabel]);

  const pauseGame = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || choice || transitionRef.current) return;
    r.paused = !r.paused; setPaused(r.paused);
  }, [choice]);

  useEffect(() => {
    const hide = () => { if (document.hidden && runtimeRef.current.started) { runtimeRef.current.paused = true; if (!transitionRef.current && !choice) setPaused(true); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [choice]);

  const liveDetailLabel = versionCause.detail === "unknown" ? tr("记不清了", "Not sure") : versionCause.detail === "left" ? tr("左侧", "LEFT")
    : versionCause.detail === "center" ? tr("中央", "CENTER")
    : versionCause.detail === "right" ? tr("右侧", "RIGHT")
    : versionCause.detail === "white" ? tr("白色", "WHITE")
    : versionCause.detail === "pink" ? tr("粉色", "PINK")
    : versionCause.detail === "blue" ? tr("蓝色", "BLUE")
    : tr("未记录", "UNRECORDED");

  return (
    <main className="rush-page">
      <section className="rush-game" data-lang={language} data-quiet={quiet} data-screen={record ? "result" : !awake ? "dormant" : booting ? "loading" : started ? "playing" : "intro"} data-impact={impactPulse ?? undefined} aria-label={tr("记忆与遗忘竖屏游戏", "Vertical game about memory and forgetting")}>
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
          <div><span>{tr("照片", "PHOTOS")}</span><strong>{hud.memories}/{SAVE_SLOT_COUNT}</strong></div>
          <div className="rush-title"><span>WHAT WAS I AGAIN?</span><strong>VERSION {hud.version}</strong></div>
          <div><span>{tr("回想次数", "RECALLS")}</span><strong>{String(hud.checks).padStart(2, "0")}</strong></div>
        </header>}

        {awake && !booting && <div className="rush-settings">
          <span className="device-pill">{lastDevice === "gamepad" ? tr("街机", "ARCADE") : lastDevice === "keyboard" ? tr("键盘", "KEYS") : tr("触控", "TOUCH")}</span>
          {started && <button
            className="pause-quick pause-icon"
            type="button"
            aria-label={paused ? tr("继续游戏", "Resume game") : tr("暂停游戏", "Pause game")}
            title={paused ? tr("继续游戏", "Resume game") : tr("暂停游戏", "Pause game")}
            onClick={pauseGame}
            disabled={choice}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {paused ? <path d="M8 5l11 7-11 7Z" /> : <path d="M6 5h4v14H6zM14 5h4v14h-4z" />}
            </svg>
          </button>}
          <button
            className="settings-toggle settings-icon"
            type="button"
            data-open={settingsOpen}
            aria-label={tr(settingsOpen ? "关闭设置" : "打开设置", settingsOpen ? "CLOSE SETTINGS" : "OPEN SETTINGS")}
            title={tr(settingsOpen ? "关闭设置" : "设置", settingsOpen ? "Close settings" : "Settings")}
            aria-expanded={settingsOpen}
            aria-controls="display-controls"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.25" />
              <circle cx="12" cy="12" r="7.1" />
              <path d="M12 2.2v3M12 18.8v3M2.2 12h3M18.8 12h3M5.1 5.1l2.2 2.2M16.7 16.7l2.2 2.2M18.9 5.1l-2.2 2.2M7.3 16.7l-2.2 2.2" />
            </svg>
          </button>
          {settingsOpen && <div className="settings-popover" id="display-controls">
            <button aria-pressed={quiet} onClick={() => { quietRef.current = !quiet; setQuiet(!quiet); }}>{tr("画面抖动", "SHAKE")}<strong>{quiet ? tr("柔和", "SOFT") : tr("标准", "NORMAL")}</strong></button>
            <button aria-pressed={sound} onClick={() => { const next = !soundRef.current; soundRef.current = next; setSound(next); audioRef.current?.setEnabled(next); if (next) unlockAudio(); }}>{tr("声音", "SOUND")}<strong>{sound ? tr("开", "ON") : tr("关", "OFF")}</strong></button>
            <div className="audio-preview" role="group" aria-label={tr("音效试听", "Sound preview")}>
              <span>{tr("试听", "LISTEN")}</span>
              <button type="button" disabled={!sound} onClick={() => { unlockAudio(); playCue("collect"); }}>{tr("收集", "COLLECT")}</button>
              <button type="button" disabled={!sound} onClick={() => { unlockAudio(); playCue("collision"); }}>{tr("碰撞", "IMPACT")}</button>
            </div>
            <button onClick={() => { const next=language === "zh" ? "en" : "zh"; setLanguage(next); }}>{tr("语言", "LANGUAGE")}<strong>{language === "zh" ? "EN" : "中文"}</strong></button>
            <div className="speed-selector" role="group" aria-label={tr("移动速度", "Movement speed")}>
              <span>{tr("倍速", "SPEED")}</span>
              {GAME_SPEEDS.map((rate) => <button key={rate} type="button" aria-pressed={gameSpeed === rate} data-selected={gameSpeed === rate} onClick={() => {
                gameSpeedRef.current = rate;
                setGameSpeed(rate);
                localStorage.setItem("memory-rush-speed", String(rate));
              }}>{rate}×</button>)}
            </div>
          </div>}
        </div>}

        {!awake && <button className="dormant-screen" onClick={wake} aria-label={tr("唤醒装置", "Wake installation")}>
          <span className="dormant-code">WHAT WAS I AGAIN? / 00</span>
          <DormantVisual sharedTime={memoryVisualTime} />
          <strong>{tr("你还记得吗？", "Do you remember?")}</strong>
          <small>{tr("碰一下，或按任意键开始", "Touch here or press any key to start")}</small>
          <em>{tr("等待开始", "TOUCH TO START")}</em>
        </button>}
        {awake && booting && <section className="signal-loader" aria-live="polite" aria-label={tr("正在准备游戏", "Getting the game ready")}>
          <span className="loader-index">01 / LOADING</span>
          <DormantVisual developing sharedTime={memoryVisualTime} />
          <strong>{tr("正在准备照片", "Loading the photo")}</strong>
          <p>{tr("马上就好", "One moment")}</p>
          <small>{tr("约 3 秒", "ABOUT 3 SECONDS")}</small>
        </section>}
        {started && !choice && !paused && memoryEvent && <aside className="shared-memory-event" data-event={memoryEvent} aria-label={tr("别人的留言，游戏虚构", "Other people’s comments, written for the game")} aria-live="polite">
          <header>{tr("别人的留言", "OTHER PEOPLE’S COMMENTS")}<small>{tr("游戏虚构", "FICTIONAL")}</small></header>
          <p><b>A</b>{memoryEvent === "people" ? tr("“那张照片里有五个人吧？”", '“There were five people in that photo, right?”') : tr("“我记得天空是粉色的。”", '“I remember a pink sky.”')}</p>
          <p><b>B</b>{memoryEvent === "people" ? tr("“对，我也记得是五个。”", '“Yes, I remember five too.”') : tr("“我也记得，淡淡的粉色。”", '“Me too. A pale pink.”')}</p>
        </aside>}
        {started && !choice && !paused && !memoryEvent && hud.version !== "A" && <aside className="reconstructed-preview" data-version={hud.version} aria-label={tr("按你的回答画的，不是原图", "Drawn from your answer, not the original")}>
          <span>{versionCause.recall === 0 ? tr("人数记不清了", "The count is unclear") : tr(`你选了 ${versionCause.recall} 人`, `You chose ${versionCause.recall} people`)}<small>{tr("这是照你的回答画的，不是原图。", "Drawn from your answer, not the original.")}</small></span>
          {versionCause.recall === 0 && <p className="uncertain-picture">{tr("你选了“记不清”，这里不显示人物。", "You chose “Not sure”, so no people are shown.")}</p>}<div className="memory-figures">{Array.from({length: versionCause.recall},(_,index)=><img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":1.05+(index%2)*.2} as CSSProperties}/>)}</div>
        </aside>}
        {started && <><div className="combo-pill" data-active={hud.checks > 0}>{hud.checks > 0 ? `×${hud.checks} ${tr("次回想", "recalls")}` : tr("再看一次", "Look again")}</div>
          <div className="rush-journey"><span>{hud.version === "A" ? tr("01 / 彩色", "01 / COLOR") : hud.version === "B" ? tr("02 / 黑白", "02 / BLACK & WHITE") : tr("03 / 紫蓝", "03 / VIOLET")}</span><strong>{tr(`照片 ${hud.memories} 张 · ${seconds}s · ${gameSpeed}×`, `${hud.memories} ${hud.memories === 1 ? "photo" : "photos"} · ${seconds}s · ${gameSpeed}×`)}</strong><progress max={RUN_DURATION_MS / 1000} value={RUN_DURATION_MS / 1000-seconds} aria-label={tr("本轮进度", "Round progress")} /></div>
          {!choice && !paused && <>
          <div className="run-purpose"><b>{hud.version === "A" ? tr("A / 保存", "A / STORE") : hud.version === "B" ? tr("B / 复盘", "B / RECHECK") : tr("C / 保护", "C / PROTECT")}</b><span>{hud.version === "A" ? tr("最多留 5 张，接满后会换掉最早的一张。", "Keep up to 5 photos. New ones replace the oldest.") : hud.version === "B" ? tr("躲开泡泡，别让假记忆混进来。", "Avoid bubbles. They slip false memories in.") : tr("按住下方按钮，可以挡住一次干扰。", "Hold the button below to block one hit.")}</span></div>
          <div className="bottom-console">
            <div className="memory-storage" data-overwritten={hud.overwritten > 0} data-protected={hud.protected}>
              <header><b>{tr("留下的照片", "PHOTOS KEPT")}</b><span>{tr(`换过 ${hud.overwritten} 次`, `${hud.overwritten} replaced`)}</span></header>
              <div>{Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => <i key={index} data-filled={index < hud.memories} data-locked={hud.protected && index === 0}>{hud.protected && index === 0 ? "▣" : String(index + 1).padStart(2,"0")}</i>)}</div>
            </div>
            <div className="rush-feedback" data-fault={feedback.includes("撞到了") || feedback.includes("假记忆") || feedback.includes("被换掉")} role="status">{shownFeedback}</div>
            <div className="bottom-actions">
              <div className="pickup-legend compact-legend"><span>{tr("照片 · 保存", "PHOTO · SAVE")}</span><span>{tr("泡泡 · 假记忆", "BUBBLE · FALSE MEMORY")}</span><span>{tr("碰撞 · 打断", "IMPACT · INTERRUPT")}</span></div>
              <button className="protect-memory" type="button" disabled={choice || paused || hud.memories < 1} data-holding={hud.hold > 0} data-protected={hud.protected} aria-pressed={hud.protected} style={{"--hold":`${hud.hold * 100}%`} as CSSProperties}
                onPointerDown={(event)=>{ event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); beginProtectHold(); }}
                onPointerUp={endProtectHold} onPointerCancel={endProtectHold} onPointerLeave={endProtectHold}
                onKeyDown={(event)=>{ if (["Enter"," "].includes(event.key) && !event.repeat) beginProtectHold(); }}
                onKeyUp={(event)=>{ if (["Enter"," "].includes(event.key)) endProtectHold(); }}
                onClick={(event)=>{ if (event.detail === 0) beginProtectHold(.8); }}>
                <small>{hud.protected ? tr("可挡一次 · 最多 4 秒", "ONE HIT · UP TO 4s") : tr("长按 0.7 秒", "HOLD 0.7 SEC")}</small><strong>{hud.protected ? tr("正在保护", "PROTECTED") : tr("护住照片", "PROTECT PHOTOS")}</strong><i aria-hidden="true" />
              </button>
            </div>
          </div></>}</>}

        {versionPulse && <div className="version-transition" data-version={versionPulse} role="status" aria-live="assertive">
          <span>{tr(`你的回答：${answerLabel(versionCause.recall)} · ${liveDetailLabel}`, `YOUR RECALL: ${answerLabel(versionCause.recall)} · ${liveDetailLabel}`)}</span>
          <strong>VERSION {versionPulse}</strong>
          <div className="version-art" aria-hidden="true" style={{ "--recall-scene": `url("${resolveImageUrl(versionPulse === "B" ? backgroundAUrl : backgroundBUrl)}")` } as CSSProperties}>
            {[0,1,2,3,4].map(index => <i className="version-print" key={index} style={{ "--print-index": index } as CSSProperties} />)}
            <div className="version-figures">{Array.from({length: versionCause.recall > 0 ? versionCause.recall : 0}, (_, index) => <img key={index} src={resolveImageUrl(playerUrl)} alt="" />)}</div>
            <span className="version-registration" />
          </div>
          <p>{versionCause.recall === 0
            ? tr("这次没有确定人数。画面里暂不补入人物。", "No count chosen. This version leaves the people out.")
            : tr(`这一版有 ${versionCause.recall} 人。原图没有变。`, `This version has ${versionCause.recall} people. The original is unchanged.`)}</p>
        </div>}

        {awake && !booting && !started && !record && <div key={intro} className="rush-intro" data-step={intro}>
          <span>{intro === 0
            ? tr("先看一眼，再凭记忆回答", "Take a look, then answer from memory")
            : tr(`开始之前 0${intro === 4 ? 4 : intro + 1} / 04`, `BEFORE YOU START 0${intro === 4 ? 4 : intro + 1} / 04`)}</span>
          <nav className="experience-route" aria-label={tr("游戏流程", "Game steps")}>
            {[tr("靠近", "APPROACH"),tr("观看", "OBSERVE"),tr("回想", "RECALL"),tr("穿行", "JOURNEY"),tr("对照", "COMPARE")].map((label,index) => {
              const active = intro === 0 ? 0 : intro === 1 ? 1 : intro < 4 ? 2 : 3;
              return <i key={label} data-active={index <= active}><b>0{index + 1}</b>{label}</i>;
            })}
          </nav>
          <h1>{intro === 0 ? tr("忘了自己是什么", "WHAT WAS I AGAIN?") : intro === 1 ? tr("看看这张照片", "Look at this photo") : intro === 2 ? tr("你刚才看见了几个人？", "HOW MANY PEOPLE DID YOU SEE?") : intro === 3 ? (recallAnswer === 0 ? tr("你选了“记不清”", "You chose “Not sure”") : tr(`你选了 ${recallAnswer} 人`, `You chose ${recallAnswer} people`)) : tr("操作说明", "Controls")}</h1>
          {intro === 0 && <div className="intro-photo intro-photo-0">
            <img src={resolveImageUrl(photoUrl)} alt={tr("一只装着照片的相框", "A framed photo")} />
            <i />
          </div>}
          {intro === 3 && <div className="motive-loop" aria-label={tr("看照片后凭记忆回答", "Look at the photo, then answer from memory")}>
            <span><b>01</b><em>{tr("看照片", "LOOK")}</em><small>01</small></span><i aria-hidden="true">↘</i><span><b>02</b><em>{tr("记住细节", "REMEMBER")}</em><small>02</small></span><i aria-hidden="true">↗</i><span><b>03</b><em>{tr("稍后回答", "ANSWER")}</em><small>03</small></span><i aria-hidden="true">↺</i>
          </div>}
          {intro === 1 && <div className="intro-photo intro-photo-1"><img src={resolveImageUrl(backgroundAUrl)} alt={tr("最初呈现的记忆场景", "The memory scene shown at the start")} /><div className="memory-figures" aria-label={tr("照片里有四个人", "Four people are visible in the photograph")}>{[.82,1,.7,.9].map((scale,index) => <img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":scale} as CSSProperties} />)}</div><i /></div>}
          {intro === 2 && <div className="recall-choice" role="group" aria-label={tr("选择记得的人数", "Choose the number you remember")}>
            {COUNT_OPTIONS.map(value => <button key={value} aria-pressed={recallAnswer === value} data-selected={recallAnswer === value} onClick={() => { setRecallAnswer(value); playCue("confirm"); }}><strong>{value === 0 ? tr("记不清了", "Not sure") : value}</strong><span>{value === 0 ? tr("直接继续", "Continue") : tr("个人", "PEOPLE")}</span></button>)}
          </div>}
          {intro === 4 && <p className="intro-answer">{tr("你刚才的回答：", "Your first answer: ")}{answerLabel(recallAnswer)}</p>}
          {intro === 4 && <div className="version-map" style={{"--scene-image": `url("${resolveImageUrl(backgroundAUrl)}")`, "--scene-rebuilt": `url("${resolveImageUrl(backgroundBUrl)}")`} as CSSProperties} aria-label={tr("记忆版本变化", "Memory version changes")}>
            <span data-version="A"><small>01 / STORE</small><b>A</b><em>{tr("接住照片", "CATCH PHOTOS")}</em></span><i aria-hidden="true">→</i><span data-version="B"><small>02 / RECHECK</small><b>B</b><em>{tr("躲开泡泡", "AVOID BUBBLES")}</em></span><i aria-hidden="true">→</i><span data-version="C"><small>03 / PROTECT</small><b>C</b><em>{tr("护住照片", "PROTECT PHOTOS")}</em></span>
          </div>}
          <p>{intro === 0 ? tr("先看照片，记住里面的人和景物。游戏中会问你几次，最后再看原图。", "Look at the people and surroundings in the photo. Answer a few questions as you play, then compare your answers with the original.") : intro === 1 ? tr("看好后，点“我看过了”。", "Take your time. Select Continue when you are ready.") : intro === 2 ? tr("选你记得的人数，也可以选“记不清了”。", "Choose a number, or select Not sure.") : intro === 3 ? tr("接下来还会问两次人数，以及位置和颜色。你可以改答案。", "You will be asked about the people twice more, and about position and color. You can change your answers.") : tr("左右移动接照片，躲开泡泡和障碍。长按下方按钮可挡一次碰撞。移动时间共 24 秒（1×速度），回答问题时暂停计时。", "Move left or right to catch photos. Dodge bubbles and obstacles. Hold the button below to block one hit. At 1× speed, movement lasts 24 seconds; questions pause the timer.")}</p>
            {previous && intro === 0 && <div className="previous-memory"><b>{tr(`上次：VERSION ${previous.version}`, `LAST: VERSION ${previous.version}`)}</b><span>{tr(`上次留下 ${previous.retained ?? Math.min(SAVE_SLOT_COUNT, previous.caught)} 张照片 · 这次重新开始`, `You kept ${previous.retained ?? Math.min(SAVE_SLOT_COUNT, previous.caught)} photos last time · Start fresh`)}</span></div>}
          <button disabled={!ready || (intro === 2 && recallAnswer < 0)} onClick={advanceIntro}>{loadError ? tr("图片没加载出来，请刷新重试", "The pictures did not load. Please refresh.") : !ready ? tr("正在加载照片…", "Loading photos…") : intro === 0 ? tr("开始看照片", "Start with the photo") : intro === 1 ? tr("我看过了", "Continue") : intro === 2 ? tr("选好了", "Keep this answer") : intro === 3 ? tr("接下来怎么玩", "How to play") : tr("开始", "Start")}</button>
          {loadError && <button onClick={() => location.reload()}>{tr("重新加载", "RELOAD")}</button>}
          <small>{tr("点击、回车或街机按钮继续", "CLICK · ENTER · OR ARCADE BUTTON")}</small>
        </div>}

        {(choice || paused) && <section className="rush-choice" data-phase={choicePhase} data-choice={choice} aria-label={tr("回答问题", "Questions")}>
          <span>{choice ? tr(`再想一想 · ${choicePhase === "count" ? "人数" : "细节"}`, `Think back · ${choicePhase === "count" ? "People" : "Details"}`) : tr("暂时停下", "PAUSED")}</span>
          <h2>{choice ? choicePhase === "count"
            ? tr("最开始的照片里，有几个人？", "How many people were in the first photo?")
            : choiceStage === 1
              ? tr("旋转木马在画面的哪一侧？", "Where was the carousel in the first photo?")
              : tr("最开始的照片里，天空是什么颜色？", "What color was the sky in the first photo?")
            : tr("已暂停", "Paused")}</h2>
          {choice ? <><p>{choicePhase === "count"
            ? tr("选你记得的人数，记不清也可以。", "Choose a number, or select Not sure.")
            : tr("选完继续；记不清也可以。", "Select an answer to continue. Not sure is also an option.")}</p>
          {checkpointOptions(choicePhase, choiceStage).map((value,index)=><button key={value} data-focused={choiceIndex === index} onFocus={()=>{choiceIndexRef.current=index;setChoiceIndex(index);}} onClick={()=>chooseCheckpointOption(value)}><strong>{typeof value === "number" && value !== 0 ? value : answerLabel(value)}</strong><span>{value === 0 || value === "unknown" ? tr("直接继续", "Continue") : typeof value === "number" ? tr("个人", "PEOPLE") : tr("选择", "Select")}</span></button>)}</> : <button onClick={pauseGame}>{tr("继续", "RESUME")}</button>}
        </section>}

        {record && <section className="memory-result" aria-label={tr("这次的结果", "Your results")}>
          <div className="result-kicker">YOUR ANSWERS · VISIT {String(record.run).padStart(2,"0")} · VERSION {record.version}</div>
          <h2>{tr("回答记录", "YOUR ANSWERS")}</h2>
          <div className="recall-timeline" aria-label={tr("原图与你的三次回答对照", "Source and your three answers")}>
            {[4, ...Array.from({length:3},(_,index) => record.recalls?.[index] ?? "—")].map((count,index) => <div key={index} data-source={index === 0}>
              <span>{index === 0 ? tr("原图", "SOURCE") : tr(`回想 ${index}`, `RECALL ${index}`)}</span>
              <strong data-uncertain={count === 0}>{answerLabel(count)}</strong>
              <em>{index === 0 ? tr("一开始看到的", "What you first saw") : index === 1 ? tr("首次判断", "FIRST ANSWER") : count === 0 ? tr("这次没有确定人数", "COUNT LEFT OPEN") : tr(`照此画成 ${index === 2 ? "B" : "C"}`, `Used for ${index === 2 ? "B" : "C"}`)}</em>
            </div>)}
          </div>
          <div className="recall-evidence"><strong>{tr("原图", "ORIGINAL PHOTO")}</strong><div className="intro-photo intro-photo-1"><img src={resolveImageUrl(backgroundAUrl)} alt={tr("最初呈现的场景", "The scene shown at the start")} /><div className="memory-figures">{[.82,1,.7,.9].map((scale,index)=><img key={index} src={resolveImageUrl(playerUrl)} alt="" style={{"--figure-scale":scale} as CSSProperties}/>)}</div></div><p>{(record.recalls ?? []).some(n=>n===0) ? tr("原图里有 4 人。“记不清”的回答也列在上方。", "The photo had four people. Any Not sure answers are shown above.") : (record.recalls ?? []).some(n=>n!==4) ? tr("原图里有 4 人。你的三次回答列在上方。", "The photo had four people. Your three answers are shown above.") : tr("你三次都选了 4 人，与原图一致。", "You chose four people each time, matching the photo.")}</p></div>
          <section className="memory-changes" aria-label={tr("变化发生在哪里", "Where answers changed")}>
            <details className="recall-history"><summary>{tr("查看三次回答的经过", "View answer history")}</summary>
            <ol>
              {[0,1,2].map(index => {
                const value = record.recalls?.[index];
                const previousAnswer = record.recalls?.[index-1];
                return <li key={index}>
                  <small>{index === 0 ? tr("看过原图后", "AFTER THE ORIGINAL") : index === 1 ? (record.sharedMemories?.includes("people") ? tr("“五个人”的虚构留言出现后", "AFTER THE FICTIONAL FIVE-PEOPLE COMMENTS") : tr("第二次回想", "SECOND RECALL")) : (record.sharedMemories?.includes("sky") ? tr("“粉色天空”的虚构留言出现后", "AFTER THE FICTIONAL PINK-SKY COMMENTS") : tr("第三次回想", "THIRD RECALL"))}</small>
                  <strong>{answerLabel(value)}</strong>
                  <span>{index === 0 ? tr("第一次回答", "First answer") : value === undefined ? tr("没有记录", "Not recorded") : value === previousAnswer ? tr("人数答案没变。", "Your count stayed the same.") : value === 0 ? tr("这次选了“记不清”", "You selected Not sure") : previousAnswer === 0 ? tr(`这次选了 ${value} 人`, `You selected ${value} people`) : tr(`人数从 ${previousAnswer} 改成了 ${value}。`, `Your count changed from ${previousAnswer} to ${value}.`)}</span>
                </li>;
              })}
            </ol>
            </details>
            <div className="detail-evidence">
              {([{key:"count", title:tr("最后记得的人数","FINAL COUNT"), source:4, answer:record.recalls?.[2], comment:record.sharedMemories?.includes("people") ? 5 : undefined}, {key:"side", title:tr("旋转木马的位置","CAROUSEL POSITION"), source:"right", answer:record.details?.[0]}, {key:"sky", title:tr("天空的颜色","SKY COLOR"), source:"blue", answer:record.details?.[1], comment:record.sharedMemories?.includes("sky") ? "pink" : undefined}]).map(item => {
                const state = comparisonState(item.answer, item.source);
                return <span key={item.key} data-comparison={state}><b>{item.title}</b>{tr("原图：","Original: ")}{answerLabel(item.source)}{item.comment !== undefined && <span>{tr("留言：", "Comments: ")}{answerLabel(item.comment)}</span>}<em>{tr("你的回想：","Your recall: ")}{answerLabel(item.answer)}</em><small>{state === "uncertain" ? tr("没有确定答案","Left uncertain") : state === "same" ? tr("与原图一致","Matches the original") : state === "different" ? tr("与原图不同","Differs from the original") : tr("没有记录","Not recorded")}</small></span>;
              })}
            </div>
          </section>
          <div className="result-reflection">
            {(record.sharedMemories?.length ?? 0) > 0 && <section className="shared-memory-reveal" aria-label={tr("别人的留言与原图对照", "Other people’s comments and the original")}>
              <h3>{tr("留言和原图", "Comments and the photo")}</h3>
              {record.sharedMemories?.includes("people") && <p>{tr("两条留言都说有五个人，原图里却只有四个。", "Both comments said five people. The original had four.")}</p>}
              {record.sharedMemories?.includes("sky") && <p>{tr("留言说天空是粉色，原图是蓝色。", "The comments said pink. The original sky was blue.")}</p>}
              <p>{tr("这些留言是为游戏编写的，不是真实玩家的评论。", "These comments were written for the game, not posted by real players.")}</p>
              <details><summary>{tr("关于曼德拉效应", "About the Mandela effect")}</summary>
                <p>{tr("很多人对同一件事有相似的记忆，却与可核实的事实不符，这类现象通常被称为曼德拉效应。", "The Mandela effect describes shared memories that do not match verifiable facts.")}</p>
                <a href="https://news.uchicago.edu/story/visual-mandela-effect-false-memories-psychology-neuroscience-pikachu-mr-monopoly-waldo" target="_blank" rel="noreferrer">{tr("相关研究：芝加哥大学", "Research: University of Chicago")}</a>
              </details>
            </section>}
            <h3>{tr("照片和记忆", "Photos and memory")}</h3>
            <p className="result-thesis">{tr("想不起一个细节时，我们常会翻照片、找聊天记录，或者重新搜索过去的事。", "When you cannot remember a detail, you might look through old photos, messages or posts to check it.")}</p>
          </div>
          <blockquote>{tr("遗忘是一种缺陷，还是一种自我保护？", "Is forgetting a flaw, or a way to protect yourself?")}</blockquote>
          <dl className="result-traces">
            <div><dt>{tr("留下的照片", "PHOTOS KEPT")}</dt><dd>{record.retained ?? Math.min(SAVE_SLOT_COUNT, record.caught)}</dd></div><div><dt>{tr("替换照片", "PHOTOS REPLACED")}</dt><dd>{record.overwritten ?? 0}</dd></div>
            <div><dt>{tr("保护次数", "TIMES PROTECTED")}</dt><dd>{record.protections ?? 0}</dd></div><div><dt>{tr("碰到几次", "HITS")}</dt><dd>{record.bumps}</dd></div>
          </dl>
          <p role="status">{shareMessage}</p>
          <div className="result-actions"><button onClick={saveCard}>{tr("保存这次记录", "Save this record")}</button><button onClick={shareCard}>{tr("分享结果", "SHARE RESULT")}</button></div>
          <button className="replay-memory" onClick={restartObservation}>{tr("再看一次", "Look again")}</button>
        </section>}
      </section>
    </main>
  );
}
