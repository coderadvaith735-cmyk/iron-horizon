import React, { useEffect, useState } from 'react';
import {
  Play,
  Settings,
  Sun,
  Moon,
  Shield,
  Crosshair,
  Target,
  Users,
  Award,
  ArrowUpCircle,
  Power,
  Radio,
  LogIn,
  PlusCircle,
} from 'lucide-react';
import type { PvpMode } from '../game/multiplayerTypes';
import { getEffectiveWeaponStats, getUpgradeCost } from '../game/storage';
import {
  GameMode,
  GameSettings,
  LightingMode,
  PlayerProgress,
  WEAPON_ORDER,
  WeaponId,
  WeaponUpgrades,
} from '../game/types';

interface MainMenuProps {
  settings: GameSettings;
  progress: PlayerProgress;
  selectedMode: GameMode;
  selectedWeapon: WeaponId;
  initialTab?: 'deploy' | 'multiplayer' | 'armory' | 'career';
  initialRoomCode?: string;
  pvpError?: string | null;
  pvpConnecting?: boolean;
  onSelectMode: (mode: GameMode) => void;
  onSelectWeapon: (weapon: WeaponId) => void;
  onPlay: () => void;
  onOpenSettings: () => void;
  onToggleLighting: () => void;
  onUpgradeWeapon: (weaponId: WeaponId, field: keyof WeaponUpgrades) => void;
  onCallsignChange: (callsign: string) => void;
  onCreatePvpRoom: (mode: PvpMode, lighting: LightingMode, targetKills: number) => void;
  onJoinPvpRoom: (code: string) => void;
  onClearPvpError: () => void;
  onExitSession: () => void;
}

const MODE_LIST: Array<{
  id: GameMode;
  title: string;
  subtitle: string;
  summary: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'survival',
    title: 'Survival Waves',
    subtitle: 'Endless Escalation',
    summary: 'Hold the sector against progressively tougher waves of Riflemen, Rushers, Snipers, and Heavy Juggernauts.',
    icon: <Shield className="h-5 w-5 text-amber-400" />,
  },
  {
    id: 'tdm',
    title: 'Team Deathmatch',
    subtitle: '5v5 AI Squad Battle',
    summary: 'Fight alongside 4 Allied AI soldiers against a 5-soldier hostile squad. First team to 25 kills wins.',
    icon: <Users className="h-5 w-5 text-sky-400" />,
  },
  {
    id: 'mission',
    title: 'Tactical Mission',
    subtitle: '4-Stage Operation',
    summary: 'Clear the forward outpost, decrypt the comms terminal, neutralize the bunker commander, and reach extraction.',
    icon: <Target className="h-5 w-5 text-emerald-400" />,
  },
  {
    id: 'training',
    title: 'Training Range',
    subtitle: 'Ballistics & Drills',
    summary: 'Practice recoil control on static and moving targets with unlimited reserve ammo and optional sparring bots.',
    icon: <Crosshair className="h-5 w-5 text-slate-300" />,
  },
];

export const MainMenu: React.FC<MainMenuProps> = ({
  settings,
  progress,
  selectedMode,
  selectedWeapon,
  initialTab = 'deploy',
  initialRoomCode = '',
  pvpError,
  pvpConnecting = false,
  onSelectMode,
  onSelectWeapon,
  onPlay,
  onOpenSettings,
  onToggleLighting,
  onUpgradeWeapon,
  onCallsignChange,
  onCreatePvpRoom,
  onJoinPvpRoom,
  onClearPvpError,
  onExitSession,
}) => {
  const [activeTab, setActiveTab] = useState<'deploy' | 'multiplayer' | 'armory' | 'career'>(initialTab);
  const [exitNotice, setExitNotice] = useState(false);

  // Multiplayer form state
  const [pvpMode, setPvpMode] = useState<PvpMode>('ffa');
  const [pvpLighting, setPvpLighting] = useState<LightingMode>(settings.lighting);
  const [pvpTargetKills, setPvpTargetKills] = useState<number>(20);
  const [joinCode, setJoinCode] = useState<string>(initialRoomCode);

  useEffect(() => {
    if (initialRoomCode) {
      setJoinCode(initialRoomCode);
      setActiveTab('multiplayer');
    }
  }, [initialRoomCode]);

  const selectedWeaponStats = getEffectiveWeaponStats(selectedWeapon, progress);
  const selectedUpgrades = progress.upgrades[selectedWeapon];

  const upgradeRows: Array<{ key: keyof WeaponUpgrades; label: string; detail: string }> = [
    { key: 'damageLevel', label: 'Match-Grade Barrel', detail: '+12% Damage per tier' },
    { key: 'fireRateLevel', label: 'Tuned Gas System', detail: '+10% Fire Rate per tier' },
    { key: 'capacityLevel', label: 'Extended Magazine', detail: '+20% Ammo Capacity per tier' },
    { key: 'reloadLevel', label: 'Speed Magwell', detail: '-12% Reload Time per tier' },
  ];

  const singlePlayerMode: GameMode =
    selectedMode === 'pvp_ffa' || selectedMode === 'pvp_tdm' ? 'survival' : selectedMode;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#0b0e11]/75 text-slate-100 overflow-hidden">
      {/* Three-Zone Top Bar */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 border-b border-slate-800/90 bg-[#0b0e11]/90 px-4 sm:px-6 py-4 overflow-x-auto">
        <div className="font-display text-lg sm:text-xl font-bold tracking-wider text-white whitespace-nowrap shrink-0">
          IRON HORIZON
        </div>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveTab('deploy')}
            className={`pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'deploy'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Solo Ops
          </button>
          <button
            onClick={() => setActiveTab('multiplayer')}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'multiplayer'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="h-3.5 w-3.5 text-emerald-400" />
            Multiplayer PvP
          </button>
          <button
            onClick={() => setActiveTab('armory')}
            className={`pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'armory'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Weapon Armory
          </button>
          <button
            onClick={() => setActiveTab('career')}
            className={`pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'career'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Service Record
          </button>
        </nav>

        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <button
            onClick={onPlay}
            className="rounded-md bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Solo Deploy
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto tactical-scroll p-5 sm:p-8">
        <div className="mx-auto max-w-6xl">
          {activeTab === 'deploy' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: Mission Briefing & Mode Selector */}
              <div className="lg:col-span-8 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-2">
                    <span>Sector 04 Battlefield</span>
                    <span aria-hidden="true">·</span>
                    <span>{settings.lighting === 'day' ? 'Daylight Clear' : 'Night Operations'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num text-amber-400 font-semibold">
                      {progress.credits.toLocaleString()} Credits
                    </span>
                  </div>
                  <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
                    Tactical Combat Operations
                  </h1>
                  <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                    Select a single-player combat mode or switch to Multiplayer PvP to battle friends across devices on the same network.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {MODE_LIST.map((m) => {
                    const active = singlePlayerMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => onSelectMode(m.id)}
                        className={`text-left rounded-lg border p-4 transition-colors ${
                          active
                            ? 'border-amber-500 bg-[#151c26]'
                            : 'border-slate-800 bg-[#10151c]/90 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400">{m.subtitle}</span>
                          {m.icon}
                        </div>
                        <div className="font-display text-lg font-bold text-white mt-1">
                          {m.title}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                          {m.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Deployment Loadout & Actions */}
              <div className="lg:col-span-4 rounded-lg border border-slate-800 bg-[#10151c]/95 p-5 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h2 className="font-display text-lg font-bold">Deployment Kit</h2>
                    <button
                      onClick={onToggleLighting}
                      className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                    >
                      {settings.lighting === 'day' ? (
                        <>
                          <Sun className="h-3.5 w-3.5 text-amber-400" />
                          Day
                        </>
                      ) : (
                        <>
                          <Moon className="h-3.5 w-3.5 text-sky-400" />
                          Night
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-2">Primary Starting Weapon</div>
                    <div className="space-y-1.5">
                      {WEAPON_ORDER.map((id) => {
                        const s = getEffectiveWeaponStats(id, progress);
                        const isSel = selectedWeapon === id;
                        return (
                          <button
                            key={id}
                            onClick={() => onSelectWeapon(id)}
                            className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
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

                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <button
                    onClick={onPlay}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={onOpenSettings}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setExitNotice(true);
                        onExitSession();
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                      <Power className="h-4 w-4 text-slate-400" />
                      Exit
                    </button>
                  </div>

                  {exitNotice && (
                    <p className="text-xs text-slate-400 text-center">
                      Session standby ready. Select Play whenever you wish to deploy.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'multiplayer' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="text-xs text-emerald-400 font-medium mb-1">
                    Cross-Device Real-Time PvP · Same Network / Shared Link
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
                    Multiplayer PvP Rooms
                  </h1>
                  <p className="mt-1.5 text-sm text-slate-300 max-w-2xl">
                    Create a private Free-for-All or Team Deathmatch room and share the 6-character code or direct invite link with friends on laptops or Android devices.
                  </p>
                </div>

                {/* Operator Callsign */}
                <div className="w-full sm:w-64">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Operator Callsign
                  </label>
                  <input
                    type="text"
                    maxLength={18}
                    value={progress.callsign}
                    onChange={(e) => onCallsignChange(e.target.value)}
                    placeholder="Vanguard-01"
                    className="w-full rounded-md border border-slate-700 bg-[#0d1117] px-3 py-2 text-sm font-semibold text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {pvpError && (
                <div className="rounded-md border border-red-500/60 bg-red-950/50 px-4 py-3 text-sm text-red-200 flex items-center justify-between gap-4">
                  <span>{pvpError}</span>
                  <button
                    onClick={onClearPvpError}
                    className="text-xs font-semibold text-red-300 hover:text-white underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Create PvP Room */}
                <div className="lg:col-span-7 rounded-lg border border-slate-800 bg-[#10151c]/95 p-6 space-y-5">
                  <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                    <PlusCircle className="h-5 w-5 text-amber-400" />
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">Create PvP Room</h2>
                      <p className="text-xs text-slate-400">Human players only · Up to 10 operators</p>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-2">PvP Mode</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setPvpMode('ffa')}
                        className={`rounded-md border p-3.5 text-left transition-colors ${
                          pvpMode === 'ffa'
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-display text-base font-bold text-white">Free-for-All</div>
                        <div className="text-xs text-slate-400 mt-1">
                          Every operator for themselves. Highest elimination count wins.
                        </div>
                      </button>

                      <button
                        onClick={() => setPvpMode('tdm')}
                        className={`rounded-md border p-3.5 text-left transition-colors ${
                          pvpMode === 'tdm'
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-display text-base font-bold text-white">Team Deathmatch</div>
                        <div className="text-xs text-slate-400 mt-1">
                          Blue Squad vs Red Squad. Coordinate and hit the kill limit first.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-2">Battlefield Lighting</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPvpLighting('day')}
                          className={`flex items-center justify-center gap-1.5 rounded border py-2 text-xs font-semibold ${
                            pvpLighting === 'day'
                              ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                              : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                        >
                          <Sun className="h-3.5 w-3.5" />
                          Day
                        </button>
                        <button
                          onClick={() => setPvpLighting('night')}
                          className={`flex items-center justify-center gap-1.5 rounded border py-2 text-xs font-semibold ${
                            pvpLighting === 'night'
                              ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                              : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                        >
                          <Moon className="h-3.5 w-3.5" />
                          Night
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-2">Elimination Target</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[10, 15, 20, 30].map((target) => (
                          <button
                            key={target}
                            onClick={() => setPvpTargetKills(target)}
                            className={`rounded border py-2 font-mono-num text-xs font-bold ${
                              pvpTargetKills === target
                                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                                : 'border-slate-800 bg-slate-900 text-slate-400'
                            }`}
                          >
                            {target}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={pvpConnecting}
                    onClick={() => onCreatePvpRoom(pvpMode, pvpLighting, pvpTargetKills)}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {pvpConnecting ? 'Creating Room...' : 'Create PvP Room'}
                  </button>
                </div>

                {/* Join by Room Code */}
                <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#10151c]/95 p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                      <LogIn className="h-5 w-5 text-sky-400" />
                      <div>
                        <h2 className="font-display text-xl font-bold text-white">Join Room</h2>
                        <p className="text-xs text-slate-400">Enter a 6-character code from the room host</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2">
                        Room Code
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) => {
                          onClearPvpError();
                          setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                        }}
                        placeholder="E.G. K7M4P9"
                        className="w-full rounded-md border border-slate-700 bg-[#0d1117] px-4 py-3 font-mono-num text-xl font-bold tracking-[0.25em] text-center text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      disabled={pvpConnecting || joinCode.trim().length < 4}
                      onClick={() => onJoinPvpRoom(joinCode)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 transition-colors"
                    >
                      <LogIn className="h-4 w-4" />
                      {pvpConnecting ? 'Connecting...' : 'Join PvP Room'}
                    </button>
                    <button
                      onClick={onOpenSettings}
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      Controls & Audio Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'armory' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-bold">Arsenal</h2>
                  <span className="font-mono-num text-sm font-bold text-amber-400">
                    {progress.credits.toLocaleString()} CR
                  </span>
                </div>
                {WEAPON_ORDER.map((id) => {
                  const s = getEffectiveWeaponStats(id, progress);
                  const active = selectedWeapon === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onSelectWeapon(id)}
                      className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                        active
                          ? 'border-amber-500 bg-[#151c26]'
                          : 'border-slate-800 bg-[#10151c]/90 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs text-slate-400">{s.category}</div>
                      <div className="font-display text-base font-bold text-white mt-0.5">{s.name}</div>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-8 rounded-lg border border-slate-800 bg-[#10151c]/95 p-6 space-y-6">
                <div className="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-amber-400 font-medium">{selectedWeaponStats.category}</div>
                    <h3 className="font-display text-2xl font-bold text-white">{selectedWeaponStats.name}</h3>
                    <p className="text-sm text-slate-400 mt-1">{selectedWeaponStats.description}</p>
                  </div>
                </div>

                {/* Live Weapon Specs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-800 pb-5">
                  <div>
                    <div className="text-xs text-slate-400">Damage</div>
                    <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                      {selectedWeaponStats.damage}
                      {selectedWeaponStats.pellets > 1 ? ` × ${selectedWeaponStats.pellets}` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Fire Rate</div>
                    <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                      {selectedWeaponStats.fireRate} /s
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Magazine</div>
                    <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                      {selectedWeaponStats.magSize}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Reload</div>
                    <div className="font-mono-num text-xl font-bold text-white mt-0.5">
                      {selectedWeaponStats.reloadTime}s
                    </div>
                  </div>
                </div>

                {/* Upgrades */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-200">Weapon Upgrades (Max Tier 3)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {upgradeRows.map((row) => {
                      const level = selectedUpgrades[row.key];
                      const isMax = level >= 3;
                      const cost = getUpgradeCost(level);
                      const canAfford = progress.credits >= cost && !isMax;

                      return (
                        <div
                          key={row.key}
                          className="rounded-md border border-slate-800 bg-slate-900/70 p-3.5 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-sm font-semibold text-white">{row.label}</div>
                            <div className="text-xs text-slate-400">{row.detail}</div>
                            <div className="mt-1.5 flex items-center gap-1">
                              {[0, 1, 2].map((tier) => (
                                <span
                                  key={tier}
                                  className={`h-1.5 w-6 rounded-sm ${
                                    tier < level ? 'bg-amber-400' : 'bg-slate-700'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          <button
                            disabled={!canAfford}
                            onClick={() => onUpgradeWeapon(selectedWeapon, row.key)}
                            className={`flex items-center gap-1 rounded px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                              isMax
                                ? 'bg-slate-800 text-slate-400 cursor-default'
                                : canAfford
                                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <ArrowUpCircle className="h-3.5 w-3.5" />
                            {isMax ? 'Maxed' : `${cost} CR`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'career' && (
            <div className="rounded-lg border border-slate-800 bg-[#10151c]/95 p-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
                <Award className="h-6 w-6 text-amber-400" />
                <div>
                  <h2 className="font-display text-2xl font-bold">Operator Service Record</h2>
                  <p className="text-xs text-slate-400">Progress saved automatically in browser local storage</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div>
                  <div className="text-xs text-slate-400">Total Eliminations</div>
                  <div className="font-mono-num text-3xl font-bold text-white mt-1">
                    {progress.totalKills.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Confirmed Headshots</div>
                  <div className="font-mono-num text-3xl font-bold text-amber-400 mt-1">
                    {progress.totalHeadshots.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Available Credits</div>
                  <div className="font-mono-num text-3xl font-bold text-emerald-400 mt-1">
                    {progress.credits.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Highest Survival Wave</div>
                  <div className="font-mono-num text-3xl font-bold text-white mt-1">
                    {progress.highestWave}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Missions Completed</div>
                  <div className="font-mono-num text-3xl font-bold text-white mt-1">
                    {progress.missionsCompleted}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Team Deathmatch Wins</div>
                  <div className="font-mono-num text-3xl font-bold text-sky-400 mt-1">
                    {progress.tdmWins}
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Desktop Controls</div>
                <div>WASD: Move · Shift: Sprint · Space: Jump · Mouse: Look · LMB: Shoot · RMB: Aim Down Sights · R: Reload · G: Frag Grenade · 1–5 / Q: Switch Weapon · Tab: PvP Scoreboard · ESC: Pause</div>
                <div className="font-semibold text-slate-300 pt-2">Android / Mobile Controls</div>
                <div>Left Virtual Stick: Move · Right Screen Drag: Aim · Dedicated FIRE, ADS, Jump, Reload, Grenade & Weapon buttons</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
