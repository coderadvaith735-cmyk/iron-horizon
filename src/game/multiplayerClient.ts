import type {
  ClientToServerMsg,
  CombatFxPayload,
  CombatHitPayload,
  CombatKillPayload,
  MatchEndedPayload,
  PvpMode,
  PvpTeam,
  RoomSnapshot,
  ServerToClientMsg,
  StateTickPlayer,
} from './multiplayerTypes';
import type { LightingMode, WeaponId } from './types';

export interface MultiplayerClientHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onJoinedRoom?: (playerId: string, room: RoomSnapshot) => void;
  onRoomUpdate?: (room: RoomSnapshot) => void;
  onError?: (message: string) => void;
  onStateTick?: (payload: {
    timeRemaining: number;
    blueScore: number;
    redScore: number;
    players: StateTickPlayer[];
  }) => void;
  onCombatFx?: (fx: CombatFxPayload) => void;
  onCombatHit?: (hit: CombatHitPayload) => void;
  onCombatKill?: (kill: CombatKillPayload) => void;
  onRespawn?: (payload: { playerId: string; x: number; y: number; z: number; yaw: number }) => void;
  onBarrelExplode?: (payload: { barrelId: string; x: number; y: number; z: number }) => void;
  onExplosion?: (payload: { x: number; y: number; z: number }) => void;
  onPickupSync?: (payload: { pickupId: string; active: boolean }) => void;
  onMatchEnded?: (result: MatchEndedPayload) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private handlers: MultiplayerClientHandlers = {};
  private currentRoomCode: string | null = null;
  private currentPlayerId: string | null = null;
  private currentCallsign = 'Operator';
  private intentionalClose = false;
  private reconnectTimer: number | null = null;

  public setHandlers(handlers: MultiplayerClientHandlers) {
    this.handlers = handlers;
  }

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      const socket = new WebSocket(this.getWsUrl());
      this.ws = socket;

      socket.onopen = () => {
        this.handlers.onConnected?.();
        resolve(socket);
      };

      socket.onerror = () => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error('Unable to connect to multiplayer server.'));
        }
      };

      socket.onclose = () => {
        this.handlers.onDisconnected?.();
        if (!this.intentionalClose && this.currentRoomCode && this.currentPlayerId) {
          this.scheduleReconnect();
        }
      };

      socket.onmessage = (event) => {
        let msg: ServerToClientMsg;
        try {
          msg = JSON.parse(String(event.data)) as ServerToClientMsg;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'room:joined':
            this.currentPlayerId = msg.playerId;
            this.currentRoomCode = msg.room.code;
            this.handlers.onJoinedRoom?.(msg.playerId, msg.room);
            break;
          case 'room:error':
            this.handlers.onError?.(msg.message);
            break;
          case 'room:update':
            this.handlers.onRoomUpdate?.(msg.room);
            break;
          case 'state:tick':
            this.handlers.onStateTick?.(msg);
            break;
          case 'combat:fx':
            this.handlers.onCombatFx?.(msg.fx);
            break;
          case 'combat:hit':
            this.handlers.onCombatHit?.(msg.hit);
            break;
          case 'combat:kill':
            this.handlers.onCombatKill?.(msg.kill);
            break;
          case 'combat:respawn':
            this.handlers.onRespawn?.(msg);
            break;
          case 'world:barrel':
            this.handlers.onBarrelExplode?.(msg);
            break;
          case 'world:explosion':
            this.handlers.onExplosion?.(msg);
            break;
          case 'world:pickup':
            this.handlers.onPickupSync?.(msg);
            break;
          case 'match:ended':
            this.handlers.onMatchEnded?.(msg.result);
            break;
        }
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose || !this.currentRoomCode || !this.currentPlayerId) return;
      try {
        await this.ensureSocket();
        this.send({
          type: 'room:reconnect',
          code: this.currentRoomCode,
          playerId: this.currentPlayerId,
          callsign: this.currentCallsign,
        });
      } catch {
        this.scheduleReconnect();
      }
    }, 1500);
  }

  public send(msg: ClientToServerMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public async createRoom(callsign: string, mode: PvpMode, lighting: LightingMode, targetKills: number) {
    this.currentCallsign = callsign;
    await this.ensureSocket();
    this.send({ type: 'room:create', callsign, mode, lighting, targetKills });
  }

  public async joinRoom(code: string, callsign: string) {
    this.currentCallsign = callsign;
    await this.ensureSocket();
    this.send({ type: 'room:join', code, callsign });
  }

  public leaveRoom() {
    this.intentionalClose = true;
    this.currentRoomCode = null;
    this.currentPlayerId = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.send({ type: 'room:leave' });
    this.ws?.close();
    this.ws = null;
  }

  public switchTeam(team: PvpTeam) {
    this.send({ type: 'lobby:team', team });
  }

  public updateLobbyConfig(config: { mode?: PvpMode; lighting?: LightingMode; targetKills?: number }) {
    this.send({ type: 'lobby:config', ...config });
  }

  public startMatch() {
    this.send({ type: 'lobby:start' });
  }

  public returnToLobby() {
    this.send({ type: 'lobby:return' });
  }

  public sendMove(payload: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    weapon: WeaponId;
    isSprinting: boolean;
    isAds: boolean;
  }) {
    this.send({ type: 'player:move', ...payload });
  }

  public sendShoot(payload: {
    weapon: WeaponId;
    muzzleX: number;
    muzzleY: number;
    muzzleZ: number;
    hitX: number;
    hitY: number;
    hitZ: number;
    targetPlayerId?: string;
    hitZone?: 'head' | 'body';
  }) {
    this.send({ type: 'player:shoot', ...payload });
  }
}

export const multiplayerClient = new MultiplayerClient();
