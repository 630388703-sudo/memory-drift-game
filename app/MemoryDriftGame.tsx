"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemoryAudio } from "../game/audio";
import { GAME_CONFIG, type ArchiveAnchorId, type GameStage } from "../game/config";
import { GameInput, type InputEvent } from "../game/input";
import { renderFrame } from "../game/renderer";
import { buildSessionReport, createRunId, downloadSessionReport, persistSessionReport, type MemorySessionReport } from "../game/session";

type Version = "A" | "B";
type Model = {
  runId: string;
  startedAt: number;
  report: MemorySessionReport | null;
  stage: GameStage;
  tutorialStep: number;
  scanner: { x: number; y: number };
  scanned: Set<ArchiveAnchorId>;
  read: Set<ArchiveAnchorId>;
  pressureStartedAt: number | null;
  pressureHeldMs: number;
  scanPulseUntil: number;
  transitionAt: number;
  progress: number;
  lane: number;
  collected: Set<number>;
  corridorEvents: Set<string>;
  doorIndex: number;
  calibrationIndex: number;
  calibrationChoices: Version[];
  calibrationLocked: boolean[];
  puzzleIndex: number;
  puzzleSides: Version[];
  puzzleLocked: boolean[];
  activeVersion: Version;
  selectedVersion: Version | null;
  memoryBias: number;
  stableReads: number;
  overloads: number;
  blankHits: number;
  reliability: number;
  lastActionAt: number;
  finaleAt: number | null;
  toast: string;
  toastUntil: number;
};

const nowSafe = () => typeof performance === "undefined" ? 0 : performance.now();
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

const freshModel = (): Model => ({
  runId: createRunId(), startedAt: Date.now(), report: null,
  stage: "dormant", tutorialStep: 0, scanner: { x: .5, y: .5 }, scanned: new Set(), read: new Set(),
  pressureStartedAt: null, pressureHeldMs: 0, scanPulseUntil: 0, transitionAt: 0,
  progress: 0, lane: 1, collected: new Set(), corridorEvents: new Set(), doorIndex: 1,
  calibrationIndex: 0, calibrationChoices: ["A", "A", "A"], calibrationLocked: [false, false, false],
  puzzleIndex: 0, puzzleSides: ["A", "A", "A", "A", "A"], puzzleLocked: [false, false, false, false, false],
  activeVersion: "A", selectedVersion: null, memoryBias: 0, stableReads: 0, overloads: 0,
  blankHits: 0, reliability: 96, lastActionAt: nowSafe(), finaleAt: null, toast: "", toastUntil: 0,
});

const STAGE_META: Record<GameStage, { eyebrow: string; title: string; status: string }> = {
  dormant: { eyebrow: "STATUS", title: "等待接入", status: "DORMANT" },
  tutorial: { eyebrow: "00 / CALIBRATION", title: "操作校准", status: "UNSTABLE" },
  archive: { eyebrow: "01 / STABLE ARCHIVE", title: "保存的记忆", status: "STABLE" },
  corridor: { eyebrow: "02 / MEMORY DRIFT", title: "记忆漂移走廊", status: "DRIFT" },
  doors: { eyebrow: "02 / EXIT QUERY", title: "走廊尽头", status: "DRIFT" },
  classroom: { eyebrow: "03 / CORRUPTED CLASSROOM", title: "扭曲的记忆", status: "CORRUPTED" },
  reconstruct: { eyebrow: "04 / RECONSTRUCTION", title: "碎片重组", status: "FOCUS" },
  versions: { eyebrow: "05 / MULTIPLE VERSION", title: "可保存版本", status: "UNKNOWN" },
  finale: { eyebrow: "06 / ARCHIVE SAVED", title: "结局反思", status: "ALTERED" },
};

function pressureRatio(ms: number) {
  if (ms <= 360) return clamp(ms / 360 * .3);
  if (ms <= 2300) return .3 + clamp((ms - 360) / 1940) * .4;
  return .7 + clamp((ms - 2300) / 1300) * .3;
}

function releaseKind(ms: number): "scan" | "focus" | "overload" {
  if (ms < GAME_CONFIG.pressure.focusMinMs) return "scan";
  if (ms < GAME_CONFIG.pressure.overloadMs) return "focus";
  return "overload";
}

export default function MemoryDriftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState<Model>(() => freshModel());
  const modelRef = useRef<Model>(current);
  const inputRef = useRef<GameInput | null>(null);
  const audioRef = useRef<MemoryAudio | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const uiFrameRef = useRef(0);
  const touchPressureAt = useRef(0);
  const [muted, setMuted] = useState(false);

  const syncUI = useCallback(() => {
    const m = modelRef.current;
    setCurrent({ ...m, scanner: { ...m.scanner }, scanned: new Set(m.scanned), read: new Set(m.read), collected: new Set(m.collected), corridorEvents: new Set(m.corridorEvents), calibrationChoices: [...m.calibrationChoices], calibrationLocked: [...m.calibrationLocked], puzzleSides: [...m.puzzleSides], puzzleLocked: [...m.puzzleLocked] });
  }, []);

  const toast = useCallback((message: string, duration = 2300) => {
    const m = modelRef.current; m.toast = message; m.toastUntil = performance.now() + duration;
  }, []);

  const reset = useCallback(() => {
    const next = freshModel(); modelRef.current = next; setCurrent({ ...next }); audioRef.current?.setRainLevel(.12);
  }, []);

  const nearestAnchor = useCallback(() => {
    const m = modelRef.current;
    return GAME_CONFIG.anchors.map((a) => ({ ...a, d: Math.hypot(a.x - m.scanner.x, (a.y - m.scanner.y) * .7) })).sort((a, b) => a.d - b.d)[0];
  }, []);

  const collectCorridor = useCallback((range = .11) => {
    const m = modelRef.current; if (m.stage !== "corridor") return false;
    const f = GAME_CONFIG.corridorFragments.find((item) => !m.collected.has(item.id) && item.lane === m.lane && Math.abs(item.at - m.progress) < range);
    if (!f) return false;
    m.collected.add(f.id); audioRef.current?.collect(f.id); m.memoryBias += f.id === 4 ? 1 : (m.overloads % 2 ? -1 : 1);
    if (f.id === 4) { window.setTimeout(() => audioRef.current?.speakWait(), 220); toast("FRAGMENT 04 · “等我一下……”", 3000); }
    else toast("FRAGMENT 05 · 人影 / 空椅子", 3000);
    syncUI(); return true;
  }, [syncUI, toast]);

  const finishDoor = useCallback(() => {
    const m = modelRef.current; if (m.stage !== "doors") return;
    if (performance.now() < m.transitionAt) return;
    const door = GAME_CONFIG.doors[m.doorIndex]; m.memoryBias += door.bias; m.stage = "classroom"; m.transitionAt = 0;
    toast(`${door.label} 已写入空间坐标 · 未判定真伪`); audioRef.current?.tone(510, .35, .12); syncUI();
  }, [syncUI, toast]);

  const enterVersions = useCallback(() => {
    const m = modelRef.current; m.stage = "versions"; m.activeVersion = m.memoryBias >= 0 ? "A" : "B"; m.transitionAt = 0;
    toast("两个版本均符合现存证据", 2800); audioRef.current?.setRainLevel(.07); syncUI();
  }, [syncUI, toast]);

  const processPressure = useCallback((heldMs: number) => {
    const m = modelRef.current; const kind = releaseKind(heldMs); const now = performance.now();
    m.pressureStartedAt = null; m.pressureHeldMs = 0;
    if (kind === "overload") { m.overloads += 1; m.reliability = Math.max(58, m.reliability - 4); m.memoryBias -= 1; audioRef.current?.tone(155, .5, .12); }

    if (m.stage === "tutorial") {
      if (m.tutorialStep === 1 && kind === "scan") { m.scanPulseUntil = now + 1200; m.tutorialStep = 2; toast("扫描波已校准 · 将压力保持在绿色区域"); audioRef.current?.tone(740, .25, .1); }
      else if (m.tutorialStep === 2 && kind !== "scan") { m.stableReads += kind === "focus" ? 1 : 0; m.stage = "archive"; toast(kind === "focus" ? "FOCUS LOCKED · 档案已打开" : "强制读取完成 · 已留下改写痕迹"); }
      else toast("轻按空格，发出扫描波");
    } else if (m.stage === "archive") {
      const target = nearestAnchor();
      if (target.d > .125) toast("SIGNAL LOST · 将扫描框移近异常区域");
      else if (kind === "scan") { m.scanned.add(target.id); m.scanPulseUntil = now + 1200; toast(`${target.title} · 异常已定位，稳定按住读取`); audioRef.current?.tone(820, .18, .08); }
      else {
        m.scanPulseUntil = now + 600;
        if (!m.scanned.has(target.id) && kind === "focus") toast("先轻按扫描，再保持压力读取");
        else if (!m.read.has(target.id)) {
          m.scanned.add(target.id); m.read.add(target.id); m.collected.add(target.fragment); m.stableReads += kind === "focus" ? 1 : 0;
          m.memoryBias += target.id === "figure" && kind === "focus" ? 2 : kind === "overload" ? -1 : 1;
          audioRef.current?.collect(target.fragment); toast(`MEMORY FRAGMENT ACQUIRED · ${target.fragment} / 5`, 2800);
          if (m.read.size === 3) m.transitionAt = now + 1800;
        } else toast("该锚点已写入记忆链");
      }
    } else if (m.stage === "corridor") {
      m.scanPulseUntil = now + (kind === "scan" ? 1200 : 700);
      if (kind === "focus") { m.stableReads += 1; collectCorridor(.15); }
      else if (kind === "overload") { collectCorridor(.22); toast("OVERLOAD · 走廊复制，假人物已写入"); }
      else if (!collectCorridor(.12)) toast("扫描波已发出 · 白色轮廓是真实碎片", 1500);
    } else if (m.stage === "doors") finishDoor();
    else if (m.stage === "classroom") {
      if (kind === "scan") toast("两个坐标都与现存碎片相容");
      else {
        const i = m.calibrationIndex; m.calibrationLocked[i] = true; m.stableReads += kind === "focus" ? 1 : 0; m.memoryBias += m.calibrationChoices[i] === "A" ? 2 : -2;
        toast(`${GAME_CONFIG.coordinates[i].label} 已校准 · ${m.calibrationChoices[i] === "A" ? GAME_CONFIG.coordinates[i].a : GAME_CONFIG.coordinates[i].b}`);
        const next = m.calibrationLocked.findIndex((v) => !v); if (next >= 0) m.calibrationIndex = next; else m.transitionAt = now + 1000;
      }
    } else if (m.stage === "reconstruct") {
      const i = m.puzzleIndex;
      if (kind === "scan") { m.puzzleSides[i] = m.puzzleSides[i] === "A" ? "B" : "A"; toast(`FRAGMENT ${i + 1} · 已切换解释`); }
      else { m.puzzleLocked[i] = true; m.stableReads += kind === "focus" ? 1 : 0; m.memoryBias += m.puzzleSides[i] === "A" ? 1 : -1; toast(kind === "overload" ? "碎片已锁定，并留下新的重影" : "碎片位置已锁定"); const next = m.puzzleLocked.findIndex((v) => !v); if (next >= 0) m.puzzleIndex = next; else m.transitionAt = now + 1000; }
    } else if (m.stage === "versions") {
      m.selectedVersion = m.activeVersion; m.stage = "finale"; m.finaleAt = now;
      m.report = buildSessionReport({
        runId: m.runId, startedAt: m.startedAt, selectedVersion: m.selectedVersion, memoryBias: m.memoryBias,
        fragments: m.collected.size, stableReads: m.stableReads, overloads: m.overloads, blankHits: m.blankHits,
        reliability: m.reliability, door: GAME_CONFIG.doors[m.doorIndex].label,
        calibration: GAME_CONFIG.coordinates.map((coordinate, index) => `${coordinate.label}:${m.calibrationChoices[index] === "A" ? coordinate.a : coordinate.b}`),
        reconstruction: GAME_CONFIG.fragments.map((fragment, index) => `${fragment.title}:${m.puzzleSides[index] === "A" ? fragment.a : fragment.b}`),
      });
      if (m.report) persistSessionReport(m.report);
      toast("选择已保存，但原始记忆仍无法确认", 2600); audioRef.current?.tone(520, .5, .12); window.setTimeout(() => audioRef.current?.tone(720, .5, .09), 150);
    }
    syncUI();
  }, [collectCorridor, finishDoor, nearestAnchor, syncUI, toast]);

  const moveScanner = (m: Model, action: InputEvent["action"]) => {
    const step = .055;
    if (action === "left") m.scanner.x = clamp(m.scanner.x - step, .1, .9);
    if (action === "right") m.scanner.x = clamp(m.scanner.x + step, .1, .9);
    if (action === "up") m.scanner.y = clamp(m.scanner.y - step, .19, .74);
    if (action === "down") m.scanner.y = clamp(m.scanner.y + step, .19, .74);
  };

  const handleInput = useCallback((event: InputEvent) => {
    const m = modelRef.current; const now = performance.now(); m.lastActionAt = now; void audioRef.current?.start();
    if (event.action === "reset") { reset(); return; }
    if (event.action === "export-report") { if (m.stage === "finale" && m.report) { downloadSessionReport(m.report); toast("本次体验数据已导出"); } return; }
    if (event.action === "fullscreen") { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); return; }
    if (event.action === "any-direction") { if (m.stage === "dormant") { m.stage = "tutorial"; m.tutorialStep = 0; toast("移动摇杆，定位异常区域"); audioRef.current?.tone(680, .32, .12); syncUI(); } return; }
    if (event.action === "pressure-start") { if (m.pressureStartedAt === null) m.pressureStartedAt = now; m.pressureHeldMs = 0; syncUI(); return; }
    if (event.action === "pressure-end") { processPressure(event.heldMs ?? now - (m.pressureStartedAt ?? now)); return; }

    if (["tutorial", "archive"].includes(m.stage)) {
      moveScanner(m, event.action); if (m.stage === "tutorial" && m.tutorialStep === 0) { m.tutorialStep = 1; toast("异常区域已定位 · 轻按空格发出扫描波"); } syncUI(); return;
    }
    if (m.stage === "corridor") {
      if (event.action === "left" && m.lane > 0) { m.lane -= 1; m.memoryBias += .12; }
      if (event.action === "right" && m.lane < 2) { m.lane += 1; m.memoryBias -= .12; }
      if (event.action === "up") m.progress = Math.min(1.01, m.progress + .018);
      if (event.action === "down") m.progress = Math.max(0, m.progress - .008);
      syncUI(); return;
    }
    if (m.stage === "doors") { if (event.action === "left") m.doorIndex = Math.max(0, m.doorIndex - 1); if (event.action === "right") m.doorIndex = Math.min(2, m.doorIndex + 1); if (event.action === "up") { finishDoor(); return; } syncUI(); return; }
    if (m.stage === "classroom") {
      const i = m.calibrationIndex; if (event.action === "left") m.calibrationChoices[i] = "A"; if (event.action === "right") m.calibrationChoices[i] = "B";
      if (event.action === "up" || event.action === "down") m.calibrationIndex = (i + (event.action === "up" ? 2 : 1)) % 3; syncUI(); return;
    }
    if (m.stage === "reconstruct") {
      const i = m.puzzleIndex; if (event.action === "left") m.puzzleSides[i] = "A"; if (event.action === "right") m.puzzleSides[i] = "B";
      if (event.action === "up" || event.action === "down") m.puzzleIndex = (i + (event.action === "up" ? 4 : 1)) % 5; syncUI(); return;
    }
    if (m.stage === "versions" && (event.action === "left" || event.action === "right")) { m.activeVersion = event.action === "left" ? "A" : "B"; audioRef.current?.footsteps(m.activeVersion === "A" ? 2 : 1); audioRef.current?.clock(); syncUI(); }
  }, [finishDoor, processPressure, reset, syncUI, toast]);

  useEffect(() => {
    const input = new GameInput(); const audio = new MemoryAudio(); inputRef.current = input; audioRef.current = audio; input.attach(); const unsubscribe = input.subscribe(handleInput);
    return () => { unsubscribe(); input.detach(); audio.destroy(); inputRef.current = null; audioRef.current = null; };
  }, [handleInput]);

  useEffect(() => {
    const tick = (now: number) => {
      const m = modelRef.current; const canvas = canvasRef.current; const dt = Math.min(.05, Math.max(0, (now - (lastFrameRef.current || now)) / 1000)); lastFrameRef.current = now;
      if (m.pressureStartedAt !== null) m.pressureHeldMs = now - m.pressureStartedAt;
      if (m.stage === "archive" && m.transitionAt && now >= m.transitionAt) { m.stage = "corridor"; m.transitionAt = 0; m.progress = 0; m.lane = 1; toast("ARCHIVE OPENED · 记忆是一处仍在变化的空间", 3200); audioRef.current?.setRainLevel(.17); syncUI(); }
      if (m.stage === "corridor") {
        const held = m.pressureStartedAt !== null; const ratio = pressureRatio(m.pressureHeldMs); const speed = held && ratio >= .3 && ratio < .7 ? .0045 : .014;
        const before = m.progress; m.progress += dt * speed; if (m.scanPulseUntil > now || (held && ratio >= .3 && ratio < .7)) collectCorridor(.075);
        if (Math.floor(before * 12) !== Math.floor(m.progress * 12)) audioRef.current?.footsteps(m.memoryBias >= 0 ? 2 : 1);
        if (m.progress > .14 && m.progress < .28) { const key = `blank-${m.lane}`; const blankLane = Math.floor((m.progress * 8) % 3); if (m.lane === blankLane && !m.corridorEvents.has(key)) { m.corridorEvents.add(key); m.blankHits += 1; m.reliability = Math.max(58, m.reliability - 3); toast("空白数据区 · 档案可信度下降"); } }
        if (m.progress >= .55 && !m.corridorEvents.has("figure")) { m.corridorEvents.add("figure"); if (m.lane === 0) { m.memoryBias -= 1; toast("你避开了错误人物"); } else if (m.lane === 1) { m.memoryBias += 1; toast("人物轮廓被保留为未确认线索"); } else { m.memoryBias -= 2; m.overloads += 1; toast("你穿过了人物 · 新重影已生成"); } }
        if (m.progress >= 1) { if (m.collected.has(4) && m.collected.has(5)) { m.stage = "doors"; m.progress = 1; m.transitionAt = now + 450; toast("走廊尽头出现三个同样熟悉的入口"); } else { m.progress = .04; m.corridorEvents.clear(); toast("仍有碎片留在走廊 · 路径已回环"); } syncUI(); }
      }
      if (m.stage === "classroom" && m.transitionAt && now >= m.transitionAt) { m.stage = "reconstruct"; m.transitionAt = 0; toast("五块碎片已送入档案工作台"); syncUI(); }
      if (m.stage === "reconstruct" && m.transitionAt && now >= m.transitionAt) enterVersions();
      if (m.stage === "finale" && m.finaleAt && now - m.finaleAt >= GAME_CONFIG.finaleResetMs) reset();
      if (canvas) {
        const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); const tw = Math.max(1, Math.floor(rect.width * dpr)); const th = Math.max(1, Math.floor(rect.height * dpr)); if (canvas.width !== tw || canvas.height !== th) { canvas.width = tw; canvas.height = th; }
        const ctx = canvas.getContext("2d"); if (ctx) renderFrame(ctx, tw, th, { stage: m.stage, now, pressure: pressureRatio(m.pressureHeldMs), scanner: m.scanner, scanned: m.scanned, read: m.read, scanPulseUntil: m.scanPulseUntil, progress: m.progress, lane: m.lane, collected: m.collected, doorIndex: m.doorIndex, calibrationIndex: m.calibrationIndex, calibrationChoices: m.calibrationChoices, puzzleIndex: m.puzzleIndex, puzzleSides: m.puzzleSides, puzzleLocked: m.puzzleLocked, activeVersion: m.activeVersion, overloads: m.overloads, selectedVersion: m.selectedVersion });
      }
      if (now - uiFrameRef.current > 90) { uiFrameRef.current = now; syncUI(); }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(rafRef.current);
  }, [collectCorridor, enterVersions, reset, syncUI, toast]);

  useEffect(() => {
    const bridge = {
      getState: () => ({ ...modelRef.current, scanned: [...modelRef.current.scanned], read: [...modelRef.current.read], collected: [...modelRef.current.collected] }),
      input: (action: InputEvent["action"], heldMs?: number) => inputRef.current?.emitHardware(action, heldMs),
      setScannerAtAnchor: (id: ArchiveAnchorId) => { const a = GAME_CONFIG.anchors.find((x) => x.id === id); if (a) { modelRef.current.scanner = { x: a.x, y: a.y }; syncUI(); } },
      jumpCorridor: (progress: number, lane: number) => { modelRef.current.stage = "corridor"; modelRef.current.progress = progress; modelRef.current.lane = clamp(lane, 0, 2); syncUI(); }, reset,
    };
    (window as Window & { __memoryDriftDebug?: typeof bridge }).__memoryDriftDebug = bridge;
    return () => { delete (window as Window & { __memoryDriftDebug?: typeof bridge }).__memoryDriftDebug; };
  }, [reset, syncUI]);

  const renderNow = nowSafe(); const pressing = current.pressureStartedAt !== null; const ratio = pressureRatio(pressing ? current.pressureHeldMs : 0);
  const pressureState = !pressing || ratio < .3 ? "UNSTABLE" : ratio < .7 ? "FOCUS" : "OVERLOAD";
  const idle = renderNow - current.lastActionAt > GAME_CONFIG.idleHintMs;
  const meta = STAGE_META[current.stage]; const anchor = GAME_CONFIG.anchors.map((a) => ({ ...a, d: Math.hypot(a.x - current.scanner.x, (a.y - current.scanner.y) * .7) })).sort((a, b) => a.d - b.d)[0];
  const prompt = useMemo(() => {
    if (current.stage === "dormant") return "移动摇杆唤醒档案";
    if (current.stage === "tutorial") return ["移动摇杆，定位异常区域", "轻按空格，发出扫描波", "稳定按住，将压力保持在绿色区域"][current.tutorialStep];
    if (current.stage === "archive") return "移动扫描框 · 轻按扫描 · 稳定按住读取";
    if (current.stage === "corridor") return "左右换轨 · 轻按扫描 · 稳定按住减速读取";
    if (current.stage === "doors") return "左右选择门 · 上键或空格进入";
    if (current.stage === "classroom") return "左右选择坐标 · 稳定按住确认";
    if (current.stage === "reconstruct") return "左右切换解释 · 稳定按住锁定碎片";
    if (current.stage === "versions") return "左右切换版本 · 空格保存";
    return "E 导出本次数据 · 10 秒后自动返回待机";
  }, [current.stage, current.tutorialStep]);
  const affinityA = Math.round(clamp(50 + current.memoryBias * 4, 18, 82)); const affinityB = 100 - affinityA;
  const version = GAME_CONFIG.versions[current.activeVersion];

  const toggleMute = () => { const next = !muted; setMuted(next); audioRef.current?.setMuted(next); };
  const emitTouch = (action: InputEvent["action"]) => { inputRef.current?.emitTouch(action); if (["left", "right", "up", "down"].includes(action)) inputRef.current?.emitTouch("any-direction"); };
  const startTouchPressure = () => { touchPressureAt.current = performance.now(); inputRef.current?.emitTouch("pressure-start"); };
  const endTouchPressure = () => inputRef.current?.emitTouch("pressure-end", performance.now() - touchPressureAt.current);

  return (
    <main className={`game-shell stage-${current.stage}`} data-stage={current.stage} data-progress={current.progress.toFixed(3)} data-collected={current.collected.size} data-pressure={pressureState} data-bias={current.memoryBias.toFixed(2)}>
      <section className="game-frame" aria-label="记忆漂移互动游戏">
        <canvas ref={canvasRef} className="scene-canvas" aria-hidden="true" /><div className="memory-vignette" /><div className="scanline" />
        <header className="archive-header"><div><p>{GAME_CONFIG.archive}</p><strong>{meta.eyebrow} · {meta.title}</strong></div><div className="header-actions"><span className={`status-chip status-${meta.status.toLowerCase()}`}>{meta.status}</span><button className="icon-button" onClick={toggleMute}>{muted ? "声音关" : "声音开"}</button></div></header>

        {current.stage === "dormant" && <section className="center-copy dormant-copy"><p className="micro">MEMORY ARCHIVE 07 · STATUS: DORMANT</p><h1>MEMORY<br />DRIFT</h1><p>等待寻忆者接入</p></section>}

        {current.stage === "tutorial" && <section className="tutorial-card panel"><p className="micro">INPUT CALIBRATION · 0{current.tutorialStep + 1}/03</p><h2>{["定位异常区域", "发出记忆扫描波", "将压力保持在绿色区域"][current.tutorialStep]}</h2><div className="tutorial-steps">{[0,1,2].map((i)=><span key={i} className={i<=current.tutorialStep?"active":""} />)}</div><p>{prompt}</p></section>}

        {current.stage === "archive" && <><section className="archive-console panel"><p className="micro">ARCHIVE RELIABILITY · {current.reliability}%</p><h2>{anchor.d < .125 ? anchor.title : "移动扫描框寻找异常"}</h2><p>{anchor.d < .125 ? current.read.has(anchor.id) ? "READ / 已写入记忆链" : current.scanned.has(anchor.id) ? "SCAN FOUND / 保持压力读取" : "ANOMALY NEARBY / 轻按扫描" : "边缘噪点将在靠近线索时增强"}</p></section><aside className="anchor-list panel">{GAME_CONFIG.anchors.map((a,i)=><div key={a.id} className={current.read.has(a.id)?"done":current.scanned.has(a.id)?"scanned":""}><span>0{i+1}</span><strong>{a.title}</strong><i>{current.read.has(a.id)?"READ":current.scanned.has(a.id)?"FOUND":"—"}</i></div>)}</aside></>}

        {current.stage === "corridor" && <><aside className="corridor-card panel"><span>B-307 / A-307</span><strong>{current.progress < .34 ? "保存层" : current.progress < .68 ? "漂移层" : "遗忘层"}</strong><small>时间戳 17:42 / 18:12</small></aside><div className="lane-indicator">{[0,1,2].map((l)=><span key={l} className={current.lane===l?"active":""}/>)}</div></>}

        {current.stage === "doors" && <section className="door-copy panel"><p className="micro">THREE PLAUSIBLE EXITS</p><h2>{GAME_CONFIG.doors[current.doorIndex].label}</h2><p>选择不会触发失败，只会改变接下来出现的教室。</p></section>}

        {current.stage === "classroom" && <section className="calibration panel"><p className="micro">COORDINATE {current.calibrationIndex+1} / 03</p><h2>{GAME_CONFIG.coordinates[current.calibrationIndex].label}</h2><div className="binary-choice"><button className={current.calibrationChoices[current.calibrationIndex]==="A"?"active":""}>{GAME_CONFIG.coordinates[current.calibrationIndex].a}</button><button className={current.calibrationChoices[current.calibrationIndex]==="B"?"active":""}>{GAME_CONFIG.coordinates[current.calibrationIndex].b}</button></div><div className="lock-dots">{current.calibrationLocked.map((v,i)=><span key={i} className={v?"locked":i===current.calibrationIndex?"active":""}/>)}</div><p>两个坐标都合理。保持压力，锁定你正在看的版本。</p></section>}

        {current.stage === "reconstruct" && <section className="puzzle-card panel"><p className="micro">FRAGMENT {current.puzzleIndex+1} / 05</p><h2>{GAME_CONFIG.fragments[current.puzzleIndex].title}</h2><p>{current.puzzleSides[current.puzzleIndex]==="A"?GAME_CONFIG.fragments[current.puzzleIndex].a:GAME_CONFIG.fragments[current.puzzleIndex].b}</p><div className="lock-dots five">{current.puzzleLocked.map((v,i)=><span key={i} className={v?"locked":i===current.puzzleIndex?"active":""}/>)}</div></section>}

        {current.stage === "versions" && <section className="version-panel panel"><p className="micro">MULTIPLE VERSION · {current.activeVersion === "A" ? "01" : "02"}/02</p><h2>Version {current.activeVersion}：{version.title}</h2><dl><div><dt>时间 / 地点</dt><dd>{version.time} · {version.room}</dd></div><div><dt>人物</dt><dd>{version.people}</dd></div><div><dt>离开</dt><dd>{version.leaving}</dd></div><div><dt>拍摄</dt><dd>{version.camera}</dd></div><div><dt>声音</dt><dd>{version.voice}</dd></div></dl><blockquote>照片背面：{version.back}</blockquote><div className="affinity"><span>操作痕迹偏向 A {affinityA}%</span><i><b style={{width:`${affinityA}%`}}/></i><span>B {affinityB}%</span></div><strong className="unknown">两个版本均符合现存证据<br/>ORIGINAL MEMORY: UNKNOWN</strong></section>}

        {current.stage === "finale" && <section className="finale-copy center-copy"><p className="micro">VERSION {current.selectedVersion} SAVED · ORIGINAL UNKNOWN</p><h2>MEMORY RESTORED<br/><span>BUT ALTERED</span></h2><p className="cn-title">记忆已恢复，但已发生改变</p><p>你没有找回原始记忆。<br/>你完成了一次新的记忆保存。</p><div className="run-stats"><span>碎片<strong>{current.collected.size}/5</strong></span><span>稳定读取<strong>{current.stableReads}</strong></span><span>过载<strong>{current.overloads}</strong></span><span>可信度<strong>{current.reliability}%</strong></span></div><strong>ORIGINAL MEMORY: UNKNOWN<br/>原始记忆：无法确认</strong><button className="report-button" onClick={()=>current.report&&downloadSessionReport(current.report)}>E · 导出测试记录</button><small className="session-id">{current.runId}</small><div className="reset-progress"><span style={{animationDuration:`${GAME_CONFIG.finaleResetMs}ms`}}/></div></section>}

        {current.stage !== "dormant" && current.stage !== "finale" && <aside className="fragment-rail"><span>{String(current.collected.size).padStart(2,"0")} / 05</span>{[1,2,3,4,5].map((id)=><i key={id} className={current.collected.has(id)?"filled":""}>{current.collected.has(id)?id:""}</i>)}</aside>}
        {(idle || current.stage === "dormant") && current.stage !== "finale" && <div className="idle-nudge"><span>↕</span><b>SPACE</b></div>}
        {current.toast && current.toastUntil > renderNow && <div className="toast">{current.toast}</div>}

        <footer className="control-footer"><div className="prompt-line"><span/>{prompt}</div><div className="pressure-row"><span>PRESSURE</span><div className="pressure-track"><i className="green-zone"/><b style={{transform:`scaleX(${ratio})`}}/></div><strong className={`pressure-${pressureState.toLowerCase()}`}>{pressureState}</strong></div></footer>
        {process.env.NODE_ENV !== "production" && <div className="qa-controls" aria-hidden="true"><button tabIndex={-1} data-testid="qa-focus" onClick={()=>processPressure(1500)}>focus</button><button tabIndex={-1} data-testid="qa-overload" onClick={()=>processPressure(2600)}>overload</button></div>}
        <div className="touch-controls"><div className="touch-dpad"><button onPointerDown={()=>emitTouch("up")}>↑</button><button onPointerDown={()=>emitTouch("left")}>←</button><button onPointerDown={()=>emitTouch("down")}>↓</button><button onPointerDown={()=>emitTouch("right")}>→</button></div><button className="touch-pressure" onPointerDown={startTouchPressure} onPointerUp={endTouchPressure} onPointerCancel={endTouchPressure}><span>PRESS</span></button></div>
      </section>
    </main>
  );
}
