export type Language = "zh" | "en";
export type TraitKey = "motion" | "attention" | "echo" | "trace";
export type GameStage =
  | "dormant"
  | "find"
  | "chase"
  | "platform"
  | "sound"
  | "assemble"
  | "trial"
  | "report";

export type PartId = "cloud" | "spring" | "horn" | "leaf" | "bulb" | "rope";
export type BodySlot = "head" | "body" | "leftArm" | "rightArm" | "legs";

export const GAME_CONFIG = {
  title: "忘了自己是什么",
  englishTitle: "What Was I Again?",
  reserve: "FORGETFUL CREATURE RESERVE · FIELD NOTE 07",
  designSize: { width: 1080, height: 1920 },
  idleHintMs: 10_000,
  reportResetMs: 40_000,
  traceDelayMs: 350,
  maxFakeCreatures: 3,
  stageOrder: ["find", "chase", "platform", "sound", "assemble", "trial", "report"] as GameStage[],
  stages: {
    dormant: { zh: "待机观察", en: "FIELD IDLE", progress: 0 },
    find: { zh: "准备间 · 找到它", en: "PREP ROOM · FIND IT", progress: 1 },
    chase: { zh: "中央庭院 · 识破它", en: "COURTYARD · SPOT IT", progress: 2 },
    platform: { zh: "记忆竖井 · 追上它", en: "TRACE SHAFT · CATCH UP", progress: 3 },
    sound: { zh: "回声台 · 听出它", en: "ECHO DECK · HEAR IT", progress: 4 },
    assemble: { zh: "修补棚 · 拼出它", en: "MENDING SHED · BUILD IT", progress: 5 },
    trial: { zh: "活动场 · 看它试用", en: "YARD · TRY IT ON", progress: 6 },
    report: { zh: "观察报告 · 现在的它", en: "FIELD REPORT · NOW", progress: 7 },
  },
  roomObjects: [
    { id: "chair-a", kind: "chair", x: 0.2, y: 0.32, zh: "倒着的椅子", en: "fallen chair" },
    { id: "boxes", kind: "box", x: 0.71, y: 0.3, zh: "叠起来的箱子", en: "stacked boxes" },
    { id: "scarf", kind: "scarf", x: 0.48, y: 0.22, zh: "太会飘的围巾", en: "overly floaty scarf" },
    { id: "ball", kind: "ball", x: 0.29, y: 0.7, zh: "滚走的小球", en: "rolling ball" },
    { id: "lamp", kind: "lamp", x: 0.78, y: 0.67, zh: "眨眼的灯", en: "blinking lamp" },
    { id: "broom", kind: "broom", x: 0.52, y: 0.55, zh: "假装没动的扫把", en: "definitely still broom" },
  ],
  chaseRounds: [
    { zh: "它少变了一个角", en: "one corner is missing", clue: "shape" },
    { zh: "它的动作反了", en: "one movement is reversed", clue: "motion" },
    { zh: "它发出的声音不对", en: "one sound is off", clue: "sound" },
  ],
  soundRounds: [
    { notes: [262, 330, 392, 330], wrongIndex: 2, kind: "pitch" },
    { notes: [294, 294, 370, 440], wrongIndex: 1, kind: "rhythm" },
    { notes: [330, 392, 440, 392, 330], wrongIndex: 3, kind: "timbre" },
  ],
  parts: [
    { id: "cloud" as const, symbol: "☁", zh: "小云", en: "cloud", slots: ["head", "body"] as BodySlot[] },
    { id: "spring" as const, symbol: "≋", zh: "弹簧", en: "spring", slots: ["leftArm", "rightArm", "legs"] as BodySlot[] },
    { id: "horn" as const, symbol: "◁", zh: "小喇叭", en: "horn", slots: ["head", "leftArm", "rightArm"] as BodySlot[] },
    { id: "leaf" as const, symbol: "❧", zh: "大叶子", en: "leaf", slots: ["body", "leftArm", "rightArm", "legs"] as BodySlot[] },
    { id: "bulb" as const, symbol: "✦", zh: "灯泡", en: "bulb", slots: ["head", "body"] as BodySlot[] },
    { id: "rope" as const, symbol: "⌇", zh: "绳子", en: "rope", slots: ["leftArm", "rightArm", "legs"] as BodySlot[] },
  ],
  bodySlots: ["head", "body", "leftArm", "rightArm", "legs"] as BodySlot[],
  inheritedTraits: [
    { id: "blue-tail", zh: "一条轻微闪烁的蓝色尾巴", en: "a faintly flickering blue tail" },
    { id: "soft-echo", zh: "一个总慢半拍的回声", en: "an echo half a beat late" },
    { id: "leaf-curl", zh: "一片向内卷的叶尖", en: "one inward-curled leaf tip" },
    { id: "tiny-bounce", zh: "一次几乎看不见的小弹跳", en: "an almost invisible little bounce" },
  ],
} as const;

export const text = (lang: Language, zh: string, en: string) => (lang === "zh" ? zh : en);
