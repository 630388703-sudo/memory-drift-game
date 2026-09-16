// Rendering only: never changes item positions, hit boxes, or the source photo.
export function photoFaultStrength(now: number, id: number, version: "A" | "B" | "C", impactUntil: number, reduced: boolean) {
  if (reduced) return 0;
  const impact = Math.max(0, Math.min(1, (impactUntil - now) / 840));
  const phase = (now + id * 451) % 3800;
  const pulse = version !== "A" && phase < 420 ? Math.sin(phase / 420 * Math.PI) * .72 : 0;
  return Math.max(impact * impact, pulse);
}

export function drawPhotoFault(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number, strength: number) {
  if (!Number.isFinite(strength) || strength <= 0 || !image.naturalWidth || !image.naturalHeight) return;
  const amount = Math.min(1, strength);
  const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * ratio;
  const height = image.naturalHeight * ratio;
  const left = x - width / 2;
  const top = y - height / 2;
  ctx.save();
  // Keep the frame readable; displacement is restricted to the photo interior.
  ctx.beginPath();
  ctx.rect(left + width * .16, top + height * .2, width * .68, height * .58);
  ctx.clip();
  for (const direction of [-1, 1]) {
    ctx.globalAlpha = .24 * amount;
    ctx.globalCompositeOperation = "screen";
    ctx.filter = direction < 0 ? "sepia(1) saturate(4) hue-rotate(130deg)" : "sepia(1) saturate(4) hue-rotate(295deg)";
    ctx.drawImage(image, left + direction * width * .065 * amount, top, width, height);
  }
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = .82 * amount;
  for (let band = 0; band < 3; band++) {
    const sourceY = image.naturalHeight * (.29 + band * .16);
    const sourceHeight = image.naturalHeight * .075;
    const offset = (band % 2 ? -1 : 1) * width * .12 * amount;
    ctx.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, left + offset, top + sourceY * ratio, width, sourceHeight * ratio);
  }
  ctx.restore();
}
