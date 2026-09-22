// Short-lived drawing events only. Never move the player, change hit boxes or score.
export type MemoryGesture = {
  kind: "collect" | "replace" | "bubble" | "hit" | "block" | "protect";
  x: number;
  y: number;
  at: number;
  seed: number;
};
export const GESTURE_DURATION = 760;
export const gestureProgress = (now: number, at: number) => Math.max(0, Math.min(1, (now - at) / GESTURE_DURATION));

export function addMemoryGesture(events: MemoryGesture[], event: MemoryGesture) {
  // Bound work even when several objects meet the traveler on the same frame.
  events.splice(0, Math.max(0, events.length - 7));
  events.push(event);
}

export function drawMemoryGestures(ctx: CanvasRenderingContext2D, photo: HTMLImageElement, events: MemoryGesture[], now: number, reduced: boolean) {
  for (const event of events) {
    const t = gestureProgress(now, event.at);
    if (t >= 1 || now < event.at) continue;
    const ease = 1 - (1 - t) ** 3;
    const alpha = (1 - t) ** 1.5;
    const collect = event.kind === "collect" || event.kind === "replace";
    const protectedHit = event.kind === "protect" || event.kind === "block";
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.globalAlpha = alpha;
    const color = collect ? "#2675c9" : protectedHit ? "#13a688" : event.kind === "bubble" ? "#9674d2" : "#ee6551";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (reduced) {
      // No travel, rotation, burst or shake in soft mode; just a small fading mark.
      ctx.strokeRect(-22, -22, 44, 44);
      ctx.restore();
      continue;
    }
    if (collect && photo.naturalWidth && photo.naturalHeight) {
      // A caught print folds upwards, with two offset paper edges, then disappears.
      ctx.translate(32 * Math.sin(t * Math.PI), -85 * ease);
      ctx.rotate((event.seed % 2 ? 1 : -1) * .22 * Math.sin(t * Math.PI));
      const height = 142 * (1 - ease * .8);
      const width = height * photo.naturalWidth / photo.naturalHeight;
      ctx.strokeRect(-width / 2 - 7, -height / 2 + 5, width, height);
      ctx.drawImage(photo, -width / 2, -height / 2, width, height);
    } else {
      // Bubble: expanding broken arcs. Shield: one complete protective contour.
      const radius = 35 + ease * (protectedHit ? 90 : 112);
      for (let arc = 0; arc < (protectedHit ? 1 : 3); arc++) {
        ctx.beginPath();
        const start = arc * Math.PI * 2 / 3 + event.seed * .35;
        ctx.ellipse(0, 0, radius, radius * .6, -.2, start, start + (protectedHit ? Math.PI * 2 : 1.25));
        ctx.stroke();
      }
    }
    // A few colored paper slips, not a full-screen particle shower.
    if (!collect || event.kind === "replace") {
      for (let index = 0; index < 6; index++) {
        const angle = index * Math.PI / 3 + event.seed * .31;
        const radius = 20 + ease * (event.kind === "hit" ? 148 : 94);
        ctx.save();
        ctx.translate(Math.cos(angle) * radius, Math.sin(angle) * radius * .65);
        ctx.rotate(angle + t * .8);
        ctx.fillStyle = index % 2 ? color : "#fff9e8";
        ctx.fillRect(-8, -3, 16 * (1 - t * .5), 6);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
