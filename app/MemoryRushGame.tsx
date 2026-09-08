"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import backgroundAUrl from "../game/assets/sunny-memory-corridor.webp";
import backgroundBUrl from "../game/assets/sunny-memory-corridor-b.webp";
import playerUrl from "../game/assets/traveler-run-back.png";
import photoUrl from "../game/assets/memory-photo.png";
import cartUrl from "../game/assets/memory-cart.png";
import riftUrl from "../game/assets/memory-rift.webp";
import bubbleUrl from "../game/assets/memory-bubble.webp";

const W = 1080;
const H = 1920;
const PLAYER_Y = 0.79;

type ItemKind = "photo" | "cart" | "bubble" | "rift";
type Item = { id: number; kind: ItemKind; x: number; y: number; speed: number; hit?: boolean };
type Trail = { x: number; at: number };
type RunStats = { caught: number; echoed: number; missed: number; bumps: number; dashes: number; rifts: number; maxCombo: number };
type MemoryRecord = RunStats & { score: number; version: "A" | "B"; tendency: string; run: number };
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
  stats: RunStats;
  photoWeight: number;
  cartWeight: number;
  bubbleWeight: number;
  trail: Trail[];
};

const emptyStats = (): RunStats => ({ caught: 0, echoed: 0, missed: 0, bumps: 0, dashes: 0, rifts: 0, maxCombo: 0 });
const makeRuntime = (previous?: MemoryRecord | null): Runtime => ({
  clock: 0, paused: false, drift: 0, effectUntil: 0, upgrade: null, offered: false,
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, memories: 0, version: "A", versionFade: 0,
  dashUntil: 0, shakeUntil: 0, portalQueued: false, startedAt: 0, shield: 0,
  stats: emptyStats(),
  photoWeight: previous?.missed ? Math.min(.75, .55 + previous.missed * .025) : .58,
  cartWeight: previous?.bumps ? Math.max(.12, .27 - previous.bumps * .018) : .26,
  bubbleWeight: previous?.bumps ? Math.min(.4, .28 + previous.bumps * .018) : .28,
  trail: [],
});

const getTendency = (stats: RunStats) => {
  if (stats.echoed >= 4) return "残影收藏家";
  if (stats.dashes >= 4) return "主动遗忘者";
  if (stats.bumps >= 3) return "跌撞考古员";
  if (stats.missed <= 2) return "记忆守门人";
  return "漂移旅行者";
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

export default function MemoryRushGame() {
  const [intro, setIntro] = useState(0);
  const [choice, setChoice] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(52);
  const [quiet, setQuiet] = useState(false);
  const quietRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [album, setAlbum] = useState<string[]>([]);
  const [best, setBest] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const chime = useCallback((frequency = 640) => {
    if (!soundRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.resume();
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.connect(gain); gain.connect(audio.destination);
    osc.frequency.setValueAtTime(frequency, audio.currentTime);
    gain.gain.setValueAtTime(.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .18);
    osc.start(); osc.stop(audio.currentTime + .2);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime());
  const assetsRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const pointerDown = useRef(false);
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

  useEffect(() => {
    let live = true;
    Promise.all([
      loadImage(backgroundAUrl), loadImage(backgroundBUrl), loadImage(playerUrl),
      loadImage(photoUrl), loadImage(cartUrl), loadImage(riftUrl), loadImage(bubbleUrl),
    ]).then(([backgroundA, backgroundB, player, photo, cart, rift, bubble]) => {
      if (!live) return;
      assetsRef.current = { backgroundA, backgroundB, player, photo, cart, rift, bubble };
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
    const fresh = makeRuntime(previous);
    fresh.started = true;
    fresh.lastSpawn = 0; fresh.startedAt = 0;
    fresh.items = [{ id: fresh.nextId++, kind: "photo", x: .5, y: .6, speed: .12 }, { id: fresh.nextId++, kind: "bubble", x: .38, y: .3, speed: .12 }];
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, memories: 0, version: "A" });
    setRecord(null); setStarted(true); setChoice(false); setPaused(false); setSeconds(52);
    setFeedback("左右拖动接照片 · 轻点相框泡泡");
  }, [previous]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, version: r.version, tendency: getTendency(r.stats), run: (previous?.run ?? 0) + 1 };
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
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("button,input,select,textarea")) return;
      if (!runtimeRef.current.started || runtimeRef.current.paused) return;
      if (event.key.startsWith("Arrow")) event.preventDefault();
      if (event.key === " " || event.key === "ArrowUp") { event.preventDefault(); dash(); return; }
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") runtimeRef.current.targetX -= 0.16;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") runtimeRef.current.targetX += 0.16;
      runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, runtimeRef.current.targetX));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dash]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let hudAt = 0;

    const tick = (wallNow: number) => {
      const canvas = canvasRef.current;
      const assets = assetsRef.current;
      if (!canvas || !assets) { frame = requestAnimationFrame(tick); return; }
      const ctx = canvas.getContext("2d")!;
      const r = runtimeRef.current;
      const dt = Math.min(0.05, (wallNow - previous) / 1000);
      previous = wallNow;
      if (r.started && !r.paused && !document.hidden) r.clock += dt * 1000;
      const now = r.clock;

      if (r.started && !r.paused && !document.hidden) {
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
          const kind: ItemKind = now < 6000 ? "photo" : roll < photoEdge ? "photo" : roll < cartEdge ? "cart" : "bubble";
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

        if (now >= 18000 && !r.offered) { r.offered = true; r.paused = true; setChoice(true); }
        setSeconds((old) => { const value = Math.max(0, Math.ceil((52000 - now) / 1000)); return old === value ? old : value; });

        if (now - r.startedAt >= 52000 || r.stats.rifts >= 3) finishRun();

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
        ctx.globalAlpha = (quietRef.current ? .05 : .22) * fade;
        const phase = quietRef.current ? 0 : Math.floor(now / 240);
        for (let strip = 0; strip < 12; strip++) {
          const x = (strip * 173 + phase * 31) % W;
          ctx.fillStyle = ["#263247", "#80e8e7", "#d5c5ec"][strip % 3];
          ctx.fillRect(x, 250, strip % 3 === 0 ? 18 : 4, 1250);
        }
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finishRun, chime]);

  const saveCard = useCallback(() => {
    if (!record) return;
    const card = document.createElement("canvas"); card.width = 1080; card.height = 1440;
    const c = card.getContext("2d")!; const g = c.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, "#5ee0ff"); g.addColorStop(.48, "#fff0a8"); g.addColorStop(1, "#ff8c67"); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
    c.fillStyle = "rgba(255,255,255,.84)"; c.roundRect(75, 80, 930, 1280, 52); c.fill(); c.fillStyle = "#173755";
    c.font = "800 34px sans-serif"; c.fillText(`MEMORY JOURNEY · RUN ${String(record.run).padStart(2,"0")}`, 130, 160);
    c.font = "900 76px sans-serif"; c.fillText("忘了自己是什么", 130, 280); c.font = "700 38px sans-serif"; c.fillStyle = "#ef704f"; c.fillText(record.tendency, 130, 360);
    c.fillStyle = "#173755"; c.font = "800 42px sans-serif";
    [["SCORE",record.score],["记住",record.caught],["残影补捡",record.echoed],["遗漏",record.missed],["碰撞",record.bumps],["主动遗忘",record.dashes]].forEach(([label,value],i)=>c.fillText(`${label}  ${value}`,130,500+i*105));
    c.font = "800 38px sans-serif"; c.fillText(`CURRENT VERSION  ${record.version}`,130,1190); c.font = "600 28px sans-serif"; c.fillText("下一次奔跑会继承这一次留下的偏差。",130,1270);
    const a = document.createElement("a"); a.download = `memory-journey-${record.run}.png`; a.href = card.toDataURL("image/png"); a.click();
  }, [record]);

  const shareCard = useCallback(async () => {
    if (!record) return;
    const text = `我的记忆身份：${record.tendency}｜${record.score} 分｜Version ${record.version}`;
    try {
      if (navigator.share) await navigator.share({ title: "忘了自己是什么", text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); setShareMessage("结算文字和网址已复制"); }
    } catch { setShareMessage("分享未完成，可以用保存记忆卡下载图片。"); }
  }, [record]);

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

  const chooseUpgrade = (upgrade: "magnet" | "echo" | "shield") => {
    const r = runtimeRef.current; r.upgrade = upgrade;
    if (upgrade === "shield") { r.shield = 3; r.drift = 0; }
    r.paused = false; setPaused(false); setChoice(false);
    setFeedback("带上新能力，追回剩下的夏天"); chime(880);
  };

  return (
    <main className="rush-page">
      <section className="rush-game" aria-label="记忆与遗忘竖屏游戏">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="滑动控制旅行者收集记忆照片"
          onPointerDown={(event) => { if (popBubble(event.clientX, event.clientY)) return; pointerDown.current = true; event.currentTarget.setPointerCapture(event.pointerId); movePointer(event.clientX); }}
          onPointerMove={(event) => { if (pointerDown.current) movePointer(event.clientX); }}
          onPointerUp={() => { pointerDown.current = false; }}
          onPointerCancel={() => { pointerDown.current = false; }}
        />

        <header className="rush-hud">
          <div><span>MEMORY</span><strong>{hud.memories}/6</strong></div>
          <div className="rush-title"><span>WHAT WAS I AGAIN?</span><strong>VERSION {hud.version}</strong></div>
          <div><span>SCORE</span><strong>{hud.score.toString().padStart(5, "0")}</strong></div>
        </header>

        <div className="rush-settings">
          <button aria-pressed={quiet} onClick={() => { quietRef.current = !quiet; setQuiet(!quiet); }}>视觉：{quiet ? "柔和" : "条纹"}</button>
          <button aria-pressed={sound} onClick={() => { if (!audioRef.current) audioRef.current = new AudioContext(); soundRef.current = !sound; setSound(!sound); void audioRef.current.resume(); }}>声音：{sound ? "开" : "关"}</button>
          {started && <button onClick={pauseGame} disabled={choice}>{paused ? "继续" : "暂停"}</button>}
        </div>
        {started && <><div className="combo-pill" data-active={hud.combo > 1}>{hud.combo > 1 ? `×${hud.combo} 记忆连击` : "接住漂走的照片"}</div>
          <div className="rush-journey"><span>{seconds > 34 ? "01 / 找回颜色" : seconds > 16 ? "02 / 过去的帮手" : "03 / 追回夏天"}</span><strong>{seconds}s</strong><progress max={52} value={52-seconds} aria-label="旅程进度" /></div>
          <div className="rush-feedback" role="status">{feedback}</div></>}

        {!started && !record && <div className="rush-intro">
          <span>一段正在消失的夏天 · 约一分钟</span>
          <h1>忘了自己是什么</h1>
          <div className={`intro-photo intro-photo-${intro}`}><img src={resolveImageUrl(photoUrl)} alt="通往夏日乐园的旧照片" /><i /></div>
          <p>{intro === 0 ? "旧手机里，只剩下这张照片。你记得那条街，却想不起一起去乐园的人。" : intro === 1 ? "你触碰照片。窗户变了，颜色正在消失……记得越用力，画面越不可靠。" : "相框泡泡正带着照片飘走。接住它们，找回颜色；丢掉一张记忆，可以冲过挡路的柜子。"}</p>
          {previous && intro === 0 && <div className="previous-memory"><b>最高 {best} 分</b><span>相册 {album.length}/6 · 上次留下了 {previous.caught} 张照片</span></div>}
          <button disabled={!ready} onClick={() => { if (intro < 2) setIntro(intro+1); else begin(); }}>{loadError ? "素材加载失败，请刷新页面" : !ready ? "正在装载记忆…" : intro === 0 ? "打开旧照片" : intro === 1 ? "追上漂走的相框" : "进入街道 · 找回 12 张照片"}</button>
          {loadError && <button onClick={() => location.reload()}>重新加载</button>}
          <small>{intro === 2 ? "拖动左右移动 · 点泡泡 · 空格或按钮冲刺" : "点击继续故事"}</small>
          {previous && <button className="rush-skip" disabled={!ready} onClick={begin}>跳过故事，直接出发</button>}
        </div>}

        {(choice || paused) && <section className="rush-choice" aria-label={choice ? "选择记忆能力" : "游戏已暂停"}>
          <span>{choice ? "口袋里腾出了一点空间" : "记忆已暂停"}</span><h2>{choice ? "这次，带走什么？" : "等你回来再出发"}</h2>
          {choice ? <><p>选择一个本局能力。时间已暂停。</p>
            <button onClick={() => chooseUpgrade("magnet")}><strong>照片磁铁</strong><span>附近的照片和泡泡会靠过来</span></button>
            <button onClick={() => chooseUpgrade("echo")}><strong>更清晰的昨天</strong><span>残影的补捡范围扩大</span></button>
            <button onClick={() => chooseUpgrade("shield")}><strong>彩色保护壳</strong><span>恢复颜色，获得 3 次保护</span></button></> : <button onClick={pauseGame}>继续旅程</button>}
        </section>}

        {started && <button className="forget-dash" disabled={hud.memories < 1} onClick={dash}>
          <span>遗忘 1 张</span><strong>冲刺</strong>
        </button>}

        {record && <section className="memory-result" aria-label="本局记忆旅程卡">
          <div className="result-kicker">MEMORY JOURNEY · RUN {String(record.run).padStart(2,"0")}</div>
          <h2>{record.tendency}</h2>
          <p>{record.caught >= 12 ? "12 张照片目标达成！这段夏天又清晰了一点。" : `带回了 ${record.caught} 张照片，再找 ${12-record.caught} 张就能达成收藏目标。`}</p>
          <div className="result-score"><span>SCORE</span><strong>{record.score}</strong><i>VERSION {record.version}</i></div>
          <dl>
            <div><dt>记住</dt><dd>{record.caught}</dd></div><div><dt>残影补捡</dt><dd>{record.echoed}</dd></div>
            <div><dt>遗漏</dt><dd>{record.missed}</dd></div><div><dt>碰撞</dt><dd>{record.bumps}</dd></div>
            <div><dt>主动遗忘</dt><dd>{record.dashes}</dd></div><div><dt>最高连击</dt><dd>×{record.maxCombo}</dd></div>
          </dl>
          <div className="result-note">个人最佳 {best} 分 · 夏日相册 {album.length}/6<br />{["第一张回忆", "满载而归", "过去的帮手", "轻装上路", "另一个夏天", "连成一段"].map(name => <span className="album-stamp" key={name} data-earned={album.includes(name)}>{album.includes(name) ? "✓ " : "○ "}{name}</span>)}<br />下个目标：{!album.includes("满载而归") ? "单局找回 12 张照片" : !album.includes("过去的帮手") ? "让残影补捡 3 张照片" : !album.includes("轻装上路") ? "使用 3 次遗忘冲刺" : !album.includes("另一个夏天") ? "穿过一次记忆裂隙" : "挑战 5 连击与个人最佳"}</div>
          <p role="status">{shareMessage}</p>
          <div className="result-actions"><button onClick={saveCard}>保存记忆卡</button><button onClick={shareCard}>分享结果</button></div>
          <button className="replay-memory" onClick={begin}>带着这段记忆再跑一次</button>
        </section>}
      </section>
    </main>
  );
}

