import React from 'react';
import { X, Sun, Moon, Volume2, MousePointer, Smartphone, Eye, Monitor } from 'lucide-react';
import { GameSettings } from '../game/types';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (updated: GameSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onChange, onClose }) => {
  const update = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-700/80 bg-[#11161d] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="font-display text-xl font-bold tracking-wide">Game Settings</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6 max-h-[75vh] overflow-y-auto tactical-scroll">
          {/* Day / Night Lighting */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {settings.lighting === 'day' ? (
                <Sun className="h-5 w-5 text-amber-400 shrink-0" />
              ) : (
                <Moon className="h-5 w-5 text-sky-400 shrink-0" />
              )}
              <div>
                <div className="text-sm font-semibold">Battlefield Lighting</div>
                <div className="text-xs text-slate-400">Switch between daylight and night operations</div>
              </div>
            </div>
            <div className="flex rounded-md bg-slate-900 p-1 border border-slate-800 shrink-0">
              <button
                onClick={() => update('lighting', 'day')}
                className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                  settings.lighting === 'day'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Daylight
              </button>
              <button
                onClick={() => update('lighting', 'night')}
                className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                  settings.lighting === 'night'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Night Ops
              </button>
            </div>
          </div>

          {/* Mouse Sensitivity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <MousePointer className="h-4 w-4 text-slate-400" />
                Aim Sensitivity
              </span>
              <span className="font-mono-num text-amber-400">{settings.mouseSensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2.5"
              step="0.1"
              value={settings.mouseSensitivity}
              onChange={(e) => update('mouseSensitivity', parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Field of View */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <Eye className="h-4 w-4 text-slate-400" />
                Field of View (FOV)
              </span>
              <span className="font-mono-num text-amber-400">{settings.fov}°</span>
            </div>
            <input
              type="range"
              min="65"
              max="95"
              step="1"
              value={settings.fov}
              onChange={(e) => update('fov', parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Audio Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <Volume2 className="h-4 w-4 text-slate-400" />
                Master Audio Volume
              </span>
              <span className="font-mono-num text-amber-400">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.masterVolume}
              onChange={(e) => update('masterVolume', parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Mobile Touch Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-slate-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Touch Controls (Android / Tablet)</div>
                <div className="text-xs text-slate-400">On-screen joystick and firing buttons</div>
              </div>
            </div>
            <div className="flex rounded-md bg-slate-900 p-1 border border-slate-800 shrink-0">
              {(['auto', 'on', 'off'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => update('touchControls', opt)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded capitalize whitespace-nowrap transition-colors ${
                    settings.touchControls === opt
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Graphics Quality */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-slate-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Graphics Preset</div>
                <div className="text-xs text-slate-400">Use Balanced for maximum mobile framerate</div>
              </div>
            </div>
            <div className="flex rounded-md bg-slate-900 p-1 border border-slate-800 shrink-0">
              <button
                onClick={() => update('graphicsQuality', 'high')}
                className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                  settings.graphicsQuality === 'high'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                High
              </button>
              <button
                onClick={() => update('graphicsQuality', 'balanced')}
                className={`px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap transition-colors ${
                  settings.graphicsQuality === 'balanced'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Balanced
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-800 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
