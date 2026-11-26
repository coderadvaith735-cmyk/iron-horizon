import React from 'react';
import { Play, RotateCcw, Settings, LogOut, Sun, Moon } from 'lucide-react';
import { GameMode, GameSettings, WEAPON_ORDER, WEAPON_SPECS, WeaponId } from '../game/types';

interface PauseMenuProps {
  mode: GameMode;
  activeWeapon: WeaponId;
  settings: GameSettings;
  pvpRoomCode?: string | null;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onSelectWeapon: (id: WeaponId) => void;
  onToggleLighting: () => void;
  onExitToMenu: () => void;
}

const MODE_LABELS: Record<GameMode, string> = {
  survival: 'Survival Waves',
  tdm: 'Team Deathmatch (AI)',
  mission: 'Tactical Mission',
  training: 'Firing Range & Training',
  pvp_ffa: 'Multiplayer PvP · Free-for-All',
  pvp_tdm: 'Multiplayer PvP · Team Deathmatch',
};

export const PauseMenu: React.FC<PauseMenuProps> = ({
  mode,
  activeWeapon,
  settings,
  pvpRoomCode,
  onResume,
  onRestart,
  onOpenSettings,
  onSelectWeapon,
  onToggleLighting,
  onExitToMenu,
}) => {
  const isPvp = mode === 'pvp_ffa' || mode === 'pvp_tdm';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-700/80 bg-[#11161d] p-6 text-slate-100 shadow-2xl">
        <div className="mb-5 border-b border-slate-800 pb-4">
          <div className="text-xs font-medium text-amber-400">
            {MODE_LABELS[mode]}
            {isPvp && pvpRoomCode ? ` · Room ${pvpRoomCode}` : ''}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-wide mt-0.5">
            {isPvp ? 'Tactical Menu' : 'Mission Paused'}
          </h2>
        </div>

        {/* Quick Weapon Switcher */}
        <div className="mb-5">
          <div className="text-xs font-medium text-slate-400 mb-2">Active Weapon Loadout</div>
          <div className="grid grid-cols-5 gap-1.5">
            {WEAPON_ORDER.map((id) => {
              const spec = WEAPON_SPECS[id];
              const isSelected = activeWeapon === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectWeapon(id)}
                  className={`rounded border px-2 py-2 text-center transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="font-mono-num text-[10px] text-slate-400">{spec.slot}</div>
                  <div className="text-xs font-semibold truncate">{spec.shortName}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onResume}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors"
          >
            <Play className="h-4 w-4 fill-current" />
            Resume Combat
          </button>

          {isPvp ? (
            <button
              onClick={onOpenSettings}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Settings
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onToggleLighting}
                className="flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {settings.lighting === 'day' ? (
                  <>
                    <Moon className="h-4 w-4 text-sky-400" />
                    Switch to Night
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4 text-amber-400" />
                    Switch to Day
                  </>
                )}
              </button>

              <button
                onClick={onOpenSettings}
                className="flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Settings
              </button>
            </div>
          )}

          {!isPvp && (
            <button
              onClick={onRestart}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="h-4 w-4 text-slate-400" />
              Restart Match
            </button>
          )}

          <button
            onClick={onExitToMenu}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-300 hover:bg-red-950/60 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {isPvp ? 'Leave PvP Match' : 'Return to Main Menu'}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-3 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>WASD Move</span>
          <span aria-hidden="true">·</span>
          <span>LMB Shoot</span>
          <span aria-hidden="true">·</span>
          <span>RMB Aim</span>
          <span aria-hidden="true">·</span>
          <span>R Reload</span>
          <span aria-hidden="true">·</span>
          <span>G Grenade</span>
          <span aria-hidden="true">·</span>
          <span>{isPvp ? 'Tab Scoreboard' : '1-5 Weapons'}</span>
        </div>
      </div>
    </div>
  );
};
