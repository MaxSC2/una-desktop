/**
 * U.N.A. Avatar — визуальный аватар с эмоциями.
 *
 * Заменяет Orb на более «человечный» визуал:
 * - Глаза, которые меняют форму по эмоции
 * - Цветовой ореол по статусу
 * - Анимация разговора (когда speaking)
 * - Моргание в idle
 * - Плавные переходы между состояниями
 *
 * Canvas-based, 60fps, без зависимостей.
 */

import { useEffect, useRef } from 'react';

export type AvatarEmotion = 'neutral' | 'happy' | 'sad' | 'frustrated' | 'excited' | 'anxious' | 'thinking';
export type AvatarStatus = 'idle' | 'thinking' | 'speaking' | 'listening' | 'executing' | 'awaiting_confirmation';

interface AvatarProps {
  emotion?: AvatarEmotion;
  status?: AvatarStatus;
  size?: number;
}

// Палитра по эмоциям (RGB для oreol)
const EMOTION_COLORS: Record<AvatarEmotion, { primary: string; secondary: string; glow: number }> = {
  neutral:    { primary: '34, 211, 238',  secondary: '6, 182, 212',   glow: 0.6 },
  happy:      { primary: '74, 222, 128',  secondary: '34, 197, 94',   glow: 0.9 },
  sad:        { primary: '129, 140, 248', secondary: '99, 102, 241',  glow: 0.5 },
  frustrated: { primary: '248, 113, 113', secondary: '239, 68, 68',   glow: 0.8 },
  excited:    { primary: '251, 191, 36',  secondary: '245, 158, 11',  glow: 1.0 },
  anxious:    { primary: '167, 139, 250', secondary: '139, 92, 246',  glow: 0.7 },
  thinking:   { primary: '252, 211, 77',  secondary: '234, 179, 8',   glow: 0.85 },
};

// Палитра по статусу (перекрывает эмоцию для ореола)
const STATUS_COLORS: Record<AvatarStatus, { primary: string; secondary: string; glow: number; speed: number }> = {
  idle:                   { primary: '34, 211, 238',  secondary: '6, 182, 212',   glow: 0.5, speed: 0.4 },
  thinking:               { primary: '252, 211, 77',  secondary: '234, 179, 8',   glow: 0.9, speed: 2.0 },
  speaking:               { primary: '74, 222, 128',  secondary: '34, 197, 94',   glow: 1.0, speed: 3.0 },
  listening:              { primary: '244, 114, 182', secondary: '236, 72, 153',  glow: 0.85, speed: 1.5 },
  executing:              { primary: '251, 146, 60',  secondary: '249, 115, 22',  glow: 0.95, speed: 2.5 },
  awaiting_confirmation:  { primary: '248, 113, 113', secondary: '239, 68, 68',   glow: 0.8, speed: 1.0 },
};

const STATUS_LABELS: Record<AvatarStatus, string> = {
  idle: 'В сети',
  thinking: 'Размышляю...',
  speaking: 'Говорю',
  listening: 'Слушаю',
  executing: 'Выполняю',
  awaiting_confirmation: 'Жду подтверждения',
};

export function UnaAvatar({ emotion = 'neutral', status = 'idle', size = 220 }: AvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    t: 0,
    blinkTimer: 0,
    isBlinking: false,
    blinkProgress: 0,
    // Smooth interpolation
    currentColor: { ...EMOTION_COLORS.neutral },
    targetColor: { ...EMOTION_COLORS.neutral },
  });

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

    const state = stateRef.current;
    let raf = 0;

    // Determine which color palette to use (status takes priority for glow)
    const statusColor = STATUS_COLORS[status];
    const emotionColor = EMOTION_COLORS[emotion];
    state.targetColor = {
      primary: status !== 'idle' ? statusColor.primary : emotionColor.primary,
      secondary: status !== 'idle' ? statusColor.secondary : emotionColor.secondary,
      glow: status !== 'idle' ? statusColor.glow : emotionColor.glow,
    };

    const speed = statusColor.speed;

    const draw = () => {
      state.t += 0.016 * speed;

      // Lerp colors for smooth transition
      const lerp = (a: string, b: string, t: number) => {
        const parse = (s: string) => s.split(',').map(Number);
        const pa = parse(a);
        const pb = parse(b);
        return pa.map((va, i) => Math.round(va + (pb[i] - va) * t)).join(', ');
      };
      const lerpNum = (a: number, b: number, t: number) => a + (b - a) * t;
      const transitionSpeed = 0.05;
      state.currentColor.primary = lerp(state.currentColor.primary, state.targetColor.primary, transitionSpeed);
      state.currentColor.secondary = lerp(state.currentColor.secondary, state.targetColor.secondary, transitionSpeed);
      state.currentColor.glow = lerpNum(state.currentColor.glow, state.targetColor.glow, transitionSpeed);

      const cur = state.currentColor;
      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = size * 0.28;

      ctx.clearRect(0, 0, size, size);

      // ===== 1. OUTER GLOW =====
      const glowGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, baseRadius * 2.5);
      glowGrad.addColorStop(0, `rgba(${cur.primary}, ${0.4 * cur.glow})`);
      glowGrad.addColorStop(0.4, `rgba(${cur.secondary}, ${0.12 * cur.glow})`);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, size, size);

      // ===== 2. ROTATING RINGS =====
      for (let ring = 0; ring < 3; ring++) {
        const radius = baseRadius * (1.3 + ring * 0.15);
        const segments = 8 + ring * 3;
        const rotation = state.t * (1 + ring * 0.3) * (ring % 2 === 0 ? 1 : -1);
        const alpha = (0.5 - ring * 0.12) * cur.glow;

        ctx.strokeStyle = `rgba(${cur.primary}, ${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2 + rotation;
          const len = 0.15 + 0.05 * Math.sin(state.t * 2 + i + ring);
          ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
          ctx.arc(cx, cy, radius, angle, angle + len * Math.PI);
        }
        ctx.stroke();
      }

      // ===== 3. CORE CIRCLE (the "face") =====
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 1.5);
      const coreR = baseRadius * (0.95 + 0.05 * pulse);

      // Inner gradient
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      innerGrad.addColorStop(0, `rgba(${cur.primary}, ${0.15})`);
      innerGrad.addColorStop(0.7, `rgba(${cur.secondary}, ${0.08})`);
      innerGrad.addColorStop(1, `rgba(${cur.primary}, ${0.02})`);
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = `rgba(${cur.primary}, ${0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.stroke();

      // ===== 4. EYES (emotion-based) =====
      drawEyes(ctx, cx, cy, coreR, emotion, status, state);

      // ===== 5. MOUTH (speaking animation) =====
      if (status === 'speaking') {
        drawSpeakingMouth(ctx, cx, cy, coreR, state, cur);
      } else if (emotion === 'happy' && status === 'idle') {
        drawHappyMouth(ctx, cx, cy, coreR, cur);
      } else if (emotion === 'sad' && status === 'idle') {
        drawSadMouth(ctx, cx, cy, coreR, cur);
      }

      // ===== 6. BLINK ANIMATION =====
      updateBlink(state, status);
      if (state.isBlinking) {
        drawBlinkOverlay(ctx, cx, cy, coreR, state, cur);
      }

      // ===== 7. PARTICLES (excited) =====
      if (emotion === 'excited' || status === 'speaking') {
        drawParticles(ctx, cx, cy, coreR, state, cur);
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(raf);
  }, [emotion, status, size]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="block" />
      <div className="text-xs font-mono uppercase tracking-[0.3em] text-una-300/80">
        {STATUS_LABELS[status] ?? status}
      </div>
      {emotion !== 'neutral' && status === 'idle' && (
        <div className="text-[10px] font-mono text-slate-500">
          {emotion === 'happy' && '😊 радость'}
          {emotion === 'sad' && '😢 грусть'}
          {emotion === 'frustrated' && '😤 раздражение'}
          {emotion === 'excited' && '✨ волнение'}
          {emotion === 'anxious' && '😰 тревога'}
          {emotion === 'thinking' && '🤔 размышление'}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ГЛАЗА — меняются по эмоции
// ============================================================

function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  emotion: AvatarEmotion,
  status: AvatarStatus,
  state: { t: number; isBlinking: boolean; blinkProgress: number }
) {
  const eyeY = cy - r * 0.15;
  const eyeOffsetX = r * 0.35;
  const eyeSize = r * 0.12;

  ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
  ctx.strokeStyle = `rgba(255, 255, 255, 0.7)`;
  ctx.lineWidth = 1.5;

  const leftX = cx - eyeOffsetX;
  const rightX = cx + eyeOffsetX;

  // Если моргает — рисуем линию вместо глаз
  if (state.isBlinking && state.blinkProgress < 0.5) {
    ctx.beginPath();
    ctx.moveTo(leftX - eyeSize, eyeY);
    ctx.lineTo(leftX + eyeSize, eyeY);
    ctx.moveTo(rightX - eyeSize, eyeY);
    ctx.lineTo(rightX + eyeSize, eyeY);
    ctx.stroke();
    return;
  }

  switch (emotion) {
    case 'happy':
      // Дуга вверх ^_^
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(leftX, eyeY + eyeSize * 0.5, eyeSize, Math.PI * 1.2, Math.PI * 1.8);
      ctx.arc(rightX, eyeY + eyeSize * 0.5, eyeSize, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      break;

    case 'sad':
      // Дуга вниз v_v
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(leftX, eyeY - eyeSize * 0.5, eyeSize, Math.PI * 0.2, Math.PI * 0.8);
      ctx.arc(rightX, eyeY - eyeSize * 0.5, eyeSize, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      break;

    case 'frustrated':
      // Прищур — узкие глаза
      ctx.beginPath();
      ctx.ellipse(leftX, eyeY, eyeSize, eyeSize * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(rightX, eyeY, eyeSize, eyeSize * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'excited':
      // Большие звёздочки-глаза
      drawStar(ctx, leftX, eyeY, eyeSize * 1.2);
      drawStar(ctx, rightX, eyeY, eyeSize * 1.2);
      break;

    case 'anxious':
      // Дрожащие точки
      const shake = Math.sin(state.t * 8) * 1.5;
      ctx.beginPath();
      ctx.arc(leftX + shake, eyeY, eyeSize * 0.6, 0, Math.PI * 2);
      ctx.arc(rightX - shake, eyeY, eyeSize * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'thinking':
      // Один глаз нормальный, другой прищурен
      ctx.beginPath();
      ctx.arc(leftX, eyeY, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(rightX, eyeY, eyeSize, eyeSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    default: // neutral
      // Обычные круглые глаза
      ctx.beginPath();
      ctx.arc(leftX, eyeY, eyeSize, 0, Math.PI * 2);
      ctx.arc(rightX, eyeY, eyeSize, 0, Math.PI * 2);
      ctx.fill();
  }

  // Если listening — широкие глаза + дополнительное свечение
  if (status === 'listening' && emotion === 'neutral') {
    ctx.beginPath();
    ctx.arc(leftX, eyeY, eyeSize * 1.3, 0, Math.PI * 2);
    ctx.arc(rightX, eyeY, eyeSize * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// РТ — анимация разговора
// ============================================================

function drawSpeakingMouth(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  state: { t: number },
  color: { primary: string }
) {
  const mouthY = cy + r * 0.25;
  const mouthW = r * 0.3;

  // Sound wave bars
  const bars = 5;
  ctx.fillStyle = `rgba(${color.primary}, 0.8)`;
  for (let i = 0; i < bars; i++) {
    const x = cx - mouthW + (i / (bars - 1)) * mouthW * 2;
    const h = 3 + Math.abs(Math.sin(state.t * 5 + i * 0.8)) * 8;
    ctx.fillRect(x - 1, mouthY - h / 2, 2, h);
  }
}

function drawHappyMouth(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  color: { primary: string }
) {
  const mouthY = cy + r * 0.2;
  ctx.strokeStyle = `rgba(${color.primary}, 0.7)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, mouthY, r * 0.2, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawSadMouth(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  color: { primary: string }
) {
  const mouthY = cy + r * 0.4;
  ctx.strokeStyle = `rgba(${color.primary}, 0.7)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, mouthY, r * 0.2, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

// ============================================================
// МОРГАНИЕ
// ============================================================

function updateBlink(
  state: { t: number; blinkTimer: number; isBlinking: boolean; blinkProgress: number },
  status: AvatarStatus
) {
  // Не моргает когда говорит или слушает
  if (status === 'speaking' || status === 'listening') {
    state.isBlinking = false;
    return;
  }

  state.blinkTimer += 0.016;

  // Моргает каждые 3-5 секунд
  if (!state.isBlinking && state.blinkTimer > 3 + Math.random() * 2) {
    state.isBlinking = true;
    state.blinkProgress = 0;
    state.blinkTimer = 0;
  }

  if (state.isBlinking) {
    state.blinkProgress += 0.08;
    if (state.blinkProgress >= 1) {
      state.isBlinking = false;
    }
  }
}

function drawBlinkOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  state: { blinkProgress: number },
  color: { primary: string }
) {
  // Полупрозрачная полоса — "веки"
  const eyeY = cy - r * 0.15;
  const progress = state.blinkProgress < 0.5
    ? state.blinkProgress * 2
    : (1 - state.blinkProgress) * 2;

  ctx.fillStyle = `rgba(${color.primary}, ${0.3 * progress})`;
  ctx.beginPath();
  ctx.rect(cx - r * 0.6, eyeY - r * 0.2 * progress, r * 1.2, r * 0.2 * progress);
  ctx.fill();
}

// ============================================================
// ЧАСТИЦЫ — для excited и speaking
// ============================================================

function drawParticles(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  state: { t: number },
  color: { primary: string }
) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + state.t * 0.5;
    const dist = r * (1.4 + 0.3 * Math.sin(state.t * 2 + i));
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const size = 1 + 2 * (0.5 + 0.5 * Math.sin(state.t * 3 + i));
    const alpha = 0.3 + 0.4 * Math.sin(state.t * 2 + i * 0.5);

    ctx.fillStyle = `rgba(${color.primary}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// ЗВЕЗДА — для excited глаз
// ============================================================

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = `rgba(255, 255, 255, 0.95)`;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
