/**
 * U.N.A. Orb — анимированный arc reactor.
 * Цвета и активность меняются по статусу ассистента.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';

interface OrbProps {
  size?: number;
}

const PALETTE: Record<string, { primary: string; secondary: string; speed: number; glow: number }> = {
  idle: { primary: '34, 211, 238', secondary: '6, 182, 212', speed: 0.5, glow: 0.6 },
  thinking: { primary: '250, 204, 21', secondary: '234, 179, 8', speed: 2.2, glow: 0.9 },
  speaking: { primary: '74, 222, 128', secondary: '34, 197, 94', speed: 3.0, glow: 1.0 },
  listening: { primary: '244, 114, 182', secondary: '236, 72, 153', speed: 1.5, glow: 0.85 },
  executing: { primary: '251, 146, 60', secondary: '249, 115, 22', speed: 2.5, glow: 0.95 },
  awaiting_confirmation: { primary: '248, 113, 113', secondary: '239, 68, 68', speed: 1.0, glow: 0.8 },
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'В сети',
  thinking: 'Размышляю...',
  speaking: 'Говорю',
  listening: 'Слушаю',
  executing: 'Выполняю',
  awaiting_confirmation: 'Жду подтверждения',
};

export function Orb({ size = 220 }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useStore((s) => s.status);

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

    let raf = 0;
    let t = 0;
    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = size * 0.3;

    const draw = () => {
      const cur = PALETTE[status] ?? PALETTE.idle;
      t += 0.016 * cur.speed;
      ctx.clearRect(0, 0, size, size);

      // Внешнее свечение
      const glow = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, baseRadius * 2.2);
      glow.addColorStop(0, `rgba(${cur.primary}, ${0.5 * cur.glow})`);
      glow.addColorStop(0.5, `rgba(${cur.secondary}, ${0.15 * cur.glow})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // Кольца
      for (let ring = 0; ring < 4; ring++) {
        const radius = baseRadius + ring * 12;
        const segments = 12 + ring * 4;
        const rotation = t * (1 + ring * 0.3) * (ring % 2 === 0 ? 1 : -1);
        const alpha = (0.9 - ring * 0.18) * cur.glow;

        ctx.strokeStyle = `rgba(${cur.primary}, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2 + rotation;
          const len = 0.18 + 0.06 * Math.sin(t * 3 + i + ring);
          ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
          ctx.arc(cx, cy, radius, angle, angle + len * Math.PI);
        }
        ctx.stroke();
      }

      // Внутренний круг
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      const innerR = baseRadius * 0.55 * (0.9 + 0.1 * pulse);
      const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
      inner.addColorStop(0, `rgba(255, 255, 255, ${0.9 * cur.glow})`);
      inner.addColorStop(0.4, `rgba(${cur.primary}, ${0.85 * cur.glow})`);
      inner.addColorStop(1, `rgba(${cur.secondary}, ${0.4})`);
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fill();

      // Точки по периметру
      const dotCount = 24;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + t * 0.4;
        const dotR = baseRadius * 1.05;
        const x = cx + Math.cos(angle) * dotR;
        const y = cy + Math.sin(angle) * dotR;
        const dotSize = 1.5 + 1.5 * (0.5 + 0.5 * Math.sin(t * 4 + i * 0.5));
        const a = 0.3 + 0.5 * Math.sin(t * 2 + i * 0.3);
        ctx.fillStyle = `rgba(${cur.primary}, ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [status, size]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="block" />
      <div className="text-xs font-mono uppercase tracking-[0.3em] text-una-300/80">
        {STATUS_LABELS[status] ?? status}
      </div>
    </div>
  );
}
