import React, { useState } from 'react';
import {
  Check,
  Copy,
  Crosshair,
  LogOut,
  Play,
  Shield,
  Sun,
  Moon,
  Users,
  RefreshCw,
} from 'lucide-react';
import type { PvpMode, PvpTeam, RoomSnapshot } from '../game/multiplayerTypes';
import { getEffectiveWeaponStats } from '../game/storage';
import { LightingMode, PlayerProgress, WEAPON_ORDER, WeaponId } from '../game/types';

interface MultiplayerLobbyProps {
  room: RoomSnapshot;
  localPlayerId: string;
  progress: PlayerProgress;
  selectedWeapon: WeaponId;
  connected: boolean;
  onSelectWeapon: (weapon: WeaponId) => void;
  onUpdateConfig: (config: { mode?: PvpMode; lighting?: LightingMode; targetKills?: number }) => void;
  onSwitchTeam: (team: PvpTeam) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

const KILL_TARGETS = [10, 15, 20, 30];

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  room,
  localPlayerId,
  progress,
  selectedWeapon,
  connected,
  onSelectWeapon,
  onUpdateConfig,
  onSwitchTeam,
  onStartMatch,
  onLeaveRoom,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const isHost = room.hostId === localPlayerId;
  const localPlayer = room.players.find((p) => p.id === localPlayerId);
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?room=${room.code}` : room.code;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const bluePlayers = room.players.filter((p) => p.team === 'blue');
  const redPlayers = room.players.filter((p) => p.team === 'red');

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#0b0e11]/85 text-slate-100 overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-[#0b0e11]/95 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="font-display text-xl font-bold tracking-wider text-white">IRON HORIZON</div>
          <span className="text-slate-600" aria-hidden="true">
            |
          </span>
          <div className="text-sm font-medium text-amber-400">
            PvP Room Staging · {connected ? 'Connected' : 'Reconnecting'}
          </div>
        </div>

        <button
          onClick={onLeaveRoom}
          className="flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/30 px-3.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/60 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Leave Room
        </button>
      </header>

      <main className="flex-1 overflow-y-auto tactical-scroll p-6 sm:p-8">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Room Code, Invite Link, and Player Roster */}
          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-lg border border-slate-800 bg-[#10151c]/95 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-400">Room Join Code</div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono-num text-3xl sm:text-4xl font-bold tracking-[0.22em] text-amber-400">
                    {room.code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center gap-1.5"
                    aria-label="Copy room code"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? 'Copied' : 'Code'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Share this code or invite link with friends on any desktop or phone on your network.
                </p>
              </div>

              <button
                onClick={handleCopyInvite}
                className="flex items-center justify-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copiedLink ? 'Invite Link Copied' : 'Copy Direct Join Link'}
              </button>
            </div>

            {/* Roster */}
            <div className="rounded-lg border border-slate-800 bg-[#10151c]/95 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Connected Operators ({room.players.length}/10)
                  </h2>
                  <p className="text-xs text-slate-400">Human players only · No AI bots in PvP</p>
                </div>

                {room.mode === 'tdm' && localPlayer && (
                  <button
                    onClick={() => onSwitchTeam(localPlayer.team === 'blue' ? 'red' : 'blue')}
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                    Switch to {localPlayer.team === 'blue' ? 'Red Team' : 'Blue Team'}
                  </button>
                )}
              </div>

              {room.mode === 'ffa' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {room.players.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-sm ${
                        p.id === localPlayerId
                          ? 'border-amber-500/70 bg-amber-500/10'
                          : 'border-slate-800 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Crosshair className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="font-semibold text-white truncate">{p.callsign}</span>
                        {p.id === localPlayerId && (
                          <span className="text-xs text-amber-300 font-medium">(You)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 ml-2">
                        {p.isHost ? 'Host' : p.connected ? 'Ready' : 'Reconnecting'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Blue Team */}
                  <div className="rounded-md border border-sky-500/30 bg-sky-950/15 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-sky-400 pb-1 border-b border-sky-500/20">
                      <span>BLUE SQUAD</span>
                      <span className="font-mono-num">{bluePlayers.length}</span>
                    </div>
                    {bluePlayers.length === 0 && (
                      <div className="text-xs text-slate-500 py-2">No operators assigned</div>
                    )}
                    {bluePlayers.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                          p.id === localPlayerId
                            ? 'border-sky-400 bg-sky-500/15 text-white'
                            : 'border-slate-800 bg-slate-900/75 text-slate-200'
                        }`}
                      >
                        <span className="font-semibold truncate">
                          {p.callsign} {p.id === localPlayerId ? '(You)' : ''}
                        </span>
                        <span className="text-slate-400 ml-2 shrink-0">
                          {p.isHost ? 'Host' : p.connected ? 'Ready' : 'Sync'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Red Team */}
                  <div className="rounded-md border border-red-500/30 bg-red-950/15 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-red-400 pb-1 border-b border-red-500/20">
                      <span>RED SQUAD</span>
                      <span className="font-mono-num">{redPlayers.length}</span>
                    </div>
                    {redPlayers.length === 0 && (
                      <div className="text-xs text-slate-500 py-2">No operators assigned</div>
                    )}
                    {redPlayers.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                          p.id === localPlayerId
                            ? 'border-red-400 bg-red-500/15 text-white'
                            : 'border-slate-800 bg-slate-900/75 text-slate-200'
                        }`}
                      >
                        <span className="font-semibold truncate">
                          {p.callsign} {p.id === localPlayerId ? '(You)' : ''}
                        </span>
                        <span className="text-slate-400 ml-2 shrink-0">
                          {p.isHost ? 'Host' : p.connected ? 'Ready' : 'Sync'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Match Rules & Starting Weapon */}
          <div className="lg:col-span-4 rounded-lg border border-slate-800 bg-[#10151c]/95 p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="font-display text-lg font-bold text-white">Match Configuration</h2>
                <p className="text-xs text-slate-400">
                  {isHost ? 'You control the room rules.' : 'Configured by room host.'}
                </p>
              </div>

              {/* Mode */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Combat Mode</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ mode: 'ffa' })}
                    className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                      room.mode === 'ffa'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Free-for-All
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ mode: 'tdm' })}
                    className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                      room.mode === 'tdm'
                        ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Team DM
                  </button>
                </div>
              </div>

              {/* Lighting */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Battlefield Lighting</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ lighting: 'day' })}
                    className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                      room.lighting === 'day'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    Daylight
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => onUpdateConfig({ lighting: 'night' })}
                    className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                      room.lighting === 'night'
                        ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    Night Ops
                  </button>
                </div>
              </div>

              {/* Target Kills */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Score Limit (Eliminations)</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {KILL_TARGETS.map((k) => (
                    <button
                      key={k}
                      disabled={!isHost}
                      onClick={() => onUpdateConfig({ targetKills: k })}
                      className={`rounded border py-1.5 font-mono-num text-xs font-bold transition-colors ${
                        room.targetKills === k
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      } ${!isHost ? 'cursor-default opacity-85' : 'hover:border-slate-600'}`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {/* Starting Weapon */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1.5">Your Starting Weapon</div>
                <div className="space-y-1.5">
                  {WEAPON_ORDER.map((id) => {
                    const s = getEffectiveWeaponStats(id, progress);
                    const isSel = selectedWeapon === id;
                    return (
                      <button
                        key={id}
                        onClick={() => onSelectWeapon(id)}
                        className={`w-full flex items-center justify-between rounded border px-3 py-2 text-left text-xs transition-colors ${
                          isSel
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-semibold">{s.name}</span>
                        <span className="font-mono-num text-slate-400">{s.magSize} rds</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2">
              {isHost ? (
                <>
                  <button
                    onClick={onStartMatch}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Launch PvP Match
                  </button>
                  {room.players.length < 2 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      1 player connected · Share the room code or join link to battle friends.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-slate-700 bg-slate-900/90 px-4 py-3 text-center text-xs font-medium text-slate-300">
                  Waiting for host to launch the match...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
