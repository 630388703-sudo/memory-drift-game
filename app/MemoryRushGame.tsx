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
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, memories: 0, version: "A", versionFade: 0,
  dashUntil: 0, shakeUntil: 0, portalQueued: false, startedAt: 0, shield: 0,
  stats: emptyStats(),
  photoWeight: previous?.missed ? Math.min(.75, .55 + previous.missed * .025) : .58,
  cartWeight: previous?.bumps ? Math.max(.12, .27 - previous.bumps * .018) : .26,
  bubbleWeight: previous?.bumps ? Math.min(.25, .16 + previous.bumps * .018) : .16,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime());
  const assetsRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const pointerDown = useRef(false);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [record, setRecord] = useState<MemoryRecord | null>(null);
  const [previous, setPrevious] = useState<MemoryRecord | null>(null);
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
    }).catch(() => setReady(false));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("memory-rush-record");
      if (saved) setPrevious(JSON.parse(saved));
    } catch { /* a private browser may block local storage */ }
  }, []);

  const begin = useCallback(() => {
    const fresh = makeRuntime(previous);
    fresh.started = true;
    fresh.lastSpawn = performance.now(); fresh.startedAt = fresh.lastSpawn;
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, memories: 0, version: "A" });
    setRecord(null); setStarted(true);
    setFeedback(previous ? "上一段记忆正在改变事件池" : "过去的你会帮忙补捡");
  }, [previous]);

  const finishRun = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started) return;
    r.started = false;
    const next: MemoryRecord = { ...r.stats, score: r.score, version: r.version, tendency: getTendency(r.stats), run: (previous?.run ?? 0) + 1 };
    try { localStorage.setItem("memory-rush-record", JSON.stringify(next)); } catch { /* optional persistence */ }
    setPrevious(next); setRecord(next); setStarted(false);
  }, [previous]);

  const dash = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || r.memories <= 0 || performance.now() < r.dashUntil) return;
    r.memories -= 1;
    r.dashUntil = performance.now() + 760;
    r.score += 25;
    r.stats.dashes += 1;
    setFeedback("你主动丢掉一张记忆，换来短暂加速");
  }, []);

  const movePointer = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    runtimeRef.current.targetX = Math.max(0.22, Math.min(0.78, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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

    const tick = (now: number) => {
      const canvas = canvasRef.current;
      const assets = assetsRef.current;
      if (!canvas || !assets) { frame = requestAnimationFrame(tick); return; }
      const ctx = canvas.getContext("2d")!;
      const r = runtimeRef.current;
      const dt = Math.min(0.034, (now - previous) / 1000);
      previous = now;

      if (r.started) {
        r.targetX = Math.max(0.22, Math.min(0.78, r.targetX));
        r.x += (r.targetX - r.x) * Math.min(1, dt * 12);
        r.trail.push({ x: r.x, at: now });
        r.trail = r.trail.filter((p) => now - p.at < 1350);

        const spawnGap = Math.max(510, 820 - Math.min(240, r.score / 30));
        if (now - r.lastSpawn > spawnGap && !r.portalQueued) {
          const lanes = [0.3, 0.42, 0.58, 0.7];
          const lane = lanes[Math.floor(Math.random() * lanes.length)];
          const roll = Math.random();
          const total = r.photoWeight + r.cartWeight + r.bubbleWeight;
          const photoEdge = r.photoWeight / total;
          const cartEdge = photoEdge + r.cartWeight / total;
          const kind: ItemKind = roll < photoEdge ? "photo" : roll < cartEdge ? "cart" : "bubble";
          r.items.push({ id: r.nextId++, kind, x: lane, y: 0.08, speed: 0.21 + Math.min(0.11, r.score / 30000) });
          r.lastSpawn = now;
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
          item.y += item.speed * dt;
          if (item.hit || item.y < PLAYER_Y - 0.07 || item.y > PLAYER_Y + 0.09) return;
          const playerHit = Math.abs(item.x - r.x) < (item.kind === "cart" ? 0.115 : 0.08);
          const echoHit = item.kind === "photo" && echoes.some((x) => Math.abs(item.x - x) < 0.065);
          if (item.kind === "photo" && (playerHit || echoHit)) {
            item.hit = true;
            r.combo += 1;
            r.memories = Math.min(6, r.memories + 1);
            r.score += (echoHit ? 80 : 100) * Math.min(8, r.combo);
            r.stats.caught += 1; if (echoHit) r.stats.echoed += 1;
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
              r.combo = 0; r.shakeUntil = now + (r.memories > 0 ? 280 : 420); setFeedback("撞击让事件池变得更温柔");
            }
          } else if (item.kind === "bubble" && playerHit) {
            item.hit = true; r.shield = Math.min(2, r.shield + 1); r.score += 120;
            setFeedback("获得一次记忆保护");
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
          if (!item.hit && item.kind === "photo" && item.y >= 1.02) {
            item.hit = true; r.stats.missed += 1; r.combo = 0;
            r.photoWeight = Math.min(.75, r.photoWeight + .024);
            setFeedback("漏掉的照片，下轮更容易再次出现");
          }
        });
        r.items = r.items.filter((item) => !item.hit && item.y < 1.08);
        r.versionFade = Math.max(0, r.versionFade - dt * 1.7);

        if (now - r.startedAt >= 52000 || r.stats.rifts >= 3) finishRun();

        if (now - hudAt > 90) {
          hudAt = now;
          setHud({ score: r.score, combo: r.combo, memories: r.memories, version: r.version });
        }
      }

      const shake = now < r.shakeUntil ? Math.sin(now * 0.09) * 12 : 0;
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
          const scale = 0.46 + item.y * 0.72;
          if (item.kind === "photo") cropDraw(ctx, assets.photo, [284, 232, 742, 758], item.x * W, item.y * H, 112 * scale, 115 * scale);
          if (item.kind === "cart") cropDraw(ctx, assets.cart, [203, 190, 862, 882], item.x * W, item.y * H, 238 * scale, 244 * scale);
          if (item.kind === "bubble") {
            ctx.save(); ctx.globalCompositeOperation = "screen";
            ctx.drawImage(assets.bubble, item.x * W - 78 * scale, item.y * H - 78 * scale, 156 * scale, 156 * scale); ctx.restore();
          }
          if (item.kind === "rift") {
            ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.95;
            ctx.drawImage(assets.rift, item.x * W - 220 * scale, item.y * H - 220 * scale, 440 * scale, 440 * scale);
            ctx.restore();
          }
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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finishRun]);

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
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); setFeedback("结算文字和网址已复制"); }
    } catch { /* sharing may be cancelled */ }
  }, [record]);

  return (
    <main className="rush-page">
      <section className="rush-game" aria-label="记忆与遗忘竖屏游戏">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="滑动控制旅行者收集记忆照片"
          onPointerDown={(event) => { pointerDown.current = true; event.currentTarget.setPointerCapture(event.pointerId); movePointer(event.clientX); }}
          onPointerMove={(event) => { if (pointerDown.current) movePointer(event.clientX); }}
          onPointerUp={() => { pointerDown.current = false; }}
          onPointerCancel={() => { pointerDown.current = false; }}
        />

        <header className="rush-hud">
          <div><span>MEMORY</span><strong>{hud.memories}/6</strong></div>
          <div className="rush-title"><span>WHAT WAS I AGAIN?</span><strong>VERSION {hud.version}</strong></div>
          <div><span>SCORE</span><strong>{hud.score.toString().padStart(5, "0")}</strong></div>
        </header>

        {started && <div className="combo-pill" data-active={hud.combo > 1}>{hud.combo > 1 ? `×${hud.combo} 记忆连击` : feedback}</div>}

        {!started && <div className="rush-intro">
          <span>记忆轻冒险 · 单手可玩</span>
          <h1>忘了自己是什么</h1>
          <p>滑动奔跑，收集照片。过去的你会沿着刚才的路线再次出现。</p>
          {previous && <div className="previous-memory"><b>上一局：{previous.tendency}</b><span>漏掉 {previous.missed} 张 · 本局事件已经重加权</span></div>}
          <button disabled={!ready} onClick={begin}>{ready ? "开始追逐记忆" : "正在装载记忆…"}</button>
          <small>拖动移动 · 点击下方按钮发动遗忘冲刺</small>
        </div>}

        {started && <button className="forget-dash" disabled={hud.memories < 1} onClick={dash}>
          <span>遗忘 1 张</span><strong>冲刺</strong>
        </button>}

        {record && <section className="memory-result" aria-label="本局记忆旅程卡">
          <div className="result-kicker">MEMORY JOURNEY · RUN {String(record.run).padStart(2,"0")}</div>
          <h2>{record.tendency}</h2>
          <p>这不是评分，而是这一局留下的玩法偏差。</p>
          <div className="result-score"><span>SCORE</span><strong>{record.score}</strong><i>VERSION {record.version}</i></div>
          <dl>
            <div><dt>记住</dt><dd>{record.caught}</dd></div><div><dt>残影补捡</dt><dd>{record.echoed}</dd></div>
            <div><dt>遗漏</dt><dd>{record.missed}</dd></div><div><dt>碰撞</dt><dd>{record.bumps}</dd></div>
            <div><dt>主动遗忘</dt><dd>{record.dashes}</dd></div><div><dt>最高连击</dt><dd>×{record.maxCombo}</dd></div>
          </dl>
          <div className="result-note">下一次奔跑会继承本局偏差：漏掉越多，相似照片越会回来；碰撞越多，保护泡泡越常出现。</div>
          <div className="result-actions"><button onClick={saveCard}>保存记忆卡</button><button onClick={shareCard}>分享结果</button></div>
          <button className="replay-memory" onClick={begin}>带着这段记忆再跑一次</button>
        </section>}
      </section>
    </main>
  );
}

