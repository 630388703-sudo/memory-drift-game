"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryAudio, type MemoryCue } from "./memory-audio";
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto, photoCount, type PhotoSlots } from "./memory-storage";
import { snapshotPhotos, summarizePhotos, firstCarriedSlot } from "./photo-evidence";
import { COUNT_OPTIONS, moveChoiceIndex, recallLabel } from "./memory-recall";
import { createWorld, stepWorld, readingZoneAt, type WorldEvent } from "./pixel-world";
import { dialogueLines, dialogueSummary, type DialogueZone } from "./memory-dialogue";
import { createPixelInput, loadPixelBindings, DEFAULT_BUTTONS, type PixelConnection, type PixelAction, type PixelTouchAction, type PixelDevice } from "./pixel-input";
import { practiceStep, PRACTICE_STEPS, type PracticeStep } from "./pixel-tutorial";
import { loadPixelArt, drawPixelWorld, drawMemoryPhoto, drawGameObject, type PixelArt } from "./pixel-renderer";
import "./pixel-game.css";

type Screen = "title" | "practice" | "loading" | "observe" | "count" | "play" | "pause" | "controls" | "result";
type Lang = "en" | "zh";
type RecordData = { recalls: number[]; dialogueSeen: DialogueZone[]; photos: PhotoSlots; retained: number; collected: number; altered: number; replaced: number };
type ResultView = "carried" | "original" | "recall";
const PHOTO_MISSION: [string, string] = ["捡起原图的副本，带到终点核对。", "Carry copies of the original to check at the end."];
const ACTIONS: PixelAction[] = ["jump", "protect", "confirm", "pause", "compare", "help"];
const KEY_LABELS = ["Z / Space", "X", "Enter", "P / Esc", "C", "H"];
const NAMES = { en: ["Jump", "Protect photo", "Confirm", "Pause", "Compare (ending)", "Controls"], zh: ["跳跃", "保护照片", "确认", "暂停", "结尾看原图", "操作说明"] };

function Icon({ kind }: { kind: "pause" | "sound" | "muted" | "settings" | "left" | "right" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {kind === "pause" ? <><path d="M8 4v16M16 4v16" strokeWidth="4" /></> : kind === "settings" ? <><path d="M4 7h16M4 17h16" /><path d="M8 3v8M16 13v8" strokeWidth="4" /></> : kind === "left" || kind === "right" ? <path d={kind === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} /> : <><path d="M3 9h4l5-5v16l-5-5H3z" />{kind === "sound" ? <path d="M16 8q5 4 0 8M19 4q8 8 0 16" /> : <path d="M16 9l6 6m0-6l-6 6" />}</>}
  </svg>;
}

function Photo({ art, count = 4, sky = "blue", carousel = "right", label, obscured = false }: { art: PixelArt | null; count?: number; sky?: string; carousel?: string; label: string; obscured?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !art) return;
    drawMemoryPhoto(ctx, art, { count, sky, carousel });
    // Interference obscures this carried copy, never changes the original or invents people.
    if (obscured) {
      ctx.fillStyle = '#8196b5'; ctx.fillRect(0, 166, 480, 54);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = i % 3 === 0 ? '#df96b8' : '#70c9de';
        ctx.fillRect(i * 20, 170 + (i % 4) * 12, 16, 3);
      }
    }
  }, [art, count, sky, carousel, obscured]);
  return <canvas ref={ref} width={480} height={270} className="px-memory-photo" role="img" aria-label={label} />;
}

function Sprite({ art, index = 4 }: { art: PixelArt | null; index?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx && art) { ctx.clearRect(0, 0, 40, 40); ctx.imageSmoothingEnabled = false; drawGameObject(ctx, art, index, 2, 2, 36, 36); } }, [art, index]);
  return <canvas ref={ref} width={40} height={40} aria-hidden="true" />;
}

export default function LandscapeMemoryGame() {
  const [language, setLanguage] = useState<Lang>("en");
  const [screen, setScreen] = useState<Screen>("title");
  const [art, setArt] = useState<PixelArt | null>(null);
  const [assetError, setAssetError] = useState(false);
  const [sound, setSound] = useState(true);
  const [device, setDevice] = useState<PixelDevice>("keyboard");
  const [stage, setStage] = useState(0);
  const [selection, setSelection] = useState(-1);
  const [recalls, setRecalls] = useState<number[]>([]);
  const [photos, setPhotos] = useState<PhotoSlots>(emptyPhotoSlots);
  const [feedback, setFeedback] = useState<[string, string]>(PHOTO_MISSION);
  const [comment, setComment] = useState<0 | DialogueZone>(0);
  const [resultView, setResultView] = useState<ResultView>("carried");
  const [carriedSlot, setCarriedSlot] = useState(-1);
  const compareReturn = useRef<ResultView>("carried");
  const [bindings, setBindings] = useState(loadPixelBindings);
  const [connection, setConnection] = useState<PixelConnection>({ connected: false, id: '', buttons: 0 });
  const [pressedButton, setPressedButton] = useState<number | null>(null);
  const [practice, setPractice] = useState<PracticeStep>('move');
  const [shield, setShield] = useState(false);
  const [bindingAction, setBindingAction] = useState<PixelAction | null>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [replaced, setReplaced] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLElement>(null);
  const world = useRef(createWorld());
  const runtime = useRef({ screen: "title" as Screen, stage: 0, selection: -1, recalls: [] as number[], dialogueSeen: [] as DialogueZone[], photos: emptyPhotoSlots(), replaced: 0, comment: 0 as 0 | DialogueZone, sound: true, returnScreen: "title" as Screen, activeScreen: "play" as "play" | "practice", practice: 'move' as PracticeStep, shield: false });
  const input = useRef<ReturnType<typeof createPixelInput> | null>(null);
  const audio = useRef<MemoryAudio | null>(null);
  const artRef = useRef<PixelArt | null>(null);
  const actions = useRef({ action: (_a: PixelAction, _p: boolean) => {}, navigate: (_d: number) => {}, event: (_e: WorldEvent) => {} });
  const bootTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);
  const label = (value: string | number | undefined) => recallLabel(value, language);

  const cue = (name: MemoryCue) => { if (runtime.current.sound) audio.current?.play(name); };
  const unlock = () => {
    if (!runtime.current.sound) return;
    try { if (!audio.current) audio.current = new MemoryAudio(new AudioContext(), document.baseURI); audio.current.unlock(); } catch { /* Sound is optional. */ }
  };
  const changeScreen = (next: Screen) => {
    runtime.current.screen = next;
    input.current?.clear();
    setScreen(next);
    audio.current?.setScene((["A", "B", "C"] as const)[Math.min(world.current.checkpoint, 2)], next !== "play" && next !== "practice");
  };
  const choose = (index: number) => { runtime.current.selection = index; setSelection(index); cue("confirm"); };
  const ask = (index: number) => {
    runtime.current.stage = index; runtime.current.selection = -1;
    setStage(index); setSelection(-1); changeScreen("count");
  };
  const setSlots = (next: PhotoSlots) => { runtime.current.photos = next; setPhotos(next); };
  const reset = () => {
    world.current = createWorld();
    runtime.current.recalls = []; runtime.current.dialogueSeen = []; runtime.current.replaced = 0; runtime.current.comment = 0; runtime.current.shield = false;
    setRecalls([]); setShield(false); setReplaced(0); setComment(0); setSlots(emptyPhotoSlots()); setRecord(null); setResultView("carried"); setCarriedSlot(-1);
    setFeedback(PHOTO_MISSION);
    changeScreen("observe");
  };
  const begin = () => {
    if (!artRef.current) return;
    world.current = createWorld();
    runtime.current.shield = false; setShield(false);
    setFeedback(PHOTO_MISSION);
    unlock(); changeScreen("loading"); cue("wake");
    bootTimer.current = setTimeout(() => { changeScreen("observe"); cue("ready"); }, 2200);
  };
  const startPractice = () => {
    if (!artRef.current) return;
    world.current = createWorld('practice');
    runtime.current.practice = 'move'; runtime.current.shield = false;
    setPractice('move'); setShield(false); setFeedback(['先试试按键，练习不计入正式游戏。', 'This is practice. It will not change your photographs.']);
    unlock(); changeScreen('practice');
  };
  const submit = () => {
    const state = runtime.current;
    if (state.screen !== "count" || state.selection < 0) return;
    cue("confirm");
    const next = [...state.recalls]; next[state.stage] = COUNT_OPTIONS[state.selection];
    state.recalls = next; setRecalls(next); changeScreen("play");
    setFeedback(state.stage === 0 ? PHOTO_MISSION : ["记下了。带好照片，继续往右走。", "Answer saved. Keep your copies with you."]);
  };
  const openControls = () => {
    if (runtime.current.screen === "controls" || runtime.current.screen === "loading") return;
    runtime.current.returnScreen = runtime.current.screen;
    changeScreen("controls");
  };
  const closeControls = () => { input.current?.capture(null); setBindingAction(null); changeScreen(runtime.current.returnScreen); };
  const togglePause = () => {
    if (runtime.current.screen === "play" || runtime.current.screen === "practice") { runtime.current.activeScreen = runtime.current.screen; changeScreen("pause"); }
    else if (runtime.current.screen === "pause") changeScreen(runtime.current.activeScreen);
    else if (runtime.current.screen === "controls") closeControls();
  };
  const finish = () => {
    const state = runtime.current;
    const next: RecordData = { recalls: [...state.recalls], dialogueSeen: [...state.dialogueSeen], photos: snapshotPhotos(state.photos), retained: photoCount(state.photos), collected: world.current.collected.size, altered: state.photos.filter(p => p?.altered).length, replaced: state.replaced };
    setRecord(next); setResultView("carried"); setCarriedSlot(firstCarriedSlot(next.photos)); compareReturn.current = "carried"; changeScreen("result"); cue("finish");
    try { localStorage.setItem("memory-drift.pixel-record.v3", JSON.stringify(next)); } catch { /* Visits still work without local storage. */ }
  };

  actions.current = {
    action(action, pressed) {
      const current = runtime.current.screen;
      if (pressed) unlock();
      if (action === "compare" && current === "result") {
        if (pressed) { compareReturn.current = resultView; setResultView("original"); }
        else setResultView(compareReturn.current);
        return;
      }
      if (!pressed) return;
      if (action === "pause") { togglePause(); return; }
      if (action === "help") { if (current === "controls") closeControls(); else openControls(); return; }
      if (current === "play" || current === "loading" || (current === "practice" && runtime.current.practice !== "done")) return;
      if (action === "jump" || action === "confirm") {
        const focused = document.activeElement;
        const button = focused instanceof HTMLButtonElement && overlay.current?.contains(focused) ? focused : overlay.current?.querySelector<HTMLButtonElement>("[data-primary]");
        if (button && !button.disabled) button.click();
      }
    },
    navigate(direction) {
      const current = runtime.current.screen;
      if (current === "count") {
        choose(moveChoiceIndex(runtime.current.selection, direction));
        // Confirm should submit the selection rather than re-click the focused option.
        requestAnimationFrame(() => overlay.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus());
      } else if (current !== "play" && current !== "loading" && current !== "practice") {
        const buttons = Array.from(overlay.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!buttons.length) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[at < 0 ? (direction > 0 ? 0 : buttons.length - 1) : (at + direction + buttons.length) % buttons.length]?.focus();
      }
    },
    event(event) {
      const state = runtime.current;
      if (state.screen === 'practice') {
        if (event.type === 'photo') { cue('collect'); setFeedback(['捡到了！落回地面，试试保护键。', 'Got it. Return to the ground and try protecting it.']); }
        else if (event.type === 'protect') { cue('protect'); setFeedback(['保护已开启，等泡泡过来。', 'Ready. Let the signal reach you.']); }
        else if (event.type === 'block') { cue('block'); setFeedback(['挡住了！可以正式开始了。', 'Blocked. You are ready to begin.']); }
        else if (event.type === 'bubble' || event.type === 'collision') { cue('bubble'); setFeedback(['练习时不会丢照片。松开保护键，再长按一次。', 'Photo safe. Release Protect, then hold it again.']); }
        return;
      }
      if (event.type === "photo") {
        const full = photoCount(state.photos) === 5;
        if (full) { state.replaced++; setReplaced(state.replaced); }
        setSlots(storePhoto(state.photos, { id: Number(event.id.split("-")[1]), at: world.current.time, version: (["A", "B", "C"] as const)[world.current.checkpoint], altered: false }));
        cue(full ? "overwrite" : "collect");
        setFeedback(full ? ["背包满了，换下最早的一张。保住副本，终点再核对。", "Five slots full. The new copy replaces the oldest."] : ["捡到一张原图副本，终点可以拿它核对。", "A copy saved. You can inspect it at the end."]);
      } else if (event.type === "collision") { const hadPhoto = photoCount(state.photos) > 0; setSlots(losePhoto(state.photos)); cue("collision"); setFeedback(hadPhoto ? ["撞到了，丢了一张照片。", "Hit. One stored photo was lost."] : ["撞到障碍了。", "You hit an obstacle."]); }
      else if (event.type === "bubble") { const hadPhoto = photoCount(state.photos) > 0; setSlots(alterPhoto(state.photos)); cue("bubble"); setFeedback(hadPhoto ? ["副本被干扰了，上面的人看不清了。原图没有变。", "Interference obscured a copy. The original is unchanged."] : ["碰到泡泡，画面抖了一下。", "A bubble disturbed the picture."]); }
      else if (event.type === "protect") { cue("protect"); setFeedback(["四秒内挡一次撞击或泡泡，保住手里的副本。", "One block for four seconds. Keep your copies intact."]); }
      else if (event.type === "block") { cue("block"); setFeedback(["挡住了！留住了可以带去核对的照片。", "Blocked. Your copies are still available to check."]); }
      else if (event.type === "checkpoint") { ask(event.index); cue("transition"); }
      else if (event.type === "finish") finish();
      else if (event.type === "spring") { cue('confirm'); setFeedback(['弹起来了，上面有照片！', 'Up you go. There is a photograph above.']); }
    },
  };

  useEffect(() => {
    let live = true;
    void loadPixelArt().then(value => { if (live) { artRef.current = value; setArt(value); } }).catch(() => { if (live) setAssetError(true); });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches); updateMotion(); motion.addEventListener("change", updateMotion);
    input.current = createPixelInput({ onAction: (a, p) => actions.current.action(a, p), onNavigate: d => actions.current.navigate(d), onDevice: setDevice, onConnection: setConnection, onButton: (index, pressed) => setPressedButton(previous => pressed ? index : previous === index ? null : previous), onRebind: (_a, _i, next) => { setBindings(next); setBindingAction(null); }, onDisconnect: () => { if (runtime.current.screen === "play" || runtime.current.screen === "practice") togglePause(); } });
    input.current.setLayout(6);
    const onBlur = () => { if (runtime.current.screen === "play" || runtime.current.screen === "practice") togglePause(); audio.current?.setActive(false); };
    const onFocus = () => audio.current?.setActive(!document.hidden);
    const onVisibility = () => document.hidden ? onBlur() : onFocus();
    window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisibility);
    return () => { live = false; input.current?.dispose(); input.current = null; audio.current?.dispose(); audio.current = null; if (bootTimer.current) clearTimeout(bootTimer.current); motion.removeEventListener("change", updateMotion); window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    let frame = 0, previous = 0, accumulator = 0, jumpQueued = false;
    const render = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .06) : 0; previous = now;
      const controls = input.current?.read() ?? { axis: 0, jump: false, jumpPressed: false, protect: false };
      if (runtime.current.screen === "play" || (runtime.current.screen === "practice" && runtime.current.practice !== 'done')) {
        accumulator += delta; jumpQueued ||= controls.jumpPressed;
        while (accumulator >= 1 / 120 && (runtime.current.screen === "play" || runtime.current.screen === 'practice')) {
          const practicing = runtime.current.screen === 'practice';
          const events = stepWorld(world.current, { ...controls, jumpPressed: jumpQueued, protect: controls.protect && (practicing ? world.current.collected.size > 0 : photoCount(runtime.current.photos) > 0) }, 1 / 120);
          jumpQueued = false; accumulator -= 1 / 120;
          events.forEach(event => actions.current.event(event));
          if (practicing) {
            const next = practiceStep(world.current);
            if (next !== runtime.current.practice) { runtime.current.practice = next; setPractice(next); }
            if (next === 'done') { input.current?.clear(); accumulator = 0; break; }
          }
        }
        const shieldActive = world.current.shieldUntil > world.current.time;
        if (shieldActive !== runtime.current.shield) { runtime.current.shield = shieldActive; setShield(shieldActive); }
        const nextComment = runtime.current.screen === 'play' ? readingZoneAt(world.current.x) : 0;
        if (nextComment !== runtime.current.comment) {
          runtime.current.comment = nextComment; setComment(nextComment);
          // A displayed passage is not evidence that the visitor read or believed it.
          if (nextComment && !runtime.current.dialogueSeen.includes(nextComment)) runtime.current.dialogueSeen.push(nextComment);
        }
      } else { accumulator = 0; jumpQueued = false; }
      const ctx = canvas.current?.getContext("2d");
      if (ctx && artRef.current) drawPixelWorld(ctx, world.current, artRef.current, { reducedMotion, idle: runtime.current.screen !== "play" && runtime.current.screen !== 'practice', version: Math.min(world.current.checkpoint, 2) as 0 | 1 | 2 });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; document.title = language === "zh" ? "忘了自己是什么 · 像素横屏版" : "What Was I Again? · Pixel Edition"; }, [language]);
  useEffect(() => { overlay.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus({ preventScroll: true }); }, [screen]);
  useEffect(() => { if (screen === 'practice' && practice === 'done') overlay.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus({ preventScroll: true }); }, [screen, practice]);

  const bindTouch = (action: PixelTouchAction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); unlock(); input.current?.setTouch(action, true); },
    onPointerUp: () => input.current?.setTouch(action, false), onPointerCancel: () => input.current?.setTouch(action, false), onLostPointerCapture: () => input.current?.setTouch(action, false),
  });
  const isQuestion = screen === "count";
  const options = COUNT_OPTIONS;
  const area = Math.min(world.current.checkpoint, 2);
  const areaTitles = language === "en" ? ["THE FIRST IMAGE", "A STORY RETOLD", "LOOK BACK"] : ["第一张照片", "一路传下来的话", "再想一遍"];
  const primaryText = tr("看好了", "I have seen it");
  const buttonName = (action: PixelAction) => `${tr("键", "BTN ")}${bindings[action] + 1}`;
  const prompt = (action: PixelAction) => device === 'gamepad' ? buttonName(action) : device === 'touch' ? NAMES[language][ACTIONS.indexOf(action)] : KEY_LABELS[ACTIONS.indexOf(action)];
  const moving = screen === 'play' || screen === 'practice';
  const practiceIndex = practice === 'done' ? 4 : PRACTICE_STEPS.indexOf(practice);
  const practiceCopy = {
    move: [tr('先试试左右移动', 'Try moving.'), tr('往右走，到箭头路标那里。', 'Move left or right toward the arrow.'), device === 'keyboard' ? '← → / A D' : tr('摇杆左右', 'STICK ← →')],
    jump: [tr('跳一下试试', 'Now jump.'), tr('轻按跳得低，按住跳得高。', 'Hold Jump for a higher leap. Release for a short hop.'), prompt('jump')],
    collect: [tr('够到上面的照片', 'Get the photograph.'), tr('正式游戏要把副本带到终点核对。先练习：往右跳，碰到就能捡起。', 'In the game, copies are kept for comparison. Practice reaching this one: jump right.'), `${device === 'keyboard' ? '→' : tr('摇杆', 'STICK')} + ${prompt('jump')}`],
    protect: [tr('挡住过来的泡泡', 'Block the signal.'), tr('回到地面，长按保护键。边框亮了就松开，等泡泡过来。', 'Land, then hold Protect. Release when the outline lights up and let the signal reach you.'), prompt('protect')],
    done: [tr('准备好了', 'You are ready.'), tr('正式游戏要把副本带到终点。撞击会丢照片，泡泡会遮住人物。这次练习不带入正式游戏。', 'Keep copies to inspect at the end. Hits lose a copy; signals obscure it. Practice does not carry over.'), prompt('confirm')],
  };
  const cabinetLabel = <span className="px-cabinet-label">{tr('六个按键 · 每排三个', '6 BUTTONS · TWO ROWS OF THREE')}</span>;
  const connectionLabel = connection.connected ? tr('手柄已连接', 'USB controller detected') : tr('接好摇杆后，先按一下上面的按键。', 'No controller yet? Press a physical button.');
  const carried = record?.photos[carriedSlot];
  const evidence = summarizePhotos(record?.photos ?? photos);
  const resultCaption = resultView === 'original'
    ? tr('原图是四个人，从头到尾没有变。副本受损，不代表原图改变。', 'Four people. The original never changed, even when a copy was damaged.')
    : resultView === 'recall'
      ? record?.recalls[2] === 0
        ? tr('你选了“记不清了”，所以这里留空；不是说原图没人。', 'You chose Not sure. The figures are left blank, not counted as zero.')
        : tr('这里只按你最后选的人数重画，不是原图。', 'This redraw uses your final count. It is not the original.')
      : carried
        ? carried.altered
          ? tr('这张副本被泡泡干扰，已经看不清人数。可以换一张，或查看原图。', 'A signal obscured this copy. Try another, or check the original.')
          : tr('这张副本保住了，仍能看清四个人。你带回了一份能核对的记录。', 'This copy survived intact: four people. You kept a record you can check.')
        : tr('这次没有带回副本。仍可查看原图，对照你听到的话和三次回答。', 'No copies made it back. You can still check the original against the story and your answers.');

  return <main className="px-page" data-screen={screen}>
    <div className="px-game">
      <header className="px-header">
        <strong>{tr("忘了自己是什么", "WHAT WAS I AGAIN?")}</strong>
        <span className="px-area">{screen === 'practice' ? tr('先练一练', 'PRACTICE / NO PENALTY') : `0${area + 1} / ${areaTitles[area]}`}</span>
        <nav aria-label={tr("游戏设置", "Game settings")}>
          <button type="button" className="px-language" onClick={() => setLanguage(language === "en" ? "zh" : "en")} aria-label={tr("Switch to English", "切换到中文")}>{language === "en" ? "中" : "EN"}</button>
          <button type="button" aria-label={tr(sound ? "关闭声音" : "开启声音", sound ? "Mute sound" : "Enable sound")} aria-pressed={!sound} onClick={() => { runtime.current.sound = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) unlock(); }}><Icon kind={sound ? "sound" : "muted"} /></button>
          <button type="button" aria-label={tr("操作说明与改键", "Controls and remapping")} onClick={openControls}><Icon kind="settings" /></button>
          <button type="button" aria-label={tr("暂停", "Pause")} disabled={!moving && screen !== "pause"} onClick={togglePause}><Icon kind="pause" /></button>
        </nav>
      </header>
      <div className="px-stage">
        <canvas ref={canvas} className="px-world" width={480} height={270} role="img" aria-label={tr("往右走，跳起来捡照片，躲开障碍和泡泡。", "Side-scrolling pixel level. Move right, jump to collect photographs and avoid interference.")} />
        {screen === "play" && <>
          <div className="px-hud" aria-label={tr("随身的照片", "Stored photographs")}><div className="px-slots">{photos.map((p, i) => <span key={i} className={p?.altered ? "is-altered" : ""} aria-label={p ? tr(p.altered ? "被干扰的副本" : "照片", p.altered ? "Obscured copy" : "Photograph") : tr("空位", "Empty slot")}>{p ? <Sprite art={art} /> : <i />}{p?.altered && <b>×</b>}</span>)}</div><small>{tr("带去核对", "COPIES TO CHECK")} {photoCount(photos)} / 5 {replaced > 0 && <em> · {tr("已换下", "REPLACED")} {replaced}</em>}</small></div>
          <div className="px-route" aria-label={tr('回想进度', 'Recall progress')}>{[0, 1, 2].map(n => <span key={n} data-current={area === n} data-complete={area > n}>{n + 1}</span>)}</div>
          <p className="px-feedback" role="status">{tr(...feedback)}</p>
          <span className="px-shield-status" data-ready={shield}>{shield ? tr('保护中 · 还能挡一次', 'READY · ONE BLOCK') : photoCount(photos) ? tr(`按住 ${prompt('protect')} 开启保护`, `HOLD ${prompt('protect')} TO PROTECT`) : tr('先捡一张照片', 'COLLECT A PHOTO FIRST')}</span>
          {comment !== 0 && <aside className="px-comment" aria-label={tr('路边留言 · 虚构人物', 'Roadside conversation · fictional characters')} data-dialogue-zone={comment}>
            <small>{tr(comment === 1 ? '路边留言 01 · 虚构人物' : '路边留言 02 · 他们聊起你的回答（虚构）', comment === 1 ? '01 / FICTIONAL CONVERSATION' : '02 / YOUR ANSWER RETOLD · FICTION')}</small>
            <ol>{dialogueLines(comment, recalls[1], language).map(line => <li key={line.id} data-line-id={line.id} data-reply-to={line.replyTo}>
              <strong>{line.replyTo ? '↳ ' : ''}{line.speaker}</strong><p>{line.text}</p>
            </li>)}</ol>
            <small className="px-reading-note">{tr('这里不会撞伤，可以停下来看。', 'Safe to stop and read here.')}</small>
          </aside>}
        </>}
        {screen === 'practice' && <section ref={overlay} className="px-practice-coach" aria-label={tr('操作练习', 'Hands-on practice')}>
          <div className="px-practice-heading"><ol aria-label={tr('练习步骤', 'Practice steps')}>{PRACTICE_STEPS.map((step, i) => <li key={step} aria-current={practice === step ? 'step' : undefined} data-complete={practiceIndex > i}>{practiceIndex > i ? '✓' : i + 1}</li>)}</ol><button type="button" onClick={begin}>{tr('跳过练习', 'Skip practice')}</button></div>
          <div className="px-practice-instruction" role="status"><kbd>{practiceCopy[practice][2]}</kbd><div><h2>{practiceCopy[practice][0]}</h2><p>{practiceCopy[practice][1]}</p></div></div>
          {practice === 'done' && <button type="button" data-primary className="px-primary" onClick={begin}>{tr('开始看照片', 'Open the photograph')}</button>}
          {practice === 'protect' && <small>{shield ? tr('边框亮了，等泡泡过来。', 'The outline is lit. Wait for the signal.') : tr(...feedback)}</small>}
        </section>}
        {screen !== "play" && screen !== 'practice' && <section ref={overlay} className={`px-overlay px-${screen}`} aria-label={tr("游戏面板", "Game panel")}>
          {screen === "title" && <div className="px-title-layout"><div><small className="px-eyebrow">{tr('同一张照片，你会记得一样吗？', 'ONE PHOTOGRAPH. THREE RECALLS.')}</small><h1>{language === "en" ? <>What was<br />I again?</> : <>忘了自己<br />是什么</>}</h1><p>{tr("路上会有人说起这张照片，他们记得的未必和你一样。捡起原图的副本，带到终点核对：照片里，真的有他们说的那个人吗？", "A photograph starts a story. As you walk, others remember it differently. Collect copies and keep them safe, so you have something to check the story against at the end.")}</p><p className="px-mission-note">{tr("捡照片，是留下记录。保护照片，是不让手里的记录丢失或看不清。", "Collect to keep a record. Protect to keep that record readable.")}</p><div className="px-start-actions"><button type="button" data-primary className="px-primary" disabled={!art || assetError} onClick={startPractice}>{assetError ? tr("画面没能加载出来", "Art could not load") : art ? tr("先练一下", "Try the controls") : tr("画面加载中…", "Preparing the scene…")}</button><button type="button" className="px-text-button" disabled={!art || assetError} onClick={begin}>{tr('跳过练习，直接开始', 'Skip practice · view photograph')}</button></div>{assetError && <button type="button" onClick={() => location.reload()}>{tr("重新加载", "Reload")}</button>}<small>{tr("不限时。路边的人物和留言均为虚构。", "No timer. Roadside characters and their remarks are fictional.")}</small></div><div className="px-title-controls"><div className="px-cabinet" data-layout={6} aria-hidden="true"><span className="px-stick"><i /></span><div>{ACTIONS.map((action, n) => <i key={action} data-pressed={pressedButton === bindings[action]}>{n + 1}</i>)}</div></div><h2>{tr('一个摇杆，六个按键', 'One stick. Six buttons.')}</h2>{cabinetLabel}<p className="px-layout-note">{tr('左右移动、跳跃、保护。六个按键可以按你的摇杆重新设置。', 'Move, jump, protect. Remap the six buttons to match your controller.')}</p><div className="px-mini-controls">{ACTIONS.map((action,i) => <span key={action}><kbd>{prompt(action)}</kbd>{NAMES[language][i]}</span>)}</div><p className="px-device-note" data-connected={connection.connected}>{connectionLabel}</p><button type="button" className="px-text-button" onClick={openControls}>{tr("检查摇杆 / 设置按键", "Check controller / remap")}</button></div></div>}
          {screen === "loading" && <div className="px-boot" role="status"><div className="px-signal">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ animationDelay: `${n * .09}s` }} />)}</div><p>{tr("正在打开照片", "Opening the photograph")}</p></div>}
          {screen === "observe" && <div className="px-observe-layout"><div className="px-photo-frame"><Photo art={art} label={tr("原始照片：四个人，右边有旋转木马，天空是蓝色的。", "Original photograph: four people, a carousel on the right and a blue sky.")} /><small>{tr("开头的照片", "ORIGINAL PHOTOGRAPH")}</small></div><div><h1>{tr("先看看这张照片", "Take a look.")}</h1><p>{tr("记住照片里的人。这是原图，路上捡到的是它的副本；到终点再一起核对。", "This is the original. Study the people, then carry copies along the route for a final comparison.")}</p><button type="button" data-primary className="px-primary" onClick={() => ask(0)}>{primaryText}</button></div></div>}
          {isQuestion && <div className="px-question"><small>{tr(`第 ${stage + 1} 次回想`, `RECALL ${stage + 1} / 3`)}</small><h1>{tr("开头那张照片里，有几个人？", "How many people were in the first photograph?")}</h1><div className="px-choices" role="group" aria-label={tr("选择答案", "Choose an answer")}>{options.map((value, i) => <button type="button" key={value} aria-pressed={selection === i} onClick={() => choose(i)}>{label(value)}</button>)}</div><p>{device === 'touch' ? tr('点选答案，再点“选好了”。', 'Tap an answer, then confirm.') : device === 'gamepad' ? tr(`左右拨摇杆选择，按 ${prompt('confirm')} 确认。`, `Tilt left or right to choose. Press ${prompt('confirm')} to confirm.`) : tr('按左右方向键选择，按 Enter 确认。', 'Use ← → to choose. Press Enter to confirm.')}</p><button type="button" data-primary className="px-primary" disabled={selection < 0} onClick={submit}>{tr("选好了", "Keep this answer")}</button></div>}
          {screen === "pause" && <div className="px-pause-panel"><h1>{tr("已暂停", "Paused")}</h1><p>{tr("接着玩，会从刚才停下的地方继续。", "Your photographs and answers are still here.")}</p><button type="button" data-primary className="px-primary" onClick={() => { unlock(); changeScreen(runtime.current.activeScreen); }}>{tr("接着玩", "Continue")}</button><button type="button" onClick={openControls}>{tr("操作说明", "Controls")}</button><div className="px-object-guide"><span><Sprite art={art} index={4}/>{tr('照片：捡起副本，终点核对', 'Copy: collect to compare later')}</span><span><Sprite art={art} index={7}/>{tr('障碍：跳过去，或提前开启保护', 'Obstacle: jump or protect')}</span><span><Sprite art={art} index={5}/>{tr('泡泡：让副本看不清', 'Signal: obscures a copy')}</span></div></div>}
          {screen === "controls" && <div className="px-controls-panel"><div className="px-controls-heading"><h1>{tr("摇杆和按键怎么用", "Controls & controller")}</h1><button type="button" data-primary onClick={closeControls}>{tr("返回", "Back")}</button></div><div className="px-device-panel">{cabinetLabel}<div role="status"><strong>{connectionLabel}</strong><small>{connection.connected ? connection.id : tr('有些摇杆会被当作键盘，下方按键也能用。没显示手柄名称，不一定是没连上。', 'Keyboard-mode controllers use the keys below. The USB connector alone does not identify the input mode.')}</small>{pressedButton !== null && <kbd>{tr('刚按下：键 ', 'Detected BTN ')}{pressedButton + 1}</kbd>}</div></div><p>{tr("左右推摇杆控制走路。打开菜单后，上下或左右选项目，按确认进入，按暂停键返回。", "Move with the stick. In menus, move it up/down or left/right to choose, Confirm to open, Menu to go back.")}</p><div className="px-binding-list">{ACTIONS.map((action, i) => <div key={action} data-active={pressedButton === bindings[action]}><span>{NAMES[language][i]}</span><kbd>{KEY_LABELS[i]}</kbd><button type="button" aria-label={`${tr("重新设置", "Remap")} ${NAMES[language][i]}`} aria-pressed={bindingAction === action} onClick={() => { input.current?.capture(action); setBindingAction(action); }}>{bindingAction === action ? tr("按一下想用的摇杆按键…", "Press a button…") : `${buttonName(action)} ↗`}</button></div>)}</div><p className="px-control-note">{tr("保护的是带去终点核对的副本，不会改变你的回答。带着照片时，按住保护键 0.7 秒，亮起边框后约 4 秒内能挡一次撞击或泡泡。想换键：先选右侧键号，再按摇杆上的按键。键号不代表按键位置；如果这个键已有用途，两项功能会互换。", "Protect keeps carried copies intact; it never changes your answer. Hold Protect for 0.7 seconds to block one hit or signal within 4 seconds. Numbers are not cabinet positions: choose a binding, then press the physical button. Conflicting bindings swap.")}</p><div className="px-control-footer"><button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); input.current?.setBindings({ ...DEFAULT_BUTTONS }); setBindings({ ...DEFAULT_BUTTONS }); }}>{tr("恢复默认按键", "Reset bindings")}</button>{bindingAction && <button type="button" onClick={() => { input.current?.capture(null); setBindingAction(null); }}>{tr("不改了", "Cancel remapping")}</button>}<span>{tr("声音", "AUDIO")}: PYNCHON — James Gargette · SFX — Kenney</span></div></div>}
          {screen === "result" && record && <div className="px-result-layout">
            <div>
              <div className="px-result-tabs" role="group" aria-label={tr('选择核对内容', 'Choose what to compare')}>
                <button type="button" aria-pressed={resultView === 'carried'} onClick={() => setResultView('carried')}>{tr('带回的照片', 'Carried copies')}</button>
                <button type="button" aria-pressed={resultView === 'original'} onClick={() => setResultView('original')}>{tr('开头的照片', 'Original')}</button>
                <button type="button" aria-pressed={resultView === 'recall'} onClick={() => setResultView('recall')}>{tr('你选的人数', 'Your count')}</button>
              </div>
              {resultView === 'carried' && !carried
                ? <div className="px-no-copy" role="img" aria-label={tr('没有带回照片', 'No carried copies')}><span>—</span>{tr('手里没有留下副本', 'NO COPIES RETURNED')}</div>
                : <Photo art={art} count={resultView === 'recall' ? (record.recalls[2] ?? 0) : 4} obscured={resultView === 'carried' && !!carried?.altered} label={resultView === 'original' ? tr('开头的照片：四个人', 'Original photograph: four people') : resultView === 'recall' ? tr('按你最后选的人数重画的照片，并非原图', 'A reconstruction from your final count, not the original') : carried?.altered ? tr('被干扰的副本：人物被遮挡，无法核对人数', 'Obscured copy: the people cannot be counted') : tr('带回的完好副本：四个人', 'Intact carried copy: four people')} />}
              <div className="px-carried-strip" role="group" aria-label={tr('本局带回的五个照片槽', 'Five carried-photo slots from this visit')}>
                {record.photos.map((p, i) => <button type="button" key={i} disabled={!p} aria-pressed={resultView === 'carried' && carriedSlot === i} data-photo-state={!p ? 'empty' : p.altered ? 'damaged' : 'clear'} aria-label={tr(`照片槽 ${i + 1}：${!p ? '空位' : p.altered ? '受干扰' : '完好'}`, `Slot ${i + 1}: ${!p ? 'empty' : p.altered ? 'obscured' : 'intact'}`)} onClick={() => { setCarriedSlot(i); setResultView('carried'); }}><span>{String(i + 1).padStart(2, '0')}</span><small>{tr(!p ? '空位' : p.altered ? '受干扰' : '完好', !p ? 'EMPTY' : p.altered ? 'OBSCURED' : 'INTACT')}</small></button>)}
              </div>
              <p className="px-carried-total">{tr(`带回 ${evidence.retained} 张 · 完好 ${evidence.clear} 张 · 受干扰 ${evidence.damaged} 张`, `${evidence.retained} returned · ${evidence.clear} intact · ${evidence.damaged} obscured`)}</p>
              <p className="px-result-caption" role="status">{resultCaption}</p>
              <p className="px-fiction-note">{tr('路边人物和五人照片都是游戏虚构的，不是真实玩家记录。', 'The characters and five-person prints are fiction, not records from other players.')}</p>
            </div>
            <div className="px-result-copy">
              <h1>{tr("你三次选了什么", "Your three answers")}</h1>
              <div className="px-recall-history" aria-label={tr('本次回答记录', 'Answers from this visit')}>{record.recalls.map((value, i) => <span key={i}><small>{tr(`第 ${i + 1} 次`, `RECALL ${i + 1}`)}</small><b>{label(value)}</b></span>)}</div>
              <h2 className="px-trace-heading">{tr('路上，这句话是这样传的', 'How the story travelled')}</h2>
              <ol className="px-dialogue-trace">
                {record.dialogueSeen.includes(1) && <li>{tr('小林先说“好像五个人”，阿禾听后也觉得是五个。', 'Lin suggested five. Rowan then said that sounded familiar.')}</li>}
                {record.dialogueSeen.includes(2) && <li>{dialogueSummary(record.recalls[1], language)}</li>}
                <li>{tr('有人重复五人这个说法，照片里却只有四个。保住副本，就是留下一次自己核对的机会。', 'The repeated story says five; the photograph shows four. An intact copy gives you something to check for yourself.')}</li>
              </ol>
              <p className="px-final-question">{tr('被反复提起的那个人，照片里真的有吗？', 'The person they kept mentioning—were they ever in the picture?')}</p>
              <button type="button" data-primary className="px-primary" onClick={reset}>{tr("再玩一次", "Look again")}</button>
            </div>
          </div>}
        </section>}
      </div>
      <footer className="px-footer"><span>{moving ? tr(`← → 移动 · ${prompt('jump')} 跳跃 · 长按 ${prompt('protect')} 保护`, `← → MOVE · ${prompt('jump')} JUMP · HOLD ${prompt('protect')} PROTECT`) : tr(`摇杆 / 方向键选择 · ${prompt('confirm')} 确认 · ${prompt('pause')} 暂停 / 返回`, `STICK / ARROWS SELECT · ${prompt('confirm')} CONFIRM · ${prompt('pause')} MENU`)}</span><span>{screen === 'practice' ? tr('练习区 · 不会丢照片', 'PRACTICE · NO PHOTO LOSS') : tr('沿着路，往右走', 'Reach the next photograph')}</span></footer>
    </div>
    <div className="px-touch" aria-label={tr("触屏操作", "Touch controls")} data-visible={moving}><div><button type="button" aria-label={tr("向左移动", "Move left")} {...bindTouch("left")}><Icon kind="left" /></button><button type="button" aria-label={tr("向右移动", "Move right")} {...bindTouch("right")}><Icon kind="right" /></button></div><div><button type="button" {...bindTouch("protect")}>{tr("保护", "Protect")}</button><button type="button" className="px-jump" {...bindTouch("jump")}>{tr("跳跃", "Jump")}</button></div></div>
    <p className="px-rotate">{tr("把屏幕横过来，路就看全了。", "Turn your screen sideways for the full view.")}</p>
  </main>;
}
