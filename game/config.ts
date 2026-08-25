export type ArchiveAnchorId = "clock" | "name" | "figure";
export type CoordinateId = "time" | "room" | "people";

export const GAME_CONFIG = {
  title: "记忆漂移：最后一个下午",
  englishTitle: "Memory Drift: The Last Afternoon",
  archive: "MEMORY ARCHIVE 07",
  designSize: { width: 1080, height: 1920 },
  idleHintMs: 10_000,
  finaleResetMs: 10_000,
  pressure: { scanMaxMs: 360, focusMinMs: 650, overloadMs: 2300 },
  anchors: [
    { id: "clock" as const, x: 0.72, y: 0.31, title: "墙上的时钟", fragment: 1, fragmentTitle: "照片左下角" },
    { id: "name" as const, x: 0.43, y: 0.66, title: "桌面的姓名标签", fragment: 2, fragmentTitle: "时钟指针" },
    { id: "figure" as const, x: 0.63, y: 0.48, title: "窗边的第二个人影", fragment: 3, fragmentTitle: "模糊的姓名标签" },
  ],
  corridorFragments: [
    { id: 4, lane: 0, at: 0.32, title: "声音波形", code: "VOICE / WAIT" },
    { id: 5, lane: 2, at: 0.72, title: "照片中央缺失部分", code: "PHOTO / MISSING" },
  ],
  doors: [
    { label: "A-307", bias: -2 },
    { label: "B-307", bias: 2 },
    { label: "—-307", bias: 0 },
  ],
  coordinates: [
    { id: "time" as const, label: "时间", a: "17:42", b: "18:12" },
    { id: "room" as const, label: "地点", a: "B-307", b: "A-307" },
    { id: "people" as const, label: "人物数量", a: "2 人", b: "1 人" },
  ],
  fragments: [
    { id: 1, title: "照片左下角", a: "教室的另一把椅子", b: "被裁掉的桌角" },
    { id: 2, title: "时钟指针", a: "停在 17:42", b: "延迟到 18:12" },
    { id: 3, title: "模糊的姓名标签", a: "写着两个人的缩写", b: "只有记录者的名字" },
    { id: 4, title: "声音波形", a: "另一个人的声音", b: "旧录音里的声音" },
    { id: 5, title: "照片中央缺失部分", a: "窗边的人影", b: "玻璃前的空椅子" },
  ],
  versions: {
    A: {
      title: "共同记忆", time: "17:42", room: "B-307", people: "2 人",
      leaving: "两个人一起离开教室", camera: "照片由其中一人拍摄",
      voice: "“等我一下”来自另一个人", back: "那天下午，我们一起离开。",
    },
    B: {
      title: "个人重构", time: "18:12", room: "B-307", people: "1 人",
      leaving: "记录者独自离开", camera: "照片使用定时拍摄",
      voice: "“等我一下”来自另一段录音", back: "窗边也许只有玻璃的反射。",
    },
  },
  contradictions: {
    time: ["17:42", "18:12"], location: ["B-307", "A-307"], people: [1, 2],
    chairs: [1, 2], footsteps: ["一组", "两组"], camera: ["他人拍摄", "定时拍摄"],
    bag: ["左侧", "右侧", "消失"], silhouette: ["完整", "模糊", "空白"],
  },
  assets: { archivePhoto: null, ambientAudio: null, voiceAudio: null },
} as const;

export type GameStage =
  | "dormant" | "tutorial" | "archive" | "corridor" | "doors"
  | "classroom" | "reconstruct" | "versions" | "finale";
