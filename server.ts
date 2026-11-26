import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ClientToServerMsg,
  MatchEndedPayload,
  NetworkPlayerInfo,
  PvpMode,
  PvpTeam,
  RoomSnapshot,
  RoomStatus,
  ServerToClientMsg,
} from './src/game/multiplayerTypes.ts';
import type { LightingMode, WeaponId } from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS_PER_ROOM = 10;
const MATCH_DURATION_SECONDS = 300;
const RESPAWN_SECONDS = 3.5;

interface WeaponServerSpec {
  damage: number;
  minIntervalMs: number;
  range: number;
  shortName: string;
}

const WEAPON_SERVER_SPECS: Record<WeaponId, WeaponServerSpec> = {
  assault: { damage: 32, minIntervalMs: 75, range: 150, shortName: 'M4A1' },
  sniper: { damage: 120, minIntervalMs: 850, range: 255, shortName: 'M24' },
  shotgun: { damage: 22, minIntervalMs: 550, range: 54, shortName: 'M870' },
  smg: { damage: 23, minIntervalMs: 52, range: 95, shortName: 'MP7' },
  pistol: { damage: 34, minIntervalMs: 130, range: 85, shortName: 'P226' },
};

interface ServerPlayer extends NetworkPlayerInfo {
  ws: WebSocket | null;
  lastShotAt: number;
  lastGrenadeAt: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  respawnAt: number;
}

interface ServerRoom {
  code: string;
  mode: PvpMode;
  lighting: LightingMode;
  status: RoomStatus;
  hostId: string;
  targetKills: number;
  timeRemaining: number;
  matchStartAt: number;
  blueScore: number;
  redScore: number;
  players: Map<string, ServerPlayer>;
  explodedBarrels: Set<string>;
  inactivePickups: Map<string, number>; // pickupId -> respawn timestamp
  emptyCleanupTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, ServerRoom>();
const socketMeta = new Map<WebSocket, { roomCode: string; playerId: string }>();

function sanitizeCallsign(raw: unknown): string {
  if (typeof raw !== 'string') return 'Operator';
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return cleaned.length >= 2 ? cleaned : 'Operator';
}

function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function clampCoord(val: unknown, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.max(min, Math.min(max, val));
}

function isValidWeapon(w: unknown): w is WeaponId {
  return w === 'assault' || w === 'sniper' || w === 'shotgun' || w === 'smg' || w === 'pistol';
}

function pickSpawnPoint(mode: PvpMode, team: PvpTeam, indexHint = 0): { x: number; y: number; z: number; yaw: number } {
  if (mode === 'tdm') {
    const isBlue = team === 'blue';
    const x = ((indexHint % 5) - 2) * 8 + (Math.random() - 0.5) * 4;
    const z = isBlue ? 38 + Math.random() * 8 : -44 + Math.random() * 8;
    const yaw = isBlue ? 0 : Math.PI;
    return { x, y: 1.0, z, yaw };
  }
  const ffaSpots: Array<[number, number]> = [
    [0, 32],
    [0, -36],
    [34, 0],
    [-34, 0],
    [26, 26],
    [-26, -26],
    [28, -28],
    [-28, 28],
  ];
  const spot = ffaSpots[Math.floor(Math.random() * ffaSpots.length)];
  const x = spot[0] + (Math.random() - 0.5) * 4;
  const z = spot[1] + (Math.random() - 0.5) * 4;
  const yaw = Math.atan2(x, z);
  return { x, y: 1.0, z, yaw };
}

function sendMsg(ws: WebSocket | null, msg: ServerToClientMsg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function broadcastRoom(room: ServerRoom, msg: ServerToClientMsg, excludeId?: string) {
  const raw = JSON.stringify(msg);
  for (const player of room.players.values()) {
    if (excludeId && player.id === excludeId) continue;
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(raw);
    }
  }
}

function serializePlayer(p: ServerPlayer): NetworkPlayerInfo {
  const now = Date.now();
  return {
    id: p.id,
    callsign: p.callsign,
    team: p.team,
    isHost: p.isHost,
    connected: p.connected,
    kills: p.kills,
    deaths: p.deaths,
    headshots: p.headshots,
    score: p.score,
    health: p.health,
    armor: p.armor,
    alive: p.alive,
    respawnRemaining: p.alive ? 0 : Math.max(0, Number(((p.respawnAt - now) / 1000).toFixed(1))),
    weapon: p.weapon,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    isSprinting: p.isSprinting,
    isAds: p.isAds,
  };
}

function serializeRoom(room: ServerRoom): RoomSnapshot {
  return {
    code: room.code,
    mode: room.mode,
    lighting: room.lighting,
    status: room.status,
    hostId: room.hostId,
    targetKills: room.targetKills,
    timeRemaining: Math.ceil(room.timeRemaining),
    blueScore: room.blueScore,
    redScore: room.redScore,
    players: Array.from(room.players.values()).map(serializePlayer),
    explodedBarrels: Array.from(room.explodedBarrels),
    inactivePickups: Array.from(room.inactivePickups.keys()),
  };
}

function assignBalancedTeam(room: ServerRoom): PvpTeam {
  if (room.mode === 'ffa') return 'none';
  let blue = 0;
  let red = 0;
  for (const p of room.players.values()) {
    if (p.team === 'blue') blue++;
    else if (p.team === 'red') red++;
  }
  return blue <= red ? 'blue' : 'red';
}

function resetPlayersForMatch(room: ServerRoom) {
  room.status = 'active';
  room.blueScore = 0;
  room.redScore = 0;
  room.timeRemaining = MATCH_DURATION_SECONDS;
  room.matchStartAt = Date.now();
  room.explodedBarrels.clear();
  room.inactivePickups.clear();

  let idx = 0;
  for (const p of room.players.values()) {
    if (room.mode === 'ffa') {
      p.team = 'none';
    } else if (p.team === 'none') {
      p.team = idx % 2 === 0 ? 'blue' : 'red';
    }
    const spawn = pickSpawnPoint(room.mode, p.team, idx++);
    p.kills = 0;
    p.deaths = 0;
    p.headshots = 0;
    p.score = 0;
    p.health = 100;
    p.armor = 50;
    p.alive = true;
    p.respawnAt = 0;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.yaw = spawn.yaw;
    p.pitch = 0;
  }
}

function endMatch(room: ServerRoom, winnerTeam: PvpTeam, winnerName: string, reason: string) {
  if (room.status !== 'active') return;
  room.status = 'ended';
  const durationSeconds = Math.max(1, Math.round((Date.now() - room.matchStartAt) / 1000));
  const payload: MatchEndedPayload = {
    winnerTeam,
    winnerName,
    reason,
    blueScore: room.blueScore,
    redScore: room.redScore,
    durationSeconds,
    players: Array.from(room.players.values())
      .map(serializePlayer)
      .sort((a, b) => b.kills - a.kills || b.score - a.score),
  };
  broadcastRoom(room, { type: 'match:ended', result: payload });
  broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
}

function applyAuthoritativeDamage(
  room: ServerRoom,
  attacker: ServerPlayer | null,
  target: ServerPlayer,
  rawDamage: number,
  headshot: boolean,
  weaponLabel: string,
  sourceX: number,
  sourceZ: number,
) {
  if (room.status !== 'active' || !target.alive) return;
  if (attacker && attacker.id !== target.id && room.mode === 'tdm' && attacker.team === target.team) {
    return; // Friendly fire disabled
  }

  let remaining = Math.max(1, Math.round(rawDamage));
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, Math.ceil(remaining * 0.65));
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.health = Math.max(0, target.health - remaining);

  broadcastRoom(room, {
    type: 'combat:hit',
    hit: {
      targetId: target.id,
      attackerId: attacker ? attacker.id : 'environment',
      damage: rawDamage,
      health: target.health,
      armor: target.armor,
      headshot,
      sourceX,
      sourceZ,
    },
  });

  if (target.health <= 0) {
    target.alive = false;
    target.deaths += 1;
    target.respawnAt = Date.now() + RESPAWN_SECONDS * 1000;

    if (attacker && attacker.id !== target.id) {
      attacker.kills += 1;
      if (headshot) attacker.headshots += 1;
      attacker.score += 100 + (headshot ? 50 : 0);

      if (room.mode === 'tdm') {
        if (attacker.team === 'blue') room.blueScore += 1;
        else if (attacker.team === 'red') room.redScore += 1;
      }
    }

    broadcastRoom(room, {
      type: 'combat:kill',
      kill: {
        killerId: attacker ? attacker.id : 'environment',
        killerName: attacker ? attacker.callsign : 'Explosion',
        victimId: target.id,
        victimName: target.callsign,
        weapon: weaponLabel,
        headshot,
        blueScore: room.blueScore,
        redScore: room.redScore,
      },
    });

    // Check victory conditions
    if (room.mode === 'tdm') {
      if (room.blueScore >= room.targetKills) {
        endMatch(room, 'blue', 'Blue Team', `Blue Team reached ${room.targetKills} eliminations!`);
      } else if (room.redScore >= room.targetKills) {
        endMatch(room, 'red', 'Red Team', `Red Team reached ${room.targetKills} eliminations!`);
      }
    } else if (attacker && attacker.kills >= room.targetKills) {
      endMatch(
        room,
        'none',
        attacker.callsign,
        `${attacker.callsign} reached ${room.targetKills} eliminations!`,
      );
    }
  }
}

function removePlayerFromRoom(ws: WebSocket, immediateLeave: boolean) {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  socketMeta.delete(ws);

  const room = rooms.get(meta.roomCode);
  if (!room) return;
  const player = room.players.get(meta.playerId);
  if (!player) return;

  if (immediateLeave) {
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    room.players.delete(player.id);
    reassignHostIfNeeded(room);
    broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
    scheduleRoomCleanupIfEmpty(room);
  } else {
    player.connected = false;
    player.ws = null;
    broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
    player.disconnectTimer = setTimeout(() => {
      room.players.delete(player.id);
      reassignHostIfNeeded(room);
      broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
      scheduleRoomCleanupIfEmpty(room);
    }, 15000);
  }
}

function reassignHostIfNeeded(room: ServerRoom) {
  if (room.players.size === 0) return;
  if (!room.players.has(room.hostId)) {
    const nextHost = room.players.values().next().value;
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    }
  }
}

function scheduleRoomCleanupIfEmpty(room: ServerRoom) {
  if (room.players.size > 0) return;
  if (room.emptyCleanupTimer) clearTimeout(room.emptyCleanupTimer);
  room.emptyCleanupTimer = setTimeout(() => {
    if (room.players.size === 0) {
      rooms.delete(room.code);
    }
  }, 30000);
}

// Authoritative 20Hz simulation & broadcast loop
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status !== 'active') continue;

    room.timeRemaining = Math.max(0, room.timeRemaining - 0.05);

    // Respawn checks
    for (const p of room.players.values()) {
      if (!p.alive && now >= p.respawnAt) {
        const spawn = pickSpawnPoint(room.mode, p.team);
        p.alive = true;
        p.health = 100;
        p.armor = 50;
        p.x = spawn.x;
        p.y = spawn.y;
        p.z = spawn.z;
        p.yaw = spawn.yaw;
        p.pitch = 0;
        broadcastRoom(room, {
          type: 'combat:respawn',
          playerId: p.id,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
        });
      }
    }

    // Pickup respawn checks
    for (const [pickupId, respawnAt] of room.inactivePickups.entries()) {
      if (now >= respawnAt) {
        room.inactivePickups.delete(pickupId);
        broadcastRoom(room, { type: 'world:pickup', pickupId, active: true });
      }
    }

    // Match timer expiry check
    if (room.timeRemaining <= 0) {
      if (room.mode === 'tdm') {
        if (room.blueScore > room.redScore) {
          endMatch(room, 'blue', 'Blue Team', `Time expired — Blue Team wins ${room.blueScore} to ${room.redScore}.`);
        } else if (room.redScore > room.blueScore) {
          endMatch(room, 'red', 'Red Team', `Time expired — Red Team wins ${room.redScore} to ${room.blueScore}.`);
        } else {
          endMatch(room, 'none', 'Draw', `Time expired tied at ${room.blueScore} - ${room.redScore}.`);
        }
      } else {
        const sorted = Array.from(room.players.values()).sort((a, b) => b.kills - a.kills || b.score - a.score);
        const top = sorted[0];
        endMatch(
          room,
          'none',
          top ? top.callsign : 'Match Complete',
          top ? `Time expired — ${top.callsign} leads with ${top.kills} eliminations.` : 'Match complete.',
        );
      }
      continue;
    }

    // Broadcast compact state tick
    broadcastRoom(room, {
      type: 'state:tick',
      timeRemaining: Math.ceil(room.timeRemaining),
      blueScore: room.blueScore,
      redScore: room.redScore,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        weapon: p.weapon,
        isSprinting: p.isSprinting,
        isAds: p.isAds,
        health: p.health,
        armor: p.armor,
        alive: p.alive,
        respawnRemaining: p.alive ? 0 : Math.max(0, Number(((p.respawnAt - now) / 1000).toFixed(1))),
        kills: p.kills,
        deaths: p.deaths,
        headshots: p.headshots,
        score: p.score,
      })),
    });
  }
}, 50);

async function bootstrapServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (rawData) => {
      let msg: ClientToServerMsg;
      try {
        msg = JSON.parse(String(rawData)) as ClientToServerMsg;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'room:create') {
        removePlayerFromRoom(ws, true);
        const code = generateRoomCode();
        const playerId = crypto.randomUUID();
        const mode: PvpMode = msg.mode === 'tdm' ? 'tdm' : 'ffa';
        const lighting: LightingMode = msg.lighting === 'night' ? 'night' : 'day';
        const targetKills = [10, 15, 20, 30].includes(msg.targetKills) ? msg.targetKills : 20;

        const room: ServerRoom = {
          code,
          mode,
          lighting,
          status: 'lobby',
          hostId: playerId,
          targetKills,
          timeRemaining: MATCH_DURATION_SECONDS,
          matchStartAt: 0,
          blueScore: 0,
          redScore: 0,
          players: new Map(),
          explodedBarrels: new Set(),
          inactivePickups: new Map(),
          emptyCleanupTimer: null,
        };

        const team: PvpTeam = mode === 'tdm' ? 'blue' : 'none';
        const spawn = pickSpawnPoint(mode, team, 0);
        const hostPlayer: ServerPlayer = {
          id: playerId,
          callsign: sanitizeCallsign(msg.callsign),
          team,
          isHost: true,
          connected: true,
          kills: 0,
          deaths: 0,
          headshots: 0,
          score: 0,
          health: 100,
          armor: 50,
          alive: true,
          respawnRemaining: 0,
          weapon: 'assault',
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: spawn.yaw,
          pitch: 0,
          isSprinting: false,
          isAds: false,
          ws,
          lastShotAt: 0,
          lastGrenadeAt: 0,
          disconnectTimer: null,
          respawnAt: 0,
        };

        room.players.set(playerId, hostPlayer);
        rooms.set(code, room);
        socketMeta.set(ws, { roomCode: code, playerId });

        sendMsg(ws, { type: 'room:joined', playerId, room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'room:join') {
        removePlayerFromRoom(ws, true);
        const code = sanitizeRoomCode(msg.code);
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: 'room:error', message: `Room "${code}" was not found.` });
          return;
        }
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
          sendMsg(ws, { type: 'room:error', message: 'This room is full (10/10 players).' });
          return;
        }
        if (room.emptyCleanupTimer) {
          clearTimeout(room.emptyCleanupTimer);
          room.emptyCleanupTimer = null;
        }

        const playerId = crypto.randomUUID();
        const team = assignBalancedTeam(room);
        const spawn = pickSpawnPoint(room.mode, team, room.players.size);
        const newPlayer: ServerPlayer = {
          id: playerId,
          callsign: sanitizeCallsign(msg.callsign),
          team,
          isHost: false,
          connected: true,
          kills: 0,
          deaths: 0,
          headshots: 0,
          score: 0,
          health: 100,
          armor: 50,
          alive: true,
          respawnRemaining: 0,
          weapon: 'assault',
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: spawn.yaw,
          pitch: 0,
          isSprinting: false,
          isAds: false,
          ws,
          lastShotAt: 0,
          lastGrenadeAt: 0,
          disconnectTimer: null,
          respawnAt: 0,
        };

        room.players.set(playerId, newPlayer);
        socketMeta.set(ws, { roomCode: code, playerId });

        sendMsg(ws, { type: 'room:joined', playerId, room: serializeRoom(room) });
        broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) }, playerId);
        return;
      }

      if (msg.type === 'room:reconnect') {
        const code = sanitizeRoomCode(msg.code);
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: 'room:error', message: 'Room expired.' });
          return;
        }
        const existing = room.players.get(msg.playerId);
        if (!existing) {
          sendMsg(ws, { type: 'room:error', message: 'Session expired.' });
          return;
        }
        if (existing.disconnectTimer) {
          clearTimeout(existing.disconnectTimer);
          existing.disconnectTimer = null;
        }
        existing.ws = ws;
        existing.connected = true;
        existing.callsign = sanitizeCallsign(msg.callsign);
        socketMeta.set(ws, { roomCode: code, playerId: existing.id });
        sendMsg(ws, { type: 'room:joined', playerId: existing.id, room: serializeRoom(room) });
        broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) }, existing.id);
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.get(meta.playerId);
      if (!player) return;

      if (msg.type === 'room:leave') {
        removePlayerFromRoom(ws, true);
        return;
      }

      if (msg.type === 'lobby:team') {
        if (room.status === 'lobby' && room.mode === 'tdm' && (msg.team === 'blue' || msg.team === 'red')) {
          player.team = msg.team;
          broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
        }
        return;
      }

      if (msg.type === 'lobby:config') {
        if (player.id !== room.hostId || room.status !== 'lobby') return;
        if (msg.mode === 'ffa' || msg.mode === 'tdm') {
          room.mode = msg.mode;
          let idx = 0;
          for (const p of room.players.values()) {
            p.team = msg.mode === 'ffa' ? 'none' : idx++ % 2 === 0 ? 'blue' : 'red';
          }
        }
        if (msg.lighting === 'day' || msg.lighting === 'night') {
          room.lighting = msg.lighting;
        }
        if (msg.targetKills && [10, 15, 20, 30].includes(msg.targetKills)) {
          room.targetKills = msg.targetKills;
        }
        broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'lobby:start') {
        if (player.id !== room.hostId || room.status !== 'lobby') return;
        resetPlayersForMatch(room);
        broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'lobby:return') {
        if (player.id !== room.hostId) return;
        room.status = 'lobby';
        broadcastRoom(room, { type: 'room:update', room: serializeRoom(room) });
        return;
      }

      if (msg.type === 'player:move') {
        if (room.status !== 'active' || !player.alive) return;
        player.x = clampCoord(msg.x, -95, 95);
        player.y = clampCoord(msg.y, -10, 40);
        player.z = clampCoord(msg.z, -95, 95);
        player.yaw = clampCoord(msg.yaw, -100, 100);
        player.pitch = clampCoord(msg.pitch, -1.6, 1.6);
        if (isValidWeapon(msg.weapon)) player.weapon = msg.weapon;
        player.isSprinting = Boolean(msg.isSprinting);
        player.isAds = Boolean(msg.isAds);
        return;
      }

      if (msg.type === 'player:shoot') {
        if (room.status !== 'active' || !player.alive) return;
        if (!isValidWeapon(msg.weapon)) return;
        const spec = WEAPON_SERVER_SPECS[msg.weapon];
        const now = Date.now();
        // Allow shotgun multi-pellet batch within same millisecond, otherwise enforce cooldown
        const isShotgunPellet = msg.weapon === 'shotgun' && now - player.lastShotAt < 25;
        if (!isShotgunPellet && now - player.lastShotAt < spec.minIntervalMs * 0.78) {
          return;
        }
        if (!isShotgunPellet) {
          player.lastShotAt = now;
        }

        const fx = {
          shooterId: player.id,
          weapon: msg.weapon,
          muzzleX: clampCoord(msg.muzzleX, -100, 100),
          muzzleY: clampCoord(msg.muzzleY, -10, 45),
          muzzleZ: clampCoord(msg.muzzleZ, -100, 100),
          hitX: clampCoord(msg.hitX, -150, 150),
          hitY: clampCoord(msg.hitY, -20, 60),
          hitZ: clampCoord(msg.hitZ, -150, 150),
        };
        if (!isShotgunPellet) {
          broadcastRoom(room, { type: 'combat:fx', fx }, player.id);
        }

        if (msg.targetPlayerId) {
          const target = room.players.get(msg.targetPlayerId);
          if (target && target.id !== player.id && target.alive) {
            const dist = Math.hypot(target.x - player.x, target.z - player.z);
            if (dist <= spec.range + 6) {
              const isHead = msg.hitZone === 'head';
              const dmg = Math.round(spec.damage * (isHead ? 2.0 : 1.0));
              applyAuthoritativeDamage(
                room,
                player,
                target,
                dmg,
                isHead,
                spec.shortName,
                player.x,
                player.z,
              );
            }
          }
        }
        return;
      }

      if (msg.type === 'player:barrel') {
        if (room.status !== 'active' || !player.alive) return;
        const bId = String(msg.barrelId).slice(0, 24);
        if (room.explodedBarrels.has(bId)) return;
        room.explodedBarrels.add(bId);
        const bx = clampCoord(msg.x, -95, 95);
        const by = clampCoord(msg.y, -10, 40);
        const bz = clampCoord(msg.z, -95, 95);

        broadcastRoom(room, { type: 'world:barrel', barrelId: bId, x: bx, y: by, z: bz });
        for (const target of room.players.values()) {
          if (!target.alive) continue;
          const dist = Math.hypot(target.x - bx, target.z - bz);
          if (dist <= 9.5) {
            const dmg = Math.round(145 * (1 - dist / 9.5));
            applyAuthoritativeDamage(room, player, target, dmg, false, 'Fuel Barrel', bx, bz);
          }
        }
        return;
      }

      if (msg.type === 'player:grenade') {
        if (room.status !== 'active') return;
        const now = Date.now();
        if (now - player.lastGrenadeAt < 1200) return;
        player.lastGrenadeAt = now;
        const gx = clampCoord(msg.x, -95, 95);
        const gy = clampCoord(msg.y, -10, 40);
        const gz = clampCoord(msg.z, -95, 95);

        broadcastRoom(room, { type: 'world:explosion', x: gx, y: gy, z: gz });
        for (const target of room.players.values()) {
          if (!target.alive) continue;
          const dist = Math.hypot(target.x - gx, target.z - gz);
          if (dist <= 10.5) {
            const dmg = Math.round(165 * (1 - dist / 10.5));
            applyAuthoritativeDamage(room, player, target, dmg, false, 'Frag Grenade', gx, gz);
          }
        }
        return;
      }

      if (msg.type === 'player:pickup') {
        if (room.status !== 'active' || !player.alive) return;
        const pId = String(msg.pickupId).slice(0, 32);
        if (room.inactivePickups.has(pId)) return;

        let consumed = false;
        if (msg.pickupType === 'health' && player.health < 100) {
          player.health = Math.min(100, player.health + 40);
          consumed = true;
        } else if (msg.pickupType === 'armor' && player.armor < 100) {
          player.armor = Math.min(100, player.armor + 35);
          consumed = true;
        } else if (msg.pickupType === 'ammo') {
          consumed = true;
        }

        if (consumed) {
          room.inactivePickups.set(pId, Date.now() + 18000);
          broadcastRoom(room, { type: 'world:pickup', pickupId: pId, active: false });
        }
      }
    });

    ws.on('close', () => {
      removePlayerFromRoom(ws, false);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Iron Horizon server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrapServer();
