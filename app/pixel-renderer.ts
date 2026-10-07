import backgroundAsset from '../game/assets/pixel/background.png';
import atlasAsset from '../game/assets/pixel/atlas.png';
import {
  CHECKPOINTS, GOAL_X, GROUND_Y, LEVEL_BUBBLES, LEVEL_HAZARDS,
  LEVEL_PHOTOS, LEVEL_PLATFORMS, PLAYER_HEIGHT, PLAYER_WIDTH,
  VIEW_HEIGHT, VIEW_WIDTH, WORLD_WIDTH, bubblePosition, type WorldState,
} from './pixel-world';

type SpriteFrame = { x: number; y: number; width: number; height: number };
export type PixelArt = {
  background: HTMLImageElement;
  atlas: HTMLImageElement;
  frames: SpriteFrame[];
  heroWidth: number;
  heroHeight: number;
};

export type PixelWorldOptions = { reducedMotion?: boolean; idle?: boolean; version?: 0 | 1 | 2 };
export type MemoryPhotoOptions = { count: number; sky?: string; carousel?: string };

// Vite emits URLs; Next emits StaticImageData. Keep the artwork shared by both builds.
const assetUrl = (asset: string | { src: string }) => typeof asset === 'string' ? asset : asset.src;
const pixel = (value: number) => Math.round(value / 2) * 2;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load pixel artwork: ${url}`));
    image.src = url;
  });
}

/** Trim the transparent padding, not the silhouette, within each generated atlas cell. */
function atlasFrames(atlas: HTMLImageElement): SpriteFrame[] {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.naturalWidth;
  canvas.height = atlas.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Pixel artwork requires a 2D canvas.');
  ctx.drawImage(atlas, 0, 0);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return Array.from({ length: 8 }, (_, index) => {
    const left = Math.round((index % 4) * canvas.width / 4);
    const right = Math.round(((index % 4) + 1) * canvas.width / 4);
    const top = Math.round(Math.floor(index / 4) * canvas.height / 2);
    const bottom = Math.round((Math.floor(index / 4) + 1) * canvas.height / 2);
    let x0 = right, y0 = bottom, x1 = left - 1, y1 = top - 1;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (rgba[(y * canvas.width + x) * 4 + 3] < 128) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    if (x1 < x0 || y1 < y0) throw new Error(`Pixel atlas cell ${index} is empty.`);
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  });
}

let artPromise: Promise<PixelArt> | undefined;
export function loadPixelArt(): Promise<PixelArt> {
  if (!artPromise) {
    artPromise = Promise.all([loadImage(assetUrl(backgroundAsset)), loadImage(assetUrl(atlasAsset))])
      .then(([background, atlas]) => {
        const frames = atlasFrames(atlas);
        return {
          background, atlas, frames,
          heroWidth: Math.max(...frames.slice(0, 4).map(frame => frame.width)),
          heroHeight: Math.max(...frames.slice(0, 4).map(frame => frame.height)),
        };
      }).catch(error => { artPromise = undefined; throw error; });
  }
  return artPromise;
}

/** Destinations use the caller's coordinate system. Hero frames share scale and foot pivot. */
export function drawAtlasSprite(
  ctx: CanvasRenderingContext2D, art: PixelArt, index: number,
  x: number, y: number, width: number, height: number, flip = false,
): void {
  const frame = art.frames[index];
  if (!frame) return;
  const scale = index < 4
    ? Math.min(width / art.heroWidth, height / art.heroHeight)
    : Math.min(width / frame.width, height / frame.height);
  const w = Math.max(2, pixel(frame.width * scale));
  const h = Math.max(2, pixel(frame.height * scale));
  const dx = pixel(x + (width - w) / 2);
  const dy = pixel(index < 4 ? y + height - h : y + (height - h) / 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); }
  else ctx.translate(dx, dy);
  ctx.drawImage(art.atlas, frame.x, frame.y, frame.width, frame.height, 0, 0, w, h);
  ctx.restore();
}

function stageFilter(version: 0 | 1 | 2) {
  return version === 2 ? 'hue-rotate(22deg) saturate(.86)' : version === 1 ? 'saturate(.64)' : 'none';
}

function background(
  ctx: CanvasRenderingContext2D, art: PixelArt, cameraX: number,
  filter: string,
) {
  ctx.save();
  ctx.filter = filter;
  // A single oversized scene avoids a visible seam at the carousel and ferris wheel.
  const width = Math.max(1200, VIEW_HEIGHT * art.background.naturalWidth / art.background.naturalHeight);
  const height = width * art.background.naturalHeight / art.background.naturalWidth;
  const travel = Math.min(width - VIEW_WIDTH, 240);
  const offset = pixel(cameraX / (WORLD_WIDTH - VIEW_WIDTH) * travel);
  ctx.drawImage(art.background, -offset, pixel((VIEW_HEIGHT - height) / 2), pixel(width), pixel(height));
  ctx.restore();
}

function tiles(ctx: CanvasRenderingContext2D, art: PixelArt, x: number, y: number, width: number, height: number) {
  const frame = art.frames[6];
  const tile = 48;
  ctx.save();
  ctx.beginPath(); ctx.rect(pixel(x), pixel(y), pixel(width), pixel(height)); ctx.clip();
  for (let row = 0; row < height; row += tile) {
    for (let column = 0; column < width; column += tile) {
      ctx.drawImage(art.atlas, frame.x, frame.y, frame.width, frame.height,
        pixel(x + column), pixel(y + row), tile, tile);
    }
  }
  ctx.restore();
}

function marker(ctx: CanvasRenderingContext2D, art: PixelArt, x: number, label: string, visited: boolean) {
  // These are in-world wayfinding labels, not substitute environment artwork.
  ctx.save();
  ctx.globalAlpha = visited ? .45 : 1;
  ctx.fillStyle = '#21364e';
  ctx.fillRect(pixel(x), GROUND_Y - 98, 2, 98);
  ctx.fillStyle = '#f3f1d5';
  ctx.fillRect(pixel(x - 14), GROUND_Y - 98, 86, 30);
  ctx.fillStyle = '#21364e';
  ctx.font = 'bold 14px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pixel(x - 6), GROUND_Y - 82);
  drawAtlasSprite(ctx, art, 4, x + 2, GROUND_Y - 63, 30, 30);
  ctx.restore();
}

function shieldCorners(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = '#eafcf5';
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1], [x + width, y, -1, 1],
    [x, y + height, 1, -1], [x + width, y + height, -1, -1],
  ]) {
    ctx.fillRect(pixel(cx - (sx < 0 ? 10 : 0)), pixel(cy), 10, 2);
    ctx.fillRect(pixel(cx), pixel(cy - (sy < 0 ? 10 : 0)), 2, 10);
  }
}

/** Draw into a 480×270 backing canvas; the simulation remains 960×540 logical pixels. */
export function drawPixelWorld(
  ctx: CanvasRenderingContext2D, world: WorldState, art: PixelArt, options: PixelWorldOptions = {},
): void {
  ctx.save();
  ctx.setTransform(ctx.canvas.width / VIEW_WIDTH, 0, 0, ctx.canvas.height / VIEW_HEIGHT, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.fillStyle = '#aec9ee'; ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const camera = pixel(world.cameraX);
  background(ctx, art, camera, stageFilter(options.version ?? Math.min(2, world.checkpoint) as 0 | 1 | 2));

  ctx.save();
  ctx.translate(-camera, 0);
  const firstTile = Math.floor(camera / 48) * 48;
  tiles(ctx, art, firstTile, GROUND_Y, VIEW_WIDTH + 96, VIEW_HEIGHT - GROUND_Y);
  for (const platform of LEVEL_PLATFORMS) {
    if (platform.x + platform.width < camera || platform.x > camera + VIEW_WIDTH) continue;
    tiles(ctx, art, platform.x, platform.y, platform.width, 30);
  }
  CHECKPOINTS.forEach((x, index) => {
    if (x > camera - 90 && x < camera + VIEW_WIDTH) marker(ctx, art, x, `0${index + 1}`, world.checkpoint > index);
  });
  if (GOAL_X > camera - 90 && GOAL_X < camera + VIEW_WIDTH) marker(ctx, art, GOAL_X, 'EXIT', world.finished);

  for (const photo of LEVEL_PHOTOS) {
    if (world.collected.has(photo.id) || photo.x < camera - 40 || photo.x > camera + VIEW_WIDTH + 40) continue;
    const bob = options.reducedMotion ? 0 : pixel(Math.sin(world.time * 2.4 + photo.x) * 2);
    drawAtlasSprite(ctx, art, 4, photo.x - 16, photo.y - 16 + bob, 32, 32);
  }
  for (const bubble of LEVEL_BUBBLES) {
    // The visual follows the same trajectory as the collider, including reduced-motion mode.
    const point = bubblePosition(bubble, world.time);
    if (point.x < camera - 50 || point.x > camera + VIEW_WIDTH + 50) continue;
    drawAtlasSprite(ctx, art, 5, point.x - bubble.radius, point.y - bubble.radius, bubble.radius * 2, bubble.radius * 2);
  }
  for (const hazard of LEVEL_HAZARDS) {
    if (hazard.x + hazard.width < camera || hazard.x > camera + VIEW_WIDTH) continue;
    drawAtlasSprite(ctx, art, 7, hazard.x, hazard.y, hazard.width, hazard.height);
  }

  const running = !options.idle && Math.abs(world.vx) > 14;
  const frame = !world.grounded ? 3 : running ? 1 + Math.floor(world.time * 8) % 2 : 0;
  const protectedNow = world.shieldUntil > world.time;
  const hit = world.invulnerableUntil > world.time;
  const playerX = pixel(world.x), playerY = pixel(world.y + PLAYER_HEIGHT - 44);
  if (hit && !options.reducedMotion) ctx.globalAlpha = Math.floor(world.time * 8) % 2 ? .55 : 1;
  drawAtlasSprite(ctx, art, frame, playerX, playerY, PLAYER_WIDTH, 44, world.facing < 0);
  ctx.globalAlpha = 1;
  if (protectedNow || (hit && options.reducedMotion)) {
    shieldCorners(ctx, playerX - 6, playerY - 6, PLAYER_WIDTH + 12, 56);
  }
  if (world.protectCharge > 0 && !protectedNow) {
    ctx.fillStyle = '#21364e'; ctx.fillRect(playerX - 4, playerY - 10, 36, 4);
    ctx.fillStyle = '#a8f5db'; ctx.fillRect(playerX - 4, playerY - 10, pixel(36 * world.protectCharge / .7), 4);
  }
  ctx.restore();

  // One quiet, short signal slip after contact; never a flashing full-screen overlay.
  const hitAge = 1.1 - (world.invulnerableUntil - world.time);
  if (hit && hitAge >= 0 && hitAge < .16 && !options.reducedMotion) {
    ctx.fillStyle = '#e0b1ef'; ctx.fillRect(118, 110, 106, 2);
    ctx.fillStyle = '#a5e9e0'; ctx.fillRect(372, 202, 54, 2);
  }
  ctx.restore();
}

/**
 * Observation and ending share the full, uncropped scene. Only the people count is
 * reconstructed; sky and carousel answers remain textual records in the UI. A global
 * tint or mirror would alter unrelated evidence, not faithfully reconstruct a detail.
 */
export function drawMemoryPhoto(ctx: CanvasRenderingContext2D, art: PixelArt, options: MemoryPhotoOptions): void {
  ctx.save();
  ctx.setTransform(ctx.canvas.width / VIEW_WIDTH, 0, 0, ctx.canvas.height / VIEW_HEIGHT, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.fillStyle = '#aec9ee'; ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  ctx.drawImage(art.background, 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  tiles(ctx, art, 0, GROUND_Y, VIEW_WIDTH, VIEW_HEIGHT - GROUND_Y);
  const count = Math.max(0, Math.min(5, Math.round(options.count)));
  const spacing = 90;
  const total = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const x = VIEW_WIDTH / 2 - total / 2 + i * spacing - 28;
    drawAtlasSprite(ctx, art, 0, x, GROUND_Y - 88, 56, 88, i % 2 === 1);
  }
  ctx.restore();
}
