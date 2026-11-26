import * as THREE from 'three';

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface BattlefieldTextures {
  terrain: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  camo: THREE.CanvasTexture;
  crate: THREE.CanvasTexture;
  sandbag: THREE.CanvasTexture;
  target: THREE.CanvasTexture;
  dispose: () => void;
}

export function createBattlefieldTextures(maxAnisotropy: number): BattlefieldTextures {
  const terrain = createCanvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = '#4c573c';
      ctx.fillRect(0, 0, s, s);
      // Organic turf, dry soil, and gravel speckle
      for (let i = 0; i < 6500; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 1 + Math.random() * 4;
        const pick = Math.random();
        if (pick < 0.35) ctx.fillStyle = 'rgba(60, 72, 42, 0.38)';
        else if (pick < 0.7) ctx.fillStyle = 'rgba(94, 86, 62, 0.28)';
        else ctx.fillStyle = 'rgba(118, 125, 84, 0.22)';
        ctx.fillRect(x, y, r, r);
      }
    },
    32,
    32,
    maxAnisotropy,
  );

  const concrete = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#6f7378';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2200; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const shade = 95 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgba(${shade},${shade},${shade},0.25)`;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.strokeStyle = 'rgba(35,38,42,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
      ctx.beginPath();
      ctx.moveTo(0, s / 2);
      ctx.lineTo(s, s / 2);
      ctx.stroke();
    },
    2,
    2,
    maxAnisotropy,
  );

  const brick = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#7e5c4c';
      ctx.fillRect(0, 0, s, s);
      const rows = 8;
      const cols = 4;
      const rh = s / rows;
      const cw = s / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let c = -1; c <= cols; c++) {
          const tone = Math.random() * 24 - 12;
          ctx.fillStyle = `rgb(${128 + tone}, ${86 + tone * 0.7}, ${70 + tone * 0.5})`;
          ctx.fillRect(c * cw + offset + 2, r * rh + 2, cw - 4, rh - 4);
        }
      }
      // Weathering plaster streaks
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = 'rgba(40,35,32,0.16)';
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 6);
      }
    },
    2,
    2,
    maxAnisotropy,
  );

  const camo = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#47523a';
      ctx.fillRect(0, 0, s, s);
      const colors = ['#2f3827', '#61563f', '#252922', '#5b6b47'];
      for (let i = 0; i < 45; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(
          Math.random() * s,
          Math.random() * s,
          12 + Math.random() * 28,
          8 + Math.random() * 18,
          Math.random() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    },
    1,
    1,
    maxAnisotropy,
  );

  const crate = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#5f533e';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#383022';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, s - 14, s - 14);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(s - 14, s - 14);
      ctx.moveTo(s - 14, 14);
      ctx.lineTo(14, s - 14);
      ctx.stroke();
      // Wood planks
      ctx.strokeStyle = 'rgba(30,24,16,0.35)';
      ctx.lineWidth = 2;
      for (let y = 32; y < s; y += 32) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(s - 14, y);
        ctx.stroke();
      }
    },
    1,
    1,
    maxAnisotropy,
  );

  const sandbag = createCanvasTexture(
    128,
    (ctx, s) => {
      ctx.fillStyle = '#9c8a65';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(65, 55, 38, 0.35)';
      ctx.lineWidth = 3;
      for (let y = 0; y < s; y += 24) {
        ctx.strokeRect(2, y + 2, s - 4, 20);
      }
    },
    2,
    2,
    maxAnisotropy,
  );

  const target = createCanvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, s, s);
      const cx = s / 2;
      const cy = s / 2;
      const rings = [
        { r: s * 0.45, c: '#1e293b' },
        { r: s * 0.34, c: '#e5e7eb' },
        { r: s * 0.22, c: '#1e293b' },
        { r: s * 0.1, c: '#dc2626' },
      ];
      for (const ring of rings) {
        ctx.fillStyle = ring.c;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    1,
    maxAnisotropy,
  );

  return {
    terrain,
    concrete,
    brick,
    camo,
    crate,
    sandbag,
    target,
    dispose: () => {
      terrain.dispose();
      concrete.dispose();
      brick.dispose();
      camo.dispose();
      crate.dispose();
      sandbag.dispose();
      target.dispose();
    },
  };
}
