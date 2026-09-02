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
  reserve: "MEMORY STICKER RUSH · RUN 07",
  designSize: { width: 1080, height: 1920 },
  idleHintMs: 10_000,
  reportResetMs: 40_000,
  traceDelayMs: 350,
  maxFakeCreatures: 3,
  stageOrder: ["find", "chase", "platform", "sound", "assemble", "trial", "report"] as GameStage[],
  stages: {
    dormant: { zh: "准备出发", en: "READY TO RUSH", progress: 0 },
    find: { zh: "彩窗走廊 · 找贴纸", en: "WINDOW HALL · FIND THE STICKER", progress: 1 },
    chase: { zh: "点名操场 · 追色块", en: "ROLL CALL · CHASE THE COLOR", progress: 2 },
    platform: { zh: "翻转竖井 · 向上冲", en: "FLIP SHAFT · CLIMB FAST", progress: 3 },
    sound: { zh: "开场乐园 · 跟节拍", en: "FUNFAIR · CATCH THE BEAT", progress: 4 },
    assemble: { zh: "贴纸工坊 · 拼徽章", en: "STICKER LAB · BUILD A BADGE", progress: 5 },
    trial: { zh: "失物操场 · 试跑", en: "LOST YARD · TEST RUN", progress: 6 },
    report: { zh: "本局版本 · 留下路线", en: "RUN VERSION · LEAVE A TRAIL", progress: 7 },
  },
  roomObjects: [
    { id: "chair-a", kind: "chair", x: 0.2, y: 0.32, zh: "弹了一下的蓝椅子", en: "blue chair that bounced" },
    { id: "boxes", kind: "box", x: 0.71, y: 0.3, zh: "会换色的礼物箱", en: "color-switching gift box" },
    { id: "scarf", kind: "scarf", x: 0.48, y: 0.22, zh: "飘成箭头的围巾", en: "scarf shaped like an arrow" },
    { id: "ball", kind: "ball", x: 0.29, y: 0.7, zh: "跑太快的弹力球", en: "super-fast bouncy ball" },
    { id: "lamp", kind: "lamp", x: 0.78, y: 0.67, zh: "会闪彩灯的路标", en: "blinking rainbow sign" },
    { id: "broom", kind: "broom", x: 0.52, y: 0.55, zh: "藏着黄色贴纸的扫把", en: "broom hiding a yellow sticker" },
  ],
  chaseRounds: [
    { zh: "追有缺角的蓝色贴纸", en: "chase the blue sticker with one missing corner", clue: "shape" },
    { zh: "追动作反着来的红色贴纸", en: "chase the red sticker moving backwards", clue: "motion" },
    { zh: "追发出错拍声的紫色贴纸", en: "chase the purple sticker with the off-beat sound", clue: "sound" },
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

