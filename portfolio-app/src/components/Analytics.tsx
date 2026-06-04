// Analytics.tsx
// Rich performance dashboard charts: Equity Curve, Drawdowns, Correlation Matrix, Allocation Donut

'use client';

import React, { useState, useMemo } from 'react';
import { BacktestResult } from '../utils/portfolioMath';
import { DBAsset } from '../utils/dbClient';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList
} from 'recharts';
import { 
  TrendingUp, 
  ArrowDownRight, 
  Percent, 
  Layers, 
  HelpCircle,
  Activity,
  Flame,
  Grid
} from 'lucide-react';

interface AnalyticsProps {
  backtestData: BacktestResult | null;
  assets: DBAsset[];
  benchmarkTicker: string;
}

export default function Analytics({
  backtestData,
  assets,
  benchmarkTicker
}: AnalyticsProps) {
  const [scaleType, setScaleType] = useState<'linear' | 'log'>('linear');
  const [activeSubTab, setActiveSubTab] = useState<'charts' | 'frontier'>('charts');

  // 1. Downsample Equity Curve Data to prevent Recharts lag (max 1000 points)
  const chartData = useMemo(() => {
    if (!backtestData) return [];
    
    const rawDates = backtestData.dates;
    const rawPort = backtestData.portfolioValue;
    const rawBench = backtestData.benchmarkValue;
    const rawDD = backtestData.drawdowns;
    
    const totalPoints = rawDates.length;
    const maxPoints = 800;
    const step = Math.ceil(totalPoints / maxPoints);
    
    const formatted = [];
    for (let i = 0; i < totalPoints; i += step) {
      formatted.push({
        date: rawDates[i],
        portfolio: Math.round(rawPort[i]),
        benchmark: rawBench ? Math.round(rawBench[i]) : undefined,
        drawdown: parseFloat((rawDD[i] * 100).toFixed(2))
      });
    }
    
    // Ensure the last element is included
    if (totalPoints > 0 && (totalPoints - 1) % step !== 0) {
      const lastIdx = totalPoints - 1;
      formatted.push({
        date: rawDates[lastIdx],
        portfolio: Math.round(rawPort[lastIdx]),
        benchmark: rawBench ? Math.round(rawBench[lastIdx]) : undefined,
        drawdown: parseFloat((rawDD[lastIdx] * 100).toFixed(2))
      });
    }
    
    return formatted;
  }, [backtestData]);

  // Efficient Frontier Data Memoizers
  const frontierData = useMemo(() => {
    if (!backtestData || !backtestData.efficientFrontier) return [];
    return backtestData.efficientFrontier.map(pt => ({
      x: parseFloat((pt.volatility * 100).toFixed(2)),
      y: parseFloat((pt.expectedReturn * 100).toFixed(2))
    }));
  }, [backtestData]);

  const assetsData = useMemo(() => {
    if (!backtestData || !backtestData.individualAssets) return [];
    return backtestData.individualAssets.map(pt => ({
      ticker: pt.ticker,
      x: parseFloat((pt.volatility * 100).toFixed(2)),
      y: parseFloat((pt.expectedReturn * 100).toFixed(2))
    }));
  }, [backtestData]);

  const currentPortfolioPoint = useMemo(() => {
    if (!backtestData || !backtestData.metrics) return { x: 0, y: 0 };
    return {
      ticker: 'Current Portfolio',
      x: parseFloat((backtestData.metrics.volatility * 100).toFixed(2)),
      y: parseFloat((backtestData.metrics.cagr * 100).toFixed(2))
    };
  }, [backtestData]);

  // 2. Asset Allocation Data for Donut Chart
  const pieData = useMemo(() => {
    const categories: Record<string, number> = {};
    assets.forEach(a => {
      categories[a.asset_type] = (categories[a.asset_type] || 0) + a.weight;
    });
    
    return Object.entries(categories).map(([name, value]) => ({
      name: name.toUpperCase(),
      value: parseFloat((value * 100).toFixed(1))
    }));
  }, [assets]);

  const COLORS = ['#6366f1', '#f59e0b', '#10b981']; // Indigo, Amber, Emerald

  // 3. Render Correlation Matrix Heatmap
  const matrixContent = useMemo(() => {
    if (!backtestData || !backtestData.correlationMatrix) return null;
    const matrix = backtestData.correlationMatrix;
    const tickers = Object.keys(matrix);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Grid size={18} className="text-indigo-400" />
          <h4 className="text-sm font-display font-bold text-white uppercase tracking-wider">
            Correlation Matrix
          </h4>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px] p-2 bg-slate-950/40 border border-white/5 rounded-2xl">
            {/* Headers row */}
            <div className="grid" style={{ gridTemplateColumns: `repeat(${tickers.length + 1}, minmax(0, 1fr))` }}>
              <div className="text-xxs font-bold text-slate-500 p-2 truncate"></div>
              {tickers.map(t => (
                <div key={t} className="text-xxs font-bold text-slate-300 p-2 text-center truncate">
                  {t}
                </div>
              ))}
            </div>
            {/* Rows */}
            {tickers.map(rowTicker => (
              <div 
                key={rowTicker} 
                className="grid border-t border-white/5" 
                style={{ gridTemplateColumns: `repeat(${tickers.length + 1}, minmax(0, 1fr))` }}
              >
                <div className="text-xxs font-bold text-slate-300 p-2 truncate flex items-center">
                  {rowTicker}
                </div>
                {tickers.map(colTicker => {
                  const val = matrix[rowTicker]?.[colTicker] ?? 0;
                  
                  // Heatmap colors mapping: 
                  // positive correlation = indigo shades
                  // negative correlation = red shades
                  let bgStyle = { backgroundColor: 'rgba(255,255,255,0.05)' };
                  if (val > 0) {
                    bgStyle = { backgroundColor: `rgba(99, 102, 241, ${val * 0.7})` };
                  } else if (val < 0) {
                    bgStyle = { backgroundColor: `rgba(239, 68, 68, ${Math.abs(val) * 0.7})` };
                  }
                  
                  return (
                    <div 
                      key={colTicker} 
                      style={bgStyle} 
                      className="text-xxs font-semibold text-white p-2 text-center flex items-center justify-center min-h-[36px] transition border border-white/5"
                      title={`${rowTicker} vs ${colTicker}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, [backtestData]);

  if (!backtestData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950/20 border border-white/5 rounded-2xl">
        <Activity className="text-slate-600 animate-pulse mb-3" size={48} />
        <h3 className="text-lg font-display font-bold text-slate-300">Awaiting Simulation</h3>
        <p className="text-slate-500 text-xs text-center max-w-sm mt-1">
          Add assets to your sandbox and model weights to generate performance backtests.
        </p>
      </div>
    );
  }

  const { metrics } = backtestData;

  // Format Helper
  const fmtPct = (val: number) => `${(val * 100).toFixed(1)}%`;
  const fmtNum = (val: number) => val.toFixed(2);

  return (
    <div className="space-y-6">
      {/* 1. Statistics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CAGR */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">CAGR</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Compound Annual Growth Rate:</strong> The smoothed annual rate at which an investment grows, assuming profits are compounded annually.
              </div>
            </div>
            <TrendingUp size={16} className="text-indigo-400" />
          </div>
          <div>
            <span className="text-2xl font-bold font-display text-white">
              {fmtPct(metrics.cagr)}
            </span>
            <span className="block text-[10px] text-slate-500 mt-1">Compound Annual Growth</span>
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Max Drawdown</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Max Drawdown:</strong> The largest peak-to-trough drop in portfolio value before a new peak is reached, indicating historical downside risk.
              </div>
            </div>
            <ArrowDownRight size={16} className="text-red-400" />
          </div>
          <div>
            <span className="text-2xl font-bold font-display text-red-400">
              -{fmtPct(metrics.maxDrawdown)}
            </span>
            <span className="block text-[10px] text-slate-500 mt-1">
              Duration: {metrics.maxDrawdownDuration} days
            </span>
          </div>
        </div>

        {/* Sharpe Ratio */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Sharpe Ratio</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Sharpe Ratio:</strong> Measures excess return per unit of total risk (volatility). Higher values indicate better risk-adjusted returns (uses UI risk-free rate, default 4%).
              </div>
            </div>
            <Percent size={16} className="text-indigo-400" />
          </div>
          <div>
            <span className="text-2xl font-bold font-display text-white">
              {fmtNum(metrics.sharpeRatio)}
            </span>
            <span className="block text-[10px] text-slate-500 mt-1">Risk-Adjusted Return</span>
          </div>
        </div>

        {/* Sortino Ratio */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Sortino Ratio</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Sortino Ratio:</strong> Measures excess return per unit of downside deviation. Unlike Sharpe, it only penalizes harmful negative return volatility.
              </div>
            </div>
            <Flame size={16} className="text-violet-400 animate-pulse" />
          </div>
          <div>
            <span className="text-2xl font-bold font-display text-white">
              {fmtNum(metrics.sortinoRatio)}
            </span>
            <span className="block text-[10px] text-slate-500 mt-1">Downside Deviation adjusted</span>
          </div>
        </div>

        {/* Extra Statistics Grid Row */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Calmar Ratio</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Calmar Ratio:</strong> The ratio of CAGR to Max Drawdown over the backtest period. Measures return reward relative to maximum historical drawdown risk.
              </div>
            </div>
            <Layers size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.calmarRatio)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Return-to-drawdown</span>
          </div>
        </div>

        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Portfolio Beta</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Portfolio Beta:</strong> Measures systematic risk relative to the benchmark ({benchmarkTicker}). A Beta of 1.0 matches benchmark volatility; &gt;1.0 is more sensitive, &lt;1.0 is less.
              </div>
            </div>
            <Activity size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.beta)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Vs Benchmark {benchmarkTicker}</span>
          </div>
        </div>

        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Jensen's Alpha</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Jensen's Alpha:</strong> The annualized excess return earned by the portfolio relative to the benchmark, adjusting for systematic risk (Beta). Positive alpha indicates outperformance.
              </div>
            </div>
            <TrendingUp size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-emerald-400">
              {metrics.alpha >= 0 ? '+' : ''}{fmtPct(metrics.alpha)}
            </span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Excess Annual Return</span>
          </div>
        </div>

        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Information Ratio</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Information Ratio:</strong> Measures active return over the benchmark divided by Tracking Error (volatility of excess returns). Shows how consistently the portfolio beats the benchmark.
              </div>
            </div>
            <HelpCircle size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.informationRatio)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Replication consistency</span>
          </div>
        </div>

        {/* Downside Deviation */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Downside Vol</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Downside Deviation:</strong> Annualized standard deviation of only negative asset returns. Measures bad volatility, ignoring positive swings.
              </div>
            </div>
            <Layers size={14} className="text-indigo-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtPct(metrics.downsideDeviation)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Annualized downside risk</span>
          </div>
        </div>

        {/* Daily 95% VaR */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Daily 95% VaR</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Value at Risk (VaR):</strong> The maximum expected daily loss at a 95% confidence level under normal conditions. There is a 5% chance of a daily loss exceeding this value.
              </div>
            </div>
            <HelpCircle size={14} className="text-red-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtPct(metrics.var95)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Expected daily loss (95% CI)</span>
          </div>
        </div>

        {/* Daily 95% CVaR */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Daily 95% CVaR</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Conditional Value at Risk (CVaR):</strong> Also called Expected Shortfall. The average expected loss on days when the portfolio loss breaches the 95% VaR threshold.
              </div>
            </div>
            <HelpCircle size={14} className="text-red-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtPct(metrics.cvar95)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Expected tail loss (ES)</span>
          </div>
        </div>

        {/* Best / Worst Year */}
        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="group relative flex items-center gap-1 cursor-help">
              <span className="text-xxs font-bold uppercase tracking-wider border-b border-dashed border-slate-500">Best / Worst Year</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 shadow-xl leading-relaxed z-50 pointer-events-none text-left font-normal normal-case">
                <strong>Best/Worst Calendar Year:</strong> The highest and lowest total returns generated by the portfolio during any single full calendar year (January–December).
              </div>
            </div>
            <TrendingUp size={14} className="text-emerald-400" />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <span className="text-sm font-bold text-emerald-400 block">{fmtPct(metrics.bestYear)}</span>
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Best</span>
            </div>
            <div className="border-l border-white/10 h-6" />
            <div>
              <span className="text-sm font-bold text-red-400 block">{fmtPct(metrics.worstYear)}</span>
              <span className="text-[8px] text-slate-500 uppercase block font-semibold">Worst</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Sub-Tab Switcher */}
      <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1 shrink-0 max-w-[280px]">
        <button
          onClick={() => setActiveSubTab('charts')}
          className={`flex-1 py-1.5 rounded-lg text-[10px] uppercase font-extrabold tracking-wider text-center transition ${
            activeSubTab === 'charts' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Performance Charts
        </button>
        <button
          onClick={() => setActiveSubTab('frontier')}
          className={`flex-1 py-1.5 rounded-lg text-[10px] uppercase font-extrabold tracking-wider text-center transition ${
            activeSubTab === 'frontier' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Efficient Frontier
        </button>
      </div>

      {activeSubTab === 'charts' ? (
        /* 2. Charts Dashboard */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Equity Curve & Drawdown (Left, col-span-2) */}
          <div className="lg:col-span-2 glass-card p-6 border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Historical Performance</h3>
                <p className="text-slate-500 text-xxs mt-0.5">Simulated growth of $10,000 portfolio vs benchmark</p>
              </div>
              <div className="bg-slate-950/60 p-0.5 rounded-lg border border-white/5 flex gap-1">
                <button
                  onClick={() => setScaleType('linear')}
                  className={`px-2.5 py-1 text-xxs font-bold rounded-md transition ${
                    scaleType === 'linear'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Linear
                </button>
                <button
                  onClick={() => setScaleType('log')}
                  className={`px-2.5 py-1 text-xxs font-bold rounded-md transition ${
                    scaleType === 'log'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Log
                </button>
              </div>
            </div>

            {/* Equity Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis
                    scale={scaleType === 'log' ? 'log' : 'auto'}
                    domain={scaleType === 'log' ? ['auto', 'auto'] : [0, 'auto']}
                    stroke="#475569"
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(v) => `$${v.toLocaleString()}`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                    itemStyle={{ fontSize: 12 }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Portfolio"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  {benchmarkTicker && (
                    <Line
                      type="monotone"
                      dataKey="benchmark"
                      name={`Benchmark (${benchmarkTicker})`}
                      stroke="#475569"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Drawdowns Area Chart (Synchronized visual height) */}
            <div className="space-y-2">
              <span className="text-xxs font-bold uppercase tracking-wider text-slate-400 px-2 block">
                Drawdown Analysis (%)
              </span>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis
                      stroke="#475569"
                      fontSize={10}
                      tickLine={false}
                      domain={[0, 'auto']}
                      reversed
                      tickFormatter={(v) => `-${v}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                      labelStyle={{ color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                      itemStyle={{ color: '#ef4444', fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      name="Drawdown"
                      stroke="#ef4444"
                      fill="url(#colorDd)"
                      fillOpacity={0.2}
                    >
                      <defs>
                        <linearGradient id="colorDd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Matrix & Asset Allocation breakdowns (Right, col-span-1) */}
          <div className="space-y-6">
            {/* Allocation Donut */}
            <div className="glass-card p-6 border border-white/5">
              <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider mb-4">
                Sector Concentration
              </h3>
              <div className="h-48 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">
                    Allocation
                  </span>
                  <span className="text-lg font-bold text-white leading-none">
                    {assets.length} Assets
                  </span>
                </div>
              </div>
              {/* Donut Legend */}
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                {pieData.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xxs">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }} 
                    />
                    <span className="text-slate-400 uppercase font-semibold">{entry.name}</span>
                    <span className="text-white font-bold">{entry.value}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap */}
            {matrixContent}
          </div>
        </div>
      ) : (
        /* Efficient Frontier View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scatter Chart (Left, col-span-2) */}
          <div className="lg:col-span-2 glass-card p-6 border border-white/5 space-y-6">
            <div>
              <h3 className="text-lg font-display font-bold text-white">Efficient Frontier Model</h3>
              <p className="text-slate-500 text-xxs mt-0.5">
                Expected annual return vs annualized historical volatility
              </p>
            </div>
            
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Volatility" 
                    unit="%" 
                    stroke="#475569" 
                    fontSize={10}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="Expected Return" 
                    unit="%" 
                    stroke="#475569" 
                    fontSize={10}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <ZAxis type="number" range={[60, 200]} />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                    itemStyle={{ fontSize: 12, color: '#fff' }}
                    labelStyle={{ display: 'none' }}
                    formatter={(value, name, props) => {
                      const ticker = props.payload.ticker;
                      return [`${value}%`, name + (ticker ? ` (${ticker})` : '')];
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  
                  {/* Efficient Frontier Curve Line */}
                  <Scatter 
                    name="Efficient Frontier" 
                    data={frontierData} 
                    fill="#6366f1" 
                    line={{ stroke: '#6366f1', strokeWidth: 2 }}
                    lineType="joint" 
                    shape={() => null} 
                  />
                  
                  {/* Individual Assets */}
                  <Scatter 
                    name="Standalone Assets" 
                    data={assetsData} 
                    fill="#10b981" 
                    shape="square"
                  >
                    <LabelList dataKey="ticker" position="top" stroke="#94a3b8" fontSize={9} offset={5} />
                  </Scatter>
                  
                  {/* Current Portfolio Position */}
                  <Scatter 
                    name="Current Portfolio" 
                    data={[currentPortfolioPoint]} 
                    fill="#f59e0b" 
                    shape="circle"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Explanation sidebar (Right, col-span-1) */}
          <div className="glass-card p-6 border border-white/5 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-sm font-display font-bold text-white uppercase tracking-wider">
                Risk & Return Breakdown
              </h4>
              <div className="space-y-3">
                {/* Current Portfolio Stats in breakdown */}
                <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest block mb-1">
                    Current Portfolio
                  </span>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Return (CAGR):</span>
                    <span className="text-white font-bold">{currentPortfolioPoint.y}%</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-slate-400">Volatility:</span>
                    <span className="text-white font-bold">{currentPortfolioPoint.x}%</span>
                  </div>
                </div>

                {/* Individual Assets listing */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">
                    Individual Standalone Assets
                  </span>
                  <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                    {assetsData.map(asset => (
                      <div key={asset.ticker} className="flex items-center justify-between text-xxs p-2 bg-slate-950/40 rounded-lg border border-white/5">
                        <span className="font-bold text-white uppercase">{asset.ticker}</span>
                        <div className="text-right text-slate-400">
                          <span>Ret: <strong className="text-slate-200">{asset.y}%</strong></span>
                          <span className="mx-1">•</span>
                          <span>Vol: <strong className="text-slate-200">{asset.x}%</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Explanation box */}
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/10 rounded-2xl text-xxs text-slate-400 leading-relaxed space-y-2">
              <span className="font-bold text-indigo-300 block uppercase tracking-wider">
                Diversification & Efficient Frontier
              </span>
              <p>
                The **Efficient Frontier** traces out the mathematically optimal portfolios that offer the highest expected return for a defined level of risk.
              </p>
              <p>
                Notice how the **Current Portfolio (Orange Dot)** is positioned relative to the **Standalone Assets (Green Squares)**. By combining assets with low correlation, portfolio volatility decreases, pushing the orange dot further left towards the frontier curve.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
