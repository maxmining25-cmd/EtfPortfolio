// CashFlowConfig.tsx
// Interactive controls to configure periodic deposits/withdrawals and view US inflation data.

'use client';

import React, { useState } from 'react';
import { 
  DollarSign, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Info,
  CalendarDays
} from 'lucide-react';
import { US_INFLATION_TABLE } from '../utils/portfolioMath';

interface CashFlowConfigProps {
  initialAmount: number;
  onInitialAmountChange: (val: number) => void;
  cashFlowType: 'none' | 'add' | 'remove';
  onCashFlowTypeChange: (val: 'none' | 'add' | 'remove') => void;
  cashFlowAmount: number;
  onCashFlowAmountChange: (val: number) => void;
  cashFlowFrequency: 'monthly' | 'quarterly';
  onCashFlowFrequencyChange: (val: 'monthly' | 'quarterly') => void;
  cashFlowInflationAdjusted: boolean;
  onCashFlowInflationAdjustedChange: (val: boolean) => void;
}

export default function CashFlowConfig({
  initialAmount,
  onInitialAmountChange,
  cashFlowType,
  onCashFlowTypeChange,
  cashFlowAmount,
  onCashFlowAmountChange,
  cashFlowFrequency,
  onCashFlowFrequencyChange,
  cashFlowInflationAdjusted,
  onCashFlowInflationAdjustedChange
}: CashFlowConfigProps) {
  const [showInflationTable, setShowInflationTable] = useState(false);

  const handlePlanChange = (value: string) => {
    switch (value) {
      case 'none':
        onCashFlowTypeChange('none');
        break;
      case 'deposit-monthly':
        onCashFlowTypeChange('add');
        onCashFlowFrequencyChange('monthly');
        break;
      case 'deposit-quarterly':
        onCashFlowTypeChange('add');
        onCashFlowFrequencyChange('quarterly');
        break;
      case 'withdraw-monthly':
        onCashFlowTypeChange('remove');
        onCashFlowFrequencyChange('monthly');
        break;
      case 'withdraw-quarterly':
        onCashFlowTypeChange('remove');
        onCashFlowFrequencyChange('quarterly');
        break;
    }
  };

  const getPlanValue = () => {
    if (cashFlowType === 'none') return 'none';
    return `${cashFlowType === 'add' ? 'deposit' : 'withdraw'}-${cashFlowFrequency}`;
  };

  return (
    <div className="glass-card p-6 border border-white/5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign size={20} className="text-emerald-400" />
        <h3 className="text-lg font-display font-bold text-white">
          Cash Flows & Inflation
        </h3>
      </div>

      {/* Main Settings Form */}
      <div className="space-y-4">
        {/* Initial Amount Input */}
        <div>
          <label htmlFor="config-initial-capital" className="text-slate-400 text-xxs font-bold uppercase mb-1.5 block flex items-center gap-1">
            Initial Capital
            <span className="text-slate-400 font-normal cursor-help" title="Starting balance at the beginning of the backtest period">
              <HelpCircle size={10} />
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 inset-y-0 flex items-center text-slate-400 text-xs">$</span>
            <input
              id="config-initial-capital"
              type="number"
              min="100"
              max="10000000"
              step="500"
              value={initialAmount}
              onChange={(e) => onInitialAmountChange(Math.max(100, Number(e.target.value)))}
              className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2 pl-7 pr-4 text-xs text-white focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition"
            />
          </div>
        </div>

        {/* Regular Cash Flow Plan */}
        <div>
          <label htmlFor="config-periodic-plan" className="text-slate-400 text-xxs font-bold uppercase mb-1.5 block">
            Periodic Plan
          </label>
          <select
            id="config-periodic-plan"
            value={getPlanValue()}
            onChange={(e) => handlePlanChange(e.target.value)}
            className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition"
          >
            <option value="none">No cash flows (Lump Sum)</option>
            <option value="deposit-monthly">Monthly Deposits</option>
            <option value="deposit-quarterly">Quarterly Deposits</option>
            <option value="withdraw-monthly">Monthly Withdrawals</option>
            <option value="withdraw-quarterly">Quarterly Withdrawals</option>
          </select>
        </div>

        {/* Cash Flow Amount & Inflation Toggle */}
        {cashFlowType !== 'none' && (
          <div className="space-y-4 p-4 bg-slate-900/40 border border-white/5 rounded-2xl animate-fadeIn">
            {/* Amount input */}
            <div>
              <label htmlFor="config-cashflow-amount" className="text-slate-400 text-xxs font-bold uppercase mb-1.5 block">
                {cashFlowType === 'add' ? 'Deposit Amount' : 'Withdrawal Amount'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 inset-y-0 flex items-center text-slate-400 text-xs">$</span>
                <input
                  id="config-cashflow-amount"
                  type="number"
                  min="5"
                  max="1000000"
                  step="50"
                  value={cashFlowAmount}
                  onChange={(e) => onCashFlowAmountChange(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl py-2 pl-7 pr-4 text-xs text-white focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition"
                />
                <span className="absolute right-3.5 inset-y-0 flex items-center text-[10px] text-slate-400 uppercase font-bold">
                  Per {cashFlowFrequency === 'monthly' ? 'Month' : 'Quarter'}
                </span>
              </div>
            </div>

            {/* Inflation Adjusted Toggle */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                id="inflation-adjust"
                type="checkbox"
                checked={cashFlowInflationAdjusted}
                onChange={(e) => onCashFlowInflationAdjustedChange(e.target.checked)}
                className="mt-0.5 rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 cursor-pointer animate-fadeIn"
              />
              <div className="text-[11px] leading-tight">
                <label htmlFor="inflation-adjust" className="font-semibold text-slate-200 cursor-pointer block mb-0.5">
                  Adjust for USA Inflation (CPI-U)
                </label>
                <span className="text-slate-400 text-[10px] block">
                  Automatically scales the cash flow size over time to maintain purchasing power based on the historical CPI table.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Predefined US Inflation Lookup Table Widget */}
      <div className="pt-4 border-t border-white/5 space-y-3">
        <button
          onClick={() => setShowInflationTable(!showInflationTable)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition font-medium focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none rounded px-1"
        >
          <span className="flex items-center gap-1.5">
            <CalendarDays size={14} className="text-indigo-400" />
            US CPI Inflation Table
          </span>
          {showInflationTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showInflationTable && (
          <div className="p-3 bg-slate-950/60 border border-white/15 rounded-xl space-y-2 max-h-[180px] overflow-y-auto pr-1 text-xxs scrollbar-thin">
            <div className="flex items-center gap-1.5 text-slate-400 pb-2 border-b border-white/5 mb-2">
              <Info size={11} className="shrink-0 text-indigo-400" />
              <span>US CPI-U values (1982-1984 average = 100). Higher index reflects price inflation.</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="font-bold text-slate-400 uppercase border-b border-white/5 pb-1">Year</div>
              <div className="font-bold text-slate-400 uppercase border-b border-white/5 pb-1">CPI Index</div>
              <div className="font-bold text-slate-400 uppercase border-b border-white/5 pb-1">Ann. Infl.</div>

              {Object.entries(US_INFLATION_TABLE)
                .sort((a, b) => Number(b[0]) - Number(a[0])) // sort descending by year
                .map(([yearStr, indexVal]) => {
                  const year = Number(yearStr);
                  const prevVal = US_INFLATION_TABLE[year - 1];
                  const inflRate = prevVal ? ((indexVal - prevVal) / prevVal) * 100 : null;

                  return (
                    <React.Fragment key={year}>
                      <div className="text-slate-300 font-semibold">{year}</div>
                      <div className="text-white font-mono">{indexVal.toFixed(2)}</div>
                      <div className="text-indigo-400 font-mono">
                        {inflRate !== null ? `${inflRate.toFixed(2)}%` : '—'}
                      </div>
                    </React.Fragment>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
