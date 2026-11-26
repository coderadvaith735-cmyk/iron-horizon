import {
  GameSettings,
  PlayerProgress,
  WEAPON_ORDER,
  WEAPON_SPECS,
  WeaponId,
  WeaponUpgrades,
} from './types';

const SETTINGS_KEY = 'iron_horizon_settings_v1';
const PROGRESS_KEY = 'iron_horizon_progress_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  lighting: 'day',
  mouseSensitivity: 1.0,
  fov: 75,
  masterVolume: 0.7,
  touchControls: 'auto',
  graphicsQuality: 'high',
};

function createDefaultUpgrades(): Record<WeaponId, WeaponUpgrades> {
  const result = {} as Record<WeaponId, WeaponUpgrades>;
  for (const id of WEAPON_ORDER) {
    result[id] = {
      damageLevel: 0,
      fireRateLevel: 0,
      capacityLevel: 0,
      reloadLevel: 0,
    };
  }
  return result;
}

export const DEFAULT_PROGRESS: PlayerProgress = {
  callsign: 'Vanguard-01',
  credits: 350, // Starting tactical requisitions so player can test upgrades right away
  totalKills: 0,
  totalHeadshots: 0,
  highestWave: 0,
  missionsCompleted: 0,
  tdmWins: 0,
  bestScore: 0,
  upgrades: createDefaultUpgrades(),
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, upgrades: createDefaultUpgrades() };
    const parsed = JSON.parse(raw);
    const upgrades = createDefaultUpgrades();
    if (parsed.upgrades) {
      for (const id of WEAPON_ORDER) {
        if (parsed.upgrades[id]) {
          upgrades[id] = { ...upgrades[id], ...parsed.upgrades[id] };
        }
      }
    }
    return { ...DEFAULT_PROGRESS, ...parsed, upgrades };
  } catch {
    return { ...DEFAULT_PROGRESS, upgrades: createDefaultUpgrades() };
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors
  }
}

export function getUpgradeCost(currentLevel: number): number {
  return (currentLevel + 1) * 150;
}

export function getEffectiveWeaponStats(id: WeaponId, progress: PlayerProgress) {
  const base = WEAPON_SPECS[id];
  const upg = progress.upgrades[id] ?? {
    damageLevel: 0,
    fireRateLevel: 0,
    capacityLevel: 0,
    reloadLevel: 0,
  };
  return {
    ...base,
    damage: Math.round(base.damage * (1 + upg.damageLevel * 0.12)),
    fireRate: Number((base.fireRate * (1 + upg.fireRateLevel * 0.1)).toFixed(2)),
    magSize: Math.round(base.magSize * (1 + upg.capacityLevel * 0.2)),
    reserveMax: Math.round(base.reserveMax * (1 + upg.capacityLevel * 0.2)),
    reloadTime: Number((base.reloadTime * Math.pow(0.88, upg.reloadLevel)).toFixed(2)),
  };
}
