import * as THREE from 'three';
import { BattlefieldTextures } from './textures';
import { LightingMode } from './types';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  minY: number;
  isCover?: boolean;
  coverPos?: THREE.Vector3[];
}

export interface ExplosiveBarrel {
  id: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  height: number;
  hp: number;
  exploded: boolean;
}

export interface TrainingTarget {
  id: string;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  basePos: THREE.Vector3;
  oscillateAmp: number;
  oscillateSpeed: number;
  phase: number;
  distanceLabel: number;
  downTimer: number;
}

export interface PickupItem {
  id: string;
  type: 'health' | 'ammo' | 'armor';
  group: THREE.Group;
  position: THREE.Vector3;
  active: boolean;
  respawnTimer: number;
}

export interface WorldContext {
  scene: THREE.Scene;
  colliders: BoxCollider[];
  coverPoints: THREE.Vector3[];
  shootableMeshes: THREE.Object3D[];
  barrels: ExplosiveBarrel[];
  trainingTargets: TrainingTarget[];
  pickups: PickupItem[];
  missionTerminalMesh: THREE.Group;
  missionDepotMesh: THREE.Group;
  extractionBeaconMesh: THREE.Group;
  setLighting: (mode: LightingMode) => void;
  updateWorldProps: (dt: number, elapsed: number) => void;
  resetTrainingTargets: () => void;
  spawnPickupAt: (type: 'health' | 'ammo' | 'armor', pos: THREE.Vector3, temporary?: boolean) => void;
  dispose: () => void;
}

export const PLAYABLE_LIMIT = 92;

/**
 * Continuous height function with flattened combat zones (central compound,
 * abandoned village, bunker ridge, vehicle depot, training range) so buildings
 * and props sit flush with zero floating.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);
  // Gentle rolling hills outside core compounds
  let h =
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 1.35 +
    Math.sin(x * 0.11 + z * 0.08) * 0.35;

  // Flatten central compound (around 0, 0)
  const centerBlend = THREE.MathUtils.smoothstep(distFromCenter, 14, 28);
  h *= centerBlend;

  // Flatten shooting range zone (x: -55..-15, z: 32..80)
  const rangeDist = Math.hypot(x + 36, z - 56);
  const rangeBlend = THREE.MathUtils.smoothstep(rangeDist, 18, 30);
  h *= rangeBlend;

  // Flatten abandoned village (x: 35..75, z: -25..25)
  const villageDist = Math.hypot(x - 52, z);
  const villageBlend = THREE.MathUtils.smoothstep(villageDist, 18, 30);
  h *= villageBlend;

  // Elevated bunker ridge in North-West (-48, -48)
  const bunkerDist = Math.hypot(x + 48, z + 48);
  if (bunkerDist < 26) {
    const ridge = (1 - THREE.MathUtils.smoothstep(bunkerDist, 12, 26)) * 2.2;
    h = THREE.MathUtils.lerp(h, 2.2, 1 - THREE.MathUtils.smoothstep(bunkerDist, 8, 16)) + ridge * 0.15;
  }

  // Outer perimeter natural cliff rise beyond playable limit
  if (distFromCenter > PLAYABLE_LIMIT - 4) {
    const rim = THREE.MathUtils.smoothstep(distFromCenter, PLAYABLE_LIMIT - 4, PLAYABLE_LIMIT + 22);
    h += rim * 12.5;
  }

  return h;
}

export function buildBattlefieldWorld(
  scene: THREE.Scene,
  textures: BattlefieldTextures,
  initialLighting: LightingMode,
  isSoftwareGl: boolean,
): WorldContext {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const colliders: BoxCollider[] = [];
  const coverPoints: THREE.Vector3[] = [];
  const shootableMeshes: THREE.Object3D[] = [];
  const barrels: ExplosiveBarrel[] = [];
  const trainingTargets: TrainingTarget[] = [];
  const pickups: PickupItem[] = [];

  // Shared calibrated PBR materials (varied roughness & metalness)
  const matTerrain = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrain,
      roughness: 0.92,
      metalness: 0.02,
      vertexColors: true,
    }),
  );
  const matConcrete = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concrete,
      roughness: 0.86,
      metalness: 0.06,
    }),
  );
  const matDarkSteel = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a3038,
      roughness: 0.38,
      metalness: 0.82,
    }),
  );
  const matOliveMetal = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x454f3a,
      roughness: 0.52,
      metalness: 0.45,
    }),
  );
  const matBrick = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.brick,
      roughness: 0.88,
      metalness: 0.03,
    }),
  );
  const matWood = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.crate,
      roughness: 0.78,
      metalness: 0.05,
    }),
  );
  const matSandbag = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandbag,
      roughness: 0.94,
      metalness: 0.0,
    }),
  );
  const matTire = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1c1e,
      roughness: 0.85,
      metalness: 0.08,
    }),
  );
  const matRock = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c5b57,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    }),
  );
  const matBarrelRed = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb92b27,
      roughness: 0.42,
      metalness: 0.58,
    }),
  );
  const matGlass = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x89b4c4,
      roughness: 0.15,
      metalness: 0.7,
    }),
  );
  const matRoofShingle = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3532,
      roughness: 0.85,
      metalness: 0.08,
    }),
  );

  // =========================================================================
  // 1. LIGHTING RIG & SKY (Day / Night dynamic)
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0x9ec5e8, 0x4a4233, 0.75);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
  sunLight.position.set(55, 78, 42);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 210;
  const d = 90;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x88b4e6, 0.45);
  rimLight.position.set(-60, 35, -55);
  scene.add(rimLight);

  // Night floodlights at key zones (toggled visible in night mode)
  const nightLights: THREE.PointLight[] = [];
  const floodPositions = [
    [0, 8.5, 0],
    [-48, 7.5, -48],
    [52, 7.5, 0],
    [-36, 7.5, 56],
    [22, 7.5, -46],
  ];
  for (const [fx, fy, fz] of floodPositions) {
    const pl = new THREE.PointLight(0xffb86c, 0, 36, 1.6);
    pl.position.set(fx, groundHeightAt(fx, fz) + fy, fz);
    scene.add(pl);
    nightLights.push(pl);
  }

  // Starfield for Night mode
  const starCount = 450;
  const starGeo = trackGeo(new THREE.BufferGeometry());
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.42;
    const r = 190;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 15;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = trackMat(
    new THREE.PointsMaterial({ color: 0xdbeafe, size: 1.1, sizeAttenuation: false }),
  );
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  const applyLighting = (mode: LightingMode) => {
    if (mode === 'day') {
      const skyColor = new THREE.Color(0x9ab5cc);
      scene.background = skyColor;
      scene.fog = new THREE.FogExp2(0x9ab5cc, 0.0072);
      hemiLight.color.setHex(0xb4d6f5);
      hemiLight.groundColor.setHex(0x524938);
      hemiLight.intensity = 0.85;
      sunLight.color.setHex(0xfff1d6);
      sunLight.intensity = 2.15;
      sunLight.position.set(55, 78, 42);
      rimLight.color.setHex(0x88b4e6);
      rimLight.intensity = 0.45;
      starField.visible = false;
      for (const nl of nightLights) nl.intensity = 0;
    } else {
      const nightSky = new THREE.Color(0x0b1220);
      scene.background = nightSky;
      scene.fog = new THREE.FogExp2(0x0b1220, 0.0115);
      hemiLight.color.setHex(0x28416b);
      hemiLight.groundColor.setHex(0x14181f);
      hemiLight.intensity = 0.55;
      sunLight.color.setHex(0x8fb4e8);
      sunLight.intensity = 0.72;
      sunLight.position.set(-45, 70, 38);
      rimLight.color.setHex(0x3a5478);
      rimLight.intensity = 0.3;
      starField.visible = true;
      for (const nl of nightLights) nl.intensity = 18;
    }
  };
  applyLighting(initialLighting);

  // =========================================================================
  // 2. TERRAIN MESH (260x260m with vertex tinting for roads, soil & cliffs)
  // =========================================================================
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(260, 260, 96, 96));
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);

    // Road cross corridors along X=0 and Z=0 inside compound
    const onMainRoad = Math.abs(vx) < 4.5 && Math.abs(vz) < 75;
    const onCrossRoad = Math.abs(vz) < 4.5 && Math.abs(vx) < 75;
    const dist = Math.hypot(vx, vz);

    if (dist > PLAYABLE_LIMIT - 2) {
      cTmp.setHex(0x52524e); // Rocky cliff rim
    } else if (onMainRoad || onCrossRoad) {
      cTmp.setHex(0x6b6a64); // Gravel/asphalt road tint
    } else if (vy > 1.3) {
      cTmp.setHex(0x757c5e); // Ridge dry scrub
    } else {
      cTmp.setHex(0x8a9370); // Grass/earth base modulated by texture
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(terrainGeo, matTerrain);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
  shootableMeshes.push(terrainMesh);

  // Helper to register box colliders and cover points
  const addBoxCollider = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    minY: number,
    maxY: number,
    isCover = true,
  ) => {
    const collider: BoxCollider = {
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      minY,
      maxY,
      isCover,
    };
    colliders.push(collider);
    if (isCover && maxY - minY >= 0.9) {
      const margin = 1.65;
      const pts = [
        new THREE.Vector3(cx - w / 2 - margin, groundHeightAt(cx - w / 2 - margin, cz), cz),
        new THREE.Vector3(cx + w / 2 + margin, groundHeightAt(cx + w / 2 + margin, cz), cz),
        new THREE.Vector3(cx, groundHeightAt(cx, cz - d / 2 - margin), cz - d / 2 - margin),
        new THREE.Vector3(cx, groundHeightAt(cx, cz + d / 2 + margin), cz + d / 2 + margin),
      ];
      for (const p of pts) {
        if (Math.hypot(p.x, p.z) < PLAYABLE_LIMIT - 4) {
          coverPoints.push(p);
        }
      }
    }
  };

  // =========================================================================
  // 3. COMPOSITE MILITARY BUILDINGS & HANGARS (3-12 parts each)
  // =========================================================================
  const buildCommandCompound = (x: number, z: number, rotY = 0) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // 1. Concrete foundation slab
    const slab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14, 0.35, 11)), matConcrete);
    slab.position.y = 0.175;
    slab.receiveShadow = true;
    slab.castShadow = true;
    group.add(slab);

    // 2-4. Left, Right, Back armored walls (open front & side bay doors)
    const wallLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 4.4, 10.6)), matConcrete);
    wallLeft.position.set(-6.6, 2.4, 0);
    wallLeft.castShadow = true;
    wallLeft.receiveShadow = true;
    group.add(wallLeft);

    const wallRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 4.4, 10.6)), matConcrete);
    wallRight.position.set(6.6, 2.4, 0);
    wallRight.castShadow = true;
    wallRight.receiveShadow = true;
    group.add(wallRight);

    const wallBackLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 4.4, 0.6)), matConcrete);
    wallBackLeft.position.set(-4.3, 2.4, -5.0);
    wallBackLeft.castShadow = true;
    wallBackLeft.receiveShadow = true;
    group.add(wallBackLeft);

    const wallBackRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.6, 4.4, 0.6)), matConcrete);
    wallBackRight.position.set(4.3, 2.4, -5.0);
    wallBackRight.castShadow = true;
    wallBackRight.receiveShadow = true;
    group.add(wallBackRight);

    // 5. Steel Roof canopy + parapet trim
    const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.4, 0.5, 11.4)), matDarkSteel);
    roof.position.y = 4.75;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    // 6. Roof HVAC / Comms box + Antenna mast
    const hvac = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 1.1, 2.0)), matOliveMetal);
    hvac.position.set(-3.2, 5.5, -1.5);
    hvac.castShadow = true;
    group.add(hvac);

    const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 4.8, 8)), matDarkSteel);
    mast.position.set(4.5, 7.2, -3.5);
    mast.castShadow = true;
    group.add(mast);

    const beacon = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.18, 10, 10)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.8 })),
    );
    beacon.position.set(4.5, 9.7, -3.5);
    group.add(beacon);

    // 7. Interior Tactical Table
    const table = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.9, 1.8)), matOliveMetal);
    table.position.set(0, 0.8, 0);
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    scene.add(group);
    shootableMeshes.push(group);

    // Wall colliders in world space (for rotY = 0 or PI/2 simple transform)
    const cos = Math.round(Math.cos(rotY));
    const sin = Math.round(Math.sin(rotY));
    const addLocalCol = (lx: number, lz: number, lw: number, ld: number, h: number) => {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      const ww = Math.abs(lw * cos) + Math.abs(ld * sin);
      const wd = Math.abs(lw * sin) + Math.abs(ld * cos);
      addBoxCollider(wx, wz, ww, wd, y, y + h, true);
    };
    addLocalCol(-6.6, 0, 0.8, 10.6, 4.8);
    addLocalCol(6.6, 0, 0.8, 10.6, 4.8);
    addLocalCol(-4.3, -5.0, 4.6, 0.8, 4.8);
    addLocalCol(4.3, -5.0, 4.6, 0.8, 4.8);
    addLocalCol(0, 0, 3.2, 1.8, 1.2);
  };

  // Central HQ Compound & Depot Hangar
  buildCommandCompound(0, -14, 0);
  buildCommandCompound(24, -46, -Math.PI / 2);

  // =========================================================================
  // 4. ABANDONED VILLAGE HOUSES (Composite 6-part structures)
  // =========================================================================
  const buildAbandonedHouse = (x: number, z: number, rotY: number) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // 1. Stone plinth
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.2, 0.3, 8.2)), matConcrete);
    base.position.y = 0.15;
    base.receiveShadow = true;
    group.add(base);

    // 2-5. Brick walls (with front doorway gap)
    const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.6, 3.6, 0.45)), matBrick);
    backWall.position.set(0, 2.0, -3.7);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    const leftWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 3.6, 7.6)), matBrick);
    leftWall.position.set(-4.1, 2.0, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 3.6, 7.6)), matBrick);
    rightWall.position.set(4.1, 2.0, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    const frontL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.1, 3.6, 0.45)), matBrick);
    frontL.position.set(-2.75, 2.0, 3.7);
    frontL.castShadow = true;
    group.add(frontL);

    const frontR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.1, 3.6, 0.45)), matBrick);
    frontR.position.set(2.75, 2.0, 3.7);
    frontR.castShadow = true;
    group.add(frontR);

    // 6. Pitched weathered roof (two angled slabs)
    const roofGeo = trackGeo(new THREE.BoxGeometry(9.6, 0.28, 4.9));
    const roofL = new THREE.Mesh(roofGeo, matRoofShingle);
    roofL.position.set(0, 4.5, -2.0);
    roofL.rotation.x = 0.36;
    roofL.castShadow = true;
    group.add(roofL);

    const roofR = new THREE.Mesh(roofGeo, matRoofShingle);
    roofR.position.set(0, 4.5, 2.0);
    roofR.rotation.x = -0.36;
    roofR.castShadow = true;
    group.add(roofR);

    // 7. Chimney
    const chimney = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 2.4, 0.9)), matBrick);
    chimney.position.set(2.5, 4.9, -2.2);
    chimney.castShadow = true;
    group.add(chimney);

    scene.add(group);
    shootableMeshes.push(group);

    // Colliders rotated appropriately
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const addLocal = (lx: number, lz: number, lw: number, ld: number) => {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      const ww = Math.abs(lw * cos) + Math.abs(ld * sin);
      const wd = Math.abs(lw * sin) + Math.abs(ld * cos);
      addBoxCollider(wx, wz, ww, wd, y, y + 4.2, true);
    };
    addLocal(0, -3.7, 8.6, 0.6);
    addLocal(-4.1, 0, 0.6, 7.6);
    addLocal(4.1, 0, 0.6, 7.6);
    addLocal(-2.75, 3.7, 3.1, 0.6);
    addLocal(2.75, 3.7, 3.1, 0.6);
  };

  buildAbandonedHouse(50, -14, 0);
  buildAbandonedHouse(55, 14, Math.PI);
  buildAbandonedHouse(36, 32, Math.PI / 2);

  // =========================================================================
  // 5. REINFORCED CONCRETE BUNKERS (Composite 5-part pillbox)
  // =========================================================================
  const buildBunker = (x: number, z: number, rotY: number) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // 1. Base pad
    const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.5, 0.4, 7.5)), matConcrete);
    pad.position.y = 0.2;
    pad.receiveShadow = true;
    group.add(pad);

    // 2. Lower armored walls
    const frontApron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 1.35, 0.7)), matConcrete);
    frontApron.position.set(0, 1.0, 3.2);
    frontApron.castShadow = true;
    frontApron.receiveShadow = true;
    group.add(frontApron);

    const sideL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.8, 2.8, 6.8)), matConcrete);
    sideL.position.set(-3.6, 1.6, 0);
    sideL.castShadow = true;
    group.add(sideL);

    const sideR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.8, 2.8, 6.8)), matConcrete);
    sideR.position.set(3.6, 1.6, 0);
    sideR.castShadow = true;
    group.add(sideR);

    // 3. Heavy sloped concrete roof slab
    const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.8, 0.75, 7.8)), matConcrete);
    roof.position.set(0, 3.1, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    // 4. Steel viewport struts
    for (const sx of [-1.8, 1.8]) {
      const strut = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.35, 1.2, 0.5)), matDarkSteel);
      strut.position.set(sx, 2.25, 3.2);
      group.add(strut);
    }

    // 5. Sandbag berm in front
    const berm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.6, 0.9, 1.1)), matSandbag);
    berm.position.set(0, 0.45, 4.1);
    berm.castShadow = true;
    berm.receiveShadow = true;
    group.add(berm);

    scene.add(group);
    shootableMeshes.push(group);

    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const addLocal = (lx: number, lz: number, lw: number, ld: number, h: number) => {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      const ww = Math.abs(lw * cos) + Math.abs(ld * sin);
      const wd = Math.abs(lw * sin) + Math.abs(ld * cos);
      addBoxCollider(wx, wz, ww, wd, y, y + h, true);
    };
    addLocal(0, 3.4, 8.2, 1.5, 1.4);
    addLocal(-3.6, 0, 0.9, 6.8, 3.2);
    addLocal(3.6, 0, 0.9, 6.8, 3.2);
  };

  buildBunker(-48, -48, Math.PI * 0.25);
  buildBunker(-46, 8, Math.PI * 0.5);
  buildBunker(18, 42, Math.PI);

  // =========================================================================
  // 6. ARMORED MILITARY VEHICLES (8-part Humvee / APC)
  // =========================================================================
  const buildArmoredVehicle = (x: number, z: number, rotY: number) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // 1. Lower chassis
    const chassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 0.85, 5.2)), matOliveMetal);
    chassis.position.y = 0.85;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // 2. Armored cabin
    const cabin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 0.9, 2.8)), matOliveMetal);
    cabin.position.set(0, 1.68, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // 3. Sloped armored windshield
    const windshield = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 0.55, 0.14)), matGlass);
    windshield.position.set(0, 1.68, 1.2);
    windshield.rotation.x = -0.35;
    group.add(windshield);

    // 4. Hood
    const hood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.45, 1.5)), matOliveMetal);
    hood.position.set(0, 1.38, 1.85);
    hood.castShadow = true;
    group.add(hood);

    // 5. Roof Turret Ring & Gun Shield
    const turretRing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.6, 0.65, 0.3, 12)), matDarkSteel);
    turretRing.position.set(0, 2.25, -0.2);
    group.add(turretRing);

    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 1.35, 8)), matDarkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 2.42, 0.55);
    group.add(barrel);

    // 6-9. 4 Rugged Wheels with rims
    const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 16));
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelOffsets: Array<[number, number]> = [
      [-1.25, 1.65],
      [1.25, 1.65],
      [-1.25, -1.65],
      [1.25, -1.65],
    ];
    for (const [wx, wz] of wheelOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, matTire);
      wheel.position.set(wx, 0.55, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }

    // 10. Front bumper bull-bar
    const bumper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.32, 0.35)), matDarkSteel);
    bumper.position.set(0, 0.72, 2.7);
    group.add(bumper);

    scene.add(group);
    shootableMeshes.push(group);

    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const ww = 2.7 * cos + 5.4 * sin;
    const wd = 2.7 * sin + 5.4 * cos;
    addBoxCollider(x, z, ww, wd, y, y + 2.4, true);
  };

  buildArmoredVehicle(-14, 12, 0.4);
  buildArmoredVehicle(16, -24, -0.6);
  buildArmoredVehicle(-28, -28, 1.1);
  buildArmoredVehicle(32, -8, 2.2);

  // =========================================================================
  // 7. TACTICAL COVER: CONCRETE BARRIERS, SANDBAGS, CRATES, ROCKS
  // =========================================================================
  const buildJerseyBarrier = (x: number, z: number, rotY: number) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.45, 0.9)), matConcrete);
    base.position.y = 0.225;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const upper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.75, 0.85, 0.52)), matConcrete);
    upper.position.y = 0.85;
    upper.castShadow = true;
    upper.receiveShadow = true;
    group.add(upper);

    // Hazard stripe cap
    const cap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(3.76, 0.12, 0.54)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xc28725, roughness: 0.75 })),
    );
    cap.position.y = 1.32;
    group.add(cap);

    scene.add(group);
    shootableMeshes.push(group);

    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    addBoxCollider(x, z, 3.8 * cos + 0.95 * sin, 3.8 * sin + 0.95 * cos, y, y + 1.4, true);
  };

  const barrierCoords: Array<[number, number, number]> = [
    [-7, 6, 0.15],
    [7, 6, -0.15],
    [0, 16, 0],
    [-16, -6, Math.PI / 2],
    [16, -6, Math.PI / 2],
    [-22, 22, 0.6],
    [22, 22, -0.5],
    [0, -34, 0],
    [-34, -18, 0.8],
    [34, 18, -0.7],
  ];
  for (const [bx, bz, br] of barrierCoords) {
    buildJerseyBarrier(bx, bz, br);
  }

  // Supply Crate Stacks
  const buildCrateCluster = (x: number, z: number) => {
    const y = groundHeightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const c1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 1.5, 1.5)), matWood);
    c1.position.set(0, 0.75, 0);
    c1.castShadow = true;
    c1.receiveShadow = true;
    group.add(c1);

    const c2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 1.25, 1.25)), matWood);
    c2.position.set(1.42, 0.625, 0.35);
    c2.rotation.y = 0.25;
    c2.castShadow = true;
    c2.receiveShadow = true;
    group.add(c2);

    const c3 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 1.1, 1.1)), matOliveMetal);
    c3.position.set(0.2, 2.05, 0.1);
    c3.rotation.y = -0.35;
    c3.castShadow = true;
    group.add(c3);

    scene.add(group);
    shootableMeshes.push(group);
    addBoxCollider(x + 0.5, z + 0.1, 3.0, 2.0, y, y + 2.6, true);
  };

  buildCrateCluster(-10, -24);
  buildCrateCluster(12, 18);
  buildCrateCluster(42, -2);
  buildCrateCluster(-30, 32);
  buildCrateCluster(26, -28);

  // Natural Boulder Outcrops
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.6, 1));
  const rockCoords: Array<[number, number, number]> = [
    [-25, -4, 1.2],
    [28, 6, 1.35],
    [-18, -42, 1.5],
    [40, -34, 1.4],
    [-62, -22, 1.8],
    [66, 30, 1.6],
    [-10, 44, 1.15],
  ];
  for (const [rx, rz, scale] of rockCoords) {
    const y = groundHeightAt(rx, rz);
    const g = new THREE.Group();
    g.position.set(rx, y, rz);

    const mainRock = new THREE.Mesh(rockGeo, matRock);
    mainRock.scale.set(scale * 1.2, scale * 0.85, scale);
    mainRock.position.y = scale * 0.65;
    mainRock.rotation.set(0.2, rx, 0.1);
    mainRock.castShadow = true;
    mainRock.receiveShadow = true;
    g.add(mainRock);

    const subRock = new THREE.Mesh(rockGeo, matRock);
    subRock.scale.set(scale * 0.65, scale * 0.55, scale * 0.7);
    subRock.position.set(scale * 1.1, scale * 0.38, scale * 0.4);
    subRock.castShadow = true;
    g.add(subRock);

    scene.add(g);
    shootableMeshes.push(g);
    addBoxCollider(rx, rz, scale * 2.5, scale * 2.2, y, y + scale * 1.8, true);
  }

  // =========================================================================
  // 8. SHOOTABLE EXPLOSIVE FUEL BARRELS
  // =========================================================================
  const barrelPositions: Array<[number, number]> = [
    [6, -9],
    [-9, 10],
    [18, -36],
    [44, 6],
    [-42, -38],
    [14, 34],
    [-22, 14],
  ];
  barrelPositions.forEach(([bx, bz], idx) => {
    const y = groundHeightAt(bx, bz);
    const g = new THREE.Group();
    g.position.set(bx, y, bz);

    const body = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 1.25, 14)), matBarrelRed);
    body.position.y = 0.625;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.barrelId = `barrel_${idx}`;
    g.add(body);

    const ringTop = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.035, 6, 16)), matDarkSteel);
    ringTop.rotation.x = Math.PI / 2;
    ringTop.position.y = 0.95;
    g.add(ringTop);

    const ringBot = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.035, 6, 16)), matDarkSteel);
    ringBot.rotation.x = Math.PI / 2;
    ringBot.position.y = 0.35;
    g.add(ringBot);

    const stripe = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.455, 0.455, 0.22, 14)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 })),
    );
    stripe.position.y = 0.65;
    stripe.userData.barrelId = `barrel_${idx}`;
    g.add(stripe);

    scene.add(g);
    shootableMeshes.push(g);
    addBoxCollider(bx, bz, 1.0, 1.0, y, y + 1.3, false);

    barrels.push({
      id: `barrel_${idx}`,
      mesh: g,
      position: new THREE.Vector3(bx, y + 0.625, bz),
      radius: 0.5,
      height: 1.25,
      hp: 45,
      exploded: false,
    });
  });

  // =========================================================================
  // 9. INSTANCED PINE FOREST & NATURAL PERIMETER BARRIERS
  // =========================================================================
  const treeCoords: Array<[number, number, number]> = [];
  // Tactical cover trees inside arena + dense perimeter forest ring
  for (let i = 0; i < 110; i++) {
    const angle = (i / 110) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const radius = i < 24 ? 26 + Math.random() * 52 : PLAYABLE_LIMIT - 2 + Math.random() * 24;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    // Keep clear of main roads and shooting range
    if (Math.abs(tx) < 8 || Math.abs(tz) < 8) continue;
    if (Math.hypot(tx + 36, tz - 56) < 22) continue;
    if (Math.hypot(tx - 52, tz) < 20) continue;
    treeCoords.push([tx, tz, 0.85 + Math.random() * 0.45]);
  }

  const treeCount = treeCoords.length;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.42, 4.2, 8));
  trunkGeo.translate(0, 2.1, 0);
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4b382a, roughness: 0.92 }));

  const foliageLowGeo = trackGeo(new THREE.ConeGeometry(2.4, 4.2, 8));
  foliageLowGeo.translate(0, 4.6, 0);
  const foliageTopGeo = trackGeo(new THREE.ConeGeometry(1.7, 3.6, 8));
  foliageTopGeo.translate(0, 6.8, 0);
  const foliageMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2d4a2b, roughness: 0.88 }));

  const instTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const instFoliageLow = new THREE.InstancedMesh(foliageLowGeo, foliageMat, treeCount);
  const instFoliageTop = new THREE.InstancedMesh(foliageTopGeo, foliageMat, treeCount);
  instTrunks.castShadow = !isSoftwareGl;
  instFoliageLow.castShadow = !isSoftwareGl;
  instFoliageTop.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const tintColor = new THREE.Color();

  treeCoords.forEach(([tx, tz, s], idx) => {
    const ty = groundHeightAt(tx, tz);
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    instTrunks.setMatrixAt(idx, dummy.matrix);
    instFoliageLow.setMatrixAt(idx, dummy.matrix);
    instFoliageTop.setMatrixAt(idx, dummy.matrix);

    tintColor.setHSL(0.3 + (Math.random() - 0.5) * 0.05, 0.32, 0.22 + (Math.random() - 0.5) * 0.06);
    instFoliageLow.setColorAt(idx, tintColor);
    instFoliageTop.setColorAt(idx, tintColor.clone().offsetHSL(0, 0, 0.03));

    if (Math.hypot(tx, tz) < PLAYABLE_LIMIT) {
      addBoxCollider(tx, tz, 0.85 * s, 0.85 * s, ty, ty + 4.5 * s, true);
    }
  });

  instTrunks.instanceMatrix.needsUpdate = true;
  instFoliageLow.instanceMatrix.needsUpdate = true;
  instFoliageTop.instanceMatrix.needsUpdate = true;
  if (instFoliageLow.instanceColor) instFoliageLow.instanceColor.needsUpdate = true;
  if (instFoliageTop.instanceColor) instFoliageTop.instanceColor.needsUpdate = true;
  instTrunks.computeBoundingSphere();
  instFoliageLow.computeBoundingSphere();
  instFoliageTop.computeBoundingSphere();

  scene.add(instTrunks, instFoliageLow, instFoliageTop);
  shootableMeshes.push(instTrunks);

  // =========================================================================
  // 10. TRAINING RANGE ZONE (x: -36, z: 56) — Pop-up & Moving Steel Targets
  // =========================================================================
  {
    const rx = -36;
    const rz = 56;
    const ry = groundHeightAt(rx, rz);

    // Firing bench platform
    const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16, 0.9, 1.4)), matWood);
    bench.position.set(rx, ry + 0.45, rz - 12);
    bench.castShadow = true;
    bench.receiveShadow = true;
    scene.add(bench);
    addBoxCollider(rx, rz - 12, 16, 1.4, ry, ry + 1.0, false);

    // Backstop berm behind targets
    const backstop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(24, 5.2, 2.2)), matSandbag);
    backstop.position.set(rx, ry + 2.6, rz + 26);
    backstop.receiveShadow = true;
    scene.add(backstop);
    addBoxCollider(rx, rz + 26, 24, 2.2, ry, ry + 5.2, false);

    const targetConfigs = [
      { ox: -7, oz: -2, amp: 0, speed: 0, dist: 10 },
      { ox: -2.5, oz: 4, amp: 0, speed: 0, dist: 16 },
      { ox: 2.5, oz: 10, amp: 2.6, speed: 1.4, dist: 22 },
      { ox: 7, oz: 16, amp: 3.4, speed: 2.0, dist: 28 },
      { ox: 0, oz: 21, amp: 4.5, speed: 2.4, dist: 33 },
    ];

    targetConfigs.forEach((cfg, idx) => {
      const tx = rx + cfg.ox;
      const tz = rz + cfg.oz;
      const ty = groundHeightAt(tx, tz);
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, ty, tz);

      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 8)), matDarkSteel);
      post.position.y = 0.7;
      tGroup.add(post);

      const plateMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: textures.target,
          roughness: 0.55,
          metalness: 0.25,
        }),
      );
      const plate = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 20)), plateMat);
      plate.rotation.x = Math.PI / 2;
      plate.position.y = 1.65;
      plate.castShadow = true;
      plate.userData.trainingTargetId = `target_${idx}`;
      tGroup.add(plate);

      scene.add(tGroup);
      shootableMeshes.push(plate);

      trainingTargets.push({
        id: `target_${idx}`,
        group: tGroup,
        hitMesh: plate,
        basePos: new THREE.Vector3(tx, ty, tz),
        oscillateAmp: cfg.amp,
        oscillateSpeed: cfg.speed,
        phase: idx * 1.1,
        distanceLabel: cfg.dist,
        downTimer: 0,
      });
    });
  }

  // =========================================================================
  // 11. MISSION OBJECTIVE PROPS (Comms Terminal, Fuel Cache, Extraction LZ)
  // =========================================================================
  const buildBeaconProp = (x: number, z: number, colorHex: number, height = 2.2): THREE.Group => {
    const y = groundHeightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const chassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, height * 0.6, 1.1)), matDarkSteel);
    chassis.position.y = height * 0.3;
    chassis.castShadow = true;
    g.add(chassis);

    const screen = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.0, 0.6, 0.1)),
      trackMat(new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.5 })),
    );
    screen.position.set(0, height * 0.52, 0.54);
    g.add(screen);

    const ring = new THREE.Mesh(
      trackGeo(new THREE.RingGeometry(2.6, 2.9, 32)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(ring);

    g.visible = false;
    scene.add(g);
    return g;
  };

  // Stage 2: Comms Terminal inside Central Compound
  const missionTerminalMesh = buildBeaconProp(0, -14, 0x38bdf8, 1.9);
  // Stage 3: Enemy Munitions Cache at North-West Bunker
  const missionDepotMesh = buildBeaconProp(-48, -42, 0xf59e0b, 2.2);
  // Stage 4: Extraction LZ at South-East Helipad
  const extractionBeaconMesh = buildBeaconProp(48, 44, 0x22c55e, 1.4);

  // =========================================================================
  // 12. PICKUPS (Health Kits, Ammo Crates, Armor Plates)
  // =========================================================================
  const matMedkit = trackMat(new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, emissive: 0x450a0a }));
  const matAmmoPack = trackMat(new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.45, metalness: 0.3 }));
  const matArmorPack = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, metalness: 0.6 }));
  const matWhiteCross = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35 }));

  const spawnPickupAt = (
    type: 'health' | 'ammo' | 'armor',
    pos: THREE.Vector3,
    _temporary = false,
    fixedId?: string,
  ) => {
    const g = new THREE.Group();
    const gy = groundHeightAt(pos.x, pos.z);
    g.position.set(pos.x, gy + 0.45, pos.z);

    if (type === 'health') {
      const box = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.45, 0.45)), matMedkit);
      box.castShadow = true;
      g.add(box);
      const c1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.1, 0.48)), matWhiteCross);
      const c2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.32, 0.48)), matWhiteCross);
      g.add(c1, c2);
    } else if (type === 'ammo') {
      const box = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.7, 0.42, 0.48)), matAmmoPack);
      box.castShadow = true;
      g.add(box);
      const band = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.72, 0.1, 0.5)),
        trackMat(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })),
      );
      g.add(band);
    } else {
      const plate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.62, 0.2)), matArmorPack);
      plate.castShadow = true;
      g.add(plate);
    }

    scene.add(g);
    pickups.push({
      id: fixedId || `pickup_${Date.now()}_${Math.random()}`,
      type,
      group: g,
      position: new THREE.Vector3(pos.x, gy + 0.45, pos.z),
      active: true,
      respawnTimer: 0,
    });
  };

  // Fixed tactical supply pickups across map
  const staticPickups: Array<{ type: 'health' | 'ammo' | 'armor'; x: number; z: number }> = [
    { type: 'ammo', x: -3.5, z: -12 },
    { type: 'health', x: 3.5, z: -12 },
    { type: 'armor', x: 0, z: 22 },
    { type: 'health', x: -46, z: -44 },
    { type: 'ammo', x: 52, z: 0 },
    { type: 'armor', x: -36, z: 46 },
    { type: 'ammo', x: 24, z: -42 },
    { type: 'health', x: 26, z: 24 },
  ];
  staticPickups.forEach((sp, idx) => {
    spawnPickupAt(sp.type, new THREE.Vector3(sp.x, 0, sp.z), false, `static_pickup_${idx}`);
  });

  return {
    scene,
    colliders,
    coverPoints,
    shootableMeshes,
    barrels,
    trainingTargets,
    pickups,
    missionTerminalMesh,
    missionDepotMesh,
    extractionBeaconMesh,
    setLighting: applyLighting,
    updateWorldProps: (dt: number, elapsed: number) => {
      // Animate training targets
      for (const tgt of trainingTargets) {
        if (tgt.downTimer > 0) {
          tgt.downTimer -= dt;
          tgt.group.rotation.x = THREE.MathUtils.damp(tgt.group.rotation.x, -Math.PI / 2, 12, dt);
        } else {
          tgt.group.rotation.x = THREE.MathUtils.damp(tgt.group.rotation.x, 0, 10, dt);
          if (tgt.oscillateAmp > 0) {
            const offset = Math.sin(elapsed * tgt.oscillateSpeed + tgt.phase) * tgt.oscillateAmp;
            tgt.group.position.x = tgt.basePos.x + offset;
          }
        }
      }

      // Rotate and bob active pickups, handle respawns
      for (const p of pickups) {
        if (p.active) {
          p.group.visible = true;
          p.group.rotation.y += dt * 1.6;
          p.group.position.y = p.position.y + Math.sin(elapsed * 2.8 + p.position.x) * 0.1;
        } else {
          p.group.visible = false;
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) {
            p.active = true;
          }
        }
      }

      // Pulse mission rings cleanly in 3D space
      if (missionTerminalMesh.visible) {
        missionTerminalMesh.children[1].rotation.y = Math.sin(elapsed * 2) * 0.05;
      }
    },
    resetTrainingTargets: () => {
      for (const t of trainingTargets) {
        t.downTimer = 0;
        t.group.rotation.x = 0;
      }
    },
    spawnPickupAt,
    dispose: () => {
      for (const dItem of disposables) {
        dItem.dispose();
      }
    },
  };
}
