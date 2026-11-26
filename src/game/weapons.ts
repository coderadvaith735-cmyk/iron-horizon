import * as THREE from 'three';
import { WeaponId } from './types';

export interface WeaponViewRig {
  root: THREE.Group;
  models: Record<WeaponId, THREE.Group>;
  muzzleFlash: THREE.Group;
  muzzleLight: THREE.PointLight;
  setActiveWeapon: (id: WeaponId) => void;
  triggerShootRecoil: (kick: number) => void;
  updateAnimation: (
    dt: number,
    elapsed: number,
    isMoving: boolean,
    isSprinting: boolean,
    isAds: boolean,
    isReloading: boolean,
    reloadProgress: number,
    activeWeapon: WeaponId,
  ) => void;
  getMuzzleWorldPosition: (target: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

export function createWeaponViewRig(camera: THREE.PerspectiveCamera): WeaponViewRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // Calibrated PBR weapon materials
  const matGunmetal = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.34, metalness: 0.86 }),
  );
  const matPolymer = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.72, metalness: 0.14 }),
  );
  const matTanPolymer = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6b604b, roughness: 0.68, metalness: 0.12 }),
  );
  const matChrome = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8b939e, roughness: 0.22, metalness: 0.94 }),
  );
  const matOpticGlass = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.65,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.55,
    }),
  );
  const matWoodStock = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c3e28, roughness: 0.65, metalness: 0.08 }),
  );

  const root = new THREE.Group();
  camera.add(root);

  // Muzzle flash assembly
  const muzzleFlash = new THREE.Group();
  const flashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffc65c,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const flashSpikeGeo = trackGeo(new THREE.ConeGeometry(0.055, 0.26, 6));
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(flashSpikeGeo, flashMat);
    spike.rotation.z = (i * Math.PI) / 2;
    spike.rotation.x = Math.PI / 2;
    spike.position.z = -0.12;
    muzzleFlash.add(spike);
  }
  const flashCore = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 8)), flashMat);
  muzzleFlash.add(flashCore);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffaa33, 0, 12, 2);
  root.add(muzzleLight);

  // -------------------------------------------------------------------------
  // 1. ASSAULT RIFLE (M4A1 Tactical Carbine - 9 parts)
  // -------------------------------------------------------------------------
  const buildAssault = () => {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.065, 0.095, 0.36)), matGunmetal);
    g.add(receiver);

    const handguard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.058, 0.072, 0.24)), matTanPolymer);
    handguard.position.set(0, 0.01, -0.28);
    g.add(handguard);

    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 10)), matGunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.012, -0.45);
    g.add(barrel);

    const suppressor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12)), matPolymer);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.012, -0.62);
    g.add(suppressor);

    const stock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.09, 0.24)), matTanPolymer);
    stock.position.set(0, -0.01, 0.28);
    g.add(stock);

    const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.042, 0.11, 0.05)), matPolymer);
    grip.position.set(0, -0.09, 0.1);
    grip.rotation.x = 0.25;
    g.add(grip);

    const mag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.038, 0.16, 0.068)), matGunmetal);
    mag.position.set(0, -0.11, -0.06);
    mag.rotation.x = -0.14;
    g.add(mag);

    const holoHousing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.048, 0.048, 0.075)), matPolymer);
    holoHousing.position.set(0, 0.07, -0.02);
    g.add(holoHousing);

    const holoLens = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.032, 0.032)), matOpticGlass);
    holoLens.position.set(0, 0.072, 0.02);
    g.add(holoLens);

    g.userData.muzzleOffset = new THREE.Vector3(0, 0.012, -0.7);
    return g;
  };

  // -------------------------------------------------------------------------
  // 2. SNIPER RIFLE (M24 Precision Bolt - 8 parts)
  // -------------------------------------------------------------------------
  const buildSniper = () => {
    const g = new THREE.Group();
    const chassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.075, 0.46)), matTanPolymer);
    g.add(chassis);

    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.02, 0.56, 12)), matGunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.018, -0.48);
    g.add(barrel);

    const muzzleBrake = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.042, 0.038, 0.08)), matDarkChrome(matChrome));
    muzzleBrake.position.set(0, 0.018, -0.77);
    g.add(muzzleBrake);

    const scopeTube = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 12)), matPolymer);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.072, -0.04);
    g.add(scopeTube);

    const scopeBell = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.034, 0.025, 0.09, 12)), matPolymer);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, 0.072, -0.2);
    g.add(scopeBell);

    const scopeLens = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.022, 12)), matOpticGlass);
    scopeLens.position.set(0, 0.072, 0.105);
    g.add(scopeLens);

    const boltHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.065, 8)), matChrome);
    boltHandle.rotation.z = Math.PI / 2;
    boltHandle.position.set(0.045, 0.02, 0.08);
    g.add(boltHandle);

    const stock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.052, 0.1, 0.26)), matTanPolymer);
    stock.position.set(0, -0.015, 0.34);
    g.add(stock);

    g.userData.muzzleOffset = new THREE.Vector3(0, 0.018, -0.83);
    return g;
  };

  function matDarkChrome(m: THREE.MeshStandardMaterial) {
    return m;
  }

  // -------------------------------------------------------------------------
  // 3. SHOTGUN (M870 Combat Breacher - 7 parts)
  // -------------------------------------------------------------------------
  const buildShotgun = () => {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.065, 0.088, 0.28)), matGunmetal);
    g.add(receiver);

    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.018, 0.02, 0.48, 12)), matGunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, -0.36);
    g.add(barrel);

    const tube = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 10)), matPolymer);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.015, -0.33);
    g.add(tube);

    const pump = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 10)), matPolymer);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.015, -0.28);
    g.add(pump);

    const stock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.052, 0.1, 0.28)), matWoodStock);
    stock.position.set(0, -0.03, 0.25);
    stock.rotation.x = 0.12;
    g.add(stock);

    const frontBead = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.007, 8, 8)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0xef4444 })),
    );
    frontBead.position.set(0, 0.044, -0.57);
    g.add(frontBead);

    g.userData.muzzleOffset = new THREE.Vector3(0, 0.022, -0.62);
    return g;
  };

  // -------------------------------------------------------------------------
  // 4. SUBMACHINE GUN (MP7 Spec-Ops PDW - 7 parts)
  // -------------------------------------------------------------------------
  const buildSmg = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.056, 0.088, 0.3)), matPolymer);
    g.add(body);

    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.013, 0.014, 0.18, 10)), matGunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.22);
    g.add(barrel);

    const foregrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.032, 0.09, 0.038)), matPolymer);
    foregrip.position.set(0, -0.075, -0.1);
    g.add(foregrip);

    const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.038, 0.11, 0.048)), matPolymer);
    grip.position.set(0, -0.085, 0.06);
    grip.rotation.x = 0.2;
    g.add(grip);

    const extMag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.15, 0.04)), matGunmetal);
    extMag.position.set(0, -0.12, 0.06);
    extMag.rotation.x = 0.2;
    g.add(extMag);

    const reflex = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.036, 0.036, 0.05)), matGunmetal);
    reflex.position.set(0, 0.062, -0.02);
    g.add(reflex);

    const reflexGlass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.026, 0.024)), matOpticGlass);
    reflexGlass.position.set(0, 0.064, 0.008);
    g.add(reflexGlass);

    g.userData.muzzleOffset = new THREE.Vector3(0, 0.01, -0.32);
    return g;
  };

  // -------------------------------------------------------------------------
  // 5. PISTOL (P226 Tactical Sidearm - 5 parts)
  // -------------------------------------------------------------------------
  const buildPistol = () => {
    const g = new THREE.Group();
    const slide = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.038, 0.042, 0.22)), matGunmetal);
    slide.position.set(0, 0.022, -0.04);
    g.add(slide);

    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.035, 0.03, 0.18)), matPolymer);
    frame.position.set(0, -0.01, -0.02);
    g.add(frame);

    const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.034, 0.11, 0.048)), matPolymer);
    grip.position.set(0, -0.072, 0.045);
    grip.rotation.x = 0.24;
    g.add(grip);

    const barrelTip = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 10)), matChrome);
    barrelTip.rotation.x = Math.PI / 2;
    barrelTip.position.set(0, 0.02, -0.16);
    g.add(barrelTip);

    const ironSight = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.01, 0.012, 0.01)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0x22c55e })),
    );
    ironSight.position.set(0, 0.048, -0.135);
    g.add(ironSight);

    g.userData.muzzleOffset = new THREE.Vector3(0, 0.02, -0.2);
    return g;
  };

  const models: Record<WeaponId, THREE.Group> = {
    assault: buildAssault(),
    sniper: buildSniper(),
    shotgun: buildShotgun(),
    smg: buildSmg(),
    pistol: buildPistol(),
  };

  for (const id of Object.keys(models) as WeaponId[]) {
    models[id].visible = false;
    root.add(models[id]);
  }

  let currentWeapon: WeaponId = 'assault';
  models[currentWeapon].visible = true;

  let recoilZ = 0;
  let recoilPitch = 0;
  let flashTimer = 0;
  let adsBlend = 0;

  const hipPos = new THREE.Vector3(0.24, -0.22, -0.44);
  const adsPosMap: Record<WeaponId, THREE.Vector3> = {
    assault: new THREE.Vector3(0, -0.145, -0.34),
    sniper: new THREE.Vector3(0, -0.15, -0.28),
    shotgun: new THREE.Vector3(0, -0.142, -0.36),
    smg: new THREE.Vector3(0, -0.142, -0.32),
    pistol: new THREE.Vector3(0, -0.125, -0.42),
  };

  return {
    root,
    models,
    muzzleFlash,
    muzzleLight,
    setActiveWeapon: (id: WeaponId) => {
      if (currentWeapon === id) return;
      models[currentWeapon].visible = false;
      currentWeapon = id;
      models[currentWeapon].visible = true;
      recoilZ = 0.08;
      recoilPitch = -0.12;
    },
    triggerShootRecoil: (kick: number) => {
      recoilZ = Math.min(0.16, recoilZ + kick);
      recoilPitch = Math.min(0.22, recoilPitch + kick * 1.45);
      flashTimer = 0.055;
      muzzleFlash.visible = true;
      muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const offset: THREE.Vector3 = models[currentWeapon].userData.muzzleOffset;
      muzzleFlash.position.copy(offset);
      muzzleLight.position.copy(offset);
      muzzleLight.intensity = 4.5;
    },
    updateAnimation: (
      dt,
      elapsed,
      isMoving,
      isSprinting,
      isAds,
      isReloading,
      reloadProgress,
      activeWeapon,
    ) => {
      const targetAds = isAds && !isReloading && !isSprinting ? 1 : 0;
      adsBlend = THREE.MathUtils.damp(adsBlend, targetAds, 14, dt);

      // Hide 3D sniper model when fully zoomed into 2D sniper reticle
      if (activeWeapon === 'sniper') {
        models.sniper.visible = adsBlend < 0.72;
      } else {
        models[activeWeapon].visible = true;
      }

      // Base hip vs ADS interpolation
      const adsTarget = adsPosMap[activeWeapon];
      root.position.lerpVectors(hipPos, adsTarget, adsBlend);

      // Walk/sprint bob
      if (isMoving && !isAds) {
        const bobFreq = isSprinting ? 13 : 8.5;
        const bobAmp = isSprinting ? 0.022 : 0.011;
        root.position.x += Math.cos(elapsed * bobFreq * 0.5) * bobAmp;
        root.position.y += Math.abs(Math.sin(elapsed * bobFreq * 0.5)) * -bobAmp * 1.1;
      } else {
        // Subtle breathing sway
        root.position.y += Math.sin(elapsed * 2.1) * 0.0025 * (1 - adsBlend * 0.7);
      }

      // Exponential recoil decay
      recoilZ = THREE.MathUtils.damp(recoilZ, 0, 16, dt);
      recoilPitch = THREE.MathUtils.damp(recoilPitch, 0, 14, dt);

      root.position.z += recoilZ;

      let rotX = recoilPitch;
      let rotY = 0;
      let rotZ = 0;

      if (isSprinting && !isReloading) {
        rotX -= 0.28;
        rotY += 0.35;
        root.position.x += 0.04;
      }

      if (isReloading) {
        const curve = Math.sin(reloadProgress * Math.PI);
        rotX -= curve * 0.65;
        rotZ += curve * 0.42;
        root.position.y -= curve * 0.14;
      }

      root.rotation.set(rotX, rotY, rotZ);

      // Muzzle flash timer
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          muzzleFlash.visible = false;
          muzzleLight.intensity = 0;
        }
      }
    },
    getMuzzleWorldPosition: (target: THREE.Vector3) => {
      const offset: THREE.Vector3 = models[currentWeapon].userData.muzzleOffset;
      target.copy(offset);
      root.localToWorld(target);
      return target;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
