import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import {
  SOLDIER_ARCHETYPES,
  SoldierAgent,
  SoldierVisualResources,
  createSoldierResources,
  hasLineOfSight,
  pickRandomPatrolPoint,
  resolveHorizontalCollision,
  updateSoldierAI,
} from './enemies';
import { multiplayerClient } from './multiplayerClient';
import type {
  CombatFxPayload,
  CombatHitPayload,
  CombatKillPayload,
  NetworkPlayerInfo,
  PvpMode,
  PvpTeam,
  RoomSnapshot,
  StateTickPlayer,
} from './multiplayerTypes';
import { getEffectiveWeaponStats } from './storage';
import { BattlefieldTextures, createBattlefieldTextures } from './textures';
import {
  EnemyHealthTag,
  EnemyType,
  GameMode,
  GamePhase,
  GameSettings,
  HudSnapshot,
  KillFeedItem,
  MatchSummary,
  MissionStageInfo,
  PlayerProgress,
  PvpHudInfo,
  PvpScoreboardRow,
  RadarBlip,
  WEAPON_ORDER,
  WeaponAmmoState,
  WeaponId,
} from './types';
import { WeaponViewRig, createWeaponViewRig } from './weapons';
import {
  PLAYABLE_LIMIT,
  WorldContext,
  buildBattlefieldWorld,
  groundHeightAt,
} from './world';

interface RemotePlayerAvatar {
  id: string;
  callsign: string;
  team: PvpTeam;
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  rightArm: THREE.Group;
  muzzlePoint: THREE.Object3D;
  targetPos: THREE.Vector3;
  targetYaw: number;
  targetPitch: number;
  weapon: WeaponId;
  health: number;
  maxHealth: number;
  armor: number;
  alive: boolean;
  respawnRemaining: number;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
  stridePhase: number;
  lastDamagedTime: number;
}

interface TracerEffect {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface ParticleEffect {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scaleRate: number;
}

interface ActiveGrenade {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
}

// Pre-allocated scratch math helpers (zero GC in loop)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _hitPos = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _toEnemy = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export interface FpsEngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onPauseRequested: () => void;
  onMatchEnd: (summary: MatchSummary) => void;
  onContextLost: () => void;
}

export class FpsGameEngine {
  private container: HTMLElement;
  private callbacks: FpsEngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: BattlefieldTextures;
  private world: WorldContext;
  private weaponRig: WeaponViewRig;
  private soldierRes: SoldierVisualResources;
  private envMapTex: THREE.Texture;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameId = 0;
  private disposed = false;

  // Game state
  private phase: GamePhase = 'menu';
  private mode: GameMode = 'survival';
  private settings: GameSettings;
  private progress: PlayerProgress;

  // Player state
  private playerPos = new THREE.Vector3(0, 0, 26);
  private playerVelY = 0;
  private playerGrounded = true;
  private playerYaw = 0;
  private playerPitch = 0;
  private health = 100;
  private maxHealth = 100;
  private armor = 50;
  private maxArmor = 100;
  private stamina = 100;
  private grenades = 2;

  // Weapons & shooting
  private activeWeapon: WeaponId = 'assault';
  private prevWeapon: WeaponId = 'pistol';
  private weaponAmmo: Record<WeaponId, WeaponAmmoState>;
  private fireTimer = 0;
  private isReloading = false;
  private reloadTimer = 0;
  private reloadDuration = 1.5;
  private isFiringHeld = false;
  private isAdsHeld = false;
  private dynamicSpread = 0;
  private pitchRecoilOffset = 0;
  private footstepTimer = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private mobileMoveX = 0;
  private mobileMoveY = 0;

  // Feedback
  private hitMarkerType: 'none' | 'body' | 'head' | 'kill' = 'none';
  private hitMarkerTimer = 0;
  private damageFlash = 0;
  private damageSourcePos: THREE.Vector3 | null = null;
  private killFeed: KillFeedItem[] = [];
  private killFeedSeq = 1;

  // Match stats
  private matchStartTime = 0;
  private kills = 0;
  private headshots = 0;
  private deaths = 0;
  private score = 0;
  private shotsFired = 0;
  private shotsHit = 0;

  // Mode-specific state
  private wave = 1;
  private waveIntermission = 0;
  private waveToSpawn = 0;
  private waveSpawnTimer = 0;

  private tdmBlueScore = 0;
  private tdmRedScore = 0;
  private tdmTargetScore = 25;
  private tdmTimeRemaining = 180;
  private respawnQueue: Array<{ team: 'enemy' | 'ally'; type: EnemyType; timer: number }> = [];

  private missionStage = 0;
  private missionHackProgress = 0;
  private missionDepotHp = 150;

  private trainingTargetsHit = 0;
  private trainingScore = 0;
  private trainingBotsActive = false;

  // PvP Multiplayer state
  private pvpRoomCode = '';
  private pvpMode: PvpMode = 'ffa';
  private pvpLocalPlayerId = '';
  private pvpLocalTeam: PvpTeam = 'none';
  private pvpLocalAlive = true;
  private pvpRespawnRemaining = 0;
  private pvpTargetKills = 20;
  private pvpTimeRemaining = 300;
  private pvpBlueScore = 0;
  private pvpRedScore = 0;
  private remotePlayers = new Map<string, RemotePlayerAvatar>();
  private netMoveTimer = 0;

  // Agents & FX
  private agents: SoldierAgent[] = [];
  private agentSeq = 1;
  private tracers: TracerEffect[] = [];
  private particles: ParticleEffect[] = [];
  private activeGrenades: ActiveGrenade[] = [];
  private raycaster = new THREE.Raycaster();
  private hudEmitTimer = 0;

  // Shared FX materials/geometries
  private particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private grenadeGeo = new THREE.SphereGeometry(0.14, 10, 10);
  private grenadeMat = new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.5, metalness: 0.4 });

  constructor(
    container: HTMLElement,
    settings: GameSettings,
    progress: PlayerProgress,
    callbacks: FpsEngineCallbacks,
  ) {
    this.container = container;
    this.settings = { ...settings };
    this.progress = progress;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && settings.graphicsQuality === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, settings.graphicsQuality === 'high' ? 2 : 1.5),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && settings.graphicsQuality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, width / height, 0.08, 280);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Mandatory studio environment map for metallic PBR weapons/vehicles
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMapTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMapTex;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createBattlefieldTextures(maxAniso);
    this.world = buildBattlefieldWorld(this.scene, this.textures, settings.lighting, this.isSoftwareGl);
    this.weaponRig = createWeaponViewRig(this.camera);
    this.soldierRes = createSoldierResources(this.textures);

    this.weaponAmmo = this.createInitialAmmoState();

    // Set initial camera showcase pose for background menu
    this.camera.position.set(22, groundHeightAt(22, 26) + 9, 26);
    this.camera.lookAt(0, 2, -10);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private createInitialAmmoState(): Record<WeaponId, WeaponAmmoState> {
    const map = {} as Record<WeaponId, WeaponAmmoState>;
    for (const id of WEAPON_ORDER) {
      const stats = getEffectiveWeaponStats(id, this.progress);
      map[id] = {
        mag: stats.magSize,
        reserve: stats.reserveMax,
        maxMag: stats.magSize,
      };
    }
    return map;
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onWebglContextLost);
  }

  private unbindEvents() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebglContextLost);
  }

  private onWebglContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost();
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.phase === 'playing') {
      e.preventDefault();
    }
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (!locked && this.phase === 'playing') {
      // Only auto-pause on desktop when pointer lock exits if user isn't purely using touch
      const isTouchPrimary = this.settings.touchControls === 'on' ||
        (this.settings.touchControls === 'auto' && 'ontouchstart' in window && navigator.maxTouchPoints > 0);
      if (!isTouchPrimary) {
        this.isFiringHeld = false;
        this.isAdsHeld = false;
        this.callbacks.onPauseRequested();
      }
    }
    this.emitHud();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (this.phase !== 'playing') return;

    if (e.code === 'Escape') {
      this.callbacks.onPauseRequested();
      return;
    }
    if (e.code === 'KeyR') {
      this.triggerReload();
    } else if (e.code === 'Digit1') {
      this.switchWeapon('assault');
    } else if (e.code === 'Digit2') {
      this.switchWeapon('sniper');
    } else if (e.code === 'Digit3') {
      this.switchWeapon('shotgun');
    } else if (e.code === 'Digit4') {
      this.switchWeapon('smg');
    } else if (e.code === 'Digit5') {
      this.switchWeapon('pistol');
    } else if (e.code === 'KeyQ') {
      this.switchWeapon(this.prevWeapon);
    } else if (e.code === 'KeyG') {
      this.triggerGrenade();
    } else if (e.code === 'Space') {
      this.triggerJump();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing' || !this.pointerLocked) return;
    const adsScale = this.isAdsHeld
      ? this.activeWeapon === 'sniper'
        ? 0.35
        : 0.65
      : 1.0;
    const sens = 0.0022 * this.settings.mouseSensitivity * adsScale;
    this.playerYaw -= e.movementX * sens;
    this.playerPitch = THREE.MathUtils.clamp(
      this.playerPitch - e.movementY * sens,
      -Math.PI / 2 + 0.08,
      Math.PI / 2 - 0.08,
    );
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    // Ignore clicks on UI buttons
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button')) return;

    soundEngine.unlock();

    if (!this.pointerLocked && this.settings.touchControls !== 'on') {
      this.requestPointerLock();
    }

    if (e.button === 0) {
      this.isFiringHeld = true;
      this.tryFireWeapon();
    } else if (e.button === 2) {
      this.isAdsHeld = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isFiringHeld = false;
    } else if (e.button === 2) {
      this.isAdsHeld = false;
    }
  };

  public requestPointerLock() {
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore on unsupported mobile browsers
    }
  }

  public exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  // =========================================================================
  // PUBLIC CONTROLS & SETTINGS API
  // =========================================================================
  public updateSettings(newSettings: GameSettings) {
    this.settings = { ...newSettings };
    this.world.setLighting(newSettings.lighting);
    soundEngine.setVolume(newSettings.masterVolume);
    this.camera.fov = newSettings.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, newSettings.graphicsQuality === 'high' ? 2 : 1.5),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && newSettings.graphicsQuality === 'high';
  }

  public updateProgress(progress: PlayerProgress) {
    this.progress = progress;
  }

  public setPhase(phase: GamePhase) {
    this.phase = phase;
    if (phase === 'playing') {
      soundEngine.unlock();
      soundEngine.startAmbient();
      this.clock.getDelta(); // flush delta spike
    } else {
      this.isFiringHeld = false;
      this.isAdsHeld = false;
      this.keys = {};
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
      if (phase === 'menu' || phase === 'lobby' || phase === 'gameover' || phase === 'victory') {
        soundEngine.stopAmbient();
        this.exitPointerLock();
        if (phase === 'menu' || phase === 'lobby') {
          this.clearAgentsAndFx();
          this.world.setLighting(this.settings.lighting);
        }
      } else {
        this.exitPointerLock();
      }
    }
  }

  private get isPvpMode(): boolean {
    return this.mode === 'pvp_ffa' || this.mode === 'pvp_tdm';
  }

  public startMatch(mode: GameMode, initialWeapon: WeaponId = 'assault') {
    this.mode = mode;
    this.phase = 'playing';
    this.clearAgentsAndFx();
    this.world.resetTrainingTargets();

    // Reset explosive barrels
    for (const b of this.world.barrels) {
      b.exploded = false;
      b.hp = 45;
      b.mesh.visible = true;
    }

    // Reset pickups
    for (const p of this.world.pickups) {
      p.active = true;
      p.respawnTimer = 0;
    }

    // Reset player stats & ammo
    this.weaponAmmo = this.createInitialAmmoState();
    this.activeWeapon = initialWeapon;
    this.prevWeapon = initialWeapon === 'pistol' ? 'assault' : 'pistol';
    this.weaponRig.setActiveWeapon(initialWeapon);

    this.health = 100;
    this.armor = 50;
    this.stamina = 100;
    this.grenades = 3;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.dynamicSpread = 0;
    this.pitchRecoilOffset = 0;
    this.damageFlash = 0;
    this.damageSourcePos = null;
    this.killFeed = [];

    this.kills = 0;
    this.headshots = 0;
    this.deaths = 0;
    this.score = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.matchStartTime = this.elapsed;

    // Position player according to mode
    if (mode === 'training') {
      this.playerPos.set(-36, groundHeightAt(-36, 42), 42);
      this.playerYaw = Math.PI; // face +Z toward targets at z=56..78
      this.playerPitch = 0;
    } else if (mode === 'tdm') {
      this.playerPos.set(0, groundHeightAt(0, 38), 38);
      this.playerYaw = 0; // face -Z toward battlefield
      this.playerPitch = 0;
    } else {
      this.playerPos.set(0, groundHeightAt(0, 28), 28);
      this.playerYaw = 0;
      this.playerPitch = 0;
    }
    this.playerVelY = 0;
    this.playerGrounded = true;

    // Hide mission props by default
    this.world.missionTerminalMesh.visible = false;
    this.world.missionDepotMesh.visible = false;
    this.world.extractionBeaconMesh.visible = false;

    // Mode initialization
    if (mode === 'survival') {
      this.wave = 1;
      this.startSurvivalWave(1);
    } else if (mode === 'tdm') {
      this.tdmBlueScore = 0;
      this.tdmRedScore = 0;
      this.tdmTimeRemaining = 180;
      this.respawnQueue = [];
      for (let i = 0; i < 4; i++) {
        this.spawnSoldier('ally', 'ally', this.pickSpawnPoint('ally'));
      }
      const enemyTypes: EnemyType[] = ['rifleman', 'rifleman', 'rusher', 'sniper', 'heavy'];
      for (const et of enemyTypes) {
        this.spawnSoldier(et, 'enemy', this.pickSpawnPoint('enemy'));
      }
    } else if (mode === 'mission') {
      this.setupMissionStage(0);
    } else if (mode === 'training') {
      this.trainingTargetsHit = 0;
      this.trainingScore = 0;
      this.trainingBotsActive = false;
    }

    soundEngine.unlock();
    soundEngine.startAmbient();
    this.emitHud();
  }

  // =========================================================================
  // PVP MULTIPLAYER SESSION SETUP & NETWORK HANDLERS
  // =========================================================================
  public startMultiplayerMatch(
    room: RoomSnapshot,
    localPlayerId: string,
    initialWeapon: WeaponId = 'assault',
  ) {
    this.mode = room.mode === 'tdm' ? 'pvp_tdm' : 'pvp_ffa';
    this.phase = 'playing';
    this.clearAgentsAndFx();
    this.world.resetTrainingTargets();
    this.world.missionTerminalMesh.visible = false;
    this.world.missionDepotMesh.visible = false;
    this.world.extractionBeaconMesh.visible = false;

    this.pvpRoomCode = room.code;
    this.pvpMode = room.mode;
    this.pvpLocalPlayerId = localPlayerId;
    this.pvpTargetKills = room.targetKills;
    this.pvpTimeRemaining = room.timeRemaining;
    this.pvpBlueScore = room.blueScore;
    this.pvpRedScore = room.redScore;
    this.world.setLighting(room.lighting);

    // Sync barrels & pickups from authoritative room snapshot
    const explodedSet = new Set(room.explodedBarrels);
    for (const b of this.world.barrels) {
      b.exploded = explodedSet.has(b.id);
      b.hp = b.exploded ? 0 : 45;
      b.mesh.visible = !b.exploded;
    }
    const inactiveSet = new Set(room.inactivePickups);
    for (const p of this.world.pickups) {
      p.active = !inactiveSet.has(p.id);
      p.respawnTimer = 0;
    }

    this.weaponAmmo = this.createInitialAmmoState();
    this.activeWeapon = initialWeapon;
    this.prevWeapon = initialWeapon === 'pistol' ? 'assault' : 'pistol';
    this.weaponRig.setActiveWeapon(initialWeapon);

    const localNet = room.players.find((p) => p.id === localPlayerId);
    this.pvpLocalTeam = localNet?.team ?? 'none';
    this.pvpLocalAlive = localNet?.alive ?? true;
    this.pvpRespawnRemaining = localNet?.respawnRemaining ?? 0;

    this.health = localNet?.health ?? 100;
    this.armor = localNet?.armor ?? 50;
    this.stamina = 100;
    this.grenades = 2;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.dynamicSpread = 0;
    this.pitchRecoilOffset = 0;
    this.damageFlash = 0;
    this.damageSourcePos = null;
    this.killFeed = [];

    this.kills = localNet?.kills ?? 0;
    this.headshots = localNet?.headshots ?? 0;
    this.deaths = localNet?.deaths ?? 0;
    this.score = localNet?.score ?? 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.matchStartTime = this.elapsed;

    const sx = localNet?.x ?? 0;
    const sz = localNet?.z ?? 28;
    this.playerPos.set(sx, groundHeightAt(sx, sz), sz);
    this.playerYaw = localNet?.yaw ?? 0;
    this.playerPitch = 0;
    this.playerVelY = 0;
    this.playerGrounded = true;

    this.syncRemotePlayersFromRoster(room.players);
    soundEngine.unlock();
    soundEngine.startAmbient();
    this.emitHud();
  }

  private syncRemotePlayersFromRoster(players: NetworkPlayerInfo[]) {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.id === this.pvpLocalPlayerId) {
        this.pvpLocalTeam = p.team;
        this.pvpLocalAlive = p.alive;
        this.pvpRespawnRemaining = p.respawnRemaining;
        continue;
      }
      activeIds.add(p.id);
      const existing = this.remotePlayers.get(p.id);
      if (!existing) {
        const isAlly = this.pvpMode === 'tdm' && p.team === this.pvpLocalTeam;
        const avatarType: EnemyType = isAlly ? 'ally' : 'rusher';
        const parts = this.soldierRes.createSoldierMesh(avatarType, p.id);
        parts.group.traverse((child) => {
          if (child.userData.enemyId) {
            child.userData.remotePlayerId = p.id;
            delete child.userData.enemyId;
          }
        });
        const gy = groundHeightAt(p.x, p.z);
        parts.group.position.set(p.x, gy, p.z);
        parts.group.rotation.y = p.yaw + Math.PI;
        this.scene.add(parts.group);

        this.remotePlayers.set(p.id, {
          id: p.id,
          callsign: p.callsign,
          team: p.team,
          group: parts.group,
          leftLeg: parts.leftLeg,
          rightLeg: parts.rightLeg,
          rightArm: parts.rightArm,
          muzzlePoint: parts.muzzlePoint,
          targetPos: new THREE.Vector3(p.x, gy, p.z),
          targetYaw: p.yaw,
          targetPitch: p.pitch,
          weapon: p.weapon,
          health: p.health,
          maxHealth: 100,
          armor: p.armor,
          alive: p.alive,
          respawnRemaining: p.respawnRemaining,
          kills: p.kills,
          deaths: p.deaths,
          headshots: p.headshots,
          score: p.score,
          stridePhase: 0,
          lastDamagedTime: -10,
        });
      } else {
        existing.callsign = p.callsign;
        existing.team = p.team;
      }
    }

    for (const [id, avatar] of this.remotePlayers.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(avatar.group);
        this.remotePlayers.delete(id);
      }
    }
  }

  public applyRoomUpdate(room: RoomSnapshot) {
    if (!this.isPvpMode) return;
    this.pvpTimeRemaining = room.timeRemaining;
    this.pvpBlueScore = room.blueScore;
    this.pvpRedScore = room.redScore;
    this.world.setLighting(room.lighting);
    this.syncRemotePlayersFromRoster(room.players);
  }

  public applyNetworkStateTick(payload: {
    timeRemaining: number;
    blueScore: number;
    redScore: number;
    players: StateTickPlayer[];
  }) {
    if (!this.isPvpMode) return;
    this.pvpTimeRemaining = payload.timeRemaining;
    this.pvpBlueScore = payload.blueScore;
    this.pvpRedScore = payload.redScore;

    for (const sp of payload.players) {
      if (sp.id === this.pvpLocalPlayerId) {
        this.health = sp.health;
        this.armor = sp.armor;
        this.pvpLocalAlive = sp.alive;
        this.pvpRespawnRemaining = sp.respawnRemaining;
        this.kills = sp.kills;
        this.deaths = sp.deaths;
        this.headshots = sp.headshots;
        this.score = sp.score;
        continue;
      }
      const avatar = this.remotePlayers.get(sp.id);
      if (!avatar) continue;
      avatar.targetPos.set(sp.x, groundHeightAt(sp.x, sp.z), sp.z);
      avatar.targetYaw = sp.yaw;
      avatar.targetPitch = sp.pitch;
      avatar.weapon = sp.weapon;
      avatar.health = sp.health;
      avatar.armor = sp.armor;
      avatar.alive = sp.alive;
      avatar.respawnRemaining = sp.respawnRemaining;
      avatar.kills = sp.kills;
      avatar.deaths = sp.deaths;
      avatar.headshots = sp.headshots;
      avatar.score = sp.score;
    }
  }

  public applyRemoteCombatFx(fx: CombatFxPayload) {
    if (!this.isPvpMode || fx.shooterId === this.pvpLocalPlayerId) return;
    const dist = Math.hypot(fx.muzzleX - this.playerPos.x, fx.muzzleZ - this.playerPos.z);
    const atten = THREE.MathUtils.clamp(1 - dist / 85, 0.08, 0.8);
    soundEngine.playGunshot(fx.weapon, atten);
    this.spawnTracer(
      new THREE.Vector3(fx.muzzleX, fx.muzzleY, fx.muzzleZ),
      new THREE.Vector3(fx.hitX, fx.hitY, fx.hitZ),
      0xff9f43,
    );
  }

  public applyRemoteHit(hit: CombatHitPayload) {
    if (!this.isPvpMode) return;
    if (hit.targetId === this.pvpLocalPlayerId) {
      this.health = hit.health;
      this.armor = hit.armor;
      this.damageFlash = 1.0;
      this.damageSourcePos = new THREE.Vector3(hit.sourceX, this.playerPos.y, hit.sourceZ);
      soundEngine.playPlayerHurt();
    } else if (hit.attackerId === this.pvpLocalPlayerId) {
      const targetAvatar = this.remotePlayers.get(hit.targetId);
      if (targetAvatar) targetAvatar.lastDamagedTime = this.elapsed;
      this.hitMarkerType = hit.headshot ? 'head' : 'body';
      this.hitMarkerTimer = 0.18;
      soundEngine.playHitMarker(hit.headshot);
    }
  }

  public applyRemoteKill(kill: CombatKillPayload) {
    if (!this.isPvpMode) return;
    this.pvpBlueScore = kill.blueScore;
    this.pvpRedScore = kill.redScore;
    const isLocalKiller = kill.killerId === this.pvpLocalPlayerId;
    if (isLocalKiller) {
      this.hitMarkerType = 'kill';
      this.hitMarkerTimer = 0.24;
      soundEngine.playHitMarker(true);
    }
    this.pushKillFeed(kill.killerName, kill.victimName, kill.weapon, kill.headshot, isLocalKiller);
  }

  public applyRemoteRespawn(payload: { playerId: string; x: number; y: number; z: number; yaw: number }) {
    if (!this.isPvpMode) return;
    const gy = groundHeightAt(payload.x, payload.z);
    if (payload.playerId === this.pvpLocalPlayerId) {
      this.pvpLocalAlive = true;
      this.pvpRespawnRemaining = 0;
      this.health = 100;
      this.armor = 50;
      this.playerPos.set(payload.x, gy, payload.z);
      this.playerYaw = payload.yaw;
      this.playerPitch = 0;
      this.weaponAmmo = this.createInitialAmmoState();
      this.isReloading = false;
      soundEngine.playPickup();
    } else {
      const avatar = this.remotePlayers.get(payload.playerId);
      if (avatar) {
        avatar.alive = true;
        avatar.health = 100;
        avatar.targetPos.set(payload.x, gy, payload.z);
        avatar.group.position.set(payload.x, gy, payload.z);
        avatar.group.rotation.x = 0;
      }
    }
  }

  public applyRemoteBarrel(payload: { barrelId: string; x: number; y: number; z: number }) {
    const barrel = this.world.barrels.find((b) => b.id === payload.barrelId);
    if (barrel && !barrel.exploded) {
      barrel.exploded = true;
      barrel.mesh.visible = false;
    }
    this.applyRemoteExplosion({ x: payload.x, y: payload.y, z: payload.z });
  }

  public applyRemoteExplosion(payload: { x: number; y: number; z: number }) {
    const center = new THREE.Vector3(payload.x, payload.y, payload.z);
    const dist = center.distanceTo(this.playerPos);
    const atten = THREE.MathUtils.clamp(1 - dist / 75, 0.12, 1.0);
    soundEngine.playExplosion(atten);
    this.spawnParticles(center, 0xff6b1a, 24, 10);
    this.spawnParticles(center, 0x334155, 14, 6);
  }

  public applyRemotePickup(payload: { pickupId: string; active: boolean }) {
    const p = this.world.pickups.find((item) => item.id === payload.pickupId);
    if (p) {
      p.active = payload.active;
      p.respawnTimer = payload.active ? 0 : 18;
    }
  }

  // Mobile Touch Control APIs
  public setMobileMove(x: number, y: number) {
    this.mobileMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.mobileMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addMobileLookDelta(dx: number, dy: number) {
    if (this.phase !== 'playing') return;
    const adsScale = this.isAdsHeld ? (this.activeWeapon === 'sniper' ? 0.35 : 0.65) : 1.0;
    const sens = 0.0042 * this.settings.mouseSensitivity * adsScale;
    this.playerYaw -= dx * sens;
    this.playerPitch = THREE.MathUtils.clamp(
      this.playerPitch - dy * sens,
      -Math.PI / 2 + 0.08,
      Math.PI / 2 - 0.08,
    );
  }

  public setMobileFiring(firing: boolean) {
    this.isFiringHeld = firing;
    if (firing && this.phase === 'playing') {
      soundEngine.unlock();
      this.tryFireWeapon();
    }
  }

  public setMobileAds(ads: boolean) {
    this.isAdsHeld = ads;
  }

  public triggerJump() {
    if (this.phase === 'playing' && this.playerGrounded) {
      this.playerVelY = 7.4;
      this.playerGrounded = false;
    }
  }

  public triggerReload() {
    if (this.phase !== 'playing' || this.isReloading) return;
    const ammo = this.weaponAmmo[this.activeWeapon];
    if (ammo.mag >= ammo.maxMag || ammo.reserve <= 0) return;

    const stats = getEffectiveWeaponStats(this.activeWeapon, this.progress);
    this.isReloading = true;
    this.reloadDuration = stats.reloadTime;
    this.reloadTimer = stats.reloadTime;
    soundEngine.playReload(stats.reloadTime);
  }

  public switchWeapon(id: WeaponId) {
    if (this.activeWeapon === id) return;
    this.prevWeapon = this.activeWeapon;
    this.activeWeapon = id;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAdsHeld = false;
    this.weaponRig.setActiveWeapon(id);
    this.emitHud();
  }

  public cycleWeapon() {
    const idx = WEAPON_ORDER.indexOf(this.activeWeapon);
    const next = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length];
    this.switchWeapon(next);
  }

  public toggleTrainingBots() {
    if (this.mode !== 'training') return;
    this.trainingBotsActive = !this.trainingBotsActive;
    if (this.trainingBotsActive) {
      this.spawnSoldier('rifleman', 'enemy', new THREE.Vector3(-12, groundHeightAt(-12, 24), 24));
      this.spawnSoldier('rusher', 'enemy', new THREE.Vector3(-4, groundHeightAt(-4, 10), 10));
      this.spawnSoldier('heavy', 'enemy', new THREE.Vector3(8, groundHeightAt(8, -6), -6));
    } else {
      for (const a of this.agents) {
        this.scene.remove(a.group);
      }
      this.agents = [];
    }
    this.emitHud();
  }

  public triggerGrenade() {
    if (this.phase !== 'playing' || this.grenades <= 0) return;
    this.grenades -= 1;

    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.castShadow = true;
    this.camera.getWorldDirection(_shotDir);
    mesh.position.copy(this.camera.position).addScaledVector(_shotDir, 0.8);
    this.scene.add(mesh);

    const vel = _shotDir.clone().multiplyScalar(20);
    vel.y += 4.5;
    this.activeGrenades.push({ mesh, vel, fuse: 1.8 });
    this.emitHud();
  }

  // =========================================================================
  // WAVE, TDM & MISSION SPAWNERS
  // =========================================================================
  private startSurvivalWave(waveNum: number) {
    this.wave = waveNum;
    this.waveIntermission = 0;
    this.waveToSpawn = 4 + waveNum * 2;
    this.waveSpawnTimer = 0.4;
    soundEngine.playWaveHorn();
  }

  private pickEnemyTypeForWave(waveNum: number): EnemyType {
    const r = Math.random();
    if (waveNum >= 3 && r < 0.18) return 'heavy';
    if (waveNum >= 2 && r < 0.36) return 'sniper';
    if (r < 0.62) return 'rusher';
    return 'rifleman';
  }

  private pickSpawnPoint(team: 'enemy' | 'ally'): THREE.Vector3 {
    if (this.mode === 'tdm') {
      const zBase = team === 'ally' ? 42 : -44;
      const x = (Math.random() - 0.5) * 48;
      const z = zBase + (Math.random() - 0.5) * 14;
      return new THREE.Vector3(x, groundHeightAt(x, z), z);
    }

    // Spawn outside immediate player radius (34..68m away)
    for (let attempt = 0; attempt < 15; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 36 + Math.random() * 32;
      const x = THREE.MathUtils.clamp(this.playerPos.x + Math.cos(angle) * dist, -PLAYABLE_LIMIT + 8, PLAYABLE_LIMIT - 8);
      const z = THREE.MathUtils.clamp(this.playerPos.z + Math.sin(angle) * dist, -PLAYABLE_LIMIT + 8, PLAYABLE_LIMIT - 8);
      if (Math.hypot(x - this.playerPos.x, z - this.playerPos.z) > 26) {
        return new THREE.Vector3(x, groundHeightAt(x, z), z);
      }
    }
    return new THREE.Vector3(0, groundHeightAt(0, -45), -45);
  }

  private spawnSoldier(type: EnemyType, team: 'enemy' | 'ally', pos: THREE.Vector3) {
    const id = `agent_${this.agentSeq++}`;
    const arch = SOLDIER_ARCHETYPES[type];
    const parts = this.soldierRes.createSoldierMesh(type, id);
    const y = groundHeightAt(pos.x, pos.z);
    parts.group.position.set(pos.x, y, pos.z);
    this.scene.add(parts.group);

    // Slight wave scaling in Survival
    const hpMult = this.mode === 'survival' ? 1 + (this.wave - 1) * 0.12 : 1;

    this.agents.push({
      id,
      type,
      team,
      archetype: arch,
      ...parts,
      hp: Math.round(arch.maxHp * hpMult),
      maxHp: Math.round(arch.maxHp * hpMult),
      alive: true,
      deathTimer: 0,
      state: 'patrol',
      patrolTarget: pickRandomPatrolPoint(),
      coverTarget: null,
      coverStayTimer: 0,
      fireCooldown: 0.6 + Math.random() * 0.6,
      hitFlashTimer: 0,
      stridePhase: Math.random() * Math.PI * 2,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 1.5,
      lastDamagedTime: -10,
    });
  }

  private setupMissionStage(stage: number) {
    this.missionStage = stage;
    this.missionHackProgress = 0;

    if (stage === 0) {
      // Clear forward outpost guards
      const spots: Array<[number, number, EnemyType]> = [
        [-8, -6, 'rifleman'],
        [8, -8, 'rifleman'],
        [0, -16, 'rifleman'],
        [14, -18, 'rusher'],
        [-14, -14, 'rusher'],
        [4, -28, 'sniper'],
      ];
      for (const [x, z, t] of spots) {
        this.spawnSoldier(t, 'enemy', new THREE.Vector3(x, 0, z));
      }
    } else if (stage === 1) {
      // Hack comms terminal at (0, -14)
      this.world.missionTerminalMesh.visible = true;
      this.spawnSoldier('rusher', 'enemy', new THREE.Vector3(-22, 0, -12));
      this.spawnSoldier('rifleman', 'enemy', new THREE.Vector3(24, 0, -14));
      this.spawnSoldier('rifleman', 'enemy', new THREE.Vector3(0, 0, -38));
    } else if (stage === 2) {
      // Destroy NW Bunker Commander & Munitions Depot (-48, -42)
      this.world.missionTerminalMesh.visible = false;
      this.world.missionDepotMesh.visible = true;
      this.missionDepotHp = 150;
      this.spawnSoldier('heavy', 'enemy', new THREE.Vector3(-44, 0, -40));
      this.spawnSoldier('rifleman', 'enemy', new THREE.Vector3(-52, 0, -34));
      this.spawnSoldier('sniper', 'enemy', new THREE.Vector3(-36, 0, -52));
    } else if (stage === 3) {
      // Reach Extraction LZ at (48, 44)
      this.world.missionDepotMesh.visible = false;
      this.world.extractionBeaconMesh.visible = true;
      this.spawnSoldier('rusher', 'enemy', new THREE.Vector3(26, 0, 22));
      this.spawnSoldier('rifleman', 'enemy', new THREE.Vector3(42, 0, 32));
      this.spawnSoldier('heavy', 'enemy', new THREE.Vector3(52, 0, 38));
      soundEngine.playWaveHorn();
    }
  }

  private getMissionInfo(): MissionStageInfo | null {
    if (this.mode !== 'mission') return null;
    if (this.missionStage === 0) {
      const aliveEnemies = this.agents.filter((a) => a.team === 'enemy' && a.alive).length;
      return {
        stageIndex: 1,
        totalStages: 4,
        title: 'Clear Forward Compound',
        description: `Eliminate hostile garrison (${aliveEnemies} remaining)`,
        progress: Math.max(0, (6 - aliveEnemies) / 6),
        targetLabel: 'Central Compound (0, -14)',
      };
    }
    if (this.missionStage === 1) {
      return {
        stageIndex: 2,
        totalStages: 4,
        title: 'Uplink Comms Terminal',
        description: 'Hold position inside the blue terminal ring to decrypt intel',
        progress: this.missionHackProgress,
        targetLabel: 'Comms Terminal (0, -14)',
      };
    }
    if (this.missionStage === 2) {
      const heavyAlive = this.agents.some((a) => a.team === 'enemy' && a.type === 'heavy' && a.alive);
      return {
        stageIndex: 3,
        totalStages: 4,
        title: 'Eliminate Bunker Commander',
        description: heavyAlive
          ? 'Defeat the Heavy Juggernaut at NW Bunker'
          : 'Bunker Commander neutralized',
        progress: heavyAlive ? 0.25 : 1,
        targetLabel: 'NW Bunker Ridge (-48, -44)',
      };
    }
    return {
      stageIndex: 4,
      totalStages: 4,
      title: 'Extract at Helipad LZ',
      description: 'Reach the green extraction beacon in the South-East sector',
      progress: 0.9,
      targetLabel: 'Extraction LZ (48, 44)',
    };
  }

  // =========================================================================
  // COMBAT, RAYCAST SHOOTING & EXPLOSIONS
  // =========================================================================
  private tryFireWeapon() {
    if (this.fireTimer > 0 || this.isReloading) return;
    if (this.isPvpMode && !this.pvpLocalAlive) return;

    const ammo = this.weaponAmmo[this.activeWeapon];
    if (ammo.mag <= 0) {
      this.fireTimer = 0.25;
      soundEngine.playEmptyClick();
      if (ammo.reserve > 0) this.triggerReload();
      return;
    }

    const stats = getEffectiveWeaponStats(this.activeWeapon, this.progress);
    this.fireTimer = 1 / stats.fireRate;
    ammo.mag -= 1;
    this.shotsFired += 1;

    soundEngine.playGunshot(this.activeWeapon, 1.0);
    this.weaponRig.triggerShootRecoil(stats.recoilKick);
    this.weaponRig.getMuzzleWorldPosition(_muzzlePos);

    // Apply upward camera recoil kick
    this.pitchRecoilOffset = Math.min(0.14, this.pitchRecoilOffset + stats.recoilPitch);
    this.dynamicSpread = Math.min(0.06, this.dynamicSpread + stats.spreadHip * 0.45);

    const baseSpread = this.isAdsHeld ? stats.spreadAds : stats.spreadHip + this.dynamicSpread;

    // Collect shootable meshes: world geometry + alive enemy hitboxes or remote PvP players
    const targets: THREE.Object3D[] = [...this.world.shootableMeshes];
    if (this.isPvpMode) {
      for (const avatar of this.remotePlayers.values()) {
        if (!avatar.alive) continue;
        if (this.pvpMode === 'tdm' && avatar.team === this.pvpLocalTeam) continue;
        targets.push(avatar.group);
      }
    } else {
      for (const a of this.agents) {
        if (a.alive && a.team === 'enemy') {
          targets.push(a.group);
        }
      }
    }

    let anyHit = false;
    let bestHitType: 'body' | 'head' | 'kill' | null = null;

    for (let p = 0; p < stats.pellets; p++) {
      this.camera.getWorldDirection(_shotDir);
      _shotDir.x += (Math.random() - 0.5) * baseSpread * 2;
      _shotDir.y += (Math.random() - 0.5) * baseSpread * 2;
      _shotDir.z += (Math.random() - 0.5) * baseSpread * 2;
      _shotDir.normalize();

      this.raycaster.set(this.camera.position, _shotDir);
      this.raycaster.near = 0.2;
      this.raycaster.far = stats.range;

      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        _hitPos.copy(hit.point);
        this.spawnTracer(_muzzlePos, _hitPos, 0xffd166);

        const ud = hit.object.userData;
        if (this.isPvpMode && ud.remotePlayerId) {
          anyHit = true;
          const isHead = ud.hitZone === 'head';
          this.spawnParticles(_hitPos, 0xdc2626, 4, 3.2);
          multiplayerClient.sendShoot({
            weapon: this.activeWeapon,
            muzzleX: _muzzlePos.x,
            muzzleY: _muzzlePos.y,
            muzzleZ: _muzzlePos.z,
            hitX: _hitPos.x,
            hitY: _hitPos.y,
            hitZ: _hitPos.z,
            targetPlayerId: ud.remotePlayerId,
            hitZone: isHead ? 'head' : 'body',
          });
        } else if (ud.enemyId) {
          anyHit = true;
          const agent = this.agents.find((a) => a.id === ud.enemyId);
          if (agent && agent.alive) {
            const isHead = ud.hitZone === 'head';
            const dmg = Math.round(stats.damage * (isHead ? 2.0 : 1.0));
            const killed = this.damageSoldier(agent, dmg, isHead, 'Player', stats.shortName);
            this.spawnParticles(_hitPos, 0xdc2626, 4, 3.2);
            if (killed) bestHitType = 'kill';
            else if (isHead && bestHitType !== 'kill') bestHitType = 'head';
            else if (!bestHitType) bestHitType = 'body';
          }
        } else if (ud.barrelId) {
          anyHit = true;
          const barrel = this.world.barrels.find((b) => b.id === ud.barrelId);
          if (barrel && !barrel.exploded) {
            barrel.hp -= stats.damage;
            this.spawnParticles(_hitPos, 0xfbbf24, 5, 4);
            if (barrel.hp <= 0) {
              if (this.isPvpMode) {
                barrel.exploded = true;
                barrel.mesh.visible = false;
                multiplayerClient.send({
                  type: 'player:barrel',
                  barrelId: barrel.id,
                  x: barrel.position.x,
                  y: barrel.position.y,
                  z: barrel.position.z,
                });
              } else {
                this.detonateExplosion(barrel.position, 9.5, 160, 'Fuel Barrel');
                barrel.exploded = true;
                barrel.mesh.visible = false;
              }
            }
          }
          if (this.isPvpMode) {
            multiplayerClient.sendShoot({
              weapon: this.activeWeapon,
              muzzleX: _muzzlePos.x,
              muzzleY: _muzzlePos.y,
              muzzleZ: _muzzlePos.z,
              hitX: _hitPos.x,
              hitY: _hitPos.y,
              hitZ: _hitPos.z,
            });
          }
        } else if (ud.trainingTargetId) {
          anyHit = true;
          const tgt = this.world.trainingTargets.find((t) => t.id === ud.trainingTargetId);
          if (tgt && tgt.downTimer <= 0) {
            tgt.downTimer = 2.6;
            this.trainingTargetsHit += 1;
            const pts = tgt.distanceLabel * 5 + (tgt.oscillateAmp > 0 ? 50 : 0);
            this.trainingScore += pts;
            this.score += pts;
            bestHitType = 'head';
            this.spawnParticles(_hitPos, 0x38bdf8, 8, 5);
          }
        } else {
          this.spawnParticles(_hitPos, 0xcbd5e1, 3, 2.5);
          if (this.isPvpMode) {
            multiplayerClient.sendShoot({
              weapon: this.activeWeapon,
              muzzleX: _muzzlePos.x,
              muzzleY: _muzzlePos.y,
              muzzleZ: _muzzlePos.z,
              hitX: _hitPos.x,
              hitY: _hitPos.y,
              hitZ: _hitPos.z,
            });
          }
        }
      } else {
        _hitPos.copy(this.camera.position).addScaledVector(_shotDir, Math.min(70, stats.range));
        this.spawnTracer(_muzzlePos, _hitPos, 0xffd166);
        if (this.isPvpMode) {
          multiplayerClient.sendShoot({
            weapon: this.activeWeapon,
            muzzleX: _muzzlePos.x,
            muzzleY: _muzzlePos.y,
            muzzleZ: _muzzlePos.z,
            hitX: _hitPos.x,
            hitY: _hitPos.y,
            hitZ: _hitPos.z,
          });
        }
      }
    }

    if (anyHit) {
      this.shotsHit += 1;
    }
    if (bestHitType) {
      this.hitMarkerType = bestHitType;
      this.hitMarkerTimer = 0.18;
      soundEngine.playHitMarker(bestHitType === 'head' || bestHitType === 'kill');
    }
  }

  private damageSoldier(
    agent: SoldierAgent,
    damage: number,
    isHeadshot: boolean,
    killerName: string,
    weaponName: string,
  ): boolean {
    if (!agent.alive) return false;
    agent.hp -= damage;
    agent.lastDamagedTime = this.elapsed;

    if (agent.hp <= 0) {
      agent.hp = 0;
      agent.alive = false;
      agent.deathTimer = 0;

      if (killerName === 'Player') {
        this.kills += 1;
        if (isHeadshot) this.headshots += 1;
        this.score += agent.archetype.scoreValue + (isHeadshot ? 50 : 0);
      }

      if (this.mode === 'tdm') {
        if (agent.team === 'enemy') {
          this.tdmBlueScore += 1;
          this.respawnQueue.push({ team: 'enemy', type: agent.type, timer: 4.0 });
        } else {
          this.tdmRedScore += 1;
          this.respawnQueue.push({ team: 'ally', type: 'ally', timer: 4.0 });
        }
      }

      // Chance to drop medkit or ammo on death
      if (agent.team === 'enemy' && Math.random() < 0.42) {
        const dropType = Math.random() < 0.48 ? 'ammo' : Math.random() < 0.75 ? 'health' : 'armor';
        this.world.spawnPickupAt(dropType, agent.group.position.clone(), true);
      }

      this.pushKillFeed(killerName, agent.archetype.label, weaponName, isHeadshot, killerName === 'Player');
      return true;
    }
    return false;
  }

  private detonateExplosion(center: THREE.Vector3, radius: number, maxDamage: number, sourceLabel: string) {
    const distToPlayer = center.distanceTo(this.playerPos);
    const atten = THREE.MathUtils.clamp(1 - distToPlayer / 75, 0.12, 1.0);
    soundEngine.playExplosion(atten);

    this.spawnParticles(center, 0xff6b1a, 24, 10);
    this.spawnParticles(center, 0x334155, 14, 6);

    // Damage enemies in blast radius
    for (const a of this.agents) {
      if (!a.alive || a.team !== 'enemy') continue;
      const d = a.group.position.distanceTo(center);
      if (d <= radius) {
        const dmg = Math.round(maxDamage * (1 - d / radius));
        this.damageSoldier(a, dmg, false, 'Player', sourceLabel);
      }
    }

    // Damage player if too close
    if (distToPlayer <= radius * 0.85) {
      const pDmg = Math.round(maxDamage * 0.45 * (1 - distToPlayer / radius));
      this.applyPlayerDamage(pDmg, center);
    }
  }

  private applyPlayerDamage(amount: number, sourcePos: THREE.Vector3) {
    if (this.phase !== 'playing' || amount <= 0) return;

    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.ceil(remaining * 0.65));
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    this.damageFlash = 1.0;
    this.damageSourcePos = sourcePos.clone();
    soundEngine.playPlayerHurt();

    if (this.health <= 0) {
      if (this.mode === 'tdm') {
        // Respawn player in TDM after brief instant reset + credit enemy point
        this.deaths += 1;
        this.tdmRedScore += 1;
        this.health = 100;
        this.armor = 50;
        this.playerPos.set((Math.random() - 0.5) * 20, groundHeightAt(0, 40), 40);
        this.pushKillFeed('Enemy Squad', 'You', 'Rifle', false, false);
      } else if (this.mode === 'training') {
        this.health = 100;
      } else {
        this.finishMatch('gameover', 'Operator KIA in the line of duty');
      }
    }
  }

  private pushKillFeed(
    killer: string,
    victim: string,
    weapon: string,
    headshot: boolean,
    isPlayerKiller: boolean,
  ) {
    this.killFeed.unshift({
      id: this.killFeedSeq++,
      killer,
      victim,
      weapon,
      headshot,
      isPlayerKiller,
      timestamp: this.elapsed,
    });
    if (this.killFeed.length > 5) this.killFeed.pop();
  }

  private finishMatch(outcome: 'victory' | 'gameover', reason: string) {
    const duration = Math.max(1, Math.round(this.elapsed - this.matchStartTime));
    const accuracy = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    const baseCredits = Math.round(this.score * 0.14) + this.kills * 15 + (outcome === 'victory' ? 200 : 40);

    this.setPhase(outcome);
    this.callbacks.onMatchEnd({
      mode: this.mode,
      outcome,
      reason,
      kills: this.kills,
      headshots: this.headshots,
      score: this.score,
      waveReached: this.wave,
      accuracy,
      creditsEarned: baseCredits,
      durationSeconds: duration,
    });
  }

  // =========================================================================
  // VISUAL FX (TRACERS & PARTICLES)
  // =========================================================================
  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08, maxLife: 0.08 });
  }

  private spawnParticles(origin: THREE.Vector3, colorHex: number, count: number, speed: number) {
    const maxCount = this.isSoftwareGl ? Math.min(count, 6) : count;
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
    for (let i = 0; i < maxCount; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.copy(origin);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * speed * 2,
        Math.random() * speed * 1.3,
        (Math.random() - 0.5) * speed * 2,
      );
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, life: 0.45, maxLife: 0.45, scaleRate: 1.5 });
    }
  }

  private clearAgentsAndFx() {
    for (const a of this.agents) {
      this.scene.remove(a.group);
    }
    this.agents = [];
    for (const avatar of this.remotePlayers.values()) {
      this.scene.remove(avatar.group);
    }
    this.remotePlayers.clear();
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.tracers = [];
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
    }
    this.particles = [];
    for (const g of this.activeGrenades) {
      this.scene.remove(g.mesh);
    }
    this.activeGrenades = [];
  }

  // =========================================================================
  // MAIN GAME LOOP
  // =========================================================================
  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.elapsed += dt;

      if (this.phase === 'menu') {
        // Gentle orbital camera flyover around the tactical compound
        const angle = this.elapsed * 0.08;
        const r = 42;
        const cx = Math.cos(angle) * r;
        const cz = Math.sin(angle) * r;
        this.camera.position.set(cx, groundHeightAt(cx, cz) + 14, cz);
        this.camera.lookAt(0, 2.5, -8);
        this.weaponRig.root.visible = false;
      } else if (this.phase === 'playing') {
        this.weaponRig.root.visible = true;
        this.updatePlaying(dt);
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updatePlaying(dt: number) {
    const stats = getEffectiveWeaponStats(this.activeWeapon, this.progress);
    const canAct = !this.isPvpMode || this.pvpLocalAlive;

    // 1. Player Movement & Physics
    const moveFwd = canAct ? (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0) + this.mobileMoveY : 0;
    const moveRight = canAct ? (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0) + this.mobileMoveX : 0;
    const wantsMove = canAct && (Math.abs(moveFwd) > 0.05 || Math.abs(moveRight) > 0.05);
    const wantsSprint =
      canAct && Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && moveFwd > 0.2 && !this.isAdsHeld;

    let isSprinting = false;
    if (wantsSprint && this.stamina > 4) {
      isSprinting = true;
      this.stamina = Math.max(0, this.stamina - dt * 22);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 15);
    }

    const baseSpeed = 6.8 * stats.moveSpeedMult;
    const moveSpeed = isSprinting ? baseSpeed * 1.48 : this.isAdsHeld ? baseSpeed * 0.62 : baseSpeed;

    _forward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
    _right.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
    _moveVec.set(0, 0, 0).addScaledVector(_forward, moveFwd).addScaledVector(_right, moveRight);
    if (_moveVec.lengthSq() > 1) _moveVec.normalize();

    if (canAct) {
      this.playerPos.x += _moveVec.x * moveSpeed * dt;
      this.playerPos.z += _moveVec.z * moveSpeed * dt;
      resolveHorizontalCollision(this.playerPos, 0.55, this.world.colliders, this.playerPos.y);
    }

    // Vertical gravity & ground height
    const groundY = groundHeightAt(this.playerPos.x, this.playerPos.z);
    if (!this.playerGrounded) {
      this.playerVelY -= 20 * dt;
      this.playerPos.y += this.playerVelY * dt;
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.playerVelY = 0;
        this.playerGrounded = true;
      }
    } else {
      this.playerPos.y = groundY;
    }

    // Footstep sound & head bob
    if (wantsMove && this.playerGrounded) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = isSprinting ? 0.31 : 0.46;
        soundEngine.playFootstep(isSprinting);
      }
    }

    // Smooth camera FOV for ADS / Sprint
    const targetFov =
      canAct && this.isAdsHeld
        ? stats.adsFov
        : isSprinting
          ? this.settings.fov + 5
          : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    // Smooth recoil recovery
    this.pitchRecoilOffset = THREE.MathUtils.damp(this.pitchRecoilOffset, 0, 12, dt);
    this.dynamicSpread = THREE.MathUtils.damp(this.dynamicSpread, 0, 8, dt);

    const eyeHeight = !canAct
      ? 0.45
      : 1.68 + (wantsMove && this.playerGrounded ? Math.sin(this.elapsed * (isSprinting ? 14 : 9)) * 0.035 : 0);
    this.camera.position.set(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
    _euler.set(
      THREE.MathUtils.clamp(this.playerPitch + this.pitchRecoilOffset, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05),
      this.playerYaw,
      0,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(_euler);

    // Stream local transform to server at ~20Hz in PvP
    if (this.isPvpMode) {
      this.netMoveTimer += dt;
      if (this.netMoveTimer >= 0.05) {
        this.netMoveTimer = 0;
        multiplayerClient.sendMove({
          x: this.playerPos.x,
          y: this.playerPos.y,
          z: this.playerPos.z,
          yaw: this.playerYaw,
          pitch: this.playerPitch,
          weapon: this.activeWeapon,
          isSprinting,
          isAds: this.isAdsHeld,
        });
      }
    }

    // 2. Weapon Firing & Reload
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (canAct && this.isFiringHeld && stats.automatic && !this.isReloading) {
      this.tryFireWeapon();
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const ammo = this.weaponAmmo[this.activeWeapon];
        const needed = ammo.maxMag - ammo.mag;
        const load = this.mode === 'training' ? needed : Math.min(needed, ammo.reserve);
        ammo.mag += load;
        if (this.mode !== 'training') ammo.reserve -= load;
      }
    }

    this.weaponRig.root.visible = canAct;
    const reloadProg = this.isReloading ? 1 - this.reloadTimer / this.reloadDuration : 0;
    this.weaponRig.updateAnimation(
      dt,
      this.elapsed,
      wantsMove,
      isSprinting,
      this.isAdsHeld,
      this.isReloading,
      reloadProg,
      this.activeWeapon,
    );

    // 3. Pickups collection
    if (canAct) {
      for (const p of this.world.pickups) {
        if (!p.active) continue;
        const dist = Math.hypot(p.position.x - this.playerPos.x, p.position.z - this.playerPos.z);
        if (dist < 1.8) {
          let consumed = false;
          if (p.type === 'health' && this.health < this.maxHealth) {
            if (!this.isPvpMode) this.health = Math.min(this.maxHealth, this.health + 40);
            consumed = true;
          } else if (p.type === 'armor' && this.armor < this.maxArmor) {
            if (!this.isPvpMode) this.armor = Math.min(this.maxArmor, this.armor + 35);
            consumed = true;
          } else if (p.type === 'ammo') {
            const ammo = this.weaponAmmo[this.activeWeapon];
            const statsActive = getEffectiveWeaponStats(this.activeWeapon, this.progress);
            ammo.reserve = Math.min(statsActive.reserveMax, ammo.reserve + statsActive.magSize * 2);
            this.grenades = Math.min(4, this.grenades + 1);
            consumed = true;
          }
          if (consumed) {
            p.active = false;
            p.respawnTimer = 18;
            soundEngine.playPickup();
            if (this.isPvpMode) {
              multiplayerClient.send({ type: 'player:pickup', pickupId: p.id, pickupType: p.type });
            }
          }
        }
      }
    }

    // 4. World & Grenade Physics
    this.world.updateWorldProps(dt, this.elapsed);

    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const gy = groundHeightAt(g.mesh.position.x, g.mesh.position.z) + 0.14;
      if (g.mesh.position.y < gy) {
        g.mesh.position.y = gy;
        g.vel.y *= -0.45;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      }
      if (g.fuse <= 0) {
        if (this.isPvpMode) {
          multiplayerClient.send({
            type: 'player:grenade',
            x: g.mesh.position.x,
            y: g.mesh.position.y,
            z: g.mesh.position.z,
          });
        } else {
          this.detonateExplosion(g.mesh.position.clone(), 10.5, 175, 'Frag Grenade');
        }
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
      }
    }

    // 5. Mode-specific Progression & Remote Player Interpolation
    if (this.isPvpMode) {
      for (const avatar of this.remotePlayers.values()) {
        if (!avatar.alive) {
          avatar.group.rotation.x = THREE.MathUtils.damp(avatar.group.rotation.x, -Math.PI / 2, 10, dt);
          continue;
        }
        avatar.group.rotation.x = THREE.MathUtils.damp(avatar.group.rotation.x, 0, 12, dt);
        const prevX = avatar.group.position.x;
        const prevZ = avatar.group.position.z;
        avatar.group.position.x = THREE.MathUtils.damp(avatar.group.position.x, avatar.targetPos.x, 14, dt);
        avatar.group.position.y = THREE.MathUtils.damp(avatar.group.position.y, avatar.targetPos.y, 14, dt);
        avatar.group.position.z = THREE.MathUtils.damp(avatar.group.position.z, avatar.targetPos.z, 14, dt);

        const targetBodyYaw = avatar.targetYaw + Math.PI;
        let yawDiff = ((targetBodyYaw - avatar.group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        avatar.group.rotation.y += yawDiff * Math.min(1, dt * 14);
        avatar.rightArm.rotation.x = THREE.MathUtils.damp(avatar.rightArm.rotation.x, avatar.targetPitch, 14, dt);

        const moveDist = Math.hypot(avatar.group.position.x - prevX, avatar.group.position.z - prevZ);
        if (moveDist > 0.015) {
          avatar.stridePhase += dt * 11;
          const swing = Math.sin(avatar.stridePhase) * 0.55;
          avatar.leftLeg.rotation.x = swing;
          avatar.rightLeg.rotation.x = -swing;
        } else {
          avatar.leftLeg.rotation.x = THREE.MathUtils.damp(avatar.leftLeg.rotation.x, 0, 10, dt);
          avatar.rightLeg.rotation.x = THREE.MathUtils.damp(avatar.rightLeg.rotation.x, 0, 10, dt);
        }
      }
    } else {
      this.updateModeLogic(dt);
    }

    // 6. Update Enemy & Allied AI (single-player modes)
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      if (!a.alive) {
        a.deathTimer += dt;
        a.group.rotation.x = THREE.MathUtils.damp(a.group.rotation.x, -Math.PI / 2, 9, dt);
        if (a.deathTimer > 3.5) {
          this.scene.remove(a.group);
          this.agents.splice(i, 1);
        }
        continue;
      }

      // Determine nearest opposing threat
      let threatPos: THREE.Vector3 | null = null;
      let threatAgent: SoldierAgent | null = null;
      let bestDist = Infinity;

      if (a.team === 'enemy') {
        const dPlayer = a.group.position.distanceTo(this.playerPos);
        bestDist = dPlayer;
        threatPos = this.playerPos;

        for (const other of this.agents) {
          if (other.alive && other.team === 'ally') {
            const dAlly = a.group.position.distanceTo(other.group.position);
            if (dAlly < bestDist) {
              bestDist = dAlly;
              threatPos = other.group.position;
              threatAgent = other;
            }
          }
        }
      } else {
        // Allied trooper targets nearest enemy
        for (const other of this.agents) {
          if (other.alive && other.team === 'enemy') {
            const d = a.group.position.distanceTo(other.group.position);
            if (d < bestDist) {
              bestDist = d;
              threatPos = other.group.position;
              threatAgent = other;
            }
          }
        }
      }

      const los =
        threatPos !== null && bestDist <= a.archetype.detectRange
          ? hasLineOfSight(a.group.position, threatPos, this.raycaster, this.world.shootableMeshes)
          : false;

      updateSoldierAI(
        a,
        dt,
        threatPos,
        los,
        this.world.colliders,
        this.world.coverPoints,
        (shooter, targetP) => {
          const dist = shooter.group.position.distanceTo(targetP);
          const atten = THREE.MathUtils.clamp(1 - dist / 80, 0.08, 0.75);
          soundEngine.playGunshot(shooter.archetype.weaponSound, atten);

          shooter.muzzlePoint.getWorldPosition(_muzzlePos);
          _shotDir
            .set(targetP.x - _muzzlePos.x, targetP.y + 1.25 - _muzzlePos.y, targetP.z - _muzzlePos.z)
            .normalize();
          _shotDir.x += (Math.random() - 0.5) * shooter.archetype.accuracy;
          _shotDir.y += (Math.random() - 0.5) * shooter.archetype.accuracy;
          _shotDir.z += (Math.random() - 0.5) * shooter.archetype.accuracy;
          _shotDir.normalize();

          _hitPos.copy(_muzzlePos).addScaledVector(_shotDir, Math.min(dist + 2, 48));
          const tracerColor = shooter.team === 'ally' ? 0x38bdf8 : 0xff5a36;
          this.spawnTracer(_muzzlePos, _hitPos, tracerColor);

          // Hit evaluation
          const hitProb = THREE.MathUtils.clamp(0.62 - dist * 0.0085, 0.14, 0.65);
          if (Math.random() < hitProb) {
            if (threatAgent && threatAgent.alive) {
              this.damageSoldier(
                threatAgent,
                shooter.archetype.damage,
                false,
                shooter.archetype.label,
                'Rifle',
              );
            } else if (shooter.team === 'enemy' && targetP === this.playerPos) {
              this.applyPlayerDamage(shooter.archetype.damage, shooter.group.position);
            }
          }
        },
      );
    }

    // 7. Update FX & Timers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (t.line.material as THREE.LineBasicMaterial).opacity = t.life / t.maxLife;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.vel.y -= 12 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = Math.max(0.1, (p.life / p.maxLife) * p.scaleRate);
        p.mesh.scale.setScalar(s);
      }
    }

    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.hitMarkerType = 'none';
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    }

    // 8. Emit React HUD snapshot at ~30Hz for crisp responsive UI without excessive React renders
    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.033) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }
  }

  private updateModeLogic(dt: number) {
    if (this.mode === 'survival') {
      const aliveEnemies = this.agents.filter((a) => a.team === 'enemy' && a.alive).length;
      if (this.waveIntermission > 0) {
        this.waveIntermission -= dt;
        if (this.waveIntermission <= 0) {
          this.startSurvivalWave(this.wave + 1);
        }
      } else if (this.waveToSpawn > 0) {
        this.waveSpawnTimer -= dt;
        if (this.waveSpawnTimer <= 0 && aliveEnemies < 10) {
          this.waveSpawnTimer = 1.35;
          this.waveToSpawn -= 1;
          this.spawnSoldier(this.pickEnemyTypeForWave(this.wave), 'enemy', this.pickSpawnPoint('enemy'));
        }
      } else if (aliveEnemies === 0) {
        // Wave cleared! Bonus armor/ammo & 5s intermission
        this.score += this.wave * 250;
        this.armor = Math.min(this.maxArmor, this.armor + 25);
        this.grenades = Math.min(4, this.grenades + 1);
        this.waveIntermission = 5.0;
      }
    } else if (this.mode === 'tdm') {
      this.tdmTimeRemaining = Math.max(0, this.tdmTimeRemaining - dt);
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        this.respawnQueue[i].timer -= dt;
        if (this.respawnQueue[i].timer <= 0) {
          const item = this.respawnQueue.splice(i, 1)[0];
          this.spawnSoldier(item.type, item.team, this.pickSpawnPoint(item.team));
        }
      }

      if (this.tdmBlueScore >= this.tdmTargetScore) {
        this.finishMatch('victory', 'Allied Strike Team reached the 25-kill target!');
      } else if (this.tdmRedScore >= this.tdmTargetScore) {
        this.finishMatch('gameover', 'Hostile forces reached 25 eliminations first.');
      } else if (this.tdmTimeRemaining <= 0) {
        if (this.tdmBlueScore >= this.tdmRedScore) {
          this.finishMatch('victory', `Time expired — Allied Team wins ${this.tdmBlueScore} to ${this.tdmRedScore}.`);
        } else {
          this.finishMatch('gameover', `Time expired — Hostile Team wins ${this.tdmRedScore} to ${this.tdmBlueScore}.`);
        }
      }
    } else if (this.mode === 'mission') {
      const aliveEnemies = this.agents.filter((a) => a.team === 'enemy' && a.alive).length;
      if (this.missionStage === 0 && aliveEnemies === 0) {
        this.score += 300;
        this.setupMissionStage(1);
      } else if (this.missionStage === 1) {
        const distTerm = Math.hypot(this.playerPos.x - 0, this.playerPos.z - -14);
        if (distTerm < 3.6) {
          this.missionHackProgress = Math.min(1, this.missionHackProgress + dt / 7.5);
          if (this.missionHackProgress >= 1) {
            this.score += 450;
            soundEngine.playPickup();
            this.setupMissionStage(2);
          }
        }
      } else if (this.missionStage === 2) {
        const heavyAlive = this.agents.some((a) => a.team === 'enemy' && a.type === 'heavy' && a.alive);
        if (!heavyAlive) {
          this.score += 550;
          this.setupMissionStage(3);
        }
      } else if (this.missionStage === 3) {
        const distEx = Math.hypot(this.playerPos.x - 48, this.playerPos.z - 44);
        if (distEx < 3.8) {
          this.score += 750;
          this.finishMatch('victory', 'All tactical objectives secured and extraction complete!');
        }
      }
    }
  }

  private emitHud() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.getWorldDirection(_camDir);

    // Radar blips
    const radarBlips: RadarBlip[] = [];
    if (this.isPvpMode) {
      for (const av of this.remotePlayers.values()) {
        if (!av.alive) continue;
        const isAlly = this.pvpMode === 'tdm' && av.team === this.pvpLocalTeam;
        radarBlips.push({
          x: av.group.position.x,
          z: av.group.position.z,
          type: isAlly ? 'ally' : 'enemy',
        });
      }
    } else {
      for (const a of this.agents) {
        if (!a.alive) continue;
        radarBlips.push({
          x: a.group.position.x,
          z: a.group.position.z,
          type: a.team === 'ally' ? 'ally' : 'enemy',
        });
      }
    }
    for (const p of this.world.pickups) {
      if (!p.active) continue;
      radarBlips.push({
        x: p.position.x,
        z: p.position.z,
        type: p.type === 'health' ? 'pickup_health' : p.type === 'ammo' ? 'pickup_ammo' : 'pickup_armor',
      });
    }
    if (this.mode === 'mission') {
      if (this.missionStage === 1) radarBlips.push({ x: 0, z: -14, type: 'objective' });
      else if (this.missionStage === 2) radarBlips.push({ x: -48, z: -42, type: 'objective' });
      else if (this.missionStage === 3) radarBlips.push({ x: 48, z: 44, type: 'objective' });
    }

    // Floating Enemy / Teammate Health Tags
    const enemyTags: EnemyHealthTag[] = [];
    if (this.isPvpMode) {
      for (const av of this.remotePlayers.values()) {
        if (!av.alive) continue;
        const dist = av.group.position.distanceTo(this.playerPos);
        if (dist > 55) continue;

        _toEnemy.subVectors(av.group.position, this.camera.position).normalize();
        const dot = _camDir.dot(_toEnemy);
        if (dot < 0.72) continue;

        const isFriendly = this.pvpMode === 'tdm' && av.team === this.pvpLocalTeam;
        const recentlyHit = this.elapsed - av.lastDamagedTime < 3.5;
        const aimedNear = dot > 0.975;
        if (!isFriendly && !recentlyHit && !aimedNear) continue;

        _projVec.set(av.group.position.x, av.group.position.y + 2.15, av.group.position.z);
        _projVec.project(this.camera);
        if (_projVec.z > 1) continue;

        enemyTags.push({
          id: av.id,
          label: av.callsign,
          hp: av.health,
          maxHp: av.maxHealth,
          screenX: ((_projVec.x + 1) / 2) * w,
          screenY: ((-_projVec.y + 1) / 2) * h,
          distance: Math.round(dist),
          isFriendly,
        });
      }
    } else {
      for (const a of this.agents) {
        if (!a.alive || a.team !== 'enemy') continue;
        const dist = a.group.position.distanceTo(this.playerPos);
        if (dist > 45) continue;

        _toEnemy.subVectors(a.group.position, this.camera.position).normalize();
        const dot = _camDir.dot(_toEnemy);
        if (dot < 0.72) continue;

        const recentlyHit = this.elapsed - a.lastDamagedTime < 3.5;
        const aimedNear = dot > 0.985;
        if (!recentlyHit && !aimedNear && a.hp >= a.maxHp) continue;

        _projVec.set(a.group.position.x, a.group.position.y + 2.15 * a.archetype.scale, a.group.position.z);
        _projVec.project(this.camera);
        if (_projVec.z > 1) continue;

        enemyTags.push({
          id: a.id,
          label: a.archetype.label,
          hp: a.hp,
          maxHp: a.maxHp,
          screenX: ((_projVec.x + 1) / 2) * w,
          screenY: ((-_projVec.y + 1) / 2) * h,
          distance: Math.round(dist),
        });
      }
    }

    // Damage directional indicator angle relative to player camera forward
    let damageDirectionAngle: number | null = null;
    if (this.damageFlash > 0.05 && this.damageSourcePos) {
      const dx = this.damageSourcePos.x - this.playerPos.x;
      const dz = this.damageSourcePos.z - this.playerPos.z;
      const worldAngle = Math.atan2(dx, dz);
      damageDirectionAngle = worldAngle - this.playerYaw;
    }

    // Interaction hint
    let interactionHint: string | null = null;
    if (this.mode === 'mission' && this.missionStage === 1) {
      const distTerm = Math.hypot(this.playerPos.x - 0, this.playerPos.z - -14);
      if (distTerm < 3.6) {
        interactionHint = `Decrypting Intel... ${Math.round(this.missionHackProgress * 100)}%`;
      } else if (distTerm < 12) {
        interactionHint = 'Move inside the blue terminal ring to decrypt intel';
      }
    }

    let pvpHud: PvpHudInfo | null = null;
    if (this.isPvpMode) {
      const rows: PvpScoreboardRow[] = [
        {
          id: this.pvpLocalPlayerId,
          callsign: this.progress.callsign || 'You',
          team: this.pvpLocalTeam,
          kills: this.kills,
          deaths: this.deaths,
          headshots: this.headshots,
          score: this.score,
          alive: this.pvpLocalAlive,
          isLocal: true,
        },
        ...Array.from(this.remotePlayers.values()).map((av) => ({
          id: av.id,
          callsign: av.callsign,
          team: av.team,
          kills: av.kills,
          deaths: av.deaths,
          headshots: av.headshots,
          score: av.score,
          alive: av.alive,
          isLocal: false,
        })),
      ].sort((a, b) => b.kills - a.kills || b.score - a.score);

      pvpHud = {
        roomCode: this.pvpRoomCode,
        mode: this.pvpMode,
        targetKills: this.pvpTargetKills,
        timeRemaining: this.pvpTimeRemaining,
        blueScore: this.pvpBlueScore,
        redScore: this.pvpRedScore,
        localAlive: this.pvpLocalAlive,
        respawnRemaining: this.pvpRespawnRemaining,
        localTeam: this.pvpLocalTeam,
        scoreboard: rows,
      };
    }

    const stats = getEffectiveWeaponStats(this.activeWeapon, this.progress);
    const spreadFactor = this.isAdsHeld
      ? stats.spreadAds * 120
      : (stats.spreadHip + this.dynamicSpread) * 280;

    this.callbacks.onHudUpdate({
      health: Math.ceil(this.health),
      maxHealth: this.maxHealth,
      armor: Math.ceil(this.armor),
      maxArmor: this.maxArmor,
      stamina: Math.round(this.stamina),
      isSprinting: Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.stamina > 4,
      isAds: this.isAdsHeld,
      isReloading: this.isReloading,
      reloadProgress: this.isReloading ? 1 - this.reloadTimer / this.reloadDuration : 0,
      activeWeapon: this.activeWeapon,
      weapons: {
        assault: { ...this.weaponAmmo.assault },
        sniper: { ...this.weaponAmmo.sniper },
        shotgun: { ...this.weaponAmmo.shotgun },
        smg: { ...this.weaponAmmo.smg },
        pistol: { ...this.weaponAmmo.pistol },
      },
      grenades: this.grenades,
      kills: this.kills,
      headshots: this.headshots,
      deaths: this.deaths,
      score: this.score,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      spreadFactor,
      hitMarkerType: this.hitMarkerType,
      damageFlash: this.damageFlash,
      damageDirectionAngle,
      wave: this.wave,
      enemiesAlive: this.agents.filter((a) => a.team === 'enemy' && a.alive).length + this.waveToSpawn,
      waveIntermission: Math.max(0, Math.ceil(this.waveIntermission)),
      tdmBlueScore: this.tdmBlueScore,
      tdmRedScore: this.tdmRedScore,
      tdmTargetScore: this.tdmTargetScore,
      tdmTimeRemaining: Math.ceil(this.tdmTimeRemaining),
      mission: this.getMissionInfo(),
      pvp: pvpHud,
      trainingTargetsHit: this.trainingTargetsHit,
      trainingScore: this.trainingScore,
      trainingBotsActive: this.trainingBotsActive,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.playerYaw,
      radarBlips,
      enemyTags,
      killFeed: this.killFeed.filter((k) => this.elapsed - k.timestamp < 5.5),
      pointerLocked: this.pointerLocked,
      interactionHint,
      lighting: this.settings.lighting,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    soundEngine.stopAmbient();
    this.unbindEvents();
    this.clearAgentsAndFx();
    this.particleGeo.dispose();
    this.grenadeGeo.dispose();
    this.grenadeMat.dispose();
    this.soldierRes.dispose();
    this.weaponRig.dispose();
    this.world.dispose();
    this.textures.dispose();
    this.envMapTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
