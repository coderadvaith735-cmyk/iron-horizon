import React from 'react';
import { Trophy, Skull, RotateCcw, Home, Users } from 'lucide-react';
import { MatchSummary } from '../game/types';

interface EndScreenProps {
  summary: MatchSummary;
  isPvpHost?: boolean;
  onPlayAgain: () => void;
  onReturnToLobby?: () => void;
  onMainMenu: () => void;
}

export const EndScreen: React.FC<EndScreenProps> = ({
  summary,
  isPvpHost = false,
  onPlayAgain,
  onReturnToLobby,
  onMainMenu,
}) => {
  const isVictory = summary.outcome === 'victory';
  const isPvp = summary.mode === 'pvp_ffa' || summary.mode === 'pvp_tdm';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-lg border border-slate-700/80 bg-[#11161d] p-7 text-slate-100 shadow-2xl">
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg border ${
              isVictory
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                : 'border-red-500/40 bg-red-500/15 text-red-400'
            }`}
          >
            {isVictory ? <Trophy className="h-6 w-6" /> : <Skull className="h-6 w-6" />}
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold tracking-wide">
              {isPvp
                ? isVictory
                  ? 'Victory Secured'
                  : 'Match Complete'
                : isVictory
                  ? 'Mission Accomplished'
                  : 'Operator Down'}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">{summary.reason}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-5 border-b border-slate-800">
          <div>
            <div className="text-xs text-slate-400">Eliminations</div>
            <div className="font-mono-num text-2xl font-bold text-white mt-0.5">{summary.kills}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Headshots</div>
            <div className="font-mono-num text-2xl font-bold text-amber-400 mt-0.5">{summary.headshots}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Accuracy</div>
            <div className="font-mono-num text-2xl font-bold text-white mt-0.5">{summary.accuracy}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Combat Score</div>
            <div className="font-mono-num text-2xl font-bold text-white mt-0.5">{summary.score.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Duration</div>
            <div className="font-mono-num text-2xl font-bold text-white mt-0.5">{summary.durationSeconds}s</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Credits Earned</div>
            <div className="font-mono-num text-2xl font-bold text-emerald-400 mt-0.5">
              +{summary.creditsEarned}
            </div>
          </div>
        </div>

        {isPvp && summary.pvpRankings && summary.pvpRankings.length > 0 && (
          <div className="py-4 border-b border-slate-800">
            <div className="text-xs font-semibold text-slate-400 mb-2">Final PvP Standings</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-1.5 pr-2">#</th>
                    <th className="py-1.5 pr-3">Operator</th>
                    {summary.mode === 'pvp_tdm' && <th className="py-1.5 px-2">Squad</th>}
                    <th className="py-1.5 px-2 text-right">K</th>
                    <th className="py-1.5 px-2 text-right">D</th>
                    <th className="py-1.5 pl-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summary.pvpRankings.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={row.isLocal ? 'bg-amber-500/10 text-amber-200' : 'text-slate-200'}
                    >
                      <td className="py-1.5 pr-2 font-mono-num text-slate-400">{idx + 1}</td>
                      <td className="py-1.5 pr-3 font-semibold">
                        {row.callsign} {row.isLocal ? '(You)' : ''}
                      </td>
                      {summary.mode === 'pvp_tdm' && (
                        <td className="py-1.5 px-2">
                          <span className={row.team === 'blue' ? 'text-sky-400' : 'text-red-400'}>
                            {row.team === 'blue' ? 'Blue' : 'Red'}
                          </span>
                        </td>
                      )}
                      <td className="py-1.5 px-2 text-right font-mono-num font-bold">{row.kills}</td>
                      <td className="py-1.5 px-2 text-right font-mono-num text-slate-400">{row.deaths}</td>
                      <td className="py-1.5 pl-2 text-right font-mono-num font-bold">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {isPvp ? (
            <>
              {isPvpHost && onReturnToLobby ? (
                <button
                  onClick={onReturnToLobby}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
                >
                  <Users className="h-4 w-4" />
                  Return to Room Lobby
                </button>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs font-medium text-slate-300 text-center">
                  Waiting for room host to return to lobby...
                </div>
              )}
              <button
                onClick={onMainMenu}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Home className="h-4 w-4" />
                Leave to Menu
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onPlayAgain}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4" />
                Deploy Again
              </button>
              <button
                onClick={onMainMenu}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Home className="h-4 w-4" />
                Main Menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
