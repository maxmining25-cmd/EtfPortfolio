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
  Line
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
            <span className="text-xxs font-bold uppercase tracking-wider">CAGR</span>
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
            <span className="text-xxs font-bold uppercase tracking-wider">Max Drawdown</span>
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
            <span className="text-xxs font-bold uppercase tracking-wider">Sharpe Ratio</span>
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
            <span className="text-xxs font-bold uppercase tracking-wider">Sortino Ratio</span>
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
            <span className="text-xxs font-bold uppercase tracking-wider">Calmar Ratio</span>
            <Layers size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.calmarRatio)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Return-to-drawdown</span>
          </div>
        </div>

        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xxs font-bold uppercase tracking-wider">Portfolio Beta</span>
            <Activity size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.beta)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Vs Benchmark {benchmarkTicker}</span>
          </div>
        </div>

        <div className="glass-card p-4 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xxs font-bold uppercase tracking-wider">Jensen's Alpha</span>
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
            <span className="text-xxs font-bold uppercase tracking-wider">Information Ratio</span>
            <HelpCircle size={14} className="text-slate-400" />
          </div>
          <div>
            <span className="text-lg font-bold text-white">{fmtNum(metrics.informationRatio)}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5">Replication consistency</span>
          </div>
        </div>
      </div>

      {/* 2. Charts Dashboard */}
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
    </div>
  );
}
