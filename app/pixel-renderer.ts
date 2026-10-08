import backgroundAsset from '../game/assets/pixel/background.png';
import atlasAsset from '../game/assets/pixel/atlas.png';
import { drawWorldProps } from './pixel-props';
import type { PhotoSlots } from './memory-storage';
import {
  CHECKPOINTS, GOAL_X, GROUND_Y, LEVEL_BUBBLES, LEVEL_HAZARDS,
  LEVEL_PHOTOS, LEVEL_PLATFORMS, LEVEL_SPRINGS, PRACTICE_PHOTOS, PRACTICE_PLATFORMS,
  PLAYER_HEIGHT, PLAYER_WIDTH, VIEW_HEIGHT, VIEW_WIDTH, WORLD_WIDTH,
  bubblePosition, hazardPosition, type WorldState,
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

// Interactive objects share the same silhouette accents in the world and pause guide.
// Keep the source artwork; only the small action layer uses warm/cool contrast.
export function drawGameObject(
  ctx: CanvasRenderingContext2D, art: PixelArt, index: number,
  x: number, y: number, width: number, height: number,
): void {
  ctx.save();
  ctx.translate(pixel(x), pixel(y));
  ctx.scale(width / 32, height / 32);
  if (index === 4) {
    ctx.fillStyle = '#17294c'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#ffcd55'; ctx.fillRect(2, 2, 28, 28);
    drawAtlasSprite(ctx, art, index, 5, 4, 22, 22);
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(5, 25, 22, 3);
    ctx.fillStyle = '#17294c'; ctx.fillRect(19, 26, 6, 2);
  } else if (index === 7) {
    ctx.fillStyle = '#17294c'; ctx.fillRect(0, 2, 32, 30);
    ctx.fillRect(4, 0, 24, 2);
    ctx.fillStyle = '#ff655c'; ctx.fillRect(2, 4, 28, 26);
    drawAtlasSprite(ctx, art, index, 6, 7, 20, 20);
    ctx.fillStyle = '#fff0cc'; ctx.fillRect(6, 4, 8, 2);
    ctx.fillStyle = '#ff655c'; ctx.fillRect(10, 13, 12, 3);
    ctx.fillRect(10, 20, 12, 3);
  } else if (index === 5) {
    ctx.fillStyle = '#17294c'; ctx.fillRect(2, 6, 28, 21);
    ctx.fillRect(6, 2, 20, 28); ctx.fillRect(8, 26, 6, 6);
    ctx.fillStyle = '#ed7de1'; ctx.fillRect(4, 8, 24, 17);
    ctx.fillRect(8, 4, 16, 24); ctx.fillRect(10, 26, 2, 4);
    drawAtlasSprite(ctx, art, index, 7, 6, 18, 19);
    ctx.fillStyle = '#fff6eb';
    for (let i = 0; i < 3; i++) ctx.fillRect(8 + i * 6, 14, 3, 3);
  } else drawAtlasSprite(ctx, art, index, 0, 0, 32, 32);
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

function shieldCorners(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color = '#63ebcb') {
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1], [x + width, y, -1, 1],
    [x, y + height, 1, -1], [x + width, y + height, -1, -1],
  ]) {
    ctx.fillStyle = '#17294c';
    ctx.fillRect(pixel(cx - (sx < 0 ? 10 : 0)) - 2, pixel(cy) - 2, 14, 6);
    ctx.fillRect(pixel(cx) - 2, pixel(cy - (sy < 0 ? 10 : 0)) - 2, 6, 14);
    ctx.fillStyle = color;
    ctx.fillRect(pixel(cx - (sx < 0 ? 10 : 0)), pixel(cy), 10, 2);
    ctx.fillRect(pixel(cx), pixel(cy - (sy < 0 ? 10 : 0)), 2, 10);
  }
}

function contactFeedback(ctx: CanvasRenderingContext2D, world: WorldState, reducedMotion: boolean) {
  for (const effect of world.feedback) {
    const age = world.time - effect.at;
    if (age < 0 || age > .55) continue;
    const progress = age / .55;
    const spread = reducedMotion ? 0 : pixel(18 * (1 - (1 - progress) ** 3));
    const color = effect.type === 'collision' ? '#ff655c' : effect.type === 'bubble' ? '#ed7de1'
      : effect.type === 'photo' ? '#ffcd55' : '#63ebcb';
    ctx.save();
    ctx.globalAlpha = reducedMotion ? 1 : 1 - progress;
    if (effect.type === 'photo' || effect.type === 'block') {
      shieldCorners(ctx, effect.x - 20 - spread / 2, effect.y - 22 - spread / 2, 40 + spread, 44 + spread, color);
    } else {
      // Four blocky fragments, no full-screen flash or camera shake.
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = pixel(effect.x + dx * (16 + spread));
        const y = pixel(effect.y + dy * (12 + spread / 2));
        ctx.fillStyle = '#17294c'; ctx.fillRect(x - 2, y - 2, 10, 6);
        ctx.fillStyle = color; ctx.fillRect(x, y, 6, 2);
      }
    }
    ctx.restore();
  }
}

function recalledPrint(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // A visibly separate, repeated account, never a modification to the original photo.
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#17294c'; ctx.fillRect(6, 5, 104, 80);
  ctx.fillStyle = '#ed7de1'; ctx.fillRect(4, 3, 100, 77);
  ctx.fillStyle = '#17294c'; ctx.fillRect(0, 0, 102, 78);
  ctx.fillStyle = '#fff6d8'; ctx.fillRect(2, 2, 98, 74);
  ctx.fillStyle = '#233f83'; ctx.font = 'bold 10px monospace';
  ctx.textBaseline = 'top'; ctx.fillText('RECALLED', 9, 8);
  // Both retellings change the count only. Keep the shared blue-sky baseline.
  ctx.fillStyle = '#89b7ef'; ctx.fillRect(8, 23, 86, 39);
  ctx.fillStyle = '#233f83'; ctx.fillRect(8, 57, 86, 5);
  for (let i = 0; i < 5; i++) {
    const px = 15 + i * 16;
    ctx.fillStyle = '#17294c'; ctx.fillRect(px, 30, 6, 6);
    ctx.fillStyle = '#ffcd55'; ctx.fillRect(px - 2, 37, 10, 11);
    ctx.fillStyle = '#17294c'; ctx.fillRect(px - 2, 48, 4, 9); ctx.fillRect(px + 4, 48, 4, 9);
  }
  ctx.fillStyle = '#233f83'; ctx.fillRect(8, 67, 24, 2); ctx.fillRect(36, 67, 12, 2);
  ctx.fillStyle = '#ff655c'; ctx.fillRect(88, 66, 6, 5);
  ctx.restore();
}

function routeArrow(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'up' | 'left' | 'right') {
  ctx.save();
  ctx.translate(pixel(x), pixel(y));
  if (direction === 'up') ctx.rotate(-Math.PI / 2);
  else if (direction === 'left') ctx.scale(-1, 1);
  ctx.fillStyle = '#21364e';
  ctx.fillRect(-12, -4, 18, 8);
  ctx.fillRect(2, -10, 6, 20);
  ctx.fillRect(8, -6, 6, 12);
  ctx.fillRect(14, -2, 4, 4);
  ctx.fillStyle = '#a8f5db';
  ctx.fillRect(-10, -2, 18, 4);
  ctx.restore();
}

/** The number and highlighted strip identify the same fixed part in each route section. */
function fragmentMarker(ctx: CanvasRenderingContext2D, id: string, x: number, y: number) {
  const suffix = Number(id.match(/(\d+)$/)?.[1] ?? 1);
  const part = (Math.max(1, suffix) - 1) % 5;
  ctx.save();
  ctx.translate(pixel(x), pixel(y));
  ctx.fillStyle = '#17294c'; ctx.fillRect(22, -8, 18, 18);
  ctx.fillStyle = '#fff6d8'; ctx.fillRect(24, -6, 14, 14);
  ctx.fillStyle = '#17294c';
  ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(part + 1), 31, 1);
  ctx.fillStyle = '#17294c'; ctx.fillRect(0, 32, 32, 10);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i === part ? '#63ebcb' : '#fff6d8';
    ctx.fillRect(2 + i * 6, i === part ? 34 : 38, 4, i === part ? 6 : 2);
  }
  ctx.restore();
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
  const practice = world.mode === 'practice';
  for (const platform of practice ? PRACTICE_PLATFORMS : LEVEL_PLATFORMS) {
    if (platform.x + platform.width < camera || platform.x > camera + VIEW_WIDTH) continue;
    tiles(ctx, art, platform.x, platform.y, platform.width, 30);
    ctx.fillStyle = '#17294c'; ctx.fillRect(pixel(platform.x), platform.y, platform.width, 4);
    ctx.fillStyle = '#63ebcb'; ctx.fillRect(pixel(platform.x + 4), platform.y, platform.width - 8, 2);
  }
  drawWorldProps(ctx, world, options);
  if (!practice) {
    // The boards sit alongside the scripted shared-memory comments, above the route.
    for (const [x, y] of [[1060, 248], [2240, 224]] as const) {
      if (x + 112 > camera && x < camera + VIEW_WIDTH) recalledPrint(ctx, x, y);
    }
  }
  if (!practice) {
    CHECKPOINTS.forEach((x, index) => {
      if (x > camera - 90 && x < camera + VIEW_WIDTH) marker(ctx, art, x, `0${index + 1}`, world.checkpoint > index);
    });
    if (GOAL_X > camera - 90 && GOAL_X < camera + VIEW_WIDTH) marker(ctx, art, GOAL_X, 'EXIT', world.finished);
    for (const spring of LEVEL_SPRINGS) {
      if (spring.x + spring.width < camera || spring.x > camera + VIEW_WIDTH) continue;
      tiles(ctx, art, spring.x, GROUND_Y - 8, spring.width, 12);
      ctx.fillStyle = '#21364e'; ctx.fillRect(spring.x + 4, GROUND_Y - 10, spring.width - 8, 4);
      ctx.fillStyle = '#a8f5db'; ctx.fillRect(spring.x + 6, GROUND_Y - 12, spring.width - 12, 4);
      routeArrow(ctx, spring.x + spring.width / 2, GROUND_Y - 32, 'up');
    }
  } else if (world.collected.size === 0) {
    routeArrow(ctx, 235, GROUND_Y - 24, 'right');
    routeArrow(ctx, 337, GROUND_Y - 38, 'up');
    shieldCorners(ctx, 402, 298, 46, 46);
  }

  for (const photo of practice ? PRACTICE_PHOTOS : LEVEL_PHOTOS) {
    if (world.collected.has(photo.id) || photo.x < camera - 40 || photo.x > camera + VIEW_WIDTH + 40) continue;
    const bob = options.reducedMotion ? 0 : pixel(Math.sin(world.time * 2.4 + photo.x) * 2);
    drawGameObject(ctx, art, 4, photo.x - 16, photo.y - 16 + bob, 32, 32);
    fragmentMarker(ctx, photo.id, photo.x - 16, photo.y - 16 + bob);
  }
  for (const bubble of practice ? [] : LEVEL_BUBBLES) {
    // The visual follows the same trajectory as the collider, including reduced-motion mode.
    const point = bubblePosition(bubble, world.time);
    if (point.x < camera - 50 || point.x > camera + VIEW_WIDTH + 50) continue;
    drawGameObject(ctx, art, 5, point.x - bubble.radius, point.y - bubble.radius, bubble.radius * 2, bubble.radius * 2);
  }
  for (const hazard of practice ? [] : LEVEL_HAZARDS) {
    const point = hazardPosition(hazard, world.time);
    if (point.x + hazard.width < camera || point.x > camera + VIEW_WIDTH) continue;
    if (hazard.patrol) {
      ctx.fillStyle = '#21364e';
      ctx.globalAlpha = .3;
      ctx.fillRect(pixel(hazard.x - hazard.patrol), GROUND_Y - 2, hazard.patrol * 2 + hazard.width, 2);
      ctx.globalAlpha = 1;
    }
    drawGameObject(ctx, art, 7, point.x, point.y, hazard.width, hazard.height);
  }
  if (practice && world.practiceSignal) {
    const signal = world.practiceSignal;
    drawGameObject(ctx, art, 5, signal.x - 17, signal.y - 17, 34, 34);
    routeArrow(ctx, signal.x - signal.direction * 35, signal.y, signal.direction < 0 ? 'left' : 'right');
  }

  const running = !options.idle && Math.abs(world.vx) > 14;
  const frame = !world.grounded ? 3 : running ? 1 + Math.floor(world.time * 8) % 2 : 0;
  const protectedNow = world.shieldUntil > world.time;
  const hit = world.invulnerableUntil > world.time;
  const blocked = hit && world.lastContact === 'block';
  const playerX = pixel(world.x), playerY = pixel(world.y + PLAYER_HEIGHT - 44);
  if (hit && !blocked && !options.reducedMotion) ctx.globalAlpha = Math.floor(world.time * 8) % 2 ? .55 : 1;
  drawAtlasSprite(ctx, art, frame, playerX, playerY, PLAYER_WIDTH, 44, world.facing < 0);
  ctx.globalAlpha = 1;
  if (protectedNow || (hit && options.reducedMotion)) {
    shieldCorners(ctx, playerX - 6, playerY - 6, PLAYER_WIDTH + 12, 56);
  }
  if (world.protectCharge > 0 && !protectedNow) {
    ctx.fillStyle = '#21364e'; ctx.fillRect(playerX - 4, playerY - 10, 36, 4);
    ctx.fillStyle = '#a8f5db'; ctx.fillRect(playerX - 4, playerY - 10, pixel(36 * world.protectCharge / .7), 4);
  }
  contactFeedback(ctx, world, Boolean(options.reducedMotion));
  ctx.restore();

  // One quiet, short signal slip after contact; never a flashing full-screen overlay.
  const hitAge = 1.1 - (world.invulnerableUntil - world.time);
  if (hit && !blocked && hitAge >= 0 && hitAge < .16 && !options.reducedMotion) {
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

/**
 * The five slots reveal five fixed strips of the original, never five alternate photos.
 * Missing and damaged strips are opaque across their whole area; no hidden person can
 * peek through a gap or be replaced with an invented reconstruction.
 */
export function drawPhotoFragments(ctx: CanvasRenderingContext2D, art: PixelArt, slots: PhotoSlots): void {
  drawMemoryPhoto(ctx, art, { count: 4 });
  ctx.save();
  ctx.setTransform(ctx.canvas.width / VIEW_WIDTH, 0, 0, ctx.canvas.height / VIEW_HEIGHT, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const width = VIEW_WIDTH / 5;
  for (let index = 0; index < 5; index++) {
    const photo = slots[index];
    const x = index * width;
    if (!photo) {
      ctx.fillStyle = '#fff6d8'; ctx.fillRect(x, 0, width, VIEW_HEIGHT);
      ctx.fillStyle = '#8196b5';
      // Dashed paper outline: absence is legible without depending on colour alone.
      for (let y = 8; y < VIEW_HEIGHT - 8; y += 20) {
        ctx.fillRect(x + 6, y, 2, Math.min(10, VIEW_HEIGHT - 8 - y));
        ctx.fillRect(x + width - 8, y, 2, Math.min(10, VIEW_HEIGHT - 8 - y));
      }
      for (let dx = 8; dx < width - 8; dx += 20) {
        ctx.fillRect(x + dx, 6, Math.min(10, width - 8 - dx), 2);
        ctx.fillRect(x + dx, VIEW_HEIGHT - 8, Math.min(10, width - 8 - dx), 2);
      }
      ctx.fillStyle = '#233f83'; ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), x + width / 2, VIEW_HEIGHT / 2);
    } else if (photo.altered) {
      ctx.fillStyle = '#8196b5'; ctx.fillRect(x, 0, width, VIEW_HEIGHT);
      for (let row = 0; row < 18; row++) {
        ctx.fillStyle = row % 3 === 0 ? '#df96b8' : '#70c9de';
        ctx.fillRect(x + 12 + row % 3 * 28, 14 + row * 30, 70 + row % 2 * 28, 2);
      }
    }
  }
  // Exact adjoining crops with quiet seams, not separated or rearranged miniatures.
  ctx.fillStyle = '#233f83';
  for (let index = 1; index < 5; index++) ctx.fillRect(index * width, 0, 2, VIEW_HEIGHT);
  ctx.restore();
}
