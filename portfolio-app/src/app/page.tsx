// page.tsx
// AuraWealth Main Workspace entry page wrapping auth and connecting sidebar, sandbox, and analytics components

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Login from '../components/Login';
import Sidebar from '../components/Sidebar';
import Sandbox from '../components/Sandbox';
import Analytics from '../components/Analytics';
import AdminPanel from '../components/AdminPanel';
import CashFlowConfig from '../components/CashFlowConfig';
import { 
  getPortfolios, 
  createPortfolio, 
  deletePortfolio, 
  getPortfolioAssets, 
  savePortfolioAssets, 
  getQuotesForTickers,
  updatePortfolio,
  getUserProfile,
  updateUserProfile,
  getImportLogs,
  prepopulateUserPortfolios,
  DBPortfolio,
  DBAsset,
  DBImportLog
} from '../utils/dbClient';
import { calculateBacktest, calculateOptimization } from '../utils/mathClient';
import { BacktestResult } from '../utils/portfolioMath';
import { 
  RefreshCw, 
  AlertTriangle,
  Info,
  Calendar,
  Lock,
  ChevronRight,
  Database,
  X,
  Menu,
  TrendingUp
} from 'lucide-react';

function DashboardContent() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin'>('dashboard');
  
  // Data State
  const [portfolios, setPortfolios] = useState<DBPortfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [assets, setAssets] = useState<DBAsset[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [lastQuoteDates, setLastQuoteDates] = useState<Record<string, string>>({});
  
  // Settings & Profile
  const [telegramChatId, setTelegramChatId] = useState('');
  const [riskFreeRate, setRiskFreeRate] = useState(0.04);
  const [importLogs, setImportLogs] = useState<DBImportLog[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  
  // Cash Flow States
  const [initialAmount, setInitialAmount] = useState<number>(10000);
  const [cashFlowType, setCashFlowType] = useState<'none' | 'add' | 'remove'>('none');
  const [cashFlowAmount, setCashFlowAmount] = useState<number>(500);
  const [cashFlowFrequency, setCashFlowFrequency] = useState<'monthly' | 'quarterly'>('monthly');
  const [cashFlowInflationAdjusted, setCashFlowInflationAdjusted] = useState<boolean>(true);
  
  // UX State
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 1. Fetch user profile and portfolios on mount
  useEffect(() => {
    if (!user) return;

    const loadUserData = async () => {
      try {
        const profile = await getUserProfile(user.id);
        if (profile) {
          setTelegramChatId(profile.telegram_chat_id || '');
          setRiskFreeRate(Number(profile.risk_free_rate) || 0.04);
        }

        let ports = await getPortfolios(user.id);
        if (ports.length === 0) {
          await prepopulateUserPortfolios(user.id);
          ports = await getPortfolios(user.id);
        }
        setPortfolios(ports);
        if (ports.length > 0) {
          setSelectedPortfolioId(ports[0].id);
        }
        
        const logs = await getImportLogs();
        setImportLogs(logs);
      } catch (err: any) {
        setErrorMessage('Failed to load user workspace: ' + err.message);
      }
    };

    loadUserData();
  }, [user]);

  // 2. Fetch assets when selected portfolio changes
  useEffect(() => {
    if (!selectedPortfolioId) {
      setAssets([]);
      setBacktestResult(null);
      return;
    }

    const loadPortfolioAssets = async () => {
      try {
        const portAssets = await getPortfolioAssets(selectedPortfolioId);
        setAssets(portAssets);
      } catch (err: any) {
        setErrorMessage('Failed to load assets: ' + err.message);
      }
    };

    loadPortfolioAssets();
  }, [selectedPortfolioId]);

  // Selected portfolio object helper
  const selectedPortfolio = portfolios.find(p => p.id === selectedPortfolioId) || null;

  // 3. Mathematical backtesting trigger on assets/weights change
  const runSimulation = useCallback(async () => {
    if (assets.length === 0) {
      setBacktestResult(null);
      return;
    }
    
    // Validate weights sum to 100% (or very close)
    const totalWeight = assets.reduce((sum, a) => sum + a.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 1e-3) {
      setBacktestResult(null);
      return;
    }

    setIsCalculating(true);
    setErrorMessage(null);

    try {
      const tickers = assets.map(a => a.ticker);
      
      // Add benchmark ticker if defined
      const bench = selectedPortfolio?.benchmark_ticker || 'SPY';
      const allTickers = Array.from(new Set([...tickers, bench]));
      
      // Fetch quote histories (either local mock or Supabase table)
      const quotesMap = await getQuotesForTickers(allTickers, '2001-01-01');

      // Update last quote dates for Sandbox hints
      const datesRecord: Record<string, string> = {};
      Object.keys(quotesMap).forEach(t => {
        const dates = quotesMap[t]?.dates || [];
        if (dates.length > 0) {
          datesRecord[t] = dates[dates.length - 1];
        }
      });
      setLastQuoteDates(prev => ({ ...prev, ...datesRecord }));
      
      // Construct asset datas
      const assetDatas = assets.map(a => ({
        ticker: a.ticker,
        dates: quotesMap[a.ticker]?.dates || [],
        prices: quotesMap[a.ticker]?.prices || []
      }));
      
      const benchData = quotesMap[bench] 
        ? { dates: quotesMap[bench].dates, prices: quotesMap[bench].prices }
        : undefined;

      const weightsRecord: Record<string, number> = {};
      assets.forEach(a => {
        weightsRecord[a.ticker] = a.weight;
      });

      // Run backtest in Web Worker!
      const result = await calculateBacktest({
        assets: assetDatas,
        weights: weightsRecord,
        riskFreeRate,
        benchmarkPrices: benchData,
        initialAmount,
        cashFlowType,
        cashFlowAmount,
        cashFlowFrequency,
        cashFlowInflationAdjusted
      });

      setBacktestResult(result);
    } catch (err: any) {
      console.error('Simulation error:', err);
      setErrorMessage(err.message || 'Error occurred during simulation.');
    } finally {
      setIsCalculating(false);
    }
  }, [assets, selectedPortfolio, riskFreeRate, initialAmount, cashFlowType, cashFlowAmount, cashFlowFrequency, cashFlowInflationAdjusted]);

  // Trigger simulation whenever assets configuration updates
  useEffect(() => {
    runSimulation();
  }, [assets, runSimulation]);

  // 4. Sidebar creation and delete handlers
  const handleCreatePortfolio = async (name: string, benchmark: string) => {
    if (!user) return;
    try {
      const newPort = await createPortfolio(user.id, {
        name,
        benchmark_ticker: benchmark,
        rebalance_type: 'none',
        deviation_threshold: 5.0
      });
      setPortfolios(prev => [...prev, newPort]);
      setSelectedPortfolioId(newPort.id);
      setSuccessMessage(`Portfolio "${name}" created.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Failed to create portfolio: ' + err.message);
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    try {
      await deletePortfolio(id);
      const remaining = portfolios.filter(p => p.id !== id);
      setPortfolios(remaining);
      if (selectedPortfolioId === id) {
        setSelectedPortfolioId(remaining.length > 0 ? remaining[0].id : null);
      }
      setSuccessMessage('Portfolio deleted.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Failed to delete portfolio: ' + err.message);
    }
  };

  const handleUpdateSettings = async (chatId: string, rate: number) => {
    if (!user) return;
    try {
      await updateUserProfile(user.id, {
        telegram_chat_id: chatId,
        risk_free_rate: rate
      });
      setTelegramChatId(chatId);
      setRiskFreeRate(rate);
      setSuccessMessage('Global settings updated successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Failed to update settings: ' + err.message);
    }
  };

  // 5. Weight Sliders Sandbox update handler
  const handleUpdateAssets = async (updatedAssets: DBAsset[]) => {
    setAssets(updatedAssets);
    if (selectedPortfolioId) {
      try {
        // Save weights config to database/local storage
        await savePortfolioAssets(selectedPortfolioId, updatedAssets);
      } catch (err: any) {
        console.error('Failed to auto-save weights:', err);
      }
    }
  };

  // 6. One-click mathematical optimization solver trigger
  const handleOptimizeWeights = async (
    type: 'equal' | 'sharpe' | 'min_vol' | 'risk_parity' | 'max_div' | 'sortino'
  ) => {
    if (assets.length === 0 || !selectedPortfolioId) return;

    setIsCalculating(true);
    setErrorMessage(null);

    try {
      const tickers = assets.map(a => a.ticker);
      const quotesMap = await getQuotesForTickers(tickers, '2001-01-01');
      
      const assetDatas = assets.map(a => ({
        ticker: a.ticker,
        dates: quotesMap[a.ticker]?.dates || [],
        prices: quotesMap[a.ticker]?.prices || []
      }));

      // Call optimization solver running in Web Worker!
      const optimalWeights = await calculateOptimization({
        assets: assetDatas,
        riskFreeRate,
        type
      });

      // Map optimal weights back to assets array
      const updated = assets.map(a => ({
        ...a,
        weight: optimalWeights[a.ticker] ?? 0
      }));

      await handleUpdateAssets(updated);
      setSuccessMessage(`Weights optimized via ${type.replace('_', ' ')}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Optimization solver failed: ' + err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  // 7. Manual trigger for EOD quote synchronization
  const handleSyncQuotes = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/cron/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'local-development-token'}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync request failed.');
      
      setSuccessMessage(`Database EOD Sync complete: ${data.processed} tickers updated.`);
      const logs = await getImportLogs();
      setImportLogs(logs);
      // Rerun backtest simulation
      await runSimulation();
    } catch (err: any) {
      setErrorMessage('EOD Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Last successful log date
  const lastSyncDate = importLogs.find(l => l.status === 'success')?.finished_at;

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Sidebar navigation for desktop */}
      <div className="hidden lg:flex lg:w-80 lg:shrink-0 h-full">
        <Sidebar
          portfolios={portfolios}
          selectedPortfolioId={selectedPortfolioId}
          onSelectPortfolio={setSelectedPortfolioId}
          onCreatePortfolio={handleCreatePortfolio}
          onDeletePortfolio={handleDeletePortfolio}
          telegramChatId={telegramChatId}
          riskFreeRate={riskFreeRate}
          onUpdateSettings={handleUpdateSettings}
          currentView={currentView}
          onViewChange={setCurrentView}
        />
      </div>

      {/* Sidebar navigation drawer for mobile/tablet */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          {/* Dimmed background overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" 
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Sidebar Drawer container */}
          <div className="relative flex flex-col w-80 max-w-[85vw] h-full bg-[#0b0f19] border-r border-white/10 z-50 animate-slideRight">
            <div className="absolute top-4 right-4 z-50">
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
                aria-label="Close navigation menu drawer"
              >
                <X size={18} />
              </button>
            </div>
            <Sidebar
              portfolios={portfolios}
              selectedPortfolioId={selectedPortfolioId}
              onSelectPortfolio={(id) => {
                setSelectedPortfolioId(id);
                setIsSidebarOpen(false);
              }}
              onCreatePortfolio={handleCreatePortfolio}
              onDeletePortfolio={handleDeletePortfolio}
              telegramChatId={telegramChatId}
              riskFreeRate={riskFreeRate}
              onUpdateSettings={handleUpdateSettings}
              currentView={currentView}
              onViewChange={(view) => {
                setCurrentView(view);
                setIsSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Main dashboard space or Admin space */}
      {currentView === 'admin' ? (
        <div className="flex-1 overflow-hidden">
          <AdminPanel onBack={() => setCurrentView('dashboard')} />
        </div>
      ) : (
        <main className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-8 relative">
          {/* Mobile Header Bar */}
          <div className="lg:hidden flex items-center justify-between p-4 mb-6 bg-slate-900/40 border border-white/5 rounded-2xl backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
                aria-label="Open navigation menu drawer"
              >
                <Menu size={20} />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <TrendingUp size={16} />
                </div>
                <span className="text-sm font-display font-bold tracking-tight text-white">
                  AURA<span className="text-indigo-400">WEALTH</span>
                </span>
              </div>
            </div>
          </div>
          {/* Banner messages */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-2 text-sm">
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2 text-sm">
            <Info size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Sync Status Banner */}
        <div className="mb-6 glass-card p-4 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Database size={18} />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-300 block">
                Database EOD Quotes Sync
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Last synchronized:{' '}
                {lastSyncDate ? (
                  new Date(lastSyncDate).toLocaleString()
                ) : (
                  <span className="text-amber-500 italic">Never (using mock EOD quotes)</span>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogModal(true)}
              className="px-3 py-1.5 text-xxs font-bold text-slate-400 hover:text-white bg-slate-900 border border-white/5 rounded-lg transition focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
            >
              View Sync Logs
            </button>
            <button
              onClick={handleSyncQuotes}
              disabled={isSyncing}
              className="px-3 py-1.5 text-xxs font-bold text-indigo-300 hover:text-white bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded-lg flex items-center gap-1.5 transition disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              Sync EOD Quotes
            </button>
          </div>
        </div>

        {/* Workspace content */}
        {!selectedPortfolioId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950/20 border border-white/5 rounded-2xl animate-fadeIn">
            <Calendar size={48} className="text-slate-400 mb-3" />
            <h3 className="text-lg font-display font-bold text-slate-300">No Portfolio Selected</h3>
            <p className="text-slate-400 text-xs text-center max-w-sm mt-1">
              Select an existing portfolio from the sidebar or click the '+' button to bootstrap a new layout.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title & Info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-2">
              <div>
                <h2 className="text-2xl font-display font-bold text-white">
                  {selectedPortfolio?.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xxs font-bold uppercase text-slate-400">Benchmark:</span>
                  <span className="text-xxs font-bold text-indigo-400 uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/10">
                    {selectedPortfolio?.benchmark_ticker}
                  </span>
                  <span className="text-slate-400 text-xxs">•</span>
                  <span className="text-xxs font-bold uppercase text-slate-400">Rebalance:</span>
                  <span className="text-xxs font-bold text-violet-400 uppercase bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/10">
                    {selectedPortfolio?.rebalance_type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isCalculating && (
                  <span className="text-xxs text-indigo-400 flex items-center gap-1.5 font-bold uppercase bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/10">
                    <RefreshCw size={10} className="animate-spin" /> Solving Math...
                  </span>
                )}
              </div>
            </div>

            {/* Dashboard workspace grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left Sandbox Col */}
            <div className="xl:col-span-1 space-y-8">
              <Sandbox
                assets={assets}
                onUpdateAssets={handleUpdateAssets}
                onOptimize={handleOptimizeWeights}
                isCalculating={isCalculating}
                lastQuoteDates={lastQuoteDates}
              />
              <CashFlowConfig
                initialAmount={initialAmount}
                onInitialAmountChange={setInitialAmount}
                cashFlowType={cashFlowType}
                onCashFlowTypeChange={setCashFlowType}
                cashFlowAmount={cashFlowAmount}
                onCashFlowAmountChange={setCashFlowAmount}
                cashFlowFrequency={cashFlowFrequency}
                onCashFlowFrequencyChange={setCashFlowFrequency}
                cashFlowInflationAdjusted={cashFlowInflationAdjusted}
                onCashFlowInflationAdjustedChange={setCashFlowInflationAdjusted}
              />
            </div>

              {/* Analytics & charts */}
              <div className="xl:col-span-2">
                <Analytics
                  backtestData={backtestResult}
                  assets={assets}
                  benchmarkTicker={selectedPortfolio?.benchmark_ticker || 'SPY'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Sync logs details modal */}
        {showLogModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="glass-card max-w-2xl w-full p-6 border border-white/10 flex flex-col max-h-[80vh] glow-indigo">
              <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
                <h3 className="text-lg font-display font-bold text-white">EOD Sync Logs</h3>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus:outline-none"
                  aria-label="Close logs dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {importLogs.length === 0 ? (
                  <p className="text-slate-400 text-xs italic py-8 text-center">No synchronization logs available.</p>
                ) : (
                  importLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`p-3 rounded-xl border flex items-center justify-between gap-4 text-xs ${
                        log.status === 'success'
                          ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'
                          : log.status === 'error'
                          ? 'bg-red-500/5 border-red-500/10 text-red-400'
                          : 'bg-slate-900 border-white/5 text-slate-400'
                      }`}
                    >
                      <div>
                        <span className="font-bold uppercase text-white block">{log.ticker}</span>
                        <span className="text-[10px] text-slate-400">
                          {log.reason || 'Manual Update'} •{' '}
                          {new Date(log.started_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold block uppercase text-[10px]">
                          {log.status}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {log.rows_imported} rows imported
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        </main>
      )}
    </div>
  );
}

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div className="flex-1 bg-[#0b0f19] flex items-center justify-center">
        <RefreshCw className="text-indigo-400 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <AuthProvider>
      <AuthContextConsumer />
    </AuthProvider>
  );
}

function AuthContextConsumer() {
  const { user, loading, theme, fontSize } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sizeMap = {
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px'
    };
    document.documentElement.style.fontSize = sizeMap[fontSize] || '16px';
  }, [fontSize]);

  if (loading) {
    return (
      <div className="flex-1 bg-[#0b0f19] flex items-center justify-center">
        <RefreshCw className="text-indigo-400 animate-spin" size={32} />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <DashboardContent />;
}
