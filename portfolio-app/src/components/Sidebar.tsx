// Sidebar.tsx
// Modular sidebar component for selecting portfolios and updating alerts/settings

'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DBPortfolio } from '../utils/dbClient';
import { 
  Trash2, 
  LogOut, 
  Bell, 
  Check, 
  Plus,
  HelpCircle,
  TrendingUp,
  Shield
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
  currentView: 'dashboard' | 'admin';
  onViewChange: (view: 'dashboard' | 'admin') => void;
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
  currentView,
  onViewChange,
}: SidebarProps) {
  const { user, signOut, isDemo, isAdmin, theme, fontSize, updatePreferences } = useAuth();
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
          <span className="text-slate-400 text-xs font-semibold">WORKSPACE</span>
        </div>
      </div>

      {/* Portfolios List */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {isAdmin && (
          <div className="space-y-1">
            <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase px-2 mb-2">
              System Administration
            </h2>
            <button
              onClick={() => onViewChange(currentView === 'admin' ? 'dashboard' : 'admin')}
              className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none ${
                currentView === 'admin'
                  ? 'bg-indigo-500/15 border border-indigo-500/25 text-indigo-300'
                  : 'bg-slate-900/40 border border-white/5 hover:border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Shield size={16} className={currentView === 'admin' ? 'text-indigo-400' : 'text-slate-400'} />
              {currentView === 'admin' ? 'Back to Dashboard' : 'Admin Control Panel'}
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between px-2 mb-3">
            <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              Portfolios
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-indigo-400 hover:text-indigo-300 transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none rounded"
              title="Add Portfolio"
              aria-label="Add Portfolio"
            >
              <Plus size={18} />
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddSubmit} className="mb-4 p-3 bg-slate-900/60 border border-white/5 rounded-xl space-y-3">
              <div>
                <label htmlFor="new-portfolio-name" className="block text-slate-400 text-xxs font-bold uppercase mb-1">Portfolio Name</label>
                <input
                  id="new-portfolio-name"
                  type="text"
                  required
                  value={newPortName}
                  onChange={(e) => setNewPortName(e.target.value)}
                  placeholder="e.g. All-Weather"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
                />
              </div>
              <div>
                <label htmlFor="new-portfolio-benchmark" className="block text-slate-400 text-xxs font-bold uppercase mb-1">Benchmark Ticker</label>
                <input
                  id="new-portfolio-benchmark"
                  type="text"
                  required
                  value={newPortBenchmark}
                  onChange={(e) => setNewPortBenchmark(e.target.value.toUpperCase())}
                  placeholder="e.g. SPY"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-2.5 py-1 text-xxs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xxs bg-indigo-600 text-white rounded hover:bg-indigo-500 transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1">
            {portfolios.length === 0 ? (
              <p className="text-slate-400 text-xs px-2 italic">No portfolios saved yet.</p>
            ) : (
              portfolios.map((portfolio) => {
                const isActive = portfolio.id === selectedPortfolioId;
                return (
                  <div
                    key={portfolio.id}
                    tabIndex={0}
                    role="button"
                    className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none ${
                      isActive
                        ? 'bg-indigo-500/10 border border-indigo-500/25 text-white'
                        : 'border border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                    }`}
                    onClick={() => onSelectPortfolio(portfolio.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPortfolio(portfolio.id);
                      }
                    }}
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
                        className="text-red-500 hover:text-red-400 p-0.5 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none rounded"
                        title="Delete Portfolio"
                        aria-label={`Delete portfolio ${portfolio.name}`}
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
              className="text-indigo-400 hover:text-indigo-300 transition text-xxs font-bold focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none rounded px-1"
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
                <label htmlFor="settings-risk-free-rate" className="text-slate-400 text-xxs font-bold uppercase flex items-center gap-1">
                  Risk-Free Rate
                  <span className="text-slate-400" title="Used for Sharpe and Sortino ratio calculations">
                    <HelpCircle size={10} />
                  </span>
                </label>
              </div>
              {editingSettings ? (
                <div className="relative">
                  <input
                    id="settings-risk-free-rate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={localRfRate}
                    onChange={(e) => setLocalRfRate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
                  />
                  <span className="absolute right-3 inset-y-0 flex items-center text-xs text-slate-400">%</span>
                </div>
              ) : (
                <p className="text-sm font-medium text-white">{(riskFreeRate * 100).toFixed(1)}%</p>
              )}
            </div>

            <div>
              <label htmlFor="settings-telegram-chat-id" className="text-slate-400 text-xxs font-bold uppercase mb-1 block">
                Telegram Chat ID
              </label>
              {editingSettings ? (
                <input
                  id="settings-telegram-chat-id"
                  type="text"
                  value={localChatId}
                  onChange={(e) => setLocalChatId(e.target.value)}
                  placeholder="e.g. 18273645"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
                />
              ) : (
                <p className="text-sm font-medium text-white truncate">
                  {telegramChatId ? telegramChatId : <span className="text-slate-400 italic">Not set</span>}
                </p>
              )}
            </div>
            
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-xxs text-slate-400">
                <Bell size={12} className="text-indigo-400 animate-bounce" />
                <span>Alerts sent via Telegram Bot</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preference Settings */}
        <div className="pt-6 border-t border-white/5">
          <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase px-2 mb-3">
            Appearance Settings
          </h2>
          <div className="space-y-4 p-3 bg-slate-900/30 border border-white/5 rounded-xl text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold uppercase text-xxs">Theme Mode</span>
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-white/10">
                <button
                  onClick={() => updatePreferences('dark', fontSize)}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none ${
                    theme === 'dark' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => updatePreferences('light', fontSize)}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none ${
                    theme === 'light' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Light
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <label htmlFor="settings-font-scaling" className="text-slate-400 font-semibold uppercase text-xxs cursor-pointer">Font Scaling</label>
              <select
                id="settings-font-scaling"
                value={fontSize}
                onChange={(e) => updatePreferences(theme, e.target.value as any)}
                className="bg-slate-950 border border-white/10 rounded-lg text-xxs font-semibold text-white px-2 py-1.5 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
              >
                <option value="sm">Small</option>
                <option value="base">Normal</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Large</option>
              </select>
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
          <span className="text-slate-400 text-xxs font-bold uppercase flex items-center gap-1">
            {isDemo ? (
              <span className="text-amber-500">Demo Account</span>
            ) : (
              <span className="text-indigo-400">Premium Account</span>
            )}
          </span>
        </div>
        <button
          onClick={signOut}
          className="p-2 bg-slate-900 border border-white/5 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 rounded-xl text-slate-400 transition focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
          title="Sign Out"
          aria-label="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
