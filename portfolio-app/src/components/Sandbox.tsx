// Sandbox.tsx
// Interactive Sandbox UI with sliders, locking, auto-normalization, and one-click optimization triggers

'use client';

import React, { useState, useEffect } from 'react';
import { DBAsset } from '../utils/dbClient';
import { cleanYahooTicker } from '../utils/portfolioMath';
import { 
  Lock, 
  Unlock, 
  Trash2, 
  Plus, 
  Percent, 
  RotateCcw,
  Sliders,
  Scale,
  BrainCircuit
} from 'lucide-react';

interface SandboxProps {
  assets: DBAsset[];
  onUpdateAssets: (assets: DBAsset[]) => void;
  onOptimize: (type: 'equal' | 'sharpe' | 'min_vol' | 'risk_parity' | 'max_div' | 'sortino') => Promise<void>;
  isCalculating: boolean;
}

export default function Sandbox({
  assets,
  onUpdateAssets,
  onOptimize,
  isCalculating
}: SandboxProps) {
  const [newTicker, setNewTicker] = useState('');
  const [newType, setNewType] = useState<'etf' | 'crypto' | 'metal'>('etf');
  
  // Weights lock state
  const [lockedAssets, setLockedAssets] = useState<Record<string, boolean>>({});
  const [autoNormalize, setAutoNormalize] = useState(true);

  // Sum of weights
  const totalWeight = assets.reduce((sum, a) => sum + a.weight, 0);
  const totalPercent = Math.round(totalWeight * 100);
  const isNormalized = Math.abs(totalWeight - 1.0) < 1e-4;

  const toggleLock = (ticker: string) => {
    setLockedAssets(prev => ({ ...prev, [ticker]: !prev[ticker] }));
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const tickerRaw = newTicker.trim();
    if (!tickerRaw) return;
    const ticker = cleanYahooTicker(tickerRaw);

    // Check if asset already exists
    if (assets.some(a => a.ticker === ticker)) {
      alert(`${ticker} is already in the portfolio.`);
      return;
    }

    const newAsset: DBAsset = {
      portfolio_id: assets[0]?.portfolio_id || 'temp',
      ticker,
      weight: assets.length === 0 ? 1.0 : 0.0, // start with 0 or 100%
      asset_type: newType
    };

    const updated = [...assets, newAsset];
    
    // Propose Equal Weights on add if autoNormalize is true
    if (autoNormalize && updated.length > 1) {
      const equalWeight = 1 / updated.length;
      onUpdateAssets(updated.map(a => ({ ...a, weight: equalWeight })));
    } else {
      onUpdateAssets(updated);
    }
    
    setNewTicker('');
  };

  const handleRemoveAsset = (ticker: string) => {
    const remaining = assets.filter(a => a.ticker !== ticker);
    
    // Recalculate weights of remaining assets
    if (autoNormalize && remaining.length > 0) {
      const sumRemaining = remaining.reduce((sum, a) => sum + a.weight, 0);
      if (sumRemaining > 0) {
        onUpdateAssets(remaining.map(a => ({ ...a, weight: a.weight / sumRemaining })));
      } else {
        const equalWeight = 1 / remaining.length;
        onUpdateAssets(remaining.map(a => ({ ...a, weight: equalWeight })));
      }
    } else {
      onUpdateAssets(remaining);
    }

    // Remove lock
    if (lockedAssets[ticker]) {
      const newLocks = { ...lockedAssets };
      delete newLocks[ticker];
      setLockedAssets(newLocks);
    }
  };

  const handleWeightChange = (ticker: string, newWeightPercent: number) => {
    const targetVal = newWeightPercent / 100;
    const currentAsset = assets.find(a => a.ticker === ticker);
    if (!currentAsset) return;

    if (!autoNormalize) {
      // Manual adjustment: update only this asset
      onUpdateAssets(
        assets.map(a => (a.ticker === ticker ? { ...a, weight: targetVal } : a))
      );
      return;
    }

    // Auto-normalize logic:
    // Determine how much weight we need to allocate from OTHER unlocked assets
    const n = assets.length;
    if (n <= 1) {
      onUpdateAssets(assets.map(a => ({ ...a, weight: 1.0 })));
      return;
    }

    const otherAssets = assets.filter(a => a.ticker !== ticker);
    const lockedOther = otherAssets.filter(a => lockedAssets[a.ticker]);
    const unlockedOther = otherAssets.filter(a => !lockedAssets[a.ticker]);

    // Sum of locked assets (including this asset which we are locking temporarily for this adjustment)
    const sumLocked = lockedOther.reduce((sum, a) => sum + a.weight, 0) + targetVal;

    if (sumLocked > 1.0) {
      // Not enough room: cap this weight to remaining space
      const maxPossible = 1.0 - lockedOther.reduce((sum, a) => sum + a.weight, 0);
      const cappedVal = Math.max(0, maxPossible);
      
      onUpdateAssets(
        assets.map(a => {
          if (a.ticker === ticker) return { ...a, weight: cappedVal };
          if (lockedAssets[a.ticker]) return a;
          return { ...a, weight: 0 };
        })
      );
      return;
    }

    // Remaining weight to distribute among unlockedOther
    const remainingToDistribute = 1.0 - sumLocked;
    const currentUnlockedSum = unlockedOther.reduce((sum, a) => sum + a.weight, 0);

    const updated = assets.map(a => {
      if (a.ticker === ticker) {
        return { ...a, weight: targetVal };
      }
      if (lockedAssets[a.ticker]) {
        return a;
      }
      // Distribute remainingToDistribute proportionally
      let newW = 0;
      if (currentUnlockedSum > 0) {
        newW = (a.weight / currentUnlockedSum) * remainingToDistribute;
      } else if (unlockedOther.length > 0) {
        newW = remainingToDistribute / unlockedOther.length;
      }
      return { ...a, weight: parseFloat(newW.toFixed(4)) };
    });

    // Final normalization cleanup for rounding errors
    const total = updated.reduce((s, a) => s + a.weight, 0);
    if (Math.abs(total - 1.0) > 1e-6) {
      const difference = 1.0 - total;
      // adjust the current sliding asset or first unlocked asset
      const adjustAsset = unlockedOther[0] || currentAsset;
      const final = updated.map(a => {
        if (a.ticker === adjustAsset.ticker) {
          return { ...a, weight: Math.max(0, a.weight + difference) };
        }
        return a;
      });
      onUpdateAssets(final);
    } else {
      onUpdateAssets(updated);
    }
  };

  const handleManualNormalize = () => {
    if (assets.length === 0) return;
    const sum = assets.reduce((s, a) => s + a.weight, 0);
    if (sum === 0) {
      const eq = 1 / assets.length;
      onUpdateAssets(assets.map(a => ({ ...a, weight: eq })));
    } else {
      onUpdateAssets(assets.map(a => ({ ...a, weight: a.weight / sum })));
    }
  };

  const handleReset = () => {
    if (assets.length === 0) return;
    const eq = 1 / assets.length;
    onUpdateAssets(assets.map(a => ({ ...a, weight: eq })));
    setLockedAssets({});
  };

  return (
    <div className="glass-card p-6 border border-white/5 space-y-6">
      {/* Sandbox Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={20} className="text-indigo-400" />
          <h3 className="text-lg font-display font-bold text-white">
            Weight Sandbox
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoNormalize(!autoNormalize)}
            className={`px-3 py-1 text-xs rounded-lg border transition flex items-center gap-1.5 ${
              autoNormalize
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                : 'bg-slate-900 border-white/10 text-slate-400'
            }`}
            title="Automatically scale other weights when adjusting sliders"
          >
            <Scale size={13} />
            Auto-Scale
          </button>
          <button
            onClick={handleReset}
            className="p-1 text-slate-400 hover:text-white transition"
            title="Reset Weights"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Optimization Toolkit */}
      <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit size={16} className="text-indigo-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            One-Click Optimizers
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <button
            onClick={() => onOptimize('equal')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Equal Weight
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Equal Weight (1/N):</strong> Allocates an equal percentage of weight to all assets in the portfolio.
            </div>
          </button>
          <button
            onClick={() => onOptimize('sharpe')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Max Sharpe (Markowitz)
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Max Sharpe:</strong> Optimizes weights to maximize expected excess return per unit of volatility (tangency portfolio).
            </div>
          </button>
          <button
            onClick={() => onOptimize('min_vol')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Min Volatility (GMV)
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Min Volatility (GMV):</strong> Optimizes weights to produce the lowest overall portfolio return volatility.
            </div>
          </button>
          <button
            onClick={() => onOptimize('risk_parity')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Risk Parity (ERC)
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Risk Parity (ERC):</strong> Allocates weights so that each asset contributes equally to the total portfolio risk.
            </div>
          </button>
          <button
            onClick={() => onOptimize('max_div')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Max Diversification
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Max Diversification:</strong> Optimizes weights to maximize the portfolio diversification ratio (weighted average volatility / portfolio volatility).
            </div>
          </button>
          <button
            onClick={() => onOptimize('sortino')}
            disabled={isCalculating || assets.length === 0}
            className="group relative px-3 py-2 text-xxs font-bold uppercase bg-slate-950/60 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 rounded-xl transition disabled:opacity-30"
          >
            Max Sortino
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-300 normal-case shadow-xl leading-relaxed z-50 pointer-events-none text-left">
              <strong>Max Sortino:</strong> Optimizes weights to maximize expected excess return per unit of downside deviation.
            </div>
          </button>
        </div>
      </div>

      {/* Asset List & Sliders */}
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
        {assets.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center italic">
            Add assets below to begin modeling.
          </p>
        ) : (
          assets.map(asset => {
            const isLocked = !!lockedAssets[asset.ticker];
            const weightPercent = Math.round(asset.weight * 100);
            
            return (
              <div
                key={asset.ticker}
                className="flex flex-col gap-2 p-3 bg-slate-950/20 border border-white/5 rounded-xl hover:border-white/10 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{asset.ticker}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                      asset.asset_type === 'crypto'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : asset.asset_type === 'metal'
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                    }`}>
                      {asset.asset_type}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Weight percentage indicator */}
                    <div className="flex items-center text-xs text-white bg-slate-950 px-2 py-0.5 rounded-lg border border-white/5">
                      <span className="font-semibold">{weightPercent}</span>
                      <Percent size={10} className="text-slate-500 ml-0.5" />
                    </div>

                    {/* Lock button */}
                    <button
                      onClick={() => toggleLock(asset.ticker)}
                      className={`p-1.5 rounded-lg border transition ${
                        isLocked 
                          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                          : 'bg-slate-900 border-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                      title={isLocked ? 'Unlock Asset Weight' : 'Lock Asset Weight'}
                    >
                      {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleRemoveAsset(asset.ticker)}
                      className="p-1.5 bg-slate-900 border border-white/5 text-slate-500 hover:text-red-400 hover:border-red-500/10 rounded-lg transition"
                      title="Remove Asset"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weightPercent}
                  disabled={isLocked}
                  onChange={(e) => handleWeightChange(asset.ticker, parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Total Weight Status Bar */}
      <div className="flex items-center justify-between p-3 bg-slate-950/40 border border-white/5 rounded-xl text-xs">
        <span className="text-slate-400">Total Allocation:</span>
        <div className="flex items-center gap-3">
          <span className={`font-bold ${isNormalized ? 'text-emerald-400' : 'text-amber-500'}`}>
            {totalPercent}%
          </span>
          {!isNormalized && (
            <button
              onClick={handleManualNormalize}
              className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded transition uppercase text-[9px]"
            >
              Normalize
            </button>
          )}
        </div>
      </div>

      {/* Add Asset Form */}
      <form onSubmit={handleAddAsset} className="pt-4 border-t border-white/5 flex gap-2">
        <input
          type="text"
          required
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value)}
          placeholder="Ticker (e.g. GLD, QQQ, BTC)"
          className="flex-1 bg-slate-950 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as any)}
          className="bg-slate-950 border border-white/10 rounded-xl py-2 px-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="etf">ETF</option>
          <option value="crypto">Crypto</option>
          <option value="metal">Metal</option>
        </select>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl p-2.5 transition flex items-center justify-center shrink-0 active:scale-[0.96]"
        >
          <Plus size={16} />
        </button>
      </form>
    </div>
  );
}
