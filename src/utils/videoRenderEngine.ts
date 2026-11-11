import { TimelineClip, EditorSettings, CaptionSettings, TimestampItem } from '../types';
import { parseTimeToSeconds } from './audioSynthesizer';

export interface RenderContext {
  canvas: HTMLCanvasElement;
  clips: TimelineClip[];
  settings: EditorSettings;
  captionSettings: CaptionSettings;
  timestamps: TimestampItem[];
  currentTime: number; // in seconds
  totalDuration: number;
}

// In-memory image cache so render loop does not flicker
const imageCache: Map<string, HTMLImageElement> = new Map();

export function preloadClipImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    if (imageCache.has(url)) {
      resolve(imageCache.get(url)!);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      // Create a fallback solid/gradient canvas image
      const fallback = document.createElement('canvas');
      fallback.width = 1280;
      fallback.height = 720;
      const fctx = fallback.getContext('2d');
      if (fctx) {
        fctx.fillStyle = '#181824';
        fctx.fillRect(0, 0, 1280, 720);
        fctx.fillStyle = '#6366f1';
        fctx.font = 'bold 36px sans-serif';
        fctx.textAlign = 'center';
        fctx.fillText('Clip Media', 640, 360);
      }
      const fImg = new Image();
      fImg.src = fallback.toDataURL();
      imageCache.set(url, fImg);
      resolve(fImg);
    };
    img.src = url;
  });
}

/**
 * Preload all images in timeline
 */
export async function preloadAllClips(clips: TimelineClip[]): Promise<void> {
  const promises = clips.map((c) => preloadClipImage(c.src));
  await Promise.all(promises);
}

/**
 * Check if the subscribe button should be visible at currentTime
 */
function isSubscribeVisible(currentTime: number, timesStr: string): { visible: boolean; progress: number } {
  if (!timesStr) return { visible: false, progress: 0 };
  const times = timesStr.split(',').map((t) => parseTimeToSeconds(t.trim())).filter((t) => !isNaN(t));
  const displayDuration = 4.6; // seconds

  for (const triggerSec of times) {
    if (currentTime >= triggerSec && currentTime < triggerSec + displayDuration) {
      const progress = (currentTime - triggerSec) / displayDuration;
      return { visible: true, progress };
    }
  }
  return { visible: false, progress: 0 };
}

/**
 * Find active caption text at currentTime
 */
function getActiveCaption(currentTime: number, timestamps: TimestampItem[], fallbackText: string): string {
  if (timestamps.length > 0) {
    const active = timestamps.find((t) => currentTime >= t.start && currentTime <= t.end);
    if (active) return active.text;
  }
  return fallbackText;
}

/**
 * Main Frame Renderer
 */
export function renderVideoFrame(ctx: CanvasRenderingContext2D, renderData: RenderContext): void {
  const { canvas, clips, settings, captionSettings, timestamps, currentTime } = renderData;
  const cw = canvas.width;
  const ch = canvas.height;

  // Clear frame
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, cw, ch);

  if (!clips || clips.length === 0) {
    ctx.fillStyle = '#52525b';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No clips in timeline. Add images or videos.', cw / 2, ch / 2);
    return;
  }

  // Calculate which clip is playing
  let accumulatedTime = 0;
  let activeClipIndex = 0;
  let clipLocalTime = 0;

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (currentTime >= accumulatedTime && currentTime <= accumulatedTime + c.duration) {
      activeClipIndex = i;
      clipLocalTime = currentTime - accumulatedTime;
      break;
    }
    accumulatedTime += c.duration;
    if (i === clips.length - 1) {
      activeClipIndex = clips.length - 1;
      clipLocalTime = c.duration;
    }
  }

  const currentClip = clips[activeClipIndex];
  const nextClip = activeClipIndex < clips.length - 1 ? clips[activeClipIndex + 1] : null;

  // Transition parameters (last 0.6 seconds of clip)
  const transitionDuration = 0.6;
  const timeRemaining = currentClip.duration - clipLocalTime;
  const isTransitioning = nextClip && timeRemaining < transitionDuration && settings.transitions !== 'none';
  const transProgress = isTransitioning ? 1 - timeRemaining / transitionDuration : 0;

  // Helper to draw a single clip with motion
  const drawClip = (clip: TimelineClip, localT: number, alpha = 1.0, offsetX = 0) => {
    ctx.save();
    ctx.globalAlpha = alpha;

    const img = imageCache.get(clip.src);
    if (img && img.complete && img.naturalWidth > 0) {
      // Calculate motion
      const tNorm = Math.min(1, Math.max(0, localT / clip.duration));
      let scale = 1.0;
      let panX = 0;
      let panY = 0;

      const motionType = clip.motion || settings.imageMotion;
      const speedMultiplier = settings.motionSpeed === 'fast' ? 1.4 : settings.motionSpeed === 'slow' ? 0.7 : 1.0;

      if (motionType.toLowerCase().includes('zoom in') || motionType === 'zoom_in') {
        scale = 1.0 + 0.15 * tNorm * speedMultiplier;
      } else if (motionType.toLowerCase().includes('zoom out') || motionType === 'zoom_out') {
        scale = 1.15 - 0.15 * tNorm * speedMultiplier;
      } else if (motionType.toLowerCase().includes('pan left')) {
        scale = 1.1;
        panX = 0.05 * (1 - tNorm * 2) * cw * speedMultiplier;
      } else if (motionType.toLowerCase().includes('pan right')) {
        scale = 1.1;
        panX = -0.05 * (1 - tNorm * 2) * cw * speedMultiplier;
      } else {
        scale = 1.0 + 0.08 * tNorm * speedMultiplier;
      }

      // Drawing bounds
      let dw = cw;
      let dh = ch;
      let dx = 0;
      let dy = 0;

      if (settings.fitMode === 'fit') {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = cw / ch;
        if (imgAspect > canvasAspect) {
          dw = cw;
          dh = cw / imgAspect;
          dy = (ch - dh) / 2;
        } else {
          dh = ch;
          dw = ch * imgAspect;
          dx = (cw - dw) / 2;
        }
      } else if (settings.fitMode === 'fill') {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = cw / ch;
        if (imgAspect > canvasAspect) {
          dh = ch;
          dw = ch * imgAspect;
          dx = (cw - dw) / 2;
        } else {
          dw = cw;
          dh = cw / imgAspect;
          dy = (ch - dh) / 2;
        }
      }

      ctx.translate(cw / 2 + offsetX + panX, ch / 2 + panY);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1e1e24';
      ctx.fillRect(0, 0, cw, ch);
    }

    ctx.restore();
  };

  // 1. Draw base current clip
  if (!isTransitioning) {
    drawClip(currentClip, clipLocalTime, 1.0, 0);
  } else {
    // Cross-dissolve or slide transition
    const transType = (currentClip.transition || settings.transitions).toLowerCase();

    if (transType.includes('slide')) {
      drawClip(currentClip, clipLocalTime, 1.0, -transProgress * cw);
      if (nextClip) {
        drawClip(nextClip, 0, 1.0, (1 - transProgress) * cw);
      }
    } else if (transType.includes('zoom')) {
      drawClip(currentClip, clipLocalTime, 1 - transProgress, 0);
      if (nextClip) {
        drawClip(nextClip, 0, transProgress, 0);
      }
    } else {
      // Default: smooth Cross Dissolve
      drawClip(currentClip, clipLocalTime, 1.0, 0);
      if (nextClip) {
        drawClip(nextClip, 0, transProgress, 0);
      }
    }
  }

  // 2. Overlay Captions / Subtitles
  const captionText = getActiveCaption(currentTime, timestamps, captionSettings.text);
  if (captionText && captionText.trim()) {
    drawCaptionOverlay(ctx, captionText, captionSettings, cw, ch);
  }

  // 3. Overlay Animated Subscribe Button
  if (settings.subscribeToggle === 'on') {
    const subStatus = isSubscribeVisible(currentTime, settings.subscribeTimes);
    if (subStatus.visible) {
      drawSubscribeOverlay(ctx, settings, subStatus.progress, cw, ch);
    }
  }
}

/**
 * Draw Subtitles with 16 customizable styles
 */
function drawCaptionOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  settings: CaptionSettings,
  cw: number,
  ch: number
): void {
  ctx.save();

  const px = (settings.xPercent / 100) * cw;
  const py = (settings.yPercent / 100) * ch;
  const baseSize = Math.round((ch * 0.046) * (settings.sizeScale / 100));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const style = settings.style || 'typewriter';
  const color = settings.color || '#ffffff';

  if (style === 'typewriter') {
    ctx.font = `600 ${baseSize}px 'JetBrains Mono', monospace`;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 36;
    const boxH = baseSize * 1.6;

    // Dark semi-transparent box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py - boxH / 2, boxW, boxH, 6);
    ctx.fill();

    // Yellow accent indicator on left
    ctx.fillStyle = '#facc15';
    ctx.fillRect(px - boxW / 2, py - boxH / 2, 6, boxH);

    ctx.fillStyle = color;
    ctx.fillText(text, px + 4, py);
  } else if (style === 'bold-punch') {
    ctx.font = `900 ${baseSize * 1.25}px 'Plus Jakarta Sans', sans-serif`;
    const upperText = text.toUpperCase();

    // Heavy outline stroke
    ctx.lineWidth = Math.max(4, baseSize * 0.18);
    ctx.strokeStyle = '#000000';
    ctx.lineJoin = 'miter';
    ctx.strokeText(upperText, px, py);

    ctx.fillStyle = color;
    ctx.fillText(upperText, px, py);
  } else if (style === 'boxed-yellow') {
    ctx.font = `900 ${baseSize * 1.1}px 'Plus Jakarta Sans', sans-serif`;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 28;
    const boxH = baseSize * 1.5;

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py - boxH / 2, boxW, boxH, 4);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.fillText(text, px, py);
  } else if (style === 'karaoke') {
    ctx.font = `800 ${baseSize * 1.15}px sans-serif`;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 40;
    const boxH = baseSize * 1.7;

    ctx.fillStyle = 'rgba(15, 15, 22, 0.75)';
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py - boxH / 2, boxW, boxH, 999);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
  } else if (style === 'neon-glow') {
    ctx.font = `800 ${baseSize * 1.2}px sans-serif`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
    ctx.shadowBlur = 0;
  } else if (style === 'comic') {
    ctx.font = `900 ${baseSize * 1.1}px 'Comic Sans MS', cursive, sans-serif`;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 36;
    const boxH = baseSize * 1.6;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py - boxH / 2, boxW, boxH, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.fillText(text, px, py);
  } else if (style === 'cyberpunk') {
    ctx.font = `800 ${baseSize * 1.15}px 'JetBrains Mono', monospace`;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + 32;
    const boxH = baseSize * 1.6;

    // Cyberpunk offset box
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(px - boxW / 2 + 4, py - boxH / 2 + 4, boxW, boxH);

    ctx.fillStyle = '#000000';
    ctx.fillRect(px - boxW / 2, py - boxH / 2, boxW, boxH);

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - boxW / 2, py - boxH / 2, boxW, boxH);

    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
  } else {
    // Standard Minimalist / Soft shadow
    ctx.font = `700 ${baseSize}px 'Plus Jakarta Sans', sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, px, py);
    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
  }

  ctx.restore();
}

/**
 * Draw Animated Subscribe Overlay with Bell
 */
function drawSubscribeOverlay(
  ctx: CanvasRenderingContext2D,
  settings: EditorSettings,
  progress: number,
  cw: number,
  ch: number
): void {
  ctx.save();

  // Entrance and exit bounce
  let animScale = 1.0;
  if (progress < 0.12) {
    animScale = (progress / 0.12) * 1.1;
  } else if (progress > 0.88) {
    animScale = (1 - (progress - 0.88) / 0.12) * 1.1;
  } else {
    animScale = 1.0 + Math.sin(progress * Math.PI * 8) * 0.04;
  }

  const baseSize = settings.subscribeSize === 'small' ? 0.75 : settings.subscribeSize === 'large' ? 1.3 : 1.0;
  const badgeW = 160 * baseSize * animScale;
  const badgeH = 42 * baseSize * animScale;

  let bx = cw - badgeW - 32;
  let by = 32;

  if (settings.subscribePos === 'top-left') {
    bx = 32;
    by = 32;
  } else if (settings.subscribePos === 'bottom-right') {
    bx = cw - badgeW - 32;
    by = ch - badgeH - 32;
  } else if (settings.subscribePos === 'bottom-left') {
    bx = 32;
    by = ch - badgeH - 32;
  }

  // Red pill container with shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(bx, by, badgeW, badgeH, 999);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Text "SUBSCRIBE"
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(14 * baseSize * animScale)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUBSCRIBE', bx + 18 * baseSize, by + badgeH / 2);

  // Bell icon circle with slight wiggle
  const bellX = bx + badgeW - 24 * baseSize;
  const bellY = by + badgeH / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.arc(bellX, bellY, 13 * baseSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `${Math.round(13 * baseSize)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔔', bellX, bellY + 1);

  ctx.restore();
}
