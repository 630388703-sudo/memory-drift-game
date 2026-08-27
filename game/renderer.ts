import { GAME_CONFIG, type BodySlot, type GameStage, type Language, type PartId } from "./config";
import type { BehaviorStats, BodyBuild } from "./session";

export type ScenePoint = { x: number; y: number };
export type ChaseEntity = ScenePoint & { id: string; kind: string; correct?: boolean; fake?: boolean; phase?: number };
export type MemoryPlatform = { id: string; x: number; y: number; w: number; kind: "base" | "trace" | "rescue" | "creature"; bornAt?: number; expiresAt?: number; stolen?: boolean };

export type RenderModel = {
  stage: GameStage; lang: Language; now: number; stageTime: number; reducedMotion: boolean;
  player: ScenePoint & { vy?: number; grounded?: boolean; facing?: number };
  creature: ScenePoint & { mood?: "curious" | "panic" | "proud" | "confused" };
  inheritedVisible: boolean; nearestObject: string | null; inspected: string[]; findTarget: string;
  chaseRound: number; chaseEntities: ChaseEntity[]; chaseHint: boolean;
  cameraY: number; platforms: MemoryPlatform[];
  soundRound: number; soundSelected: number; soundPhase: "listen" | "choose" | "feedback"; soundFlash: number;
  body: BodyBuild; assembleSlot: BodySlot; assemblePart: PartId;
  stats: BehaviorStats; dominant: string[];
};

const W = 1080;
const H = 1920;
const COLORS = {
  ink: "#263c3b", paper: "#f4f1df", mist: "#dce9e3", blue: "#67bdd0", blueDark: "#32859b",
  moss: "#789b72", yellow: "#e7bd55", coral: "#e48b72", purple: "#a88ac4", wood: "#9d7c58", white: "#fffdf2",
};

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 24) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = COLORS.ink, width = 5) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, now: number, color = COLORS.blue, alpha = 0.92) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i <= 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const ripple = 1 + Math.sin(a * 3 + now * 0.002) * 0.055 + Math.sin(a * 5 - now * 0.0014) * 0.035;
    const px = Math.cos(a) * size * ripple;
    const py = Math.sin(a) * size * 0.78 * ripple;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = COLORS.white; ctx.shadowColor = COLORS.white; ctx.shadowBlur = 15;
  ctx.beginPath(); ctx.arc(-size * 0.24, -size * 0.08, Math.max(5, size * 0.075), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.13, -size * 0.1, Math.max(5, size * 0.075), 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  line(ctx, size * 0.55, -size * 0.45, size * 0.86, -size * 0.76, COLORS.blueDark, Math.max(3, size * 0.045));
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, facing = 1, bounce = 0) {
  ctx.save(); ctx.translate(x, y + bounce); ctx.scale(facing, 1); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.fillStyle = "#f1c868"; ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 6 * scale;
  ctx.beginPath(); ctx.ellipse(0, -76 * scale, 52 * scale, 32 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COLORS.moss; rounded(ctx, -35 * scale, -52 * scale, 70 * scale, 104 * scale, 28 * scale); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#d59259"; rounded(ctx, 28 * scale, -36 * scale, 47 * scale, 76 * scale, 15 * scale); ctx.fill(); ctx.stroke();
  line(ctx, -18 * scale, 48 * scale, -28 * scale, 94 * scale, COLORS.ink, 10 * scale);
  line(ctx, 18 * scale, 48 * scale, 34 * scale, 93 * scale, COLORS.ink, 10 * scale);
  line(ctx, -36 * scale, -20 * scale, -65 * scale, 22 * scale, COLORS.ink, 9 * scale);
  line(ctx, 33 * scale, -20 * scale, 63 * scale, 13 * scale, COLORS.ink, 9 * scale);
  ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(-15 * scale, -74 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6 * scale, -75 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, scale: number, now: number, creature = false, fake = false) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5 * scale; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (kind.includes("chair")) {
    ctx.fillStyle = creature ? COLORS.blue : "#d7b582"; rounded(ctx, -34 * scale, -22 * scale, 68 * scale, 52 * scale, 9); ctx.fill(); ctx.stroke();
    line(ctx, -27 * scale, 28 * scale, -34 * scale, 72 * scale, COLORS.ink, 5 * scale); line(ctx, 27 * scale, 28 * scale, 34 * scale, 72 * scale, COLORS.ink, 5 * scale);
    line(ctx, -31 * scale, -22 * scale, -31 * scale, -70 * scale, COLORS.ink, 6 * scale); line(ctx, 31 * scale, -22 * scale, 31 * scale, -70 * scale, COLORS.ink, 6 * scale);
  } else if (kind.includes("box")) {
    ctx.fillStyle = creature ? COLORS.blue : "#d9b27b"; rounded(ctx, -48 * scale, -45 * scale, 96 * scale, 90 * scale, 8); ctx.fill(); ctx.stroke(); line(ctx, -48 * scale, -8 * scale, 48 * scale, -8 * scale, COLORS.ink, 4 * scale);
  } else if (kind.includes("ball")) {
    ctx.fillStyle = creature ? COLORS.blue : COLORS.coral; ctx.beginPath(); ctx.arc(0, 0, 43 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 22 * scale, -1.1, 1.1); ctx.stroke();
  } else if (kind.includes("umbrella")) {
    ctx.fillStyle = creature ? COLORS.blue : COLORS.yellow; ctx.beginPath(); ctx.arc(0, 0, 66 * scale, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); line(ctx, 0, 0, 0, 75 * scale, COLORS.ink, 5 * scale); ctx.beginPath(); ctx.arc(-14 * scale, 74 * scale, 15 * scale, 0, Math.PI); ctx.stroke();
  } else if (kind.includes("bucket")) {
    ctx.fillStyle = creature ? COLORS.blue : "#a7c8b7"; ctx.beginPath(); ctx.moveTo(-45 * scale, -38 * scale); ctx.lineTo(36 * scale, -38 * scale); ctx.lineTo(28 * scale, 44 * scale); ctx.lineTo(-34 * scale, 44 * scale); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -35 * scale, 55 * scale, Math.PI, 0); ctx.stroke();
  } else if (kind.includes("scarf")) {
    ctx.fillStyle = COLORS.coral; ctx.beginPath(); ctx.moveTo(-46 * scale, -60 * scale); ctx.bezierCurveTo(42 * scale, -42 * scale, -22 * scale, 10 * scale, 42 * scale, 72 * scale); ctx.lineTo(5 * scale, 81 * scale); ctx.bezierCurveTo(-45 * scale, 18 * scale, 22 * scale, -25 * scale, -58 * scale, -32 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind.includes("lamp")) {
    ctx.fillStyle = Math.sin(now * 0.01) > 0 ? COLORS.yellow : "#d8d2a4"; ctx.beginPath(); ctx.arc(0, -18 * scale, 42 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); line(ctx, 0, 24 * scale, 0, 74 * scale, COLORS.ink, 8 * scale); line(ctx, -32 * scale, 76 * scale, 32 * scale, 76 * scale, COLORS.ink, 8 * scale);
  } else if (kind.includes("broom")) {
    line(ctx, 20 * scale, -90 * scale, -10 * scale, 42 * scale, COLORS.wood, 12 * scale); ctx.fillStyle = "#d4af6f"; ctx.beginPath(); ctx.moveTo(-45 * scale, 35 * scale); ctx.lineTo(20 * scale, 29 * scale); ctx.lineTo(42 * scale, 92 * scale); ctx.lineTo(-65 * scale, 92 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (creature || fake) {
    ctx.fillStyle = COLORS.white; ctx.beginPath(); ctx.arc(-14 * scale, -5 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(12 * scale, -5 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill();
    line(ctx, 38 * scale, -53 * scale, 62 * scale, -76 * scale, fake ? COLORS.purple : COLORS.blueDark, 5 * scale);
  }
  ctx.restore();
}

function drawBodyPart(ctx: CanvasRenderingContext2D, part: PartId | undefined, slot: BodySlot, x: number, y: number, scale: number, now: number) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 6 * scale; ctx.lineCap = "round";
  const p = part ?? "cloud";
  if (p === "cloud") {
    ctx.fillStyle = "#dbe8e3"; [-24, 0, 24].forEach((dx, i) => { ctx.beginPath(); ctx.arc(dx * scale, (i % 2) * -8 * scale, (28 - i * 2) * scale, 0, Math.PI * 2); ctx.fill(); });
  } else if (p === "spring") {
    ctx.strokeStyle = COLORS.coral; ctx.beginPath(); for (let i = 0; i < 7; i += 1) { const px = (i % 2 ? 22 : -22) * scale; const py = (i - 3) * 14 * scale; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
  } else if (p === "horn") {
    ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.moveTo(-42 * scale, -25 * scale); ctx.lineTo(37 * scale, -55 * scale); ctx.lineTo(37 * scale, 55 * scale); ctx.lineTo(-42 * scale, 25 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (p === "leaf") {
    ctx.fillStyle = COLORS.moss; ctx.beginPath(); ctx.moveTo(0, -60 * scale); ctx.bezierCurveTo(55 * scale, -27 * scale, 50 * scale, 42 * scale, 0, 65 * scale); ctx.bezierCurveTo(-46 * scale, 30 * scale, -50 * scale, -28 * scale, 0, -60 * scale); ctx.fill(); ctx.stroke(); line(ctx, 0, -48 * scale, 0, 52 * scale, "#557750", 4 * scale);
  } else if (p === "bulb") {
    ctx.save(); ctx.shadowColor = COLORS.yellow; ctx.shadowBlur = 25 + Math.sin(now * 0.01) * 8; ctx.fillStyle = COLORS.yellow; ctx.beginPath(); ctx.arc(0, -8 * scale, 42 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore(); rounded(ctx, -22 * scale, 28 * scale, 44 * scale, 28 * scale, 5); ctx.stroke();
  } else {
    ctx.strokeStyle = COLORS.purple; ctx.beginPath(); ctx.moveTo(0, -58 * scale); ctx.bezierCurveTo(-35 * scale, -22 * scale, 34 * scale, 10 * scale, 0, 63 * scale); ctx.stroke();
  }
  ctx.restore();
}

function drawBuiltCreature(ctx: CanvasRenderingContext2D, x: number, y: number, body: BodyBuild, now: number, scale = 1, active = false) {
  const bounce = active ? Math.abs(Math.sin(now * 0.004)) * -24 : 0;
  ctx.save(); ctx.translate(x, y + bounce);
  drawBodyPart(ctx, body.legs, "legs", 0, 100 * scale, scale * 0.95, now);
  drawBodyPart(ctx, body.body, "body", 0, 0, scale * 1.35, now);
  drawBodyPart(ctx, body.leftArm, "leftArm", -92 * scale, 5 * scale, scale * 0.75, now);
  drawBodyPart(ctx, body.rightArm, "rightArm", 92 * scale, 5 * scale, scale * 0.75, now);
  drawBodyPart(ctx, body.head, "head", 0, -112 * scale, scale, now);
  ctx.fillStyle = COLORS.white; ctx.shadowColor = COLORS.white; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(-17 * scale, -116 * scale, 7 * scale, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(14 * scale, -118 * scale, 7 * scale, 0, Math.PI * 2); ctx.fill();
  line(ctx, 45 * scale, -153 * scale, 75 * scale, -181 * scale, COLORS.blueDark, 6 * scale);
  ctx.restore();
}

function baseBackground(ctx: CanvasRenderingContext2D, now: number, stage: GameStage, reducedMotion: boolean) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#dbe9df"); gradient.addColorStop(0.55, "#eef0df"); gradient.addColorStop(1, "#e6d8ba");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.2; ctx.fillStyle = COLORS.blue;
  for (let i = 0; i < 14; i += 1) {
    const drift = reducedMotion ? 0 : Math.sin(now * 0.00018 + i) * 38;
    ctx.beginPath(); ctx.arc((i * 173 + 90) % W + drift, 160 + ((i * 311) % 1480), 90 + (i % 4) * 38, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.08; ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 2;
  for (let y = 18; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + Math.sin(y) * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (stage !== "platform") {
    ctx.fillStyle = "rgba(255,253,242,.58)"; rounded(ctx, 46, 210, 988, 1480, 54); ctx.fill();
  }
}

function room(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 165);
  ctx.fillStyle = "#e6dcc3"; ctx.fillRect(70, 180, 940, 1110);
  ctx.fillStyle = "#b9d4cc"; for (let i = 0; i < 3; i += 1) { rounded(ctx, 135 + i * 265, 220, 210, 330, 10); ctx.fill(); }
  ctx.fillStyle = "#8ca485"; ctx.fillRect(70, 1040, 940, 250);
  line(ctx, 70, 1025, 1010, 1025, COLORS.ink, 6);
  GAME_CONFIG.roomObjects.forEach((object, index) => {
    const isTarget = object.id === m.findTarget;
    const selected = object.id === m.nearestObject;
    const wobble = m.stage === "dormant" ? Math.sin(m.now * 0.002 + index) * 3 : Math.sin(m.now * 0.003 + index) * 6;
    if (selected) { ctx.fillStyle = "rgba(231,189,85,.24)"; ctx.beginPath(); ctx.arc(object.x * W, 230 + object.y * 1000, 92, 0, Math.PI * 2); ctx.fill(); }
    drawProp(ctx, object.kind, object.x * W, 230 + object.y * 1000 + wobble, 1.1, m.now, m.stage === "find" && isTarget && m.inspected.includes(object.id));
  });
  if (m.inheritedVisible) { ctx.globalAlpha = 0.22; blob(ctx, 870, 1160, 58, m.now, COLORS.blue); ctx.globalAlpha = 1; }
  if (m.stage === "find") drawPlayer(ctx, m.player.x * W, 235 + m.player.y * 1000, 1, m.player.facing);
  ctx.restore();
}

function courtyard(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 160);
  ctx.fillStyle = "#cfddc8"; rounded(ctx, 78, 150, 924, 1190, 48); ctx.fill();
  ctx.strokeStyle = "rgba(38,60,59,.17)"; ctx.lineWidth = 4;
  for (let i = 0; i < 9; i += 1) { ctx.beginPath(); ctx.arc(540, 750, 130 + i * 75, 0, Math.PI * 2); ctx.stroke(); }
  m.chaseEntities.forEach((entity, index) => {
    const bob = Math.sin(m.now * 0.002 + (entity.phase ?? index)) * (entity.correct && m.chaseRound === 1 ? 12 : 5);
    if (entity.correct && m.chaseHint) { ctx.strokeStyle = COLORS.yellow; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(entity.x * W, 170 + entity.y * 1120, 84 + Math.sin(m.now * 0.008) * 12, 0, Math.PI * 2); ctx.stroke(); }
    drawProp(ctx, entity.kind, entity.x * W, 170 + entity.y * 1120 + bob, 0.86, m.now, !!entity.correct, !!entity.fake);
  });
  drawPlayer(ctx, m.player.x * W, 170 + m.player.y * 1120, 0.88, m.player.facing);
  ctx.restore();
}

function platformScene(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.fillStyle = "#b9d4cb"; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 6; i += 1) { ctx.fillStyle = i % 2 ? COLORS.paper : COLORS.moss; ctx.fillRect(i * 205 - 90, 0, 150, H); }
  ctx.globalAlpha = 1;
  const worldToY = (y: number) => H - 300 - (y - m.cameraY) * 250;
  m.platforms.forEach((p) => {
    const y = worldToY(p.y); if (y < -120 || y > H + 120) return;
    const alpha = p.kind === "trace" ? 0.65 : p.kind === "rescue" ? 0.9 : 1;
    ctx.save(); ctx.globalAlpha = p.stolen ? 0.25 : alpha; ctx.fillStyle = p.kind === "base" ? COLORS.paper : p.kind === "rescue" ? COLORS.yellow : COLORS.blue;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = p.kind === "trace" ? 28 : 8;
    rounded(ctx, (p.x - p.w / 2) * W, y, p.w * W, 34, 14); ctx.fill();
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
  });
  const py = worldToY(m.player.y); drawPlayer(ctx, m.player.x * W, py - 95, 0.78, m.player.facing, m.player.grounded ? Math.sin(m.now * 0.008) * 2 : 0);
  const cy = worldToY(m.creature.y); blob(ctx, m.creature.x * W, cy - 48, 48, m.now);
  ctx.strokeStyle = "rgba(255,253,242,.28)"; ctx.lineWidth = 5; ctx.setLineDash([16, 20]); ctx.beginPath(); ctx.moveTo(540, H); ctx.lineTo(540, 0); ctx.stroke(); ctx.setLineDash([]);
}

function soundScene(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 190);
  ctx.fillStyle = "#bfd7d0"; rounded(ctx, 95, 130, 890, 1160, 54); ctx.fill();
  for (let i = 0; i < 5; i += 1) { ctx.strokeStyle = `rgba(38,60,59,${0.1 + i * 0.025})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(540, 600, 120 + i * 75 + Math.sin(m.now * 0.003 + i) * 12, 0, Math.PI * 2); ctx.stroke(); }
  blob(ctx, 540, 460, 92, m.now, COLORS.blue, 0.94);
  const round = GAME_CONFIG.soundRounds[Math.min(m.soundRound, 2)];
  const gap = 150; const start = 540 - ((round.notes.length - 1) * gap) / 2;
  round.notes.forEach((_, index) => {
    const active = m.soundFlash === index; const selected = m.soundSelected === index;
    ctx.fillStyle = active ? (m.soundPhase === "listen" ? COLORS.moss : COLORS.yellow) : selected ? "#fff8d6" : "rgba(255,253,242,.55)";
    ctx.strokeStyle = selected ? COLORS.ink : "rgba(38,60,59,.35)"; ctx.lineWidth = selected ? 8 : 4;
    ctx.beginPath(); ctx.arc(start + index * gap, 930, active ? 58 : 46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.ink; ctx.font = "600 28px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(index + 1).padStart(2, "0"), start + index * gap, 940);
  });
  ctx.restore();
}

function assemblyScene(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 160);
  ctx.fillStyle = "#e6dcc3"; rounded(ctx, 70, 130, 940, 1240, 48); ctx.fill();
  ctx.strokeStyle = "rgba(38,60,59,.2)"; ctx.lineWidth = 3; for (let i = 0; i < 6; i += 1) line(ctx, 110, 260 + i * 170, 970, 260 + i * 170, "rgba(38,60,59,.15)", 3);
  drawBuiltCreature(ctx, 540, 680, m.body, m.now, 1.35, false);
  const slotPositions: Record<BodySlot, [number, number]> = { head: [540, 458], body: [540, 670], leftArm: [365, 680], rightArm: [715, 680], legs: [540, 868] };
  Object.entries(slotPositions).forEach(([slot, [x, y]]) => {
    const active = slot === m.assembleSlot; ctx.strokeStyle = active ? COLORS.yellow : "rgba(38,60,59,.28)"; ctx.lineWidth = active ? 9 : 4; ctx.setLineDash(active ? [] : [14, 12]); ctx.beginPath(); ctx.arc(x, y, active ? 86 : 72, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.setLineDash([]); ctx.fillStyle = "rgba(255,253,242,.72)"; rounded(ctx, 150, 1040, 780, 180, 28); ctx.fill(); ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5; ctx.stroke();
  const part = GAME_CONFIG.parts.find((p) => p.id === m.assemblePart)!; ctx.fillStyle = COLORS.ink; ctx.textAlign = "center"; ctx.font = "72px serif"; ctx.fillText(part.symbol, 540, 1124); ctx.font = "600 30px ui-sans-serif, sans-serif"; ctx.fillText(m.lang === "zh" ? part.zh : part.en, 540, 1176);
  ctx.restore();
}

function trialScene(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 160);
  ctx.fillStyle = "#c9dec5"; rounded(ctx, 70, 150, 940, 1150, 54); ctx.fill();
  ctx.fillStyle = "rgba(255,253,242,.6)"; ctx.beginPath(); ctx.ellipse(540, 1060, 350, 110, 0, 0, Math.PI * 2); ctx.fill();
  const walkX = 350 + ((m.stageTime / 1000) % 8) / 8 * 380;
  drawBuiltCreature(ctx, walkX, 835, m.body, m.now, 1.5, true);
  drawProp(ctx, "ball", 785, 945, 0.78, m.now);
  ctx.restore();
}

function reportScene(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.save(); ctx.translate(0, 180);
  ctx.fillStyle = "#efe7d0"; rounded(ctx, 70, 80, 940, 1330, 36); ctx.fill(); ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = COLORS.ink; ctx.font = "700 26px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.fillText("FIRST OBSERVED FORM", 130, 190); ctx.fillText("CURRENT LEARNED FORM", 570, 190);
  ctx.strokeStyle = "rgba(38,60,59,.3)"; ctx.setLineDash([10, 12]); line(ctx, 530, 155, 530, 800, "rgba(38,60,59,.25)", 4); ctx.setLineDash([]);
  blob(ctx, 300, 490, 105, m.now, COLORS.blue, 0.7); drawBuiltCreature(ctx, 765, 520, m.body, m.now, 1.2, true);
  ctx.fillStyle = "#fffaf0"; rounded(ctx, 115, 860, 850, 390, 28); ctx.fill();
  ctx.fillStyle = COLORS.ink; ctx.font = "700 30px ui-monospace, monospace"; ctx.fillText("ORIGINAL FORM: UNVERIFIABLE", 155, 940);
  const labels = m.lang === "zh" ? ["动作", "观察", "回声", "痕迹"] : ["MOTION", "ATTENTION", "ECHO", "TRACE"];
  const values = [m.stats.motion, m.stats.attention, m.stats.echo, m.stats.trace];
  labels.forEach((label, i) => {
    ctx.font = "600 24px ui-sans-serif, sans-serif"; ctx.fillText(label, 155, 1020 + i * 55);
    ctx.fillStyle = "#d8ddca"; rounded(ctx, 330, 996 + i * 55, 500, 22, 11); ctx.fill();
    ctx.fillStyle = i % 2 ? COLORS.moss : COLORS.blue; rounded(ctx, 330, 996 + i * 55, Math.min(500, 40 + values[i] * 24), 22, 11); ctx.fill(); ctx.fillStyle = COLORS.ink;
  });
  ctx.restore();
}

export function renderGame(ctx: CanvasRenderingContext2D, model: RenderModel) {
  ctx.clearRect(0, 0, W, H); baseBackground(ctx, model.now, model.stage, model.reducedMotion);
  if (model.stage === "dormant" || model.stage === "find") room(ctx, model);
  else if (model.stage === "chase") courtyard(ctx, model);
  else if (model.stage === "platform") platformScene(ctx, model);
  else if (model.stage === "sound") soundScene(ctx, model);
  else if (model.stage === "assemble") assemblyScene(ctx, model);
  else if (model.stage === "trial") trialScene(ctx, model);
  else reportScene(ctx, model);
}
