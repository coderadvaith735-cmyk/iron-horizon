import { LightingMode, WeaponId } from './types';

export type PvpMode = 'ffa' | 'tdm';
export type PvpTeam = 'none' | 'blue' | 'red';
export type RoomStatus = 'lobby' | 'active' | 'ended';

export interface NetworkPlayerInfo {
  id: string;
  callsign: string;
  team: PvpTeam;
  isHost: boolean;
  connected: boolean;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
  health: number;
  armor: number;
  alive: boolean;
  respawnRemaining: number;
  weapon: WeaponId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isSprinting: boolean;
  isAds: boolean;
}

export interface RoomSnapshot {
  code: string;
  mode: PvpMode;
  lighting: LightingMode;
  status: RoomStatus;
  hostId: string;
  targetKills: number;
  timeRemaining: number;
  blueScore: number;
  redScore: number;
  players: NetworkPlayerInfo[];
  explodedBarrels: string[];
  inactivePickups: string[];
}

export interface CombatFxPayload {
  shooterId: string;
  weapon: WeaponId;
  muzzleX: number;
  muzzleY: number;
  muzzleZ: number;
  hitX: number;
  hitY: number;
  hitZ: number;
}

export interface CombatHitPayload {
  targetId: string;
  attackerId: string;
  damage: number;
  health: number;
  armor: number;
  headshot: boolean;
  sourceX: number;
  sourceZ: number;
}

export interface CombatKillPayload {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: string;
  headshot: boolean;
  blueScore: number;
  redScore: number;
}

export interface MatchEndedPayload {
  winnerTeam: PvpTeam;
  winnerName: string;
  reason: string;
  blueScore: number;
  redScore: number;
  durationSeconds: number;
  players: NetworkPlayerInfo[];
}

export interface StateTickPlayer {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  isSprinting: boolean;
  isAds: boolean;
  health: number;
  armor: number;
  alive: boolean;
  respawnRemaining: number;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
}

export type ClientToServerMsg =
  | { type: 'room:create'; callsign: string; mode: PvpMode; lighting: LightingMode; targetKills: number }
  | { type: 'room:join'; code: string; callsign: string }
  | { type: 'room:reconnect'; code: string; playerId: string; callsign: string }
  | { type: 'room:leave' }
  | { type: 'lobby:team'; team: PvpTeam }
  | { type: 'lobby:config'; mode?: PvpMode; lighting?: LightingMode; targetKills?: number }
  | { type: 'lobby:start' }
  | { type: 'lobby:return' }
  | {
      type: 'player:move';
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      weapon: WeaponId;
      isSprinting: boolean;
      isAds: boolean;
    }
  | {
      type: 'player:shoot';
      weapon: WeaponId;
      muzzleX: number;
      muzzleY: number;
      muzzleZ: number;
      hitX: number;
      hitY: number;
      hitZ: number;
      targetPlayerId?: string;
      hitZone?: 'head' | 'body';
    }
  | { type: 'player:barrel'; barrelId: string; x: number; y: number; z: number }
  | { type: 'player:grenade'; x: number; y: number; z: number }
  | { type: 'player:pickup'; pickupId: string; pickupType: 'health' | 'ammo' | 'armor' };

export type ServerToClientMsg =
  | { type: 'room:joined'; playerId: string; room: RoomSnapshot }
  | { type: 'room:error'; message: string }
  | { type: 'room:update'; room: RoomSnapshot }
  | {
      type: 'state:tick';
      timeRemaining: number;
      blueScore: number;
      redScore: number;
      players: StateTickPlayer[];
    }
  | { type: 'combat:fx'; fx: CombatFxPayload }
  | { type: 'combat:hit'; hit: CombatHitPayload }
  | { type: 'combat:kill'; kill: CombatKillPayload }
  | { type: 'combat:respawn'; playerId: string; x: number; y: number; z: number; yaw: number }
  | { type: 'world:barrel'; barrelId: string; x: number; y: number; z: number }
  | { type: 'world:explosion'; x: number; y: number; z: number }
  | { type: 'world:pickup'; pickupId: string; active: boolean }
  | { type: 'match:ended'; result: MatchEndedPayload };
