// Sidebar.tsx
// Modular sidebar component for selecting portfolios and updating alerts/settings

'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DBPortfolio } from '../utils/dbClient';
import { 
  FolderPlus, 
  Trash2, 
  LogOut, 
  Sliders, 
  Bell, 
  Check, 
  X,
  Plus,
  HelpCircle,
  TrendingUp
} from 'lucide-react';

interface SidebarProps {
  portfolios: DBPortfolio[];
  selectedPortfolioId: string | null;
  onSelectPortfolio: (id: string) => void;
  onCreatePortfolio: (name: string, benchmark: string) => Promise<void>;
  onDeletePortfolio: (id: string) => Promise<void>;
  telegramChatId: string;
  riskFreeRate: number;
  onUpdateSettings: (telegramChatId: string, riskFreeRate: number) => Promise<void>;
}

export default function Sidebar({
  portfolios,
  selectedPortfolioId,
  onSelectPortfolio,
  onCreatePortfolio,
  onDeletePortfolio,
  telegramChatId,
  riskFreeRate,
  onUpdateSettings,
}: SidebarProps) {
  const { user, signOut, isDemo } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPortName, setNewPortName] = useState('');
  const [newPortBenchmark, setNewPortBenchmark] = useState('SPY');
  
  const [editingSettings, setEditingSettings] = useState(false);
  const [localChatId, setLocalChatId] = useState(telegramChatId);
  const [localRfRate, setLocalRfRate] = useState((riskFreeRate * 100).toString());

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortName.trim()) return;
    await onCreatePortfolio(newPortName, newPortBenchmark);
    setNewPortName('');
    setNewPortBenchmark('SPY');
    setShowAddForm(false);
  };

  const handleSaveSettings = async () => {
    const rateNum = parseFloat(localRfRate) / 100;
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 0.5) return;
    await onUpdateSettings(localChatId, rateNum);
    setEditingSettings(false);
  };

  React.useEffect(() => {
    setLocalChatId(telegramChatId);
    setLocalRfRate((riskFreeRate * 100).toString());
  }, [telegramChatId, riskFreeRate]);

  return (
    <aside className="w-80 bg-slate-950/40 border-r border-white/10 flex flex-col h-full overflow-hidden relative">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
          <TrendingUp size={20} />
        </div>
        <div>
          <span className="text-lg font-display font-bold tracking-tight text-white block leading-tight">
            AURA<span className="text-indigo-400">WEALTH</span>
          </span>
          <span className="text-slate-500 text-xs font-semibold">WORKSPACE</span>
        </div>
      </div>

      {/* Portfolios List */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div>
          <div className="flex items-center justify-between px-2 mb-3">
            <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              Portfolios
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-indigo-400 hover:text-indigo-300 transition"
              title="Add Portfolio"
            >
              <Plus size={18} />
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddSubmit} className="mb-4 p-3 bg-slate-900/60 border border-white/5 rounded-xl space-y-3">
              <div>
                <label className="block text-slate-400 text-xxs font-bold uppercase mb-1">Portfolio Name</label>
                <input
                  type="text"
                  required
                  value={newPortName}
                  onChange={(e) => setNewPortName(e.target.value)}
                  placeholder="e.g. All-Weather"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xxs font-bold uppercase mb-1">Benchmark Ticker</label>
                <input
                  type="text"
                  required
                  value={newPortBenchmark}
                  onChange={(e) => setNewPortBenchmark(e.target.value.toUpperCase())}
                  placeholder="e.g. SPY"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-2.5 py-1 text-xxs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xxs bg-indigo-600 text-white rounded hover:bg-indigo-500 transition"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1">
            {portfolios.length === 0 ? (
              <p className="text-slate-500 text-xs px-2 italic">No portfolios saved yet.</p>
            ) : (
              portfolios.map((portfolio) => {
                const isActive = portfolio.id === selectedPortfolioId;
                return (
                  <div
                    key={portfolio.id}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition ${
                      isActive
                        ? 'bg-indigo-500/10 border border-indigo-500/25 text-white'
                        : 'border border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                    }`}
                    onClick={() => onSelectPortfolio(portfolio.id)}
                  >
                    <span className="font-medium truncate max-w-[170px]">
                      {portfolio.name}
                    </span>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                      <span className="text-xxs font-bold px-1.5 py-0.5 rounded bg-slate-900/60 text-slate-400 border border-white/5 uppercase">
                        {portfolio.benchmark_ticker}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete portfolio "${portfolio.name}"?`)) {
                            onDeletePortfolio(portfolio.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-400 p-0.5"
                        title="Delete Portfolio"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Global Settings */}
        <div className="pt-6 border-t border-white/5">
          <div className="flex items-center justify-between px-2 mb-3">
            <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              Global Settings
            </h2>
            <button
              onClick={() => {
                if (editingSettings) {
                  handleSaveSettings();
                } else {
                  setEditingSettings(true);
                }
              }}
              className="text-indigo-400 hover:text-indigo-300 transition text-xxs font-bold"
            >
              {editingSettings ? (
                <div className="flex items-center gap-0.5">
                  <Check size={14} className="text-emerald-400" /> Save
                </div>
              ) : (
                'Edit'
              )}
            </button>
          </div>

          <div className="space-y-4 p-3 bg-slate-900/30 border border-white/5 rounded-xl">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 text-xxs font-bold uppercase flex items-center gap-1">
                  Risk-Free Rate
                  <span className="text-slate-600" title="Used for Sharpe and Sortino ratio calculations">
                    <HelpCircle size={10} />
                  </span>
                </label>
              </div>
              {editingSettings ? (
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={localRfRate}
                    onChange={(e) => setLocalRfRate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <span className="absolute right-3 inset-y-0 flex items-center text-xs text-slate-500">%</span>
                </div>
              ) : (
                <p className="text-sm font-medium text-white">{(riskFreeRate * 100).toFixed(1)}%</p>
              )}
            </div>

            <div>
              <label className="text-slate-400 text-xxs font-bold uppercase mb-1 block">
                Telegram Chat ID
              </label>
              {editingSettings ? (
                <input
                  type="text"
                  value={localChatId}
                  onChange={(e) => setLocalChatId(e.target.value)}
                  placeholder="e.g. 18273645"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              ) : (
                <p className="text-sm font-medium text-white truncate">
                  {telegramChatId ? telegramChatId : <span className="text-slate-600 italic">Not set</span>}
                </p>
              )}
            </div>
            
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-xxs text-slate-500">
                <Bell size={12} className="text-indigo-400 animate-bounce" />
                <span>Alerts sent via Telegram Bot</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between">
        <div className="truncate max-w-[160px]">
          <span className="text-xs font-semibold text-white block truncate">
            {user?.email}
          </span>
          <span className="text-slate-500 text-xxs font-bold uppercase flex items-center gap-1">
            {isDemo ? (
              <span className="text-amber-500">Demo Account</span>
            ) : (
              <span className="text-indigo-400">Premium Account</span>
            )}
          </span>
        </div>
        <button
          onClick={signOut}
          className="p-2 bg-slate-900 border border-white/5 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 rounded-xl text-slate-400 transition"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
