/**
 * U.N.A. Mascot — пиксельный маскот-компаньон.
 *
 * Концепт: маленькое светящееся существо (не человек!),
 * похожее на дружелюбного спрайта/каплю.
 * Живёт в чате рядом с сообщениями U.N.A.
 * В mini overlay — большой, на всё окно.
 *
 * Стиль: pixel art (grid-based canvas), как у Claude.
 * Анимации: floating, blink, emotion eyes, speaking waves.
 */

import { useEffect, useRef } from 'react';

export type MascotEmotion = 'neutral' | 'happy' | 'sad' | 'frustrated' | 'excited' | 'anxious' | 'thinking';
export type MascotStatus = 'idle' | 'thinking' | 'speaking' | 'listening' | 'executing' | 'awaiting_confirmation';

interface MascotProps {
  emotion?: MascotEmotion;
  status?: MascotStatus;
  size?: number; // px, default 48 (chat), 200 (overlay)
}

// ============================================================
// COLOR PALETTES — по эмоциям
// ============================================================

interface Palette {
  body: string;       // основной цвет тела
  bodyDark: string;   // тень
  bodyLight: string;  // блик
  eye: string;        // цвет глаз
  glow: string;       // свечение (rgba)
  glowAlpha: number;
}

const PALETTES: Record<MascotEmotion, Palette> = {
  neutral:    { body: '#22d3ee', bodyDark: '#0891b2', bodyLight: '#67e8f9', eye: '#0f172a', glow: '34, 211, 238', glowAlpha: 0.3 },
  happy:      { body: '#4ade80', bodyDark: '#16a34a', bodyLight: '#86efac', eye: '#052e16', glow: '74, 222, 128', glowAlpha: 0.5 },
  sad:        { body: '#818cf8', bodyDark: '#4f46e5', bodyLight: '#a5b4fc', eye: '#1e1b4b', glow: '129, 140, 248', glowAlpha: 0.25 },
  frustrated: { body: '#f87171', bodyDark: '#dc2626', bodyLight: '#fca5a5', eye: '#450a0a', glow: '248, 113, 113', glowAlpha: 0.4 },
  excited:    { body: '#fbbf24', bodyDark: '#d97706', bodyLight: '#fde68a', eye: '#451a03', glow: '251, 191, 36', glowAlpha: 0.6 },
  anxious:    { body: '#a78bfa', bodyDark: '#7c3aed', bodyLight: '#c4b5fd', eye: '#2e1065', glow: '167, 139, 250', glowAlpha: 0.35 },
  thinking:   { body: '#fcd34d', bodyDark: '#ca8a04', bodyLight: '#fef08a', eye: '#422006', glow: '252, 211, 77', glowAlpha: 0.45 },
};

// Status override glow
const STATUS_GLOW: Record<MascotStatus, { color: string; alpha: number; pulseSpeed: number }> = {
  idle:                   { color: '34, 211, 238', alpha: 0.2, pulseSpeed: 0.5 },
  thinking:               { color: '252, 211, 77', alpha: 0.5, pulseSpeed: 2.0 },
  speaking:               { color: '74, 222, 128', alpha: 0.6, pulseSpeed: 3.0 },
  listening:              { color: '244, 114, 182', alpha: 0.45, pulseSpeed: 1.5 },
  executing:              { color: '251, 146, 60', alpha: 0.55, pulseSpeed: 2.5 },
  awaiting_confirmation:  { color: '248, 113, 113', alpha: 0.5, pulseSpeed: 1.0 },
};

// ============================================================
// PIXEL SPRITE — тело маскота (16x16 grid)
// ============================================================
// 0 = transparent, 1 = body, 2 = bodyDark, 3 = bodyLight, 4 = eye
// Симметричная капля/спрайт:

const SPRITE_16: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,3,3,3,3,3,3,1,0,0,0,0],
  [0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0],
  [0,0,1,3,3,3,3,3,3,3,3,3,3,1,0,0],
  [0,1,3,3,3,3,3,3,3,3,3,3,3,3,1,0],
  [0,1,3,3,4,4,3,3,3,3,4,4,3,3,1,0],
  [1,3,3,3,4,4,3,3,3,3,4,4,3,3,3,1],
  [1,3,3,3,4,4,3,3,3,3,4,4,3,3,3,1],
  [1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1],
  [1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1],
  [1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1],
  [0,1,3,3,3,3,3,3,3,3,3,3,3,3,1,0],
  [0,1,2,2,3,3,3,3,3,3,3,3,2,2,1,0],
  [0,0,1,2,2,2,3,3,3,3,2,2,2,1,0,0],
  [0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0],
  [0,0,0,0,1,1,2,2,2,2,1,1,0,0,0,0],
];

// ============================================================
// COMPONENT
// ============================================================

export function UnaMascot({ emotion = 'neutral', status = 'idle', size = 48 }: MascotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Animation state
    let t = 0;
    let blinkTimer = 0;
    let isBlinking = false;
    let blinkProgress = 0;
    let lookOffsetX = 0;
    let lookOffsetY = 0;
    let lookTimer = 0;
    let raf = 0;
    let prevEmotion = emotion;
    let transitionT = 1; // 0 = old emotion, 1 = new emotion

    const draw = () => {
      t += 0.016; // ~60fps
      const palette = PALETTES[emotion];
      const statusGlow = STATUS_GLOW[status];

      // Emotion transition
      if (prevEmotion !== emotion) {
        transitionT = 0;
        prevEmotion = emotion;
      }
      if (transitionT < 1) transitionT = Math.min(1, transitionT + 0.03);

      // Clear
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;

      // Floating animation (gentle bob)
      const floatY = Math.sin(t * 1.5) * (size * 0.03);
      const floatX = Math.sin(t * 0.8) * (size * 0.01);

      // Glow pulse
      const pulseAlpha = statusGlow.alpha + Math.sin(t * statusGlow.pulseSpeed) * 0.1;
      const glowRadius = size * 0.55 + Math.sin(t * statusGlow.pulseSpeed) * (size * 0.03);

      // === 1. OUTER GLOW ===
      const grad = ctx.createRadialGradient(cx + floatX, cy + floatY, 0, cx + floatX, cy + floatY, glowRadius);
      grad.addColorStop(0, `rgba(${statusGlow.color}, ${Math.max(0, pulseAlpha)})`);
      grad.addColorStop(0.5, `rgba(${statusGlow.color}, ${Math.max(0, pulseAlpha * 0.3)})`);
      grad.addColorStop(1, `rgba(${statusGlow.color}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // === 2. PIXEL BODY ===
      const pixelSize = size / 16;
      const bodyOffsetX = cx - (16 * pixelSize) / 2 + floatX;
      const bodyOffsetY = cy - (16 * pixelSize) / 2 + floatY;

      // Breathing scale
      const breathScale = 1 + Math.sin(t * 1.2) * 0.02;
      const scaledPixel = pixelSize * breathScale;
      const breathOffset = (16 * pixelSize - 16 * scaledPixel) / 2;

      ctx.imageSmoothingEnabled = false;

      // Look around (random gentle eye movement)
      lookTimer += 0.016;
      if (lookTimer > 3 + Math.random() * 4) {
        lookTimer = 0;
        lookOffsetX = (Math.random() - 0.5) * pixelSize * 0.8;
        lookOffsetY = (Math.random() - 0.5) * pixelSize * 0.4;
      }
      // Smooth look movement
      const targetLookX = lookOffsetX;
      const targetLookY = lookOffsetY;

      // Blink logic
      blinkTimer += 0.016;
      if (!isBlinking && blinkTimer > 2.5 + Math.random() * 3) {
        isBlinking = true;
        blinkProgress = 0;
        blinkTimer = 0;
      }
      if (isBlinking) {
        blinkProgress += 0.08;
        if (blinkProgress >= 1) {
          isBlinking = false;
          blinkProgress = 0;
        }
      }

      // Draw sprite
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 16; col++) {
          const cell = SPRITE_16[row][col];
          if (cell === 0) continue;

          const px = bodyOffsetX + breathOffset + col * scaledPixel;
          const py = bodyOffsetY + breathOffset + row * scaledPixel;

          let color: string;
          switch (cell) {
            case 1: color = palette.bodyDark; break;
            case 2: color = palette.bodyDark; break;
            case 3: color = palette.body; break;
            case 4: color = palette.eye; break;
            default: continue;
          }

          // Highlight (top-left lighter)
          if (cell === 3 && row < 4 && (col < 4 || col > 11)) {
            color = palette.bodyLight;
          }

          // Blink: replace eye pixels with body color
          if (cell === 4 && isBlinking) {
            const blinkHeight = blinkProgress < 0.5 ? 1 - blinkProgress * 2 : (blinkProgress - 0.5) * 2;
            if (blinkHeight < 0.5) {
              color = palette.body;
            }
          }

          ctx.fillStyle = color;
          ctx.fillRect(px, py, scaledPixel + 0.5, scaledPixel + 0.5); // +0.5 to avoid gaps
        }
      }

      // === 3. EYES (emotion overlay) ===
      // Eyes are at rows 5-8, cols 4-5 and 10-11
      const eyeY1 = bodyOffsetY + breathOffset + 5 * scaledPixel;
      const eyeY2 = bodyOffsetY + breathOffset + 8 * scaledPixel;
      const leftEyeX = bodyOffsetX + breathOffset + 4 * scaledPixel;
      const rightEyeX = bodyOffsetX + breathOffset + 10 * scaledPixel;
      const eyeW = 2 * scaledPixel;
      const eyeH = 3 * scaledPixel;

      if (!isBlinking) {
        drawEmotionEyes(ctx, emotion, status, leftEyeX, eyeY1, eyeW, eyeH, scaledPixel, targetLookX, targetLookY, palette, t);
        drawEmotionEyes(ctx, emotion, status, rightEyeX, eyeY1, eyeW, eyeH, scaledPixel, targetLookX, targetLookY, palette, t);
      } else {
        // Blink: draw lines
        ctx.fillStyle = palette.bodyDark;
        ctx.fillRect(leftEyeX, eyeY1 + eyeH / 2 - scaledPixel / 4, eyeW, scaledPixel / 2);
        ctx.fillRect(rightEyeX, eyeY1 + eyeH / 2 - scaledPixel / 4, eyeW, scaledPixel / 2);
      }

      // === 4. SPEAKING ANIMATION ===
      if (status === 'speaking') {
        drawSpeakingWaves(ctx, cx + floatX, cy + floatY + size * 0.15, size, t, palette);
      }

      // === 5. THINKING ANIMATION ===
      if (status === 'thinking') {
        drawThinkingDots(ctx, cx + floatX, cy + floatY - size * 0.3, size, t, palette);
      }

      // === 6. PARTICLES (excited/speaking) ===
      if (emotion === 'excited' || status === 'executing') {
        drawParticles(ctx, cx + floatX, cy + floatY, size, t, palette, status === 'executing');
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [emotion, status, size]);

  return <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />;
}

// ============================================================
// EMOTION EYES — разные формы глаз по эмоции
// ============================================================

function drawEmotionEyes(
  ctx: CanvasRenderingContext2D,
  emotion: MascotEmotion,
  status: MascotStatus,
  x: number, y: number, w: number, h: number,
  pixelSize: number,
  lookX: number, lookY: number,
  palette: Palette,
  t: number
) {
  ctx.fillStyle = palette.eye;

  switch (emotion) {
    case 'happy':
      // Happy eyes: upward arcs (^_^) — draw as small triangles
      ctx.fillRect(x + lookX, y + pixelSize + lookY, w, pixelSize * 0.5);
      break;

    case 'sad':
      // Sad eyes: downward, with "tear" effect
      ctx.fillRect(x + lookX, y + pixelSize * 1.5 + lookY, w, pixelSize * 0.7);
      // Tear
      if (Math.sin(t * 0.5) > 0.5) {
        ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.fillRect(x + w * 0.5 + lookX, y + h + lookY + Math.sin(t * 2) * pixelSize, pixelSize * 0.5, pixelSize);
      }
      break;

    case 'frustrated':
      // Frustrated: narrowed eyes (horizontal lines)
      ctx.fillRect(x + lookX, y + pixelSize * 1.2 + lookY, w, pixelSize * 0.4);
      break;

    case 'excited':
      // Excited: star-shaped (bigger eyes)
      ctx.fillRect(x - pixelSize * 0.3 + lookX, y + lookY, w + pixelSize * 0.6, h);
      // Sparkle
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + pixelSize * 0.3 + lookX, y + pixelSize * 0.3 + lookY, pixelSize * 0.4, pixelSize * 0.4);
      break;

    case 'anxious':
      // Anxious: wobbly eyes (slightly offset)
      const wobble = Math.sin(t * 4) * pixelSize * 0.2;
      ctx.fillRect(x + lookX + wobble, y + lookY, w, h * 0.7);
      break;

    case 'thinking':
      // Thinking: looking up
      ctx.fillRect(x + lookX, y - pixelSize * 0.5 + lookY, w, h * 0.7);
      break;

    default: // neutral
      // Normal round-ish eyes
      ctx.fillRect(x + lookX, y + lookY, w, h);
      // Pupil highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(x + pixelSize * 0.3 + lookX, y + pixelSize * 0.3 + lookY, pixelSize * 0.4, pixelSize * 0.4);
  }
}

// ============================================================
// SPEAKING WAVES — волны от рта
// ============================================================

function drawSpeakingWaves(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  t: number, palette: Palette
) {
  const numWaves = 3;
  for (let i = 0; i < numWaves; i++) {
    const phase = (t * 3 + i * 0.5) % 1;
    const radius = size * 0.15 + phase * size * 0.15;
    const alpha = (1 - phase) * 0.4;
    ctx.strokeStyle = `rgba(${palette.glow}, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============================================================
// THINKING DOTS — три точки над головой
// ============================================================

function drawThinkingDots(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  t: number, palette: Palette
) {
  const dotSize = size * 0.025;
  const spacing = size * 0.06;
  for (let i = 0; i < 3; i++) {
    const offset = Math.sin(t * 3 - i * 0.5) * size * 0.02;
    const alpha = 0.4 + Math.sin(t * 3 - i * 0.5) * 0.3;
    ctx.fillStyle = `rgba(${palette.glow}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx - spacing + i * spacing, cy + offset, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// PARTICLES — светящиеся частицы вокруг
// ============================================================

function drawParticles(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  t: number, palette: Palette,
  isExecuting: boolean
) {
  const numParticles = isExecuting ? 8 : 5;
  const orbitRadius = size * 0.4;
  const speed = isExecuting ? 3 : 1.5;

  for (let i = 0; i < numParticles; i++) {
    const angle = (t * speed + (i * Math.PI * 2) / numParticles) % (Math.PI * 2);
    const px = cx + Math.cos(angle) * orbitRadius;
    const py = cy + Math.sin(angle) * orbitRadius;
    const pSize = size * 0.015 + Math.sin(t * 5 + i) * size * 0.005;

    ctx.fillStyle = `rgba(${palette.glow}, ${0.6 + Math.sin(t * 3 + i) * 0.2})`;
    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fill();
  }
}
