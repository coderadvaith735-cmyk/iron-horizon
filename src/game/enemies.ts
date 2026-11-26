import * as THREE from 'three';
import { BattlefieldTextures } from './textures';
import { EnemyType, WeaponId } from './types';
import { BoxCollider, PLAYABLE_LIMIT, groundHeightAt } from './world';

export type AIState = 'patrol' | 'pursue' | 'take_cover' | 'attack';

export interface SoldierArchetype {
  type: EnemyType;
  label: string;
  maxHp: number;
  speed: number;
  detectRange: number;
  attackRange: number;
  fireInterval: number;
  damage: number;
  accuracy: number; // lower = tighter spread
  weaponSound: WeaponId;
  scoreValue: number;
  creditValue: number;
  scale: number;
}

export const SOLDIER_ARCHETYPES: Record<EnemyType, SoldierArchetype> = {
  rifleman: {
    type: 'rifleman',
    label: 'Rifleman',
    maxHp: 100,
    speed: 4.5,
    detectRange: 52,
    attackRange: 38,
    fireInterval: 0.72,
    damage: 9,
    accuracy: 0.085,
    weaponSound: 'assault',
    scoreValue: 100,
    creditValue: 25,
    scale: 1.0,
  },
  rusher: {
    type: 'rusher',
    label: 'Recon Rusher',
    maxHp: 75,
    speed: 6.4,
    detectRange: 56,
    attackRange: 22,
    fireInterval: 0.34,
    damage: 6,
    accuracy: 0.11,
    weaponSound: 'smg',
    scoreValue: 120,
    creditValue: 30,
    scale: 0.96,
  },
  heavy: {
    type: 'heavy',
    label: 'Heavy Juggernaut',
    maxHp: 220,
    speed: 3.1,
    detectRange: 50,
    attackRange: 34,
    fireInterval: 0.45,
    damage: 11,
    accuracy: 0.095,
    weaponSound: 'shotgun',
    scoreValue: 220,
    creditValue: 55,
    scale: 1.15,
  },
  sniper: {
    type: 'sniper',
    label: 'Marksman',
    maxHp: 80,
    speed: 3.9,
    detectRange: 75,
    attackRange: 66,
    fireInterval: 2.15,
    damage: 24,
    accuracy: 0.032,
    weaponSound: 'sniper',
    scoreValue: 160,
    creditValue: 40,
    scale: 0.98,
  },
  ally: {
    type: 'ally',
    label: 'Allied Trooper',
    maxHp: 115,
    speed: 4.8,
    detectRange: 56,
    attackRange: 40,
    fireInterval: 0.65,
    damage: 14,
    accuracy: 0.075,
    weaponSound: 'assault',
    scoreValue: 0,
    creditValue: 0,
    scale: 1.0,
  },
};

export interface SoldierAgent {
  id: string;
  type: EnemyType;
  team: 'enemy' | 'ally';
  archetype: SoldierArchetype;
  group: THREE.Group;
  headMesh: THREE.Mesh;
  bodyMesh: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  rightArm: THREE.Group;
  muzzlePoint: THREE.Object3D;
  hp: number;
  maxHp: number;
  alive: boolean;
  deathTimer: number;
  state: AIState;
  patrolTarget: THREE.Vector3;
  coverTarget: THREE.Vector3 | null;
  coverStayTimer: number;
  fireCooldown: number;
  hitFlashTimer: number;
  stridePhase: number;
  strafeDir: number;
  strafeTimer: number;
  lastDamagedTime: number;
}

export interface SoldierVisualResources {
  sharedGeos: THREE.BufferGeometry[];
  sharedMats: THREE.Material[];
  createSoldierMesh: (type: EnemyType, id: string) => {
    group: THREE.Group;
    headMesh: THREE.Mesh;
    bodyMesh: THREE.Mesh;
    leftLeg: THREE.Mesh;
    rightLeg: THREE.Mesh;
    rightArm: THREE.Group;
    muzzlePoint: THREE.Object3D;
  };
  dispose: () => void;
}

export function createSoldierResources(textures: BattlefieldTextures): SoldierVisualResources {
  const sharedGeos: THREE.BufferGeometry[] = [];
  const sharedMats: THREE.Material[] = [];

  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    sharedGeos.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    sharedMats.push(m);
    return m;
  };

  // Shared geometries for composite 9-part soldier
  const torsoGeo = trackG(new THREE.BoxGeometry(0.56, 0.72, 0.32));
  const vestGeo = trackG(new THREE.BoxGeometry(0.6, 0.52, 0.37));
  const packGeo = trackG(new THREE.BoxGeometry(0.38, 0.48, 0.2));
  const headGeo = trackG(new THREE.SphereGeometry(0.18, 12, 12));
  const helmetGeo = trackG(new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6));
  const visorGeo = trackG(new THREE.BoxGeometry(0.26, 0.08, 0.14));
  const legGeo = trackG(new THREE.BoxGeometry(0.2, 0.74, 0.22));
  legGeo.translate(0, -0.37, 0);
  const armGeo = trackG(new THREE.BoxGeometry(0.16, 0.55, 0.18));
  armGeo.translate(0, -0.22, 0);
  const gunBodyGeo = trackG(new THREE.BoxGeometry(0.08, 0.12, 0.68));
  const gunBarrelGeo = trackG(new THREE.CylinderGeometry(0.022, 0.025, 0.42, 8));
  gunBarrelGeo.rotateX(Math.PI / 2);

  // Materials per faction/archetype
  const matUniformEnemy = trackM(
    new THREE.MeshStandardMaterial({ map: textures.camo, color: 0x7c7465, roughness: 0.85 }),
  );
  const matUniformRusher = trackM(
    new THREE.MeshStandardMaterial({ color: 0x3b3330, roughness: 0.8 }),
  );
  const matUniformHeavy = trackM(
    new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.45, metalness: 0.65 }),
  );
  const matUniformSniper = trackM(
    new THREE.MeshStandardMaterial({ map: textures.camo, color: 0x4c6042, roughness: 0.9 }),
  );
  const matUniformAlly = trackM(
    new THREE.MeshStandardMaterial({ map: textures.camo, color: 0x5c728a, roughness: 0.82 }),
  );

  const matVestDark = trackM(new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.68, metalness: 0.2 }));
  const matSkin = trackM(new THREE.MeshStandardMaterial({ color: 0xc29b7d, roughness: 0.75 }));
  const matGun = trackM(new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.35, metalness: 0.85 }));

  const matVisorRed = trackM(
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 1.4 }),
  );
  const matVisorAmber = trackM(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 1.4 }),
  );
  const matVisorBlue = trackM(
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.5 }),
  );

  const createSoldierMesh = (type: EnemyType, id: string) => {
    const arch = SOLDIER_ARCHETYPES[type];
    const group = new THREE.Group();
    group.scale.setScalar(arch.scale);

    const uniformMat =
      type === 'rusher'
        ? matUniformRusher
        : type === 'heavy'
          ? matUniformHeavy
          : type === 'sniper'
            ? matUniformSniper
            : type === 'ally'
              ? matUniformAlly
              : matUniformEnemy;

    const visorMat = type === 'ally' ? matVisorBlue : type === 'heavy' ? matVisorAmber : matVisorRed;

    // 1. Legs (pivot at hip y = 0.74)
    const leftLeg = new THREE.Mesh(legGeo, uniformMat);
    leftLeg.position.set(-0.14, 0.74, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, uniformMat);
    rightLeg.position.set(0.14, 0.74, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // 2. Torso & Plate Carrier (hitbox body)
    const bodyMesh = new THREE.Mesh(torsoGeo, uniformMat);
    bodyMesh.position.set(0, 1.1, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData.enemyId = id;
    bodyMesh.userData.hitZone = 'body';
    group.add(bodyMesh);

    const vest = new THREE.Mesh(vestGeo, matVestDark);
    vest.position.set(0, 1.12, 0);
    vest.castShadow = true;
    vest.userData.enemyId = id;
    vest.userData.hitZone = 'body';
    group.add(vest);

    // 3. Tactical Backpack
    const pack = new THREE.Mesh(packGeo, matVestDark);
    pack.position.set(0, 1.15, -0.24);
    pack.castShadow = true;
    group.add(pack);

    // 4. Head + Helmet + Glowing Tactical Visor (hitbox head)
    const headMesh = new THREE.Mesh(headGeo, matSkin);
    headMesh.position.set(0, 1.65, 0);
    headMesh.castShadow = true;
    headMesh.userData.enemyId = id;
    headMesh.userData.hitZone = 'head';
    group.add(headMesh);

    const helmet = new THREE.Mesh(helmetGeo, type === 'heavy' ? matGun : matVestDark);
    helmet.position.set(0, 1.69, 0);
    helmet.castShadow = true;
    helmet.userData.enemyId = id;
    helmet.userData.hitZone = 'head';
    group.add(helmet);

    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.66, 0.14);
    visor.userData.enemyId = id;
    visor.userData.hitZone = 'head';
    group.add(visor);

    // 5. Left Arm
    const leftArm = new THREE.Mesh(armGeo, uniformMat);
    leftArm.position.set(-0.37, 1.38, 0.08);
    leftArm.rotation.x = -0.6;
    leftArm.castShadow = true;
    group.add(leftArm);

    // 6. Right Arm + Weapon Assembly
    const rightArm = new THREE.Group();
    rightArm.position.set(0.35, 1.38, 0);

    const rArmMesh = new THREE.Mesh(armGeo, uniformMat);
    rArmMesh.rotation.x = -Math.PI / 2.2;
    rArmMesh.castShadow = true;
    rightArm.add(rArmMesh);

    const rifle = new THREE.Mesh(gunBodyGeo, matGun);
    rifle.position.set(-0.08, -0.08, 0.36);
    rifle.castShadow = true;
    rightArm.add(rifle);

    const barrel = new THREE.Mesh(gunBarrelGeo, matGun);
    barrel.position.set(-0.08, -0.06, 0.78);
    rightArm.add(barrel);

    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.position.set(-0.08, -0.06, 1.02);
    rightArm.add(muzzlePoint);

    group.add(rightArm);

    return { group, headMesh, bodyMesh, leftLeg, rightLeg, rightArm, muzzlePoint };
  };

  return {
    sharedGeos,
    sharedMats,
    createSoldierMesh,
    dispose: () => {
      for (const g of sharedGeos) g.dispose();
      for (const m of sharedMats) m.dispose();
    },
  };
}

// Reusable scratch math objects for zero-GC updates
const _toTarget = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _coverToThreat = new THREE.Vector3();

export function hasLineOfSight(
  fromPos: THREE.Vector3,
  toPos: THREE.Vector3,
  raycaster: THREE.Raycaster,
  occluders: THREE.Object3D[],
): boolean {
  _rayOrigin.set(fromPos.x, fromPos.y + 1.5, fromPos.z);
  _rayDir.set(toPos.x - fromPos.x, toPos.y + 1.4 - (fromPos.y + 1.5), toPos.z - fromPos.z);
  const dist = _rayDir.length();
  if (dist < 0.2) return true;
  _rayDir.divideScalar(dist);

  raycaster.set(_rayOrigin, _rayDir);
  raycaster.near = 0.2;
  raycaster.far = dist - 0.3;
  const hits = raycaster.intersectObjects(occluders, true);
  return hits.length === 0;
}

export function resolveHorizontalCollision(
  pos: THREE.Vector3,
  radius: number,
  colliders: BoxCollider[],
  footY: number,
) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (footY >= c.maxY - 0.15) continue; // Standing above collider
    if (footY + 1.75 <= c.minY) continue;

    const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // Inside box center fallback
        const penLeft = Math.abs(pos.x - c.minX);
        const penRight = Math.abs(c.maxX - pos.x);
        const penTop = Math.abs(pos.z - c.minZ);
        const penBot = Math.abs(c.maxZ - pos.z);
        const minPen = Math.min(penLeft, penRight, penTop, penBot);
        if (minPen === penLeft) pos.x = c.minX - radius;
        else if (minPen === penRight) pos.x = c.maxX + radius;
        else if (minPen === penTop) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }

  // Keep inside playable perimeter
  const r = Math.hypot(pos.x, pos.z);
  if (r > PLAYABLE_LIMIT - 2) {
    const scale = (PLAYABLE_LIMIT - 2) / r;
    pos.x *= scale;
    pos.z *= scale;
  }
}

export function findNearestCoverPoint(
  agentPos: THREE.Vector3,
  threatPos: THREE.Vector3,
  coverPoints: THREE.Vector3[],
): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < coverPoints.length; i++) {
    const cp = coverPoints[i];
    const distAgent = agentPos.distanceTo(cp);
    if (distAgent > 24) continue;
    const distThreat = cp.distanceTo(threatPos);
    if (distThreat < 8 || distThreat > 55) continue;

    // Prefer cover points whose direction from threat aligns with staying behind obstacle
    _coverToThreat.subVectors(threatPos, cp).normalize();
    const score = distAgent - distThreat * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = cp;
    }
  }
  return best;
}

export function pickRandomPatrolPoint(centerX = 0, centerZ = 0, radius = 58): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const r = 10 + Math.random() * radius;
  const x = THREE.MathUtils.clamp(centerX + Math.cos(angle) * r, -PLAYABLE_LIMIT + 8, PLAYABLE_LIMIT - 8);
  const z = THREE.MathUtils.clamp(centerZ + Math.sin(angle) * r, -PLAYABLE_LIMIT + 8, PLAYABLE_LIMIT - 8);
  return new THREE.Vector3(x, groundHeightAt(x, z), z);
}

export function updateSoldierAI(
  agent: SoldierAgent,
  dt: number,
  threatPos: THREE.Vector3 | null,
  hasLOS: boolean,
  colliders: BoxCollider[],
  coverPoints: THREE.Vector3[],
  onFireShot: (agent: SoldierAgent, targetPos: THREE.Vector3) => void,
) {
  if (!agent.alive) {
    agent.deathTimer += dt;
    agent.group.rotation.x = THREE.MathUtils.damp(agent.group.rotation.x, -Math.PI / 2, 9, dt);
    return;
  }

  const pos = agent.group.position;
  agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);
  agent.strafeTimer -= dt;
  if (agent.strafeTimer <= 0) {
    agent.strafeTimer = 1.4 + Math.random() * 1.8;
    agent.strafeDir = Math.random() < 0.5 ? -1 : 1;
  }

  let moving = false;
  let desiredMoveSpeed = agent.archetype.speed;

  if (!threatPos) {
    agent.state = 'patrol';
  } else {
    const distToThreat = pos.distanceTo(threatPos);

    if (distToThreat > agent.archetype.detectRange && !hasLOS) {
      agent.state = 'patrol';
    } else if (
      agent.hp < agent.maxHp * 0.55 &&
      agent.coverStayTimer <= 0 &&
      agent.type !== 'rusher'
    ) {
      if (!agent.coverTarget) {
        agent.coverTarget = findNearestCoverPoint(pos, threatPos, coverPoints);
      }
      if (agent.coverTarget) {
        agent.state = 'take_cover';
      } else {
        agent.state = hasLOS && distToThreat <= agent.archetype.attackRange ? 'attack' : 'pursue';
      }
    } else if (hasLOS && distToThreat <= agent.archetype.attackRange) {
      agent.state = 'attack';
    } else {
      agent.state = 'pursue';
    }
  }

  if (agent.state === 'patrol') {
    desiredMoveSpeed = agent.archetype.speed * 0.55;
    if (pos.distanceTo(agent.patrolTarget) < 2.2) {
      agent.patrolTarget.copy(pickRandomPatrolPoint());
    }
    _moveDir.subVectors(agent.patrolTarget, pos);
    _moveDir.y = 0;
    if (_moveDir.lengthSq() > 0.01) {
      _moveDir.normalize();
      moving = true;
      const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
      agent.group.rotation.y = lerpAngle(agent.group.rotation.y, targetYaw, dt * 5);
    }
  } else if (agent.state === 'take_cover' && agent.coverTarget && threatPos) {
    const distCover = pos.distanceTo(agent.coverTarget);
    if (distCover > 1.3) {
      _moveDir.subVectors(agent.coverTarget, pos);
      _moveDir.y = 0;
      _moveDir.normalize();
      moving = true;
      desiredMoveSpeed = agent.archetype.speed * 1.1;
    } else {
      agent.coverStayTimer = 2.4;
      agent.coverTarget = null;
    }
    _toTarget.subVectors(threatPos, pos);
    const faceYaw = Math.atan2(_toTarget.x, _toTarget.z);
    agent.group.rotation.y = lerpAngle(agent.group.rotation.y, faceYaw, dt * 7);
  } else if (agent.state === 'pursue' && threatPos) {
    _moveDir.subVectors(threatPos, pos);
    _moveDir.y = 0;
    if (_moveDir.lengthSq() > 0.01) {
      _moveDir.normalize();
      moving = true;
    }
    const faceYaw = Math.atan2(_moveDir.x, _moveDir.z);
    agent.group.rotation.y = lerpAngle(agent.group.rotation.y, faceYaw, dt * 7);
  } else if (agent.state === 'attack' && threatPos) {
    _toTarget.subVectors(threatPos, pos);
    _toTarget.y = 0;
    const dist = _toTarget.length();
    if (dist > 0.01) _toTarget.divideScalar(dist);

    const faceYaw = Math.atan2(_toTarget.x, _toTarget.z);
    agent.group.rotation.y = lerpAngle(agent.group.rotation.y, faceYaw, dt * 10);

    // Tactical strafing + optimal range spacing
    const idealDist =
      agent.type === 'sniper' ? 38 : agent.type === 'rusher' ? 9 : 18;
    _moveDir.set(-_toTarget.z * agent.strafeDir, 0, _toTarget.x * agent.strafeDir);
    if (dist > idealDist + 4) {
      _moveDir.addScaledVector(_toTarget, 0.7);
    } else if (dist < idealDist - 4) {
      _moveDir.addScaledVector(_toTarget, -0.6);
    }
    _moveDir.normalize();
    desiredMoveSpeed = agent.archetype.speed * 0.65;
    moving = true;

    if (agent.fireCooldown <= 0 && hasLOS) {
      agent.fireCooldown = agent.archetype.fireInterval * (0.85 + Math.random() * 0.35);
      onFireShot(agent, threatPos);
    }
  }

  if (agent.coverStayTimer > 0) {
    agent.coverStayTimer -= dt;
    // Peek fire from cover
    if (threatPos && hasLOS && agent.fireCooldown <= 0) {
      agent.fireCooldown = agent.archetype.fireInterval * 1.1;
      onFireShot(agent, threatPos);
    }
  }

  if (moving) {
    pos.x += _moveDir.x * desiredMoveSpeed * dt;
    pos.z += _moveDir.z * desiredMoveSpeed * dt;
    resolveHorizontalCollision(pos, 0.52, colliders, pos.y);
    pos.y = groundHeightAt(pos.x, pos.z);

    agent.stridePhase += dt * desiredMoveSpeed * 2.2;
    const swing = Math.sin(agent.stridePhase) * 0.55;
    agent.leftLeg.rotation.x = swing;
    agent.rightLeg.rotation.x = -swing;
  } else {
    agent.leftLeg.rotation.x = THREE.MathUtils.damp(agent.leftLeg.rotation.x, 0, 10, dt);
    agent.rightLeg.rotation.x = THREE.MathUtils.damp(agent.rightLeg.rotation.x, 0, 10, dt);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}
