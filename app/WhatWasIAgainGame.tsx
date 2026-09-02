"use client";

/* eslint-disable react-hooks/refs, react-hooks/purity */

import { useEffect, useRef, useState } from "react";
import { CreatureAudio } from "../game/audio";
import { GAME_CONFIG, text, type BodySlot, type GameStage, type Language, type PartId, type TraitKey } from "../game/config";
import { GameInput, type DirectionAction, type InputEvent } from "../game/input";
import { renderGame, type ChaseEntity, type MemoryPlatform, type RenderModel } from "../game/renderer";
import { buildCreatureReport, clearPersistentTrace, createRunId, dominantTraits, freshStats, loadInheritedTrait, persistReport, saveNextTrace, type BodyBuild, type CreatureReport, type InheritedTrait } from "../game/session";

type Runtime = {
  stage: GameStage; stageStartedAt: number; startedAt: number; runId: string;
  lang: Language; muted: boolean; visualAssist: boolean; reducedMotion: boolean; help: boolean;
  helpOpenedAt: number;
  player: { x: number; y: number; vx: number; vy: number; grounded: boolean; facing: number };
  creature: { x: number; y: number; mood: "curious" | "panic" | "proud" | "confused" };
  findTarget: string; inspected: Set<string>; nearestObject: string | null; inherited: InheritedTrait; inheritedVisible: boolean; noticedInherited: boolean;
  chaseRound: number; chaseEntities: ChaseEntity[]; chaseHint: boolean; fakes: ChaseEntity[]; roundStartedAt: number;
  platforms: MemoryPlatform[]; cameraY: number; maxY: number; checkpoint: { x: number; y: number }; pendingTrace: { at: number; x: number; y: number } | null;
  soundRound: number; soundSelected: number; soundPhase: "listen" | "choose" | "feedback"; soundFlash: number; originalPlayed: boolean; copyPlayed: boolean; soundAdvanceAt: number;
  body: BodyBuild; assembleSlotIndex: number; assemblePart: PartId;
  stats: ReturnType<typeof freshStats>; report: CreatureReport | null; reportSaved: boolean;
  message: { zh: string; en: string; until: number } | null; lastInteractionAt: number; pendingStage: { stage: GameStage; at: number } | null;
};

const BASE_PLATFORMS: MemoryPlatform[] = [
  { id: "p0", x: .5, y: 0, w: .38, kind: "base" }, { id: "p1", x: .26, y: .56, w: .28, kind: "base" },
  { id: "p2", x: .67, y: 1.08, w: .27, kind: "base" }, { id: "p3", x: .43, y: 1.62, w: .25, kind: "base" },
  { id: "p4", x: .76, y: 2.15, w: .22, kind: "base" }, { id: "p5", x: .27, y: 2.69, w: .25, kind: "base" },
  { id: "p6", x: .57, y: 3.22, w: .22, kind: "base" }, { id: "p7", x: .8, y: 3.78, w: .2, kind: "base" },
  { id: "p8", x: .38, y: 4.32, w: .22, kind: "base" }, { id: "p9", x: .68, y: 4.88, w: .2, kind: "base" },
  { id: "p10", x: .24, y: 5.43, w: .23, kind: "base" }, { id: "p11", x: .55, y: 5.96, w: .25, kind: "base" },
  { id: "goal", x: .52, y: 6.47, w: .52, kind: "base" },
];

function makeChaseEntities(round: number): ChaseEntity[] {
  const kind = round === 0 ? "box" : round === 1 ? "chair" : "bucket";
  const points = [[.2,.23],[.49,.19],[.77,.27],[.3,.64],[.67,.67]];
  const correct = [2, 1, 3][round] ?? 0;
  return points.map(([x, y], i) => ({ id: `r${round}-${i}`, kind, x, y, correct: i === correct, phase: i * 1.7 }));
}

function createRuntime(): Runtime {
  const now = performance.now();
  return {
    stage: "dormant", stageStartedAt: now, startedAt: Date.now(), runId: createRunId(), lang: "zh", muted: false, visualAssist: false,
    reducedMotion: typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, help: false, helpOpenedAt: 0,
    player: { x: .5, y: .84, vx: 0, vy: 0, grounded: true, facing: 1 }, creature: { x: .52, y: .45, mood: "curious" },
    findTarget: "broom", inspected: new Set(), nearestObject: null,
    inherited: GAME_CONFIG.inheritedTraits[0], inheritedVisible: true, noticedInherited: false,
    chaseRound: 0, chaseEntities: makeChaseEntities(0), chaseHint: false, fakes: [], roundStartedAt: now,
    platforms: BASE_PLATFORMS.map((p) => ({ ...p })), cameraY: 0, maxY: 0, checkpoint: { x: .5, y: 0 }, pendingTrace: null,
    soundRound: 0, soundSelected: 0, soundPhase: "listen", soundFlash: -1, originalPlayed: false, copyPlayed: false, soundAdvanceAt: 0,
    body: {}, assembleSlotIndex: 0, assemblePart: "bulb", stats: freshStats(), report: null, reportSaved: false,
    message: null, lastInteractionAt: now, pendingStage: null,
  };
}

const slotLabels: Record<BodySlot, [string, string]> = {
  head: ["头", "HEAD"], body: ["身体", "BODY"], leftArm: ["左臂", "LEFT ARM"], rightArm: ["右臂", "RIGHT ARM"], legs: ["腿", "LEGS"],
};

const traitLabels: Record<TraitKey, [string, string]> = {
  motion: ["动作很多", "RESTLESS MOTION"], attention: ["看得很仔细", "CAREFUL ATTENTION"],
  echo: ["喜欢重复", "LOVES AN ECHO"], trace: ["留下很多痕迹", "LEAVES MANY TRACES"],
};

export default function WhatWasIAgainGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const inputRef = useRef<GameInput | null>(null);
  const audioRef = useRef<CreatureAudio | null>(null);
  const frameRef = useRef(0);
  const lastFrameRef = useRef(0);
  const [, setViewTick] = useState(0);

  if (!runtimeRef.current && typeof performance !== "undefined") runtimeRef.current = createRuntime();
  const runtime = runtimeRef.current;

  const repaint = () => setViewTick((value) => value + 1);
  const say = (zh: string, en: string, duration = 1700) => {
    const r = runtimeRef.current; if (!r) return;
    r.message = { zh, en, until: performance.now() + duration }; repaint();
  };

  const transition = (stage: GameStage) => {
    const r = runtimeRef.current; if (!r) return;
    const now = performance.now(); r.stage = stage; r.stageStartedAt = now; r.pendingStage = null; r.lastInteractionAt = now; r.chaseHint = false;
    if (stage === "find") { r.player = { x: .5, y: .84, vx: 0, vy: 0, grounded: true, facing: 1 }; r.startedAt = Date.now(); }
    if (stage === "chase") { r.player.x = .5; r.player.y = .85; r.chaseRound = 0; r.chaseEntities = makeChaseEntities(0); r.fakes = []; r.roundStartedAt = now; }
    if (stage === "platform") {
      r.player = { x: .5, y: .05, vx: 0, vy: 0, grounded: true, facing: 1 }; r.platforms = BASE_PLATFORMS.map((p) => ({ ...p }));
      r.cameraY = 0; r.maxY = 0; r.checkpoint = { x: .5, y: 0 }; r.pendingTrace = null; r.creature = { x: .45, y: .78, mood: "panic" };
    }
    if (stage === "sound") { r.soundRound = 0; r.soundSelected = 0; restartSoundRound(r, now); r.creature.mood = "proud"; }
    if (stage === "assemble") { r.assembleSlotIndex = 0; r.assemblePart = "bulb"; }
    if (stage === "trial") r.creature.mood = "confused";
    if (stage === "report" && !r.reportSaved) {
      r.report = buildCreatureReport({ runId: r.runId, startedAt: r.startedAt, stats: r.stats, body: r.body, inheritedTrait: r.inherited });
      persistReport(r.report); saveNextTrace(r.stats); r.reportSaved = true;
    }
    repaint();
  };

  const resetRun = (clearTrace = false) => {
    if (clearTrace) clearPersistentTrace();
    const previous = runtimeRef.current; const next = createRuntime();
    if (previous) { next.lang = previous.lang; next.muted = previous.muted; next.visualAssist = previous.visualAssist; next.reducedMotion = previous.reducedMotion; }
    next.inherited = clearTrace ? GAME_CONFIG.inheritedTraits[0] : loadInheritedTrait(); runtimeRef.current = next; audioRef.current?.setMuted(next.muted); repaint();
  };

  const nearestRoomObject = (r: Runtime) => {
    let nearest: string | null = null; let distance = Infinity;
    for (const object of GAME_CONFIG.roomObjects) {
      const d = Math.hypot(r.player.x - object.x, r.player.y - object.y);
      if (d < distance) { distance = d; nearest = object.id; }
    }
    return { id: nearest, distance };
  };

  const nearestChaseEntity = (r: Runtime) => {
    let nearest: ChaseEntity | null = null; let distance = Infinity;
    for (const entity of [...r.chaseEntities, ...r.fakes]) {
      const d = Math.hypot(r.player.x - entity.x, r.player.y - entity.y);
      if (d < distance) { distance = d; nearest = entity; }
    }
    return { entity: nearest, distance };
  };

  const interactFind = (r: Runtime) => {
    const nearest = nearestRoomObject(r);
    if (!nearest.id || nearest.distance > .17) { say("再靠近一点。", "A little closer."); return; }
    r.inspected.add(nearest.id); r.stats.inspected += 1; r.stats.attention += 1;
    audioRef.current?.pop(470 + r.inspected.size * 42);
    if (nearest.id === r.findTarget) {
      r.inheritedVisible = false; say("贴纸冲出去了！", "The sticker bolted!", 900); audioRef.current?.transform(); r.pendingStage = { stage: "chase", at: performance.now() + 950 };
    } else {
      const object = GAME_CONFIG.roomObjects.find((item) => item.id === nearest.id)!;
      say(object.zh, object.en); if (nearest.id === "broom") r.stats.echo += 1;
    }
  };

  const pounce = (r: Runtime) => {
    const nearest = nearestChaseEntity(r);
    if (!nearest.entity || nearest.distance > .18) { say("再贴近一点！", "Get closer!"); return; }
    if (nearest.entity.correct) {
      audioRef.current?.correct(); say("追到啦！", "Got it!", 850); r.stats.attention += 2;
      r.chaseRound += 1;
      if (r.chaseRound >= 3) r.pendingStage = { stage: "platform", at: performance.now() + 900 };
      else { r.chaseEntities = makeChaseEntities(r.chaseRound); r.roundStartedAt = performance.now(); r.chaseHint = false; }
    } else {
      audioRef.current?.wrong(); r.stats.misses += 1; r.stats.motion += 1; say("糟，假贴纸也跑了！", "Oops, a decoy escaped too!");
      const fake: ChaseEntity = { ...nearest.entity, id: `fake-${Date.now()}`, fake: true, correct: false, x: Math.min(.88, Math.max(.12, nearest.entity.x + .06)), y: Math.min(.84, Math.max(.15, nearest.entity.y + .07)) };
      r.fakes = [...r.fakes.slice(-(GAME_CONFIG.maxFakeCreatures - 1)), fake];
    }
  };

  const jump = (r: Runtime) => {
    if (!r.player.grounded) return;
    r.player.grounded = false; r.player.vy = 2.72; r.stats.jumps += 1; r.stats.motion += .45; audioRef.current?.jump();
    r.pendingTrace = { at: performance.now() + GAME_CONFIG.traceDelayMs, x: Math.min(.88, Math.max(.12, r.player.x + r.player.facing * .07)), y: r.player.y + .48 };
  };

  function restartSoundRound(r: Runtime, now = performance.now()) {
    r.stageStartedAt = now; r.soundPhase = "listen"; r.soundFlash = -1; r.originalPlayed = false; r.copyPlayed = false; r.soundAdvanceAt = 0;
  }

  const selectSound = (r: Runtime) => {
    if (r.soundPhase !== "choose") { r.stats.replays += 1; r.stats.echo += .75; restartSoundRound(r); say("再听一次，别急！", "One more time, no rush!"); return; }
    const round = GAME_CONFIG.soundRounds[r.soundRound]; const correct = r.soundSelected === round.wrongIndex;
    r.soundPhase = "feedback"; r.soundAdvanceAt = performance.now() + 950;
    if (correct) { r.stats.attention += 1.5; audioRef.current?.correct(); say("节拍抓住了！", "Beat caught!"); }
    else { r.stats.soundMistakes += 1; r.stats.echo += 2; audioRef.current?.wrong(); say("错拍也变成新节奏。", "The wrong beat became a new rhythm."); }
  };

  const validPartsForSlot = (slot: BodySlot) => GAME_CONFIG.parts.filter((part) => part.slots.includes(slot));
  const changePart = (r: Runtime, direction: number) => {
    const slot = GAME_CONFIG.bodySlots[r.assembleSlotIndex]; const parts = validPartsForSlot(slot); let index = parts.findIndex((p) => p.id === r.assemblePart);
    if (index < 0) index = 0; r.assemblePart = parts[(index + direction + parts.length) % parts.length].id; audioRef.current?.click();
  };

  const installPart = (r: Runtime) => {
    const slot = GAME_CONFIG.bodySlots[r.assembleSlotIndex]; const valid = validPartsForSlot(slot);
    if (!valid.some((part) => part.id === r.assemblePart)) r.assemblePart = valid[0].id;
    r.body[slot] = r.assemblePart; audioRef.current?.transform();
    const part = GAME_CONFIG.parts.find((item) => item.id === r.assemblePart)!; say(`${part.zh}贴上了！`, `${part.en} sticker placed!`);
    const nextEmpty = GAME_CONFIG.bodySlots.findIndex((candidate) => !r.body[candidate]);
    if (nextEmpty === -1) r.pendingStage = { stage: "trial", at: performance.now() + 900 };
    else { r.assembleSlotIndex = nextEmpty; r.assemblePart = validPartsForSlot(GAME_CONFIG.bodySlots[nextEmpty])[0].id; }
  };

  const handleInput = (event: InputEvent) => {
    const r = runtimeRef.current; if (!r) return; r.lastInteractionAt = performance.now();
    if (event.action === "reset") { resetRun(false); return; }
    if (event.action === "hard-reset") { resetRun(true); say("旧路线已清除。", "Previous route cleared."); return; }
    if (event.action === "fullscreen") { if (!document.fullscreenElement) void document.documentElement.requestFullscreen(); else void document.exitFullscreen(); return; }
    if (event.action === "mute") { r.muted = !r.muted; audioRef.current?.setMuted(r.muted); repaint(); return; }
    if (event.action === "language") { r.lang = r.lang === "zh" ? "en" : "zh"; repaint(); return; }
    if (event.action === "visual-assist") { r.visualAssist = !r.visualAssist; repaint(); return; }
    if (event.action === "help") {
      const now = performance.now();
      if (!r.help) { r.help = true; r.helpOpenedAt = now; }
      else {
        const pausedFor = Math.max(0, now - r.helpOpenedAt);
        r.help = false; r.helpOpenedAt = 0; r.stageStartedAt += pausedFor; r.roundStartedAt += pausedFor;
        if (r.pendingStage) r.pendingStage.at += pausedFor;
        if (r.pendingTrace) r.pendingTrace.at += pausedFor;
        if (r.soundAdvanceAt) r.soundAdvanceAt += pausedFor;
        if (r.message) r.message.until += pausedFor;
      }
      repaint(); return;
    }
    if (r.help) return;
    if (r.stage === "dormant" && (event.action === "any-direction" || event.action === "action-start")) { void audioRef.current?.start(); transition("find"); return; }
    if (["left", "right", "up", "down"].includes(event.action)) {
      if (r.stage === "sound") {
        if (event.action === "up") { r.stats.replays += 1; r.stats.echo += .75; restartSoundRound(r); say("再听一次，别急！", "One more time, no rush!"); }
        else if (event.action === "left" || event.action === "right") { const count = GAME_CONFIG.soundRounds[r.soundRound].notes.length; r.soundSelected = (r.soundSelected + (event.action === "right" ? 1 : -1) + count) % count; audioRef.current?.click(); }
      } else if (r.stage === "assemble") {
        if (event.action === "up" || event.action === "down") {
          r.assembleSlotIndex = (r.assembleSlotIndex + (event.action === "down" ? 1 : -1) + GAME_CONFIG.bodySlots.length) % GAME_CONFIG.bodySlots.length;
          const slot = GAME_CONFIG.bodySlots[r.assembleSlotIndex]; r.assemblePart = r.body[slot] ?? validPartsForSlot(slot)[0].id; audioRef.current?.click();
        } else changePart(r, event.action === "right" ? 1 : -1);
      }
      repaint();
    }
    if (event.action !== "action-start") return;
    void audioRef.current?.start();
    if (r.stage === "find") interactFind(r);
    else if (r.stage === "chase") pounce(r);
    else if (r.stage === "platform") jump(r);
    else if (r.stage === "sound") selectSound(r);
    else if (r.stage === "assemble") installPart(r);
    else if (r.stage === "trial") {
      if (performance.now() - r.stageStartedAt >= 3500) transition("report");
      else say("让它先冲两步。", "Let it sprint a little first.");
    }
    else if (r.stage === "report") resetRun(false);
  };

  useEffect(() => {
    const r = runtimeRef.current; if (!r) return;
    r.inherited = loadInheritedTrait();
    const input = new GameInput(); const audio = new CreatureAudio(); inputRef.current = input; audioRef.current = audio;
    input.attach(); const unsubscribe = input.subscribe(handleInput);
    return () => { unsubscribe(); input.detach(); audio.destroy(); cancelAnimationFrame(frameRef.current); };
  // Runtime is deliberately held in a ref; the input boundary attaches once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return;
    let uiAccumulator = 0;
    const loop = (now: number) => {
      const r = runtimeRef.current; if (!r) return;
      const dt = Math.min(.034, Math.max(.001, (now - (lastFrameRef.current || now)) / 1000)); lastFrameRef.current = now;
      if (!r.help && r.pendingStage && now >= r.pendingStage.at) transition(r.pendingStage.stage);
      updateRuntime(r, dt, now, inputRef.current, say, transition, audioRef.current);
      const model = toRenderModel(r, now); renderGame(ctx, model);
      uiAccumulator += dt; if (uiAccumulator > .12) { uiAccumulator = 0; setViewTick((value) => value + 1); }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = (runtimeRef.current ?? runtime)!;
  const stageInfo = GAME_CONFIG.stages[r.stage];
  const hint = getHint(r.stage, r.lang);
  const activeMessage = r.message && r.message.until > performance.now() ? text(r.lang, r.message.zh, r.message.en) : "";
  const currentSlot = GAME_CONFIG.bodySlots[r.assembleSlotIndex];
  const currentPart = GAME_CONFIG.parts.find((part) => part.id === r.assemblePart)!;
  const topTraits = dominantTraits(r.stats);
  const stageElapsed = performance.now() - r.stageStartedAt;
  const nearestLabel = GAME_CONFIG.roomObjects.find((object) => object.id === r.nearestObject);

  const directionButton = (direction: DirectionAction, glyph: string) => (
    <button className={`pad-key pad-${direction}`} aria-label={direction}
      onPointerDown={(event) => { event.preventDefault(); inputRef.current?.setTouchDirection(direction, true); }}
      onPointerUp={() => inputRef.current?.setTouchDirection(direction, false)} onPointerCancel={() => inputRef.current?.setTouchDirection(direction, false)} onPointerLeave={() => inputRef.current?.setTouchDirection(direction, false)}>{glyph}</button>
  );

  return (
    <main className="game-page">
      <section className={`game-shell stage-${r.stage}`} aria-label={`${GAME_CONFIG.title} / ${GAME_CONFIG.englishTitle}`}>
        <canvas ref={canvasRef} width={1080} height={1920} aria-label={text(r.lang, "游戏场景", "Game scene")} />
        <div className="paper-grain" aria-hidden="true" />

        <header className="game-header">
          <div className="brand-block"><span className="eyebrow">{GAME_CONFIG.reserve}</span><strong>{text(r.lang, GAME_CONFIG.title, GAME_CONFIG.englishTitle)}</strong><small>{text(r.lang, stageInfo.zh, stageInfo.en)}</small></div>
          <div className="header-tools">
            <button onClick={() => inputRef.current?.emitTouch("language")} aria-label="切换中英文">{r.lang === "zh" ? "EN" : "中"}</button>
            <button className={r.visualAssist ? "active" : ""} onClick={() => inputRef.current?.emitTouch("visual-assist")} aria-label="视觉辅助">◐</button>
            <button onClick={() => inputRef.current?.emitTouch("mute")} aria-label="声音">{r.muted ? "×♪" : "♪"}</button>
            <button onClick={() => inputRef.current?.emitTouch("help")} aria-label="帮助">?</button>
            <button onClick={() => inputRef.current?.emitTouch("fullscreen")} aria-label="全屏">⛶</button>
          </div>
          <div className="stage-rail" aria-label={text(r.lang, "游戏进度", "Game progress")}>{GAME_CONFIG.stageOrder.map((stage, index) => <span key={stage} className={index + 1 <= stageInfo.progress ? "done" : ""} aria-current={stage === r.stage ? "step" : undefined} aria-label={text(r.lang, GAME_CONFIG.stages[stage].zh, GAME_CONFIG.stages[stage].en)} />)}</div>
        </header>

        {r.stage === "dormant" && <div className="title-card"><span>RUN 07 · COLOR RUSH</span><h1>{text(r.lang, "忘了自己是什么", "What Was I Again?")}</h1><p>{text(r.lang, "一张黄色贴纸跑进了会变形的城市。追上它。", "A yellow sticker ran into a shifting city. Catch it.")}</p><button className="start-action" onClick={() => inputRef.current?.emitTouch("action-start")}>{text(r.lang, "冲进去！", "START THE RUSH")}<small>{text(r.lang, "方向键 / WASD / 触控均可操作", "Keyboard, WASD and touch supported")}</small></button></div>}

        {r.stage === "find" && <div className="mission-card"><span>{String(r.inspected.size).padStart(2, "0")} / 06</span><strong>{nearestLabel ? text(r.lang, `靠近：${nearestLabel.zh}`, `NEAR: ${nearestLabel.en}`) : text(r.lang, "找到藏起来的黄色贴纸", "Find the hidden yellow sticker")}</strong><small>{text(r.lang, "靠近可疑物件，再按空格触碰", "MOVE CLOSE, THEN PRESS SPACE TO TOUCH")}</small></div>}

        {r.stage === "chase" && <div className="mission-card"><span>{String(r.chaseRound + 1).padStart(2, "0")} / 03</span><strong>{text(r.lang, GAME_CONFIG.chaseRounds[Math.min(r.chaseRound, 2)].zh, GAME_CONFIG.chaseRounds[Math.min(r.chaseRound, 2)].en)}</strong><small>{text(r.lang, `假贴纸 ${r.fakes.length} / ${GAME_CONFIG.maxFakeCreatures}`, `DECOYS ${r.fakes.length} / ${GAME_CONFIG.maxFakeCreatures}`)}</small></div>}

        {r.stage === "platform" && <div className="mission-card compact"><span>{text(r.lang, "冲刺高度", "RUSH HEIGHT")}</span><strong>{Math.min(100, Math.round(r.maxY / 6.2 * 100))}%</strong><small>{text(r.lang, `临时跳板 ${r.platforms.filter((p) => p.kind === "trace").length}`, `BONUS PLATFORMS ${r.platforms.filter((p) => p.kind === "trace").length}`)}</small></div>}

        {r.stage === "sound" && <div className="mission-card"><span>{String(r.soundRound + 1).padStart(2, "0")} / 03 · BEAT</span><strong>{r.soundPhase === "choose" ? text(r.lang, "哪一拍不一样？", "Which beat changed?") : text(r.lang, "听两次，抓住错拍。", "Listen twice. Catch the off-beat.")}</strong><small>{text(r.lang, "↑ 重听 · ← → 选择 · 空格确认", "↑ REPLAY · ← → CHOOSE · SPACE CONFIRM")}</small></div>}

        {r.stage === "assemble" && <div className="assembly-panel"><span>{text(r.lang, `正在贴：${slotLabels[currentSlot][0]}区`, `PLACING: ${slotLabels[currentSlot][1]}`)}</span><strong><i>{currentPart.symbol}</i>{text(r.lang, currentPart.zh, currentPart.en)}</strong><small>{text(r.lang, "上下换位置 · 左右换贴纸 · 空格贴上", "UP/DOWN SLOT · LEFT/RIGHT STICKER · SPACE PLACE")}</small><div>{GAME_CONFIG.bodySlots.map((slot) => <b key={slot} className={r.body[slot] ? "filled" : slot === currentSlot ? "current" : ""}>{r.body[slot] ? "●" : "○"}</b>)}</div></div>}

        {r.stage === "trial" && <div className="trial-caption"><span>{text(r.lang, "贴纸试跑中", "STICKER TEST RUN")}</span><strong>{r.stats.misses > 2 ? text(r.lang, "它跑出了好几个假影子。", "It left a whole pack of decoys.") : r.stats.falls > 2 ? text(r.lang, "它把跌落变成了弹跳。", "It turned every fall into a bounce.") : text(r.lang, "它正沿着你的路线加速。", "It is speeding along your route.")}</strong>{stageElapsed >= 3500 && <button onClick={() => inputRef.current?.emitTouch("action-start")}>{text(r.lang, "保存本局路线 →", "SAVE THIS RUN →")}</button>}</div>}

        {r.stage === "report" && <div className="report-copy"><span>{text(r.lang, "本局贴纸已生成", "RUN STICKER GENERATED")}</span><h2>{text(r.lang, "你跑出了一个新版本。", "You ran a brand-new version.")}</h2><p>{text(r.lang, "再来一局，路线会不一样。", "Run again. The route will feel different.")}</p><div className="trait-tags">{topTraits.map((trait) => <b key={trait}>{text(r.lang, traitLabels[trait][0], traitLabels[trait][1])}</b>)}</div><small>{text(r.lang, `上一局留下：${r.inherited.zh}`, `PREVIOUS RUN LEFT: ${r.inherited.en}`)}</small><button onClick={() => resetRun(false)}>{text(r.lang, "再冲一次", "RUSH AGAIN")}</button></div>}

        {activeMessage && <div className="message-toast" role="status">{activeMessage}</div>}
        <footer className="game-footer">
          <div className="hint-line"><span>{hint.icon}</span><strong>{hint.main}</strong><small>{hint.sub}</small></div>
          <div className="behavior-strip"><span>MOTION <i style={{ "--score": Math.min(100, r.stats.motion * 6) } as React.CSSProperties} /></span><span>ATTENTION <i style={{ "--score": Math.min(100, r.stats.attention * 6) } as React.CSSProperties} /></span><span>ECHO <i style={{ "--score": Math.min(100, r.stats.echo * 8) } as React.CSSProperties} /></span><span>TRACE <i style={{ "--score": Math.min(100, r.stats.trace * 8) } as React.CSSProperties} /></span></div>
        </footer>

        <div className="touch-controls" aria-label="触控操作"><div className="dpad">{directionButton("up", "↑")}{directionButton("left", "←")}{directionButton("right", "→")}{directionButton("down", "↓")}</div><button className="action-key" onPointerDown={(event) => { event.preventDefault(); inputRef.current?.emitTouch("action-start"); }} onPointerUp={() => inputRef.current?.emitTouch("action-end")} onPointerCancel={() => inputRef.current?.emitTouch("action-end")} onPointerLeave={() => inputRef.current?.emitTouch("action-end")}>SPACE<small>{text(r.lang, "碰 / 扑 / 跳 / 装", "TOUCH / POUNCE / JUMP / FIT")}</small></button></div>

        {r.help && <div className="help-sheet" role="dialog" aria-modal="true" aria-label={text(r.lang, "快速指南", "Field guide")}><button autoFocus aria-label={text(r.lang, "关闭指南", "Close guide")} onClick={() => inputRef.current?.emitTouch("help")}>×</button><span>FIELD GUIDE / 快速指南</span><h2>{text(r.lang, "别追太快。它学得很快。", "Do not rush. It learns fast.")}</h2><ul><li>{text(r.lang, "方向键 / WASD：移动与选择", "ARROWS / WASD: move and choose")}</li><li>{text(r.lang, "空格：碰、扑、跳、确认", "SPACE: touch, pounce, jump, confirm")}</li><li>{text(r.lang, "L 中英文 · M 静音 · V 视觉辅助", "L language · M mute · V visual aid")}</li><li>{text(r.lang, "R 重开 · Shift+R 清除上一位痕迹", "R restart · Shift+R clear inherited trace")}</li><li>{text(r.lang, "H / Esc：关闭本指南并继续", "H / Esc: close this guide and resume")}</li></ul></div>}
      </section>
    </main>
  );
}

function updateRuntime(r: Runtime, dt: number, now: number, input: GameInput | null, say: (zh: string, en: string, duration?: number) => void, transition: (stage: GameStage) => void, audio: CreatureAudio | null) {
  if (r.help) return;
  if (r.message && r.message.until <= now) r.message = null;
  const axis = input?.axis() ?? { x: 0, y: 0 };
  if (r.stage === "find" || r.stage === "chase") {
    const speed = r.stage === "find" ? .35 : .42; r.player.x = Math.min(.92, Math.max(.08, r.player.x + axis.x * speed * dt)); r.player.y = Math.min(.9, Math.max(.12, r.player.y + axis.y * speed * dt));
    if (axis.x !== 0 || axis.y !== 0) { r.player.facing = axis.x < 0 ? -1 : axis.x > 0 ? 1 : r.player.facing; r.stats.motion += dt * .25; }
    if (r.stage === "find") {
      const nearest = GAME_CONFIG.roomObjects.reduce((best, object) => { const d = Math.hypot(r.player.x - object.x, r.player.y - object.y); return d < best.d ? { id: object.id, d } : best; }, { id: "", d: Infinity });
      r.nearestObject = nearest.d < .19 ? nearest.id : null;
      if (!r.noticedInherited && Math.hypot(r.player.x - .8, r.player.y - .85) < .16) { r.noticedInherited = true; r.stats.attention += 2; say("那不是这一局留下的。", "That was not left this time."); }
    } else {
      r.chaseEntities.forEach((entity, i) => {
        const direction = r.chaseRound === 1 && entity.correct ? -1 : 1;
        entity.x = Math.min(.9, Math.max(.1, entity.x + Math.sin(now * .0013 + i) * dt * .022 * direction));
        entity.y = Math.min(.84, Math.max(.14, entity.y + Math.cos(now * .0011 + i) * dt * .015));
      });
      r.fakes.forEach((entity, i) => { entity.x = Math.min(.9, Math.max(.1, entity.x + Math.sin(now * .002 + i) * dt * .055)); entity.y = Math.min(.85, Math.max(.12, entity.y + Math.cos(now * .0017 + i) * dt * .05)); });
      if (now - r.roundStartedAt > GAME_CONFIG.idleHintMs) r.chaseHint = true;
    }
  }
  if (r.stage === "platform") updatePlatform(r, dt, now, axis, say, transition, audio);
  if (r.stage === "sound") updateSound(r, now, transition, audio);
  if (r.stage === "trial" && now - r.stageStartedAt > 25_000) transition("report");
  if (r.stage === "report" && now - r.stageStartedAt > GAME_CONFIG.reportResetMs) {
    const previous = { lang: r.lang, muted: r.muted, visualAssist: r.visualAssist, reducedMotion: r.reducedMotion };
    const next = createRuntime(); Object.assign(next, previous); next.inherited = loadInheritedTrait(); Object.assign(r, next);
  }
}

function updatePlatform(r: Runtime, dt: number, now: number, axis: { x: number; y: number }, say: (zh: string, en: string, duration?: number) => void, transition: (stage: GameStage) => void, audio: CreatureAudio | null) {
  r.player.vx += axis.x * 2.7 * dt; r.player.vx *= Math.pow(.02, dt); r.player.vx = Math.max(-.68, Math.min(.68, r.player.vx));
  if (axis.x) r.player.facing = axis.x < 0 ? -1 : 1;
  r.player.x = Math.min(.94, Math.max(.06, r.player.x + r.player.vx * dt));
  const previousY = r.player.y; if (!r.player.grounded) r.player.vy -= 5.4 * dt; r.player.y += r.player.vy * dt;
  if (r.pendingTrace && now >= r.pendingTrace.at) {
    r.platforms.push({ id: `trace-${now}`, x: r.pendingTrace.x, y: r.pendingTrace.y, w: .2, kind: "trace", bornAt: now, expiresAt: now + 8500 }); r.stats.trace += .75; r.pendingTrace = null; audio?.pop(540);
  }
  r.player.grounded = false;
  if (r.player.vy <= 0) {
    const candidates = r.platforms.filter((p) => !p.stolen && r.player.x >= p.x - p.w / 2 - .025 && r.player.x <= p.x + p.w / 2 + .025 && previousY >= p.y && r.player.y <= p.y);
    const landed = candidates.sort((a, b) => b.y - a.y)[0];
    if (landed) { r.player.y = landed.y; r.player.vy = 0; r.player.grounded = true; r.checkpoint = { x: landed.x, y: landed.y }; audio?.land(); }
  }
  r.maxY = Math.max(r.maxY, r.player.y); r.cameraY = Math.max(0, r.player.y - 2.45);
  r.creature.y = Math.min(6.62, Math.max(r.player.y + .68, .9 + (now - r.stageStartedAt) / 16_000)); r.creature.x = .5 + Math.sin(now * .0014) * .25;
  const elapsed = now - r.stageStartedAt;
  if (elapsed > 20_000) r.platforms.forEach((p) => { if (p.kind === "base" && p.y < r.maxY - .7 && !p.expiresAt) p.expiresAt = now + 2400; });
  if (elapsed > 50_000) r.platforms.forEach((p) => { if (p.kind === "trace" && !p.stolen && Math.abs(p.y - r.creature.y) < .22 && Math.abs(p.x - r.creature.x) < .25) { p.stolen = true; r.stats.trace += .5; } });
  r.platforms = r.platforms.filter((p) => !p.expiresAt || p.expiresAt > now);
  if (r.player.y < r.cameraY - 1.2 || r.player.y < -.8) {
    r.stats.falls += 1; r.stats.trace += 2; say("掉下去？变成弹跳近路！", "Fell down? Bonus bounce route!"); audio?.wrong();
    r.platforms.push({ id: `rescue-${now}`, x: r.checkpoint.x, y: Math.max(0, r.checkpoint.y), w: .28, kind: "rescue", bornAt: now, expiresAt: now + 2200 });
    r.player.x = r.checkpoint.x; r.player.y = r.checkpoint.y + .08; r.player.vy = 0; r.player.grounded = true;
  }
  if (r.player.y >= 6.35) { audio?.correct(); transition("sound"); }
}

function updateSound(r: Runtime, now: number, transition: (stage: GameStage) => void, audio: CreatureAudio | null) {
  if (r.soundAdvanceAt && now >= r.soundAdvanceAt) {
    r.soundRound += 1; r.soundSelected = 0;
    if (r.soundRound >= GAME_CONFIG.soundRounds.length) { transition("assemble"); return; }
    restartSoundData(r, now);
  }
  if (r.soundPhase !== "listen") return;
  const round = GAME_CONFIG.soundRounds[r.soundRound]; const elapsed = now - r.stageStartedAt; const firstStart = 450; const firstDuration = round.notes.length * 240; const secondStart = firstStart + firstDuration + 500;
  if (!r.originalPlayed && elapsed >= firstStart) { r.originalPlayed = true; audio?.playSequence(round.notes, -1, "original"); }
  if (!r.copyPlayed && elapsed >= secondStart) { r.copyPlayed = true; audio?.playSequence(round.notes, round.wrongIndex, "copy"); }
  if (elapsed >= firstStart && elapsed < firstStart + firstDuration) r.soundFlash = Math.floor((elapsed - firstStart) / 240);
  else if (elapsed >= secondStart && elapsed < secondStart + firstDuration) r.soundFlash = Math.floor((elapsed - secondStart) / 240);
  else r.soundFlash = -1;
  if (elapsed > secondStart + firstDuration + 260) r.soundPhase = "choose";
}

function restartSoundData(r: Runtime, now: number) { r.stageStartedAt = now; r.soundPhase = "listen"; r.soundFlash = -1; r.originalPlayed = false; r.copyPlayed = false; r.soundAdvanceAt = 0; }

function toRenderModel(r: Runtime, now: number): RenderModel {
  return { stage: r.stage, lang: r.lang, now, stageTime: now - r.stageStartedAt, reducedMotion: r.reducedMotion, player: r.player, creature: r.creature,
    inheritedVisible: r.inheritedVisible, nearestObject: r.nearestObject, inspected: [...r.inspected], findTarget: r.findTarget,
    chaseRound: r.chaseRound, chaseEntities: [...r.chaseEntities, ...r.fakes], chaseHint: r.chaseHint || r.visualAssist,
    cameraY: r.cameraY, platforms: r.platforms, soundRound: r.soundRound, soundSelected: r.soundSelected, soundPhase: r.soundPhase, soundFlash: r.soundFlash,
    body: r.body, assembleSlot: GAME_CONFIG.bodySlots[r.assembleSlotIndex], assemblePart: r.assemblePart, stats: r.stats, dominant: dominantTraits(r.stats) };
}

function getHint(stage: GameStage, lang: Language) {
  const hints: Record<GameStage, [string, string, string, string, string]> = {
    dormant: ["↔", "移动，开始冲刺", "MOVE TO START", "", ""], find: ["◎", "方向键靠近 · 空格触碰", "MOVE CLOSE · SPACE TOUCH", "找出藏起来的黄色贴纸", "Find the hidden yellow sticker"],
    chase: ["⌁", "靠近色块 · 空格抓住", "APPROACH · SPACE CATCH", "撞错会跑出假贴纸", "A miss spawns a decoy"],
    platform: ["↥", "左右移动 · 空格跳", "LEFT/RIGHT · SPACE JUMP", "每次跳跃会生成临时跳板", "Each jump makes a bonus platform"],
    sound: ["♪", "先听两遍，再找不同", "LISTEN TWICE, THEN SPOT THE CHANGE", "上键重听", "Up replays"],
    assemble: ["✦", "换位置、换贴纸、贴上", "CHOOSE SLOT, STICKER, PLACE", "所有组合都能冲刺", "Every combo can run"],
    trial: ["◌", "看它试跑 · 空格保存", "WATCH THE RUN · SPACE TO SAVE", "准备好后保存本局路线", "Save this run when ready"], report: ["↺", "空格再冲一次", "SPACE TO RUSH AGAIN", "40秒后自动开始新局", "New run starts in 40 seconds"],
  };
  const h = hints[stage]; return { icon: h[0], main: lang === "zh" ? h[1] : h[2], sub: lang === "zh" ? h[3] : h[4] };
}

