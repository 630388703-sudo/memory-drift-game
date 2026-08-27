import { GAME_CONFIG, type BodySlot, type PartId, type TraitKey } from "./config";

export type BehaviorStats = Record<TraitKey, number> & {
  inspected: number; misses: number; jumps: number; falls: number; replays: number; soundMistakes: number;
};
export type BodyBuild = Partial<Record<BodySlot, PartId>>;
export type InheritedTrait = (typeof GAME_CONFIG.inheritedTraits)[number];

export type CreatureReport = {
  schema: "forgetful-creature/v1";
  runId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  behavior: BehaviorStats;
  dominantTraits: TraitKey[];
  body: BodyBuild;
  inheritedTrait: InheritedTrait;
};

const TRACE_KEY = "forgetful-creature-previous-trace-v1";
const HISTORY_KEY = "forgetful-creature-session-history-v1";

export const freshStats = (): BehaviorStats => ({
  motion: 0, attention: 0, echo: 0, trace: 0,
  inspected: 0, misses: 0, jumps: 0, falls: 0, replays: 0, soundMistakes: 0,
});

export function createRunId() {
  return `FCR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function loadInheritedTrait(): InheritedTrait {
  try {
    const saved = localStorage.getItem(TRACE_KEY);
    const match = GAME_CONFIG.inheritedTraits.find((trait) => trait.id === saved);
    if (match) return match;
  } catch { /* storage is optional */ }
  return GAME_CONFIG.inheritedTraits[0];
}

export function saveNextTrace(stats: BehaviorStats) {
  const dominant = dominantTraits(stats)[0];
  const mapping: Record<TraitKey, number> = { motion: 3, attention: 2, echo: 1, trace: 0 };
  const trait = GAME_CONFIG.inheritedTraits[mapping[dominant] ?? 0];
  try { localStorage.setItem(TRACE_KEY, trait.id); } catch { /* storage is optional */ }
  return trait;
}

export function clearPersistentTrace() {
  try { localStorage.removeItem(TRACE_KEY); localStorage.removeItem(HISTORY_KEY); } catch { /* storage is optional */ }
}

export function dominantTraits(stats: BehaviorStats): TraitKey[] {
  return (["motion", "attention", "echo", "trace"] as TraitKey[])
    .sort((a, b) => stats[b] - stats[a]).slice(0, 2);
}

export function buildCreatureReport(source: { runId: string; startedAt: number; stats: BehaviorStats; body: BodyBuild; inheritedTrait: InheritedTrait }): CreatureReport {
  const completedAt = Date.now();
  return {
    schema: "forgetful-creature/v1", runId: source.runId,
    startedAt: new Date(source.startedAt).toISOString(), completedAt: new Date(completedAt).toISOString(),
    durationSeconds: Math.max(0, Math.round((completedAt - source.startedAt) / 1000)),
    behavior: { ...source.stats }, dominantTraits: dominantTraits(source.stats), body: { ...source.body }, inheritedTrait: source.inheritedTrait,
  };
}

export function persistReport(report: CreatureReport) {
  try {
    const previous = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as CreatureReport[];
    localStorage.setItem(HISTORY_KEY, JSON.stringify([report, ...previous].slice(0, 20)));
  } catch { /* storage is optional */ }
}

export function downloadReport(report: CreatureReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${report.runId}.json`; anchor.click(); URL.revokeObjectURL(url);
}
