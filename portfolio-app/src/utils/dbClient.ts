// dbClient.ts
// Unified database client layer that switches between live Supabase DB and local storage demo mode

import { supabase, isDemoMode } from '../context/AuthContext';
import { generateMockPrices } from './mockPrices';

export interface DBPortfolio {
  id: string;
  user_id: string;
  name: string;
  rebalance_type: 'none' | 'monthly' | 'quarterly' | 'annually' | 'deviation';
  deviation_threshold: number;
  benchmark_ticker: string;
  telegram_enabled: boolean;
  telegram_send_time: string;
  created_at: string;
}

export interface DBAsset {
  id?: string;
  portfolio_id: string;
  ticker: string;
  weight: number;
  asset_type: 'etf' | 'crypto' | 'metal';
}

export interface DBImportLog {
  id: string;
  ticker: string;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'error' | 'skipped';
  rows_imported: number;
  error_message: string | null;
  reason: string | null;
}

// ----------------------------------------------------
// Demo Mode LocalStorage Initializer
// ----------------------------------------------------
const MOCK_USER_ID = 'demo-user-id-12345';

function initializeDemoData() {
  if (typeof window === 'undefined') return;

  const key = 'aurawealth_demo_portfolios';
  if (!localStorage.getItem(key)) {
    const defaultPortfolios: DBPortfolio[] = [
      {
        id: 'port-1',
        user_id: MOCK_USER_ID,
        name: 'Ray Dalio All-Weather',
        rebalance_type: 'quarterly',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: true,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-2',
        user_id: MOCK_USER_ID,
        name: 'Classic 60/40 Balanced',
        rebalance_type: 'annually',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-3',
        user_id: MOCK_USER_ID,
        name: 'Aggressive Tech & Crypto',
        rebalance_type: 'deviation',
        deviation_threshold: 10.0,
        benchmark_ticker: 'QQQ',
        telegram_enabled: true,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      }
    ];

    const defaultAssets: DBAsset[] = [
      // Port 1: SPY (30%), TLT (40%), GLD (30%)
      { portfolio_id: 'port-1', ticker: 'SPY', weight: 0.30, asset_type: 'etf' },
      { portfolio_id: 'port-1', ticker: 'TLT', weight: 0.40, asset_type: 'etf' },
      { portfolio_id: 'port-1', ticker: 'GLD', weight: 0.30, asset_type: 'metal' },
      
      // Port 2: SPY (60%), TLT (40%)
      { portfolio_id: 'port-2', ticker: 'SPY', weight: 0.60, asset_type: 'etf' },
      { portfolio_id: 'port-2', ticker: 'TLT', weight: 0.40, asset_type: 'etf' },
      
      // Port 3: QQQ (50%), BTC (30%), ETH (20%)
      { portfolio_id: 'port-3', ticker: 'QQQ', weight: 0.50, asset_type: 'etf' },
      { portfolio_id: 'port-3', ticker: 'BTC', weight: 0.30, asset_type: 'crypto' },
      { portfolio_id: 'port-3', ticker: 'ETH', weight: 0.20, asset_type: 'crypto' }
    ];

    localStorage.setItem(key, JSON.stringify(defaultPortfolios));
    localStorage.setItem('aurawealth_demo_assets', JSON.stringify(defaultAssets));

    const defaultLogs: DBImportLog[] = [
      {
        id: 'log-1',
        ticker: 'SPY',
        started_at: new Date(Date.now() - 3600000).toISOString(),
        finished_at: new Date().toISOString(),
        status: 'success',
        rows_imported: 6300,
        error_message: null,
        reason: 'Initial Backfill'
      },
      {
        id: 'log-2',
        ticker: 'BTC',
        started_at: new Date(Date.now() - 7200000).toISOString(),
        finished_at: new Date(Date.now() - 3500000).toISOString(),
        status: 'success',
        rows_imported: 5800,
        error_message: null,
        reason: 'Initial Backfill'
      }
    ];
    localStorage.setItem('aurawealth_demo_logs', JSON.stringify(defaultLogs));
  }
}

// Ensure demo data is initialized in browser
if (isDemoMode) {
  initializeDemoData();
}

// ----------------------------------------------------
// Database Operations Client API
// ----------------------------------------------------

export async function getPortfolios(userId: string): Promise<DBPortfolio[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_portfolios');
    const portfolios = list ? JSON.parse(list) : [];
    return portfolios.filter((p: DBPortfolio) => p.user_id === userId);
  }

  if (!supabase) return [];
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createPortfolio(
  userId: string,
  portfolio: Partial<DBPortfolio>
): Promise<DBPortfolio> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_portfolios');
    const portfolios = list ? JSON.parse(list) : [];
    const newPort: DBPortfolio = {
      id: 'port-' + Math.random().toString(36).substring(2, 9),
      user_id: userId,
      name: portfolio.name || 'New Portfolio',
      rebalance_type: portfolio.rebalance_type || 'none',
      deviation_threshold: Number(portfolio.deviation_threshold) || 5.0,
      benchmark_ticker: (portfolio.benchmark_ticker || 'SPY').toUpperCase(),
      telegram_enabled: portfolio.telegram_enabled ?? false,
      telegram_send_time: portfolio.telegram_send_time || '09:00:00',
      created_at: new Date().toISOString()
    };
    portfolios.push(newPort);
    localStorage.setItem('aurawealth_demo_portfolios', JSON.stringify(portfolios));
    return newPort;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data, error } = await supabase
    .from('portfolios')
    .insert([{ user_id: userId, ...portfolio }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePortfolio(
  portfolioId: string,
  updates: Partial<DBPortfolio>
): Promise<DBPortfolio> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_portfolios');
    const portfolios = list ? JSON.parse(list) : [];
    const idx = portfolios.findIndex((p: DBPortfolio) => p.id === portfolioId);
    if (idx !== -1) {
      portfolios[idx] = { ...portfolios[idx], ...updates };
      localStorage.setItem('aurawealth_demo_portfolios', JSON.stringify(portfolios));
      return portfolios[idx];
    }
    throw new Error('Portfolio not found.');
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data, error } = await supabase
    .from('portfolios')
    .update(updates)
    .eq('id', portfolioId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_portfolios');
    const portfolios = list ? JSON.parse(list) : [];
    const remaining = portfolios.filter((p: DBPortfolio) => p.id !== portfolioId);
    localStorage.setItem('aurawealth_demo_portfolios', JSON.stringify(remaining));

    // Cleanup assets
    const assetList = localStorage.getItem('aurawealth_demo_assets');
    const assets = assetList ? JSON.parse(assetList) : [];
    const remainingAssets = assets.filter((a: DBAsset) => a.portfolio_id !== portfolioId);
    localStorage.setItem('aurawealth_demo_assets', JSON.stringify(remainingAssets));
    return;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', portfolioId);

  if (error) throw error;
}

export async function getPortfolioAssets(portfolioId: string): Promise<DBAsset[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_assets');
    const assets = list ? JSON.parse(list) : [];
    return assets.filter((a: DBAsset) => a.portfolio_id === portfolioId);
  }

  if (!supabase) return [];
  const { data, error } = await supabase
    .from('portfolio_assets')
    .select('*')
    .eq('portfolio_id', portfolioId);

  if (error) throw error;
  return data || [];
}

export async function savePortfolioAssets(
  portfolioId: string,
  newAssets: Omit<DBAsset, 'portfolio_id'>[]
): Promise<DBAsset[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_assets');
    const assets = list ? JSON.parse(list) : [];
    
    // Remove existing assets for this portfolio
    const filtered = assets.filter((a: DBAsset) => a.portfolio_id !== portfolioId);
    
    // Add new ones
    const added: DBAsset[] = newAssets.map(item => ({
      portfolio_id: portfolioId,
      ticker: item.ticker.toUpperCase(),
      weight: item.weight,
      asset_type: item.asset_type
    }));
    
    localStorage.setItem('aurawealth_demo_assets', JSON.stringify([...filtered, ...added]));
    return added;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');

  // Transaction-like behavior using delete + insert
  const { error: deleteError } = await supabase
    .from('portfolio_assets')
    .delete()
    .eq('portfolio_id', portfolioId);

  if (deleteError) throw deleteError;

  if (newAssets.length === 0) return [];

  const { data, error: insertError } = await supabase
    .from('portfolio_assets')
    .insert(
      newAssets.map(a => ({
        portfolio_id: portfolioId,
        ticker: a.ticker.toUpperCase(),
        weight: a.weight,
        asset_type: a.asset_type
      }))
    )
    .select();

  if (insertError) throw insertError;
  return data || [];
}

/**
 * Gets EOD quotes for the list of tickers.
 * In demo mode, generates price lists on the fly.
 * In live mode, runs a DB select and triggers backfills for missing assets.
 */
export async function getQuotesForTickers(
  tickers: string[],
  startDate: string = '2001-01-01',
  endDate: string = new Date().toISOString().split('T')[0]
): Promise<Record<string, { dates: string[]; prices: number[] }>> {
  const result: Record<string, { dates: string[]; prices: number[] }> = {};
  
  if (tickers.length === 0) return result;
  
  if (isDemoMode) {
    tickers.forEach(ticker => {
      result[ticker] = generateMockPrices(ticker, startDate, endDate);
    });
    return result;
  }

  if (!supabase) return result;
  
  // Real Mode DB Query
  const { data, error } = await supabase
    .from('quotes')
    .select('ticker, date, adj_close')
    .in('ticker', tickers)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) throw error;
  
  // Group by ticker
  tickers.forEach(t => {
    result[t] = { dates: [], prices: [] };
  });
  
  if (data) {
    data.forEach((row: any) => {
      if (result[row.ticker]) {
        result[row.ticker].dates.push(row.date);
        result[row.ticker].prices.push(Number(row.adj_close));
      }
    });
  }

  // Check if any ticker has zero data in DB
  // In live mode, client will call backfill endpoint via POST /api/quotes/backfill
  // to fetch history asynchronously from Yahoo.
  const missingTickers = tickers.filter(t => result[t].dates.length === 0);
  if (missingTickers.length > 0) {
    console.warn(`Tickers [${missingTickers.join(', ')}] have no quotes in DB. Running client-side fetch...`);
    // Run an async backfill trigger
    missingTickers.forEach(async ticker => {
      try {
        await fetch('/api/cron/sync?ticker=' + encodeURIComponent(ticker), {
          method: 'POST',
        });
      } catch (err) {
        console.error(`Failed to trigger backfill for ${ticker}:`, err);
      }
    });
  }

  return result;
}

export async function getImportLogs(): Promise<DBImportLog[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_logs');
    return list ? JSON.parse(list) : [];
  }

  if (!supabase) return [];
  const { data, error } = await supabase
    .from('import_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

export async function getUserProfile(userId: string) {
  if (isDemoMode) {
    return {
      id: userId,
      email: 'demo@aurawealth.io',
      telegram_chat_id: '123456789',
      risk_free_rate: 0.04
    };
  }

  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // If user profile doesn't exist, create it
    if (error.code === 'PGRST116') {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ id: userId, email: 'user@example.com' }])
        .select()
        .single();
      if (createError) throw createError;
      return newUser;
    }
    throw error;
  }
  return data;
}

export async function updateUserProfile(userId: string, updates: { telegram_chat_id?: string; risk_free_rate?: number }) {
  if (isDemoMode) {
    return {
      id: userId,
      email: 'demo@aurawealth.io',
      ...updates
    };
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
