export type WeaponId = 'assault' | 'sniper' | 'shotgun' | 'smg' | 'pistol';

export type GameMode = 'survival' | 'tdm' | 'mission' | 'training' | 'pvp_ffa' | 'pvp_tdm';

export type LightingMode = 'day' | 'night';

export type EnemyType = 'rifleman' | 'rusher' | 'heavy' | 'sniper' | 'ally';

export type GamePhase = 'menu' | 'lobby' | 'playing' | 'paused' | 'victory' | 'gameover';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  slot: number;
  category: string;
  damage: number;
  fireRate: number; // rounds per second
  automatic: boolean;
  magSize: number;
  reserveMax: number;
  reloadTime: number; // seconds
  pellets: number;
  spreadHip: number;
  spreadAds: number;
  recoilKick: number;
  recoilPitch: number;
  adsFov: number;
  range: number;
  moveSpeedMult: number;
  isSniperScope?: boolean;
  description: string;
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  assault: {
    id: 'assault',
    name: 'M4A1 Tactical Carbine',
    shortName: 'M4A1',
    slot: 1,
    category: 'Assault Rifle',
    damage: 28,
    fireRate: 9.5,
    automatic: true,
    magSize: 30,
    reserveMax: 150,
    reloadTime: 1.75,
    pellets: 1,
    spreadHip: 0.024,
    spreadAds: 0.004,
    recoilKick: 0.048,
    recoilPitch: 0.016,
    adsFov: 52,
    range: 140,
    moveSpeedMult: 0.96,
    description: 'Balanced full-auto 5.56mm carbine with holographic optic for mid-range dominance.',
  },
  sniper: {
    id: 'sniper',
    name: 'M24 Precision Bolt',
    shortName: 'M24',
    slot: 2,
    category: 'Sniper Rifle',
    damage: 110,
    fireRate: 0.85,
    automatic: false,
    magSize: 5,
    reserveMax: 25,
    reloadTime: 2.35,
    pellets: 1,
    spreadHip: 0.065,
    spreadAds: 0.0006,
    recoilKick: 0.14,
    recoilPitch: 0.055,
    adsFov: 22,
    range: 240,
    moveSpeedMult: 0.88,
    isSniperScope: true,
    description: 'High-caliber bolt-action rifle with 3.5x magnified optic. Lethal on headshots.',
  },
  shotgun: {
    id: 'shotgun',
    name: 'M870 Combat Breacher',
    shortName: 'M870',
    slot: 3,
    category: 'Shotgun',
    damage: 19, // per pellet * 8 pellets = 152 max close range
    fireRate: 1.35,
    automatic: false,
    magSize: 8,
    reserveMax: 40,
    reloadTime: 2.1,
    pellets: 8,
    spreadHip: 0.072,
    spreadAds: 0.048,
    recoilKick: 0.12,
    recoilPitch: 0.048,
    adsFov: 58,
    range: 48,
    moveSpeedMult: 0.94,
    description: '12-gauge pump-action breacher firing an 8-pellet buckshot spread for CQB.',
  },
  smg: {
    id: 'smg',
    name: 'MP7 Spec-Ops PDW',
    shortName: 'MP7',
    slot: 4,
    category: 'Submachine Gun',
    damage: 20,
    fireRate: 13.5,
    automatic: true,
    magSize: 40,
    reserveMax: 200,
    reloadTime: 1.45,
    pellets: 1,
    spreadHip: 0.032,
    spreadAds: 0.01,
    recoilKick: 0.032,
    recoilPitch: 0.011,
    adsFov: 56,
    range: 85,
    moveSpeedMult: 1.04,
    description: 'High-RPM compact personal defense weapon ideal for aggressive flanking.',
  },
  pistol: {
    id: 'pistol',
    name: 'P226 Tactical Sidearm',
    shortName: 'P226',
    slot: 5,
    category: 'Sidearm Pistol',
    damage: 30,
    fireRate: 5.5,
    automatic: false,
    magSize: 15,
    reserveMax: 90,
    reloadTime: 1.2,
    pellets: 1,
    spreadHip: 0.018,
    spreadAds: 0.003,
    recoilKick: 0.042,
    recoilPitch: 0.018,
    adsFov: 58,
    range: 75,
    moveSpeedMult: 1.07,
    description: 'Reliable semi-auto 9mm sidearm with rapid draw and crisp handling.',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['assault', 'sniper', 'shotgun', 'smg', 'pistol'];

export interface WeaponUpgrades {
  damageLevel: number; // 0..3 (+12% per level)
  fireRateLevel: number; // 0..3 (+10% per level)
  capacityLevel: number; // 0..3 (+20% mag size per level)
  reloadLevel: number; // 0..3 (-12% reload time per level)
}

export interface GameSettings {
  lighting: LightingMode;
  mouseSensitivity: number; // 0.3 to 2.5
  fov: number; // 65 to 95
  masterVolume: number; // 0 to 1
  touchControls: 'auto' | 'on' | 'off';
  graphicsQuality: 'high' | 'balanced';
}

export interface PlayerProgress {
  callsign: string;
  credits: number;
  totalKills: number;
  totalHeadshots: number;
  highestWave: number;
  missionsCompleted: number;
  tdmWins: number;
  bestScore: number;
  upgrades: Record<WeaponId, WeaponUpgrades>;
}

export interface WeaponAmmoState {
  mag: number;
  reserve: number;
  maxMag: number;
}

export interface RadarBlip {
  x: number;
  z: number;
  type: 'enemy' | 'ally' | 'objective' | 'pickup_health' | 'pickup_ammo' | 'pickup_armor';
}

export interface EnemyHealthTag {
  id: string;
  label: string;
  hp: number;
  maxHp: number;
  screenX: number;
  screenY: number;
  distance: number;
  isFriendly?: boolean;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  isPlayerKiller: boolean;
  timestamp: number;
}

export interface MissionStageInfo {
  stageIndex: number;
  totalStages: number;
  title: string;
  description: string;
  progress: number; // 0..1
  targetLabel: string;
}

export interface PvpScoreboardRow {
  id: string;
  callsign: string;
  team: 'none' | 'blue' | 'red';
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
  alive: boolean;
  isLocal: boolean;
}

export interface PvpHudInfo {
  roomCode: string;
  mode: 'ffa' | 'tdm';
  targetKills: number;
  timeRemaining: number;
  blueScore: number;
  redScore: number;
  localAlive: boolean;
  respawnRemaining: number;
  localTeam: 'none' | 'blue' | 'red';
  scoreboard: PvpScoreboardRow[];
}

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  isSprinting: boolean;
  isAds: boolean;
  isReloading: boolean;
  reloadProgress: number; // 0..1
  activeWeapon: WeaponId;
  weapons: Record<WeaponId, WeaponAmmoState>;
  grenades: number;
  kills: number;
  headshots: number;
  deaths: number;
  score: number;
  shotsFired: number;
  shotsHit: number;
  spreadFactor: number;
  hitMarkerType: 'none' | 'body' | 'head' | 'kill';
  damageFlash: number; // 0..1
  damageDirectionAngle: number | null; // radians relative to camera forward
  wave: number;
  enemiesAlive: number;
  waveIntermission: number; // seconds remaining before next wave, 0 if active
  tdmBlueScore: number;
  tdmRedScore: number;
  tdmTargetScore: number;
  tdmTimeRemaining: number;
  mission: MissionStageInfo | null;
  pvp: PvpHudInfo | null;
  trainingTargetsHit: number;
  trainingScore: number;
  trainingBotsActive: boolean;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  radarBlips: RadarBlip[];
  enemyTags: EnemyHealthTag[];
  killFeed: KillFeedItem[];
  pointerLocked: boolean;
  interactionHint: string | null;
  lighting: LightingMode;
}

export interface MatchSummary {
  mode: GameMode;
  outcome: 'victory' | 'gameover';
  reason: string;
  kills: number;
  headshots: number;
  score: number;
  waveReached: number;
  accuracy: number;
  creditsEarned: number;
  durationSeconds: number;
  pvpRankings?: PvpScoreboardRow[];
}
