import { useEffect, useRef, useState } from 'react';
import { EndScreen } from './components/EndScreen';
import { GameHUD } from './components/GameHUD';
import { MainMenu } from './components/MainMenu';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { PauseMenu } from './components/PauseMenu';
import { SettingsModal } from './components/SettingsModal';
import { FpsGameEngine } from './game/engine';
import { multiplayerClient } from './game/multiplayerClient';
import type { PvpMode, RoomSnapshot } from './game/multiplayerTypes';
import {
  getUpgradeCost,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from './game/storage';
import {
  GameMode,
  GamePhase,
  GameSettings,
  HudSnapshot,
  LightingMode,
  MatchSummary,
  PlayerProgress,
  WeaponId,
  WeaponUpgrades,
} from './game/types';

function readInitialRoomCodeFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get('room') ?? '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FpsGameEngine | null>(null);

  const [initialRoomCode] = useState<string>(() => readInitialRoomCodeFromUrl());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [selectedMode, setSelectedMode] = useState<GameMode>('survival');
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('assault');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // PvP Multiplayer State
  const [pvpRoom, setPvpRoom] = useState<RoomSnapshot | null>(null);
  const [pvpPlayerId, setPvpPlayerId] = useState<string | null>(null);
  const [pvpConnected, setPvpConnected] = useState(false);
  const [pvpConnecting, setPvpConnecting] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const progressRef = useRef(progress);
  progressRef.current = progress;

  const hudRef = useRef(hud);
  hudRef.current = hud;

  const selectedWeaponRef = useRef(selectedWeapon);
  selectedWeaponRef.current = selectedWeapon;

  const pvpPlayerIdRef = useRef(pvpPlayerId);
  pvpPlayerIdRef.current = pvpPlayerId;

  const pvpRoomRef = useRef(pvpRoom);
  pvpRoomRef.current = pvpRoom;

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new FpsGameEngine(mount, settings, progress, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onPauseRequested: () => {
        if (phaseRef.current === 'playing') {
          engine.setPhase('paused');
          setPhase('paused');
        }
      },
      onMatchEnd: (summary) => {
        setMatchSummary(summary);
        setPhase(summary.outcome);

        const prev = progressRef.current;
        const updated: PlayerProgress = {
          ...prev,
          credits: prev.credits + summary.creditsEarned,
          totalKills: prev.totalKills + summary.kills,
          totalHeadshots: prev.totalHeadshots + summary.headshots,
          highestWave:
            summary.mode === 'survival'
              ? Math.max(prev.highestWave, summary.waveReached)
              : prev.highestWave,
          missionsCompleted:
            summary.mode === 'mission' && summary.outcome === 'victory'
              ? prev.missionsCompleted + 1
              : prev.missionsCompleted,
          tdmWins:
            summary.mode === 'tdm' && summary.outcome === 'victory'
              ? prev.tdmWins + 1
              : prev.tdmWins,
          bestScore: Math.max(prev.bestScore, summary.score),
        };
        setProgress(updated);
        saveProgress(updated);
      },
      onContextLost: () => {
        setContextLost(true);
      },
    });

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire WebSocket multiplayer events
  useEffect(() => {
    multiplayerClient.setHandlers({
      onConnected: () => {
        setPvpConnected(true);
        setPvpConnecting(false);
      },
      onDisconnected: () => {
        setPvpConnected(false);
      },
      onError: (message) => {
        setPvpConnecting(false);
        setPvpError(message);
      },
      onJoinedRoom: (playerId, room) => {
        setPvpConnecting(false);
        setPvpError(null);
        setPvpPlayerId(playerId);
        setPvpRoom(room);
        setSelectedMode(room.mode === 'tdm' ? 'pvp_tdm' : 'pvp_ffa');

        if (room.status === 'active') {
          setMatchSummary(null);
          setPhase('playing');
          engineRef.current?.startMultiplayerMatch(room, playerId, selectedWeaponRef.current);
        } else {
          setMatchSummary(null);
          setPhase('lobby');
          engineRef.current?.setPhase('lobby');
        }
      },
      onRoomUpdate: (room) => {
        const prevRoom = pvpRoomRef.current;
        const localId = pvpPlayerIdRef.current;
        setPvpRoom(room);
        setSelectedMode(room.mode === 'tdm' ? 'pvp_tdm' : 'pvp_ffa');

        if (room.status === 'active') {
          const wasLobbyOrEnded = !prevRoom || prevRoom.status !== 'active' || phaseRef.current === 'lobby';
          if (wasLobbyOrEnded && localId) {
            setMatchSummary(null);
            setShowSettings(false);
            setPhase('playing');
            engineRef.current?.startMultiplayerMatch(room, localId, selectedWeaponRef.current);
            engineRef.current?.requestPointerLock();
          } else {
            engineRef.current?.applyRoomUpdate(room);
          }
        } else if (room.status === 'lobby') {
          if (phaseRef.current !== 'lobby' && phaseRef.current !== 'menu') {
            setMatchSummary(null);
            setShowSettings(false);
            setPhase('lobby');
            engineRef.current?.setPhase('lobby');
          }
        }
      },
      onStateTick: (payload) => {
        engineRef.current?.applyNetworkStateTick(payload);
      },
      onCombatFx: (fx) => {
        engineRef.current?.applyRemoteCombatFx(fx);
      },
      onCombatHit: (hit) => {
        engineRef.current?.applyRemoteHit(hit);
      },
      onCombatKill: (kill) => {
        engineRef.current?.applyRemoteKill(kill);
      },
      onRespawn: (payload) => {
        engineRef.current?.applyRemoteRespawn(payload);
      },
      onBarrelExplode: (payload) => {
        engineRef.current?.applyRemoteBarrel(payload);
      },
      onExplosion: (payload) => {
        engineRef.current?.applyRemoteExplosion(payload);
      },
      onPickupSync: (payload) => {
        engineRef.current?.applyRemotePickup(payload);
      },
      onMatchEnded: (result) => {
        const localId = pvpPlayerIdRef.current;
        const currentRoom = pvpRoomRef.current;
        const localPlayer = result.players.find((p) => p.id === localId);
        const topPlayer = result.players[0];
        const pvpGameMode: GameMode = currentRoom?.mode === 'tdm' ? 'pvp_tdm' : 'pvp_ffa';

        let outcome: 'victory' | 'gameover' = 'gameover';
        if (currentRoom?.mode === 'tdm') {
          outcome = localPlayer && localPlayer.team === result.winnerTeam ? 'victory' : 'gameover';
        } else {
          outcome = topPlayer && topPlayer.id === localId ? 'victory' : 'gameover';
        }

        const latestHud = hudRef.current;
        const shotsFired = latestHud?.shotsFired ?? 0;
        const shotsHit = latestHud?.shotsHit ?? 0;
        const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
        const kills = localPlayer?.kills ?? latestHud?.kills ?? 0;
        const headshots = localPlayer?.headshots ?? latestHud?.headshots ?? 0;
        const score = localPlayer?.score ?? latestHud?.score ?? 0;
        const creditsEarned = kills * 20 + (outcome === 'victory' ? 120 : 40);

        const summary: MatchSummary = {
          mode: pvpGameMode,
          outcome,
          reason: result.reason,
          kills,
          headshots,
          score,
          waveReached: 1,
          accuracy,
          creditsEarned,
          durationSeconds: result.durationSeconds,
          pvpRankings: result.players.map((p) => ({
            id: p.id,
            callsign: p.callsign,
            team: p.team,
            kills: p.kills,
            deaths: p.deaths,
            headshots: p.headshots,
            score: p.score,
            alive: p.alive,
            isLocal: p.id === localId,
          })),
        };

        engineRef.current?.setPhase(outcome);
        setMatchSummary(summary);
        setPhase(outcome);

        const prev = progressRef.current;
        const updated: PlayerProgress = {
          ...prev,
          credits: prev.credits + creditsEarned,
          totalKills: prev.totalKills + kills,
          totalHeadshots: prev.totalHeadshots + headshots,
          bestScore: Math.max(prev.bestScore, score),
        };
        setProgress(updated);
        saveProgress(updated);
      },
    });

    return () => {
      multiplayerClient.leaveRoom();
    };
  }, []);

  const handleSettingsChange = (updated: GameSettings) => {
    setSettings(updated);
    saveSettings(updated);
    engineRef.current?.updateSettings(updated);
  };

  const handleToggleLighting = () => {
    const nextLighting = settings.lighting === 'day' ? 'night' : 'day';
    handleSettingsChange({ ...settings, lighting: nextLighting });
  };

  const handleCallsignChange = (callsign: string) => {
    const updated: PlayerProgress = { ...progress, callsign };
    setProgress(updated);
    saveProgress(updated);
  };

  const handleUpgradeWeapon = (weaponId: WeaponId, field: keyof WeaponUpgrades) => {
    const currentLvl = progress.upgrades[weaponId][field];
    if (currentLvl >= 3) return;
    const cost = getUpgradeCost(currentLvl);
    if (progress.credits < cost) return;

    const updated: PlayerProgress = {
      ...progress,
      credits: progress.credits - cost,
      upgrades: {
        ...progress.upgrades,
        [weaponId]: {
          ...progress.upgrades[weaponId],
          [field]: currentLvl + 1,
        },
      },
    };
    setProgress(updated);
    saveProgress(updated);
    engineRef.current?.updateProgress(updated);
  };

  const handleCreatePvpRoom = async (mode: PvpMode, lighting: LightingMode, targetKills: number) => {
    setPvpError(null);
    setPvpConnecting(true);
    try {
      await multiplayerClient.createRoom(progress.callsign || 'Vanguard-01', mode, lighting, targetKills);
    } catch (err) {
      setPvpConnecting(false);
      setPvpError(err instanceof Error ? err.message : 'Unable to connect to multiplayer server.');
    }
  };

  const handleJoinPvpRoom = async (code: string) => {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (clean.length < 4) {
      setPvpError('Enter a valid room code.');
      return;
    }
    setPvpError(null);
    setPvpConnecting(true);
    try {
      await multiplayerClient.joinRoom(clean, progress.callsign || 'Vanguard-01');
    } catch (err) {
      setPvpConnecting(false);
      setPvpError(err instanceof Error ? err.message : 'Unable to connect to multiplayer server.');
    }
  };

  const handleLeavePvpRoom = () => {
    multiplayerClient.leaveRoom();
    setPvpRoom(null);
    setPvpPlayerId(null);
    setPvpConnected(false);
    setMatchSummary(null);
    setShowSettings(false);
    if (selectedMode === 'pvp_ffa' || selectedMode === 'pvp_tdm') {
      setSelectedMode('survival');
    }
    setPhase('menu');
    engineRef.current?.setPhase('menu');
    // Reset URL query param if joined via ?room= link
    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleStartMatch = () => {
    const modeToPlay: GameMode =
      selectedMode === 'pvp_ffa' || selectedMode === 'pvp_tdm' ? 'survival' : selectedMode;
    setSelectedMode(modeToPlay);
    setMatchSummary(null);
    setShowSettings(false);
    setPhase('playing');
    engineRef.current?.startMatch(modeToPlay, selectedWeapon);
    engineRef.current?.requestPointerLock();
  };

  const handleResume = () => {
    setShowSettings(false);
    setPhase('playing');
    engineRef.current?.setPhase('playing');
    engineRef.current?.requestPointerLock();
  };

  const handlePause = () => {
    setPhase('paused');
    engineRef.current?.setPhase('paused');
  };

  const handleExitToMenu = () => {
    if (pvpRoom) {
      handleLeavePvpRoom();
      return;
    }
    setShowSettings(false);
    setMatchSummary(null);
    setPhase('menu');
    engineRef.current?.setPhase('menu');
  };

  const handleEndTraining = () => {
    if (!hud) {
      handleExitToMenu();
      return;
    }
    const accuracy = hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;
    const creditsEarned = Math.round(hud.score * 0.1) + hud.kills * 10;
    const updated: PlayerProgress = {
      ...progress,
      credits: progress.credits + creditsEarned,
      totalKills: progress.totalKills + hud.kills,
      totalHeadshots: progress.totalHeadshots + hud.headshots,
    };
    setProgress(updated);
    saveProgress(updated);
    engineRef.current?.updateProgress(updated);
    engineRef.current?.setPhase('victory');
    setMatchSummary({
      mode: 'training',
      outcome: 'victory',
      reason: 'Training session concluded',
      kills: hud.kills,
      headshots: hud.headshots,
      score: hud.score,
      waveReached: 1,
      accuracy,
      creditsEarned,
      durationSeconds: 0,
    });
    setPhase('victory');
  };

  const isPvpHost = Boolean(pvpRoom && pvpPlayerId && pvpRoom.hostId === pvpPlayerId);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0e11]">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e11] p-6 text-center">
          <div className="max-w-md rounded-lg border border-slate-700 bg-[#12171e] p-6">
            <h2 className="font-display text-xl font-bold text-white">Graphics Context Interrupted</h2>
            <p className="mt-2 text-sm text-slate-400">
              Your browser reset the 3D rendering context. Reload the page to reinitialize the battlefield.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950"
            >
              Reload Game
            </button>
          </div>
        </div>
      )}

      {phase === 'menu' && (
        <MainMenu
          settings={settings}
          progress={progress}
          selectedMode={selectedMode}
          selectedWeapon={selectedWeapon}
          initialTab={initialRoomCode ? 'multiplayer' : 'deploy'}
          initialRoomCode={initialRoomCode}
          pvpError={pvpError}
          pvpConnecting={pvpConnecting}
          onSelectMode={setSelectedMode}
          onSelectWeapon={setSelectedWeapon}
          onPlay={handleStartMatch}
          onOpenSettings={() => setShowSettings(true)}
          onToggleLighting={handleToggleLighting}
          onUpgradeWeapon={handleUpgradeWeapon}
          onCallsignChange={handleCallsignChange}
          onCreatePvpRoom={handleCreatePvpRoom}
          onJoinPvpRoom={handleJoinPvpRoom}
          onClearPvpError={() => setPvpError(null)}
          onExitSession={() => engineRef.current?.setPhase('menu')}
        />
      )}

      {phase === 'lobby' && pvpRoom && pvpPlayerId && (
        <MultiplayerLobby
          room={pvpRoom}
          localPlayerId={pvpPlayerId}
          progress={progress}
          selectedWeapon={selectedWeapon}
          connected={pvpConnected}
          onSelectWeapon={setSelectedWeapon}
          onUpdateConfig={(cfg) => multiplayerClient.updateLobbyConfig(cfg)}
          onSwitchTeam={(team) => multiplayerClient.switchTeam(team)}
          onStartMatch={() => multiplayerClient.startMatch()}
          onLeaveRoom={handleLeavePvpRoom}
        />
      )}

      {phase === 'playing' && hud && (
        <GameHUD
          hud={hud}
          mode={selectedMode}
          settings={settings}
          onPause={handlePause}
          onSelectWeapon={(id) => engineRef.current?.switchWeapon(id)}
          onCycleWeapon={() => engineRef.current?.cycleWeapon()}
          onReload={() => engineRef.current?.triggerReload()}
          onJump={() => engineRef.current?.triggerJump()}
          onGrenade={() => engineRef.current?.triggerGrenade()}
          onMobileMove={(x, y) => engineRef.current?.setMobileMove(x, y)}
          onMobileLook={(dx, dy) => engineRef.current?.addMobileLookDelta(dx, dy)}
          onMobileFire={(f) => engineRef.current?.setMobileFiring(f)}
          onMobileAds={(a) => engineRef.current?.setMobileAds(a)}
          onToggleTrainingBots={() => engineRef.current?.toggleTrainingBots()}
          onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
          onEndTrainingMatch={handleEndTraining}
        />
      )}

      {phase === 'paused' && (
        <PauseMenu
          mode={selectedMode}
          activeWeapon={hud?.activeWeapon ?? selectedWeapon}
          settings={settings}
          pvpRoomCode={pvpRoom?.code ?? null}
          onResume={handleResume}
          onRestart={handleStartMatch}
          onOpenSettings={() => setShowSettings(true)}
          onSelectWeapon={(id) => engineRef.current?.switchWeapon(id)}
          onToggleLighting={handleToggleLighting}
          onExitToMenu={handleExitToMenu}
        />
      )}

      {(phase === 'victory' || phase === 'gameover') && matchSummary && (
        <EndScreen
          summary={matchSummary}
          isPvpHost={isPvpHost}
          onPlayAgain={handleStartMatch}
          onReturnToLobby={() => multiplayerClient.returnToLobby()}
          onMainMenu={handleExitToMenu}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
