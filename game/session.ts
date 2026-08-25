export type MemorySessionReport = {
  schema: "memory-drift-session/v1";
  runId: string;
  archive: "MEMORY ARCHIVE 07";
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  selectedVersion: "A" | "B";
  memoryBias: number;
  fragments: number;
  stableReads: number;
  overloads: number;
  blankHits: number;
  reliability: number;
  door: string;
  calibration: string[];
  reconstruction: string[];
};

type SessionSource = {
  runId: string;
  startedAt: number;
  selectedVersion: "A" | "B" | null;
  memoryBias: number;
  fragments: number;
  stableReads: number;
  overloads: number;
  blankHits: number;
  reliability: number;
  door: string;
  calibration: string[];
  reconstruction: string[];
};

export function createRunId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MD07-${time}-${random}`;
}

export function buildSessionReport(source: SessionSource): MemorySessionReport | null {
  if (!source.selectedVersion) return null;
  const completedAt = Date.now();
  return {
    schema: "memory-drift-session/v1",
    runId: source.runId,
    archive: "MEMORY ARCHIVE 07",
    startedAt: new Date(source.startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationSeconds: Math.max(0, Math.round((completedAt - source.startedAt) / 1000)),
    selectedVersion: source.selectedVersion,
    memoryBias: Number(source.memoryBias.toFixed(2)),
    fragments: source.fragments,
    stableReads: source.stableReads,
    overloads: source.overloads,
    blankHits: source.blankHits,
    reliability: source.reliability,
    door: source.door,
    calibration: source.calibration,
    reconstruction: source.reconstruction,
  };
}

export function persistSessionReport(report: MemorySessionReport) {
  try {
    const key = "memory-drift-session-history-v1";
    const previous = JSON.parse(localStorage.getItem(key) ?? "[]") as MemorySessionReport[];
    localStorage.setItem(key, JSON.stringify([report, ...previous].slice(0, 30)));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

export function downloadSessionReport(report: MemorySessionReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
