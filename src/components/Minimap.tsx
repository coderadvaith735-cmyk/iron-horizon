import React, { useEffect, useRef } from 'react';
import { HudSnapshot } from '../game/types';

interface MinimapProps {
  hud: HudSnapshot;
}

export const Minimap: React.FC<MinimapProps> = ({ hud }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const range = 72; // meters visible from center to edge
    const scale = half / range;

    ctx.clearRect(0, 0, size, size);

    // Dark tactical radar background
    ctx.fillStyle = 'rgba(11, 14, 17, 0.88)';
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();

    // Radar range rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (const rFrac of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(half, half, (half - 2) * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotate world around player yaw so "up" on minimap is where player faces
    ctx.translate(half, half);
    ctx.rotate(hud.playerYaw);

    const toMap = (wx: number, wz: number) => ({
      mx: (wx - hud.playerX) * scale,
      mz: (wz - hud.playerZ) * scale,
    });

    // Landmark footprints (HQ Compound, Village, Bunkers, Training Range)
    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    const drawRect = (wx: number, wz: number, w: number, d: number) => {
      const p = toMap(wx, wz);
      ctx.fillRect(p.mx - (w * scale) / 2, p.mz - (d * scale) / 2, w * scale, d * scale);
    };
    drawRect(0, -14, 14, 11); // HQ
    drawRect(24, -46, 11, 14); // Hangar
    drawRect(50, -14, 9, 8); // Village 1
    drawRect(55, 14, 9, 8); // Village 2
    drawRect(-48, -48, 8, 7); // NW Bunker
    drawRect(-46, 8, 8, 7); // W Bunker
    drawRect(-36, 56, 18, 28); // Range

    // Road crosshairs
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 6 * scale;
    const pN = toMap(0, -75);
    const pS = toMap(0, 75);
    ctx.beginPath();
    ctx.moveTo(pN.mx, pN.mz);
    ctx.lineTo(pS.mx, pS.mz);
    ctx.stroke();

    const pW = toMap(-75, 0);
    const pE = toMap(75, 0);
    ctx.beginPath();
    ctx.moveTo(pW.mx, pW.mz);
    ctx.lineTo(pE.mx, pE.mz);
    ctx.stroke();

    // Blips (Pickups, Allies, Enemies, Objectives)
    for (const blip of hud.radarBlips) {
      const { mx, mz } = toMap(blip.x, blip.z);
      if (Math.hypot(mx, mz) > half - 4) continue;

      if (blip.type === 'enemy') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(mx, mz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (blip.type === 'ally') {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(mx, mz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (blip.type === 'objective') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, mz, 5.2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (blip.type === 'pickup_health') {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(mx - 2, mz - 2, 4, 4);
      } else if (blip.type === 'pickup_ammo') {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(mx - 2, mz - 2, 4, 4);
      } else if (blip.type === 'pickup_armor') {
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(mx - 2, mz - 2, 4, 4);
      }
    }

    ctx.restore();

    // Player FOV cone (always pointing UP)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.arc(half, half, half - 4, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();

    // Player center chevron
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(half, half - 5);
    ctx.lineTo(half + 4, half + 4);
    ctx.lineTo(half, half + 2);
    ctx.lineTo(half - 4, half + 4);
    ctx.closePath();
    ctx.fill();

    // Outer bezel ring
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(half, half, half - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [hud]);

  return (
    <div className="relative w-[132px] h-[132px] sm:w-[152px] sm:h-[152px] pointer-events-none">
      <canvas ref={canvasRef} width={152} height={152} className="w-full h-full" />
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono-num text-amber-400/90 font-bold">
        FWD
      </span>
    </div>
  );
};
