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

type ItemKind = "photo" | "cart" | "rift";
type Item = { id: number; kind: ItemKind; x: number; y: number; speed: number; hit?: boolean };
type Trail = { x: number; at: number };
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
  trail: Trail[];
};

const makeRuntime = (): Runtime => ({
  started: false, x: 0.5, targetX: 0.5, items: [], nextId: 1, lastSpawn: 0,
  score: 0, combo: 0, memories: 0, version: "A", versionFade: 0,
  dashUntil: 0, shakeUntil: 0, portalQueued: false, trail: [],
});

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

  const begin = useCallback(() => {
    const fresh = makeRuntime();
    fresh.started = true;
    fresh.lastSpawn = performance.now();
    runtimeRef.current = fresh;
    setHud({ score: 0, combo: 0, memories: 0, version: "A" });
    setStarted(true);
  }, []);

  const dash = useCallback(() => {
    const r = runtimeRef.current;
    if (!r.started || r.memories <= 0 || performance.now() < r.dashUntil) return;
    r.memories -= 1;
    r.dashUntil = performance.now() + 760;
    r.score += 25;
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
          const cartChance = Math.min(0.35, 0.18 + r.score / 18000);
          r.items.push({ id: r.nextId++, kind: Math.random() < cartChance ? "cart" : "photo", x: lane, y: 0.08, speed: 0.21 + Math.min(0.11, r.score / 30000) });
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
          } else if (item.kind === "cart" && playerHit) {
            item.hit = true;
            if (now < r.dashUntil) r.score += 180;
            else if (r.memories > 0) { r.memories -= 1; r.combo = 0; r.shakeUntil = now + 280; }
            else { r.combo = 0; r.shakeUntil = now + 420; }
          } else if (item.kind === "rift" && playerHit) {
            item.hit = true;
            r.version = r.version === "A" ? "B" : "A";
            r.versionFade = 1;
            r.memories = 0;
            r.combo += 3;
            r.score += 1000;
            r.portalQueued = false;
            r.items = [];
            r.lastSpawn = now + 400;
          }
        });
        r.items = r.items.filter((item) => !item.hit && item.y < 1.08);
        r.versionFade = Math.max(0, r.versionFade - dt * 1.7);

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
          if (item.kind === "rift") {
            ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.95;
            ctx.drawImage(assets.rift, item.x * W - 220 * scale, item.y * H - 220 * scale, 440 * scale, 440 * scale);
            ctx.restore();
          }
        });

        if (r.memories > 0) {
          const pulse = 1 + Math.sin(now * 0.008) * 0.025;
          ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.55 + r.memories * 0.055;
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
  }, []);

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

        {started && <div className="combo-pill" data-active={hud.combo > 1}>{hud.combo > 1 ? `×${hud.combo} 记忆连击` : "残影会帮你补捡"}</div>}

        {!started && <div className="rush-intro">
          <span>记忆轻冒险 · 单手可玩</span>
          <h1>忘了自己是什么</h1>
          <p>滑动奔跑，收集照片。过去的你会沿着刚才的路线再次出现。</p>
          <button disabled={!ready} onClick={begin}>{ready ? "开始追逐记忆" : "正在装载记忆…"}</button>
          <small>拖动移动 · 点击下方按钮发动遗忘冲刺</small>
        </div>}

        {started && <button className="forget-dash" disabled={hud.memories < 1} onClick={dash}>
          <span>遗忘 1 张</span><strong>冲刺</strong>
        </button>}
      </section>
    </main>
  );
}

