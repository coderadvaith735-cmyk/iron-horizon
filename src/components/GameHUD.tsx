import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Crosshair,
  Shield,
  Heart,
  RotateCw,
  Bomb,
  ArrowUp,
  Target,
  Bot,
  Trophy,
  Skull,
} from 'lucide-react';
import {
  GameMode,
  GameSettings,
  HudSnapshot,
  WEAPON_ORDER,
  WEAPON_SPECS,
  WeaponId,
} from '../game/types';
import { Minimap } from './Minimap';

interface GameHUDProps {
  hud: HudSnapshot;
  mode: GameMode;
  settings: GameSettings;
  onPause: () => void;
  onSelectWeapon: (id: WeaponId) => void;
  onCycleWeapon: () => void;
  onReload: () => void;
  onJump: () => void;
  onGrenade: () => void;
  onMobileMove: (x: number, y: number) => void;
  onMobileLook: (dx: number, dy: number) => void;
  onMobileFire: (firing: boolean) => void;
  onMobileAds: (ads: boolean) => void;
  onToggleTrainingBots: () => void;
  onRequestPointerLock: () => void;
  onEndTrainingMatch: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  mode,
  settings,
  onPause,
  onSelectWeapon,
  onCycleWeapon,
  onReload,
  onJump,
  onGrenade,
  onMobileMove,
  onMobileLook,
  onMobileFire,
  onMobileAds,
  onToggleTrainingBots,
  onRequestPointerLock,
  onEndTrainingMatch,
}) => {
  const isTouchDevice =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const showTouchControls =
    settings.touchControls === 'on' || (settings.touchControls === 'auto' && isTouchDevice);

  const [showScoreboard, setShowScoreboard] = useState(false);

  // Tab key toggles or holds PvP scoreboard
  useEffect(() => {
    if (!hud.pvp) {
      setShowScoreboard(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hud.pvp]);

  // Virtual Joystick state
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyTouchId = useRef<number | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  // Touch Look Pad state
  const lookTouchId = useRef<number | null>(null);
  const lookLastPos = useRef({ x: 0, y: 0 });

  const handleJoyStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (!touch) return;
    joyTouchId.current = touch.identifier;
    updateJoyFromTouch(touch);
  };

  const handleJoyMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        updateJoyFromTouch(t);
        break;
      }
    }
  };

  const handleJoyEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current) {
        joyTouchId.current = null;
        setJoyKnob({ x: 0, y: 0 });
        onMobileMove(0, 0);
        break;
      }
    }
  };

  const updateJoyFromTouch = (touch: React.Touch) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy });
    onMobileMove(dx / maxR, -dy / maxR);
  };

  const handleLookStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    lookTouchId.current = touch.identifier;
    lookLastPos.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleLookMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchId.current) {
        const dx = t.clientX - lookLastPos.current.x;
        const dy = t.clientY - lookLastPos.current.y;
        lookLastPos.current = { x: t.clientX, y: t.clientY };
        onMobileLook(dx, dy);
        break;
      }
    }
  };

  const handleLookEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId.current) {
        lookTouchId.current = null;
        break;
      }
    }
  };

  const activeAmmo = hud.weapons[hud.activeWeapon];
  const activeSpec = WEAPON_SPECS[hud.activeWeapon];
  const isSniperScoped = hud.activeWeapon === 'sniper' && hud.isAds && !hud.isReloading;

  const crosshairGap = Math.max(5, Math.min(28, 7 + hud.spreadFactor));

  const formatTimer = (sec: number) => {
    const safeSec = Math.max(0, Math.floor(sec));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const pvpLeader = hud.pvp?.scoreboard[0] ?? null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none touch-none-game">
      {/* Right-half invisible touch look surface when mobile controls active */}
      {showTouchControls && (
        <div
          className="fixed inset-y-0 right-0 w-1/2 pointer-events-auto"
          onTouchStart={handleLookStart}
          onTouchMove={handleLookMove}
          onTouchEnd={handleLookEnd}
          onTouchCancel={handleLookEnd}
        />
      )}

      {/* Damage Screen Vignette */}
      {hud.damageFlash > 0.02 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle, transparent 48%, rgba(220, 38, 38, ${
              hud.damageFlash * 0.52
            }) 100%)`,
          }}
        />
      )}

      {/* Directional Damage Arc */}
      {hud.damageFlash > 0.05 && hud.damageDirectionAngle !== null && (
        <div
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 pointer-events-none"
          style={{
            transform: `translate(-50%, -50%) rotate(${-hud.damageDirectionAngle}rad)`,
            opacity: hud.damageFlash,
          }}
        >
          <div className="mx-auto w-14 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
        </div>
      )}

      {/* Sniper Scope 3.5x Reticle Overlay */}
      {isSniperScoped && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at center, transparent 27%, rgba(5, 8, 12, 0.98) 31%)',
            }}
          />
          <div className="absolute w-[56vmin] h-[56vmin] rounded-full border-2 border-slate-600/80">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-200/75" />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-200/75" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
        </div>
      )}

      {/* Dynamic Center Crosshair */}
      {!isSniperScoped && (!hud.pvp || hud.pvp.localAlive) && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-1 h-1 rounded-full bg-white/90 shadow-sm" />
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-white/90"
            style={{ bottom: `${crosshairGap}px` }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-white/90"
            style={{ top: `${crosshairGap}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-white/90"
            style={{ right: `${crosshairGap}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-2.5 bg-white/90"
            style={{ left: `${crosshairGap}px` }}
          />
        </div>
      )}

      {/* Hitmarker X */}
      {hud.hitMarkerType !== 'none' && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {[45, 135, 225, 315].map((deg) => (
            <div
              key={deg}
              className={`absolute left-1/2 top-1/2 w-[2px] h-3 origin-bottom ${
                hud.hitMarkerType === 'kill' || hud.hitMarkerType === 'head'
                  ? 'bg-red-500'
                  : 'bg-amber-300'
              }`}
              style={{
                transform: `translate(-50%, -100%) rotate(${deg}deg) translateY(-6px)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Projected 3D Health & Name Tags */}
      {hud.enemyTags.map((tag) => {
        const pct = Math.max(0, Math.min(100, (tag.hp / tag.maxHp) * 100));
        return (
          <div
            key={tag.id}
            className="fixed -translate-x-1/2 -translate-y-full pointer-events-none"
            style={{ left: tag.screenX, top: tag.screenY }}
          >
            <div
              className={`bg-[#0b0e11]/85 px-2 py-0.5 rounded text-center min-w-[76px] border ${
                tag.isFriendly ? 'border-sky-500/70' : 'border-slate-700/80'
              }`}
            >
              <div
                className={`text-[10px] font-medium whitespace-nowrap ${
                  tag.isFriendly ? 'text-sky-300' : 'text-slate-200'
                }`}
              >
                {tag.label} · {tag.distance}m
              </div>
              <div className="mt-0.5 h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${tag.isFriendly ? 'bg-sky-400' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* PvP Respawn Overlay */}
      {hud.pvp && !hud.pvp.localAlive && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/45 pointer-events-none">
          <div className="rounded-lg border border-red-500/60 bg-[#0b0e11]/95 px-6 py-4 text-center shadow-2xl">
            <Skull className="h-7 w-7 text-red-400 mx-auto mb-1.5" />
            <div className="font-display text-xl font-bold text-white">Operator Eliminated</div>
            <div className="mt-1 text-sm text-slate-300">
              Redeploying in{' '}
              <span className="font-mono-num font-bold text-amber-400">
                {hud.pvp.respawnRemaining.toFixed(1)}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TOP BAR: Minimap (Left), Mode Status (Center), Pause & Kill Feed (Right) */}
      <div className="flex items-start justify-between p-3 sm:p-5 gap-3">
        {/* Top-Left: Minimap + Score/Kills */}
        <div className="flex items-start gap-3">
          <Minimap hud={hud} />
          <div className="hidden sm:flex flex-col gap-1 bg-[#0b0e11]/80 border border-slate-700/70 rounded-md px-3 py-2">
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span>
                Kills <strong className="font-mono-num text-white ml-1">{hud.kills}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Score <strong className="font-mono-num text-amber-400 ml-1">{hud.score}</strong>
              </span>
            </div>
            {hud.interactionHint && (
              <div className="text-xs font-medium text-sky-300 max-w-[220px]">
                {hud.interactionHint}
              </div>
            )}
          </div>
        </div>

        {/* Top-Center: Mode-Specific Tactical Status */}
        <div className="bg-[#0b0e11]/85 border border-slate-700/75 rounded-md px-4 py-2 text-center min-w-[180px] sm:min-w-[260px]">
          {mode === 'survival' && (
            <div>
              <div className="text-xs text-slate-400">
                Wave <span className="font-mono-num text-amber-400 font-bold">{hud.wave}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                {hud.waveIntermission > 0 ? (
                  <span className="text-emerald-400 font-semibold">
                    Next wave in {hud.waveIntermission}s
                  </span>
                ) : (
                  <span>
                    Hostiles <span className="font-mono-num text-red-400 font-bold">{hud.enemiesAlive}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === 'tdm' && (
            <div className="flex items-center justify-center gap-4">
              <div className="text-right">
                <div className="text-[10px] text-sky-400 font-semibold">ALLIES</div>
                <div className="font-mono-num text-xl font-bold text-white leading-none">
                  {hud.tdmBlueScore}
                </div>
              </div>
              <div className="px-2 border-x border-slate-800">
                <div className="font-mono-num text-sm font-bold text-amber-400">
                  {formatTimer(hud.tdmTimeRemaining)}
                </div>
                <div className="text-[10px] text-slate-400">Target {hud.tdmTargetScore}</div>
              </div>
              <div className="text-left">
                <div className="text-[10px] text-red-400 font-semibold">HOSTILES</div>
                <div className="font-mono-num text-xl font-bold text-white leading-none">
                  {hud.tdmRedScore}
                </div>
              </div>
            </div>
          )}

          {hud.pvp && hud.pvp.mode === 'tdm' && (
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <div className="text-right">
                <div className="text-[10px] text-sky-400 font-semibold">BLUE</div>
                <div className="font-mono-num text-xl font-bold text-white leading-none">
                  {hud.pvp.blueScore}
                </div>
              </div>
              <div className="px-2.5 border-x border-slate-800">
                <div className="font-mono-num text-sm font-bold text-amber-400">
                  {formatTimer(hud.pvp.timeRemaining)}
                </div>
                <div className="text-[10px] text-slate-400">
                  Room {hud.pvp.roomCode} · To {hud.pvp.targetKills}
                </div>
              </div>
              <div className="text-left">
                <div className="text-[10px] text-red-400 font-semibold">RED</div>
                <div className="font-mono-num text-xl font-bold text-white leading-none">
                  {hud.pvp.redScore}
                </div>
              </div>
              <button
                onClick={() => setShowScoreboard((v) => !v)}
                className="pointer-events-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800"
                title="Toggle Scoreboard (Tab)"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
              </button>
            </div>
          )}

          {hud.pvp && hud.pvp.mode === 'ffa' && (
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              <div className="text-left">
                <div className="text-[10px] text-slate-400 font-semibold">
                  ROOM {hud.pvp.roomCode} · TO {hud.pvp.targetKills}
                </div>
                <div className="text-xs text-slate-200">
                  {pvpLeader ? (
                    <>
                      Leader <strong className="text-amber-400">{pvpLeader.callsign}</strong>{' '}
                      <span className="font-mono-num">({pvpLeader.kills})</span>
                    </>
                  ) : (
                    'Free-for-All'
                  )}
                </div>
              </div>
              <div className="px-2.5 border-l border-slate-800">
                <div className="font-mono-num text-sm font-bold text-amber-400">
                  {formatTimer(hud.pvp.timeRemaining)}
                </div>
              </div>
              <button
                onClick={() => setShowScoreboard((v) => !v)}
                className="pointer-events-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800"
                title="Toggle Scoreboard (Tab)"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
              </button>
            </div>
          )}

          {mode === 'mission' && hud.mission && (
            <div>
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-400">
                <Target className="h-3.5 w-3.5" />
                <span>
                  Objective {hud.mission.stageIndex}/{hud.mission.totalStages}: {hud.mission.title}
                </span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5">{hud.mission.description}</div>
              <div className="mt-1.5 h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  style={{ width: `${Math.round(hud.mission.progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {mode === 'training' && (
            <div className="flex items-center justify-center gap-3 pointer-events-auto">
              <div className="text-xs text-slate-300">
                Targets <strong className="font-mono-num text-amber-400">{hud.trainingTargetsHit}</strong>
                <span className="mx-2" aria-hidden="true">·</span>
                Pts <strong className="font-mono-num text-white">{hud.trainingScore}</strong>
              </div>
              <button
                onClick={onToggleTrainingBots}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  hud.trainingBotsActive
                    ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                {hud.trainingBotsActive ? 'Clear Bots' : 'Spawn Bots'}
              </button>
              <button
                onClick={onEndTrainingMatch}
                className="rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
              >
                Finish
              </button>
            </div>
          )}
        </div>

        {/* Top-Right: Pause Button + Kill Feed */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onPause}
            className="pointer-events-auto flex h-11 items-center gap-2 rounded-md border border-slate-700/80 bg-[#0b0e11]/85 px-3.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Pause Game"
          >
            <Pause className="h-4 w-4 text-amber-400" />
            <span className="hidden sm:inline">Pause (ESC)</span>
          </button>

          <div className="hidden sm:flex flex-col items-end gap-1">
            {hud.killFeed.map((kf) => (
              <div
                key={kf.id}
                className="rounded bg-[#0b0e11]/80 border border-slate-800 px-2.5 py-1 text-xs text-slate-200 whitespace-nowrap"
              >
                <span className={kf.isPlayerKiller ? 'text-amber-400 font-semibold' : 'text-sky-300'}>
                  {kf.killer}
                </span>
                <span className="mx-1.5 text-slate-500">[{kf.weapon}{kf.headshot ? ' HS' : ''}]</span>
                <span className="text-red-400">{kf.victim}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live PvP Scoreboard Overlay (Hold Tab or Tap Trophy) */}
      {hud.pvp && showScoreboard && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 pointer-events-auto">
          <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-[#0e131a] p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  {hud.pvp.mode === 'tdm' ? 'PvP Team Deathmatch' : 'PvP Free-for-All'} · Room {hud.pvp.roomCode}
                </h3>
                <p className="text-xs text-slate-400">
                  Target {hud.pvp.targetKills} eliminations · {formatTimer(hud.pvp.timeRemaining)} remaining
                </p>
              </div>
              <button
                onClick={() => setShowScoreboard(false)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Operator</th>
                    {hud.pvp.mode === 'tdm' && <th className="py-2 px-2">Squad</th>}
                    <th className="py-2 px-2 text-right">Kills</th>
                    <th className="py-2 px-2 text-right">Deaths</th>
                    <th className="py-2 px-2 text-right">HS</th>
                    <th className="py-2 pl-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {hud.pvp.scoreboard.map((row) => (
                    <tr
                      key={row.id}
                      className={row.isLocal ? 'bg-amber-500/10 text-amber-200' : 'text-slate-200'}
                    >
                      <td className="py-2 pr-3 font-semibold">
                        {row.callsign} {row.isLocal ? '(You)' : ''}
                      </td>
                      {hud.pvp?.mode === 'tdm' && (
                        <td className="py-2 px-2">
                          <span
                            className={
                              row.team === 'blue' ? 'text-sky-400 font-semibold' : 'text-red-400 font-semibold'
                            }
                          >
                            {row.team === 'blue' ? 'Blue' : 'Red'}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-2 text-right font-mono-num font-bold">{row.kills}</td>
                      <td className="py-2 px-2 text-right font-mono-num text-slate-400">{row.deaths}</td>
                      <td className="py-2 px-2 text-right font-mono-num text-amber-400">{row.headshots}</td>
                      <td className="py-2 pl-2 text-right font-mono-num font-bold">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Pointer Lock Resume Prompt */}
      {!showTouchControls && !hud.pointerLocked && (!hud.pvp || hud.pvp.localAlive) && !showScoreboard && (
        <div className="fixed inset-x-0 top-24 flex justify-center pointer-events-none">
          <button
            onClick={onRequestPointerLock}
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-amber-500/60 bg-[#0b0e11]/90 px-4 py-2 text-xs font-semibold text-amber-300 shadow-lg hover:bg-slate-900"
          >
            <Crosshair className="h-4 w-4" />
            Click viewport to lock mouse aim
          </button>
        </div>
      )}

      {/* BOTTOM HUD: Health/Armor (Left) & Weapon/Ammo (Right) */}
      <div
        className={`fixed inset-x-0 flex items-end justify-between px-3 sm:px-5 ${
          showTouchControls ? 'bottom-36 sm:bottom-5' : 'bottom-4 sm:bottom-5'
        }`}
      >
        {/* Health, Armor, Stamina */}
        <div className="bg-[#0b0e11]/85 border border-slate-700/75 rounded-md p-3 w-48 sm:w-64 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Heart className="h-3.5 w-3.5 text-red-400" />
              Health
            </span>
            <span className="font-mono-num font-bold text-white">{hud.health}</span>
          </div>
          <div className="h-2 w-full rounded-sm bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                hud.health > 35 ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ width: `${(hud.health / hud.maxHealth) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Shield className="h-3.5 w-3.5 text-sky-400" />
              Armor
            </span>
            <span className="font-mono-num font-bold text-sky-300">{hud.armor}</span>
          </div>
          <div className="h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-150"
              style={{ width: `${(hud.armor / hud.maxArmor) * 100}%` }}
            />
          </div>

          <div className="h-1 w-full rounded-sm bg-slate-800/80 overflow-hidden">
            <div
              className="h-full bg-amber-400/85"
              style={{ width: `${hud.stamina}%` }}
            />
          </div>
        </div>

        {/* Weapon, Ammo & Quick-Switch Strip */}
        <div className="flex flex-col items-end gap-2">
          {/* Reloading Progress Bar */}
          {hud.isReloading && (
            <div className="bg-[#0b0e11]/90 border border-amber-500/50 rounded px-3 py-1.5 w-44">
              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-300 mb-1">
                <span>Reloading</span>
                <span className="font-mono-num">{Math.round(hud.reloadProgress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${hud.reloadProgress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Active Weapon & Ammo Readout */}
          <div className="bg-[#0b0e11]/85 border border-slate-700/75 rounded-md px-4 py-2.5 text-right">
            <div className="flex items-center justify-end gap-3 text-xs text-slate-400">
              <span>{activeSpec.name}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-amber-400 font-mono-num">
                <Bomb className="h-3.5 w-3.5" />
                {hud.grenades}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-end gap-1.5">
              <span
                className={`font-mono-num text-3xl font-bold leading-none ${
                  activeAmmo.mag <= Math.ceil(activeAmmo.maxMag * 0.25)
                    ? 'text-red-400'
                    : 'text-white'
                }`}
              >
                {activeAmmo.mag}
              </span>
              <span className="font-mono-num text-sm text-slate-400">
                / {mode === 'training' ? '∞' : activeAmmo.reserve}
              </span>
            </div>
          </div>

          {/* 1-5 Weapon Switch Strip (Desktop clickable too) */}
          <div className="hidden md:flex items-center gap-1 pointer-events-auto">
            {WEAPON_ORDER.map((id) => {
              const s = WEAPON_SPECS[id];
              const active = hud.activeWeapon === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectWeapon(id)}
                  className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                      : 'border-slate-800 bg-[#0b0e11]/80 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-mono-num mr-1 text-[10px]">{s.slot}</span>
                  {s.shortName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MOBILE / ANDROID TOUCH CONTROLS OVERLAY */}
      {showTouchControls && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex items-end justify-between px-4 pointer-events-none">
          {/* Left Virtual Thumbstick */}
          <div
            ref={joyRef}
            onTouchStart={handleJoyStart}
            onTouchMove={handleJoyMove}
            onTouchEnd={handleJoyEnd}
            onTouchCancel={handleJoyEnd}
            className="pointer-events-auto relative h-28 w-28 rounded-full border-2 border-slate-500/50 bg-slate-900/55 flex items-center justify-center"
          >
            <div
              className="h-12 w-12 rounded-full bg-amber-400/85 border-2 border-white/60 shadow-lg"
              style={{
                transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              }}
            />
          </div>

          {/* Right Action Cluster (>= 44px touch targets) */}
          <div className="pointer-events-auto grid grid-cols-3 gap-2 items-center">
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onCycleWeapon();
              }}
              className="h-12 w-12 rounded-full border border-slate-600 bg-slate-900/85 text-xs font-bold text-slate-200 flex items-center justify-center"
              aria-label="Switch weapon"
            >
              {activeSpec.shortName}
            </button>
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onReload();
              }}
              className="h-12 w-12 rounded-full border border-slate-600 bg-slate-900/85 text-slate-200 flex items-center justify-center"
              aria-label="Reload"
            >
              <RotateCw className="h-5 w-5" />
            </button>
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onJump();
              }}
              className="h-12 w-12 rounded-full border border-slate-600 bg-slate-900/85 text-slate-200 flex items-center justify-center"
              aria-label="Jump"
            >
              <ArrowUp className="h-5 w-5" />
            </button>

            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onGrenade();
              }}
              className="h-12 w-12 rounded-full border border-slate-600 bg-slate-900/85 text-amber-400 flex items-center justify-center"
              aria-label="Throw grenade"
            >
              <Bomb className="h-5 w-5" />
            </button>
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onMobileAds(!hud.isAds);
              }}
              className={`h-12 w-12 rounded-full border flex items-center justify-center ${
                hud.isAds
                  ? 'border-sky-400 bg-sky-500/30 text-sky-200'
                  : 'border-slate-600 bg-slate-900/85 text-slate-200'
              }`}
              aria-label="Aim down sights"
            >
              <Crosshair className="h-5 w-5" />
            </button>
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onMobileFire(true);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                onMobileFire(false);
              }}
              onTouchCancel={(e) => {
                e.stopPropagation();
                onMobileFire(false);
              }}
              className="h-14 w-14 rounded-full border-2 border-amber-300 bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow-lg"
              aria-label="Fire weapon"
            >
              FIRE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
