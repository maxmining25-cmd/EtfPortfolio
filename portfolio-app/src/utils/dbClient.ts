// dbClient.ts
// Unified database client layer that switches between live Supabase DB and local storage demo mode

import { supabase, isDemoMode } from '../context/AuthContext';
import { generateMockPrices } from './mockPrices';
import { cleanYahooTicker } from './portfolioMath';

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

  const quotesKey = 'aurawealth_demo_quotes';
  if (!localStorage.getItem(quotesKey)) {
    const initialQuotes: DBQuote[] = [
      { id: 'q-1', ticker: 'SPY', date: '2026-06-03', adj_close: 520.40, volume: 55000000 },
      { id: 'q-2', ticker: 'SPY', date: '2026-06-02', adj_close: 518.20, volume: 48000000 },
      { id: 'q-3', ticker: 'QQQ', date: '2026-06-03', adj_close: 450.50, volume: 38000000 },
      { id: 'q-4', ticker: 'GLD', date: '2026-06-03', adj_close: 215.10, volume: 8000000 },
      { id: 'q-5', ticker: 'BTC', date: '2026-06-03', adj_close: 68500.00, volume: 22000000000 }
    ];
    localStorage.setItem(quotesKey, JSON.stringify(initialQuotes));
  }

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
      },
      {
        id: 'port-4',
        user_id: MOCK_USER_ID,
        name: 'Rick Ferri Core Four',
        rebalance_type: 'quarterly',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-5',
        user_id: MOCK_USER_ID,
        name: 'Bill Bernstein No Brainer',
        rebalance_type: 'annually',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-6',
        user_id: MOCK_USER_ID,
        name: 'Harry Browne Permanent Portfolio',
        rebalance_type: 'annually',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-7',
        user_id: MOCK_USER_ID,
        name: 'David Swensen Yale Endowment',
        rebalance_type: 'annually',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
        telegram_send_time: '09:00:00',
        created_at: new Date().toISOString()
      },
      {
        id: 'port-8',
        user_id: MOCK_USER_ID,
        name: 'Mebane Faber Ivy Portfolio',
        rebalance_type: 'quarterly',
        deviation_threshold: 5.0,
        benchmark_ticker: 'SPY',
        telegram_enabled: false,
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
      { portfolio_id: 'port-3', ticker: 'ETH', weight: 0.20, asset_type: 'crypto' },

      // Port 4: VTI (48%), VXUS (24%), VNQ (8%), BND (20%)
      { portfolio_id: 'port-4', ticker: 'VTI', weight: 0.48, asset_type: 'etf' },
      { portfolio_id: 'port-4', ticker: 'VXUS', weight: 0.24, asset_type: 'etf' },
      { portfolio_id: 'port-4', ticker: 'VNQ', weight: 0.08, asset_type: 'etf' },
      { portfolio_id: 'port-4', ticker: 'BND', weight: 0.20, asset_type: 'etf' },

      // Port 5: SPY (25%), VB (25%), VXUS (25%), SHY (25%)
      { portfolio_id: 'port-5', ticker: 'SPY', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-5', ticker: 'VB', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-5', ticker: 'VXUS', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-5', ticker: 'SHY', weight: 0.25, asset_type: 'etf' },

      // Port 6: VTI (25%), TLT (25%), BIL (25%), GLD (25%)
      { portfolio_id: 'port-6', ticker: 'VTI', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-6', ticker: 'TLT', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-6', ticker: 'BIL', weight: 0.25, asset_type: 'etf' },
      { portfolio_id: 'port-6', ticker: 'GLD', weight: 0.25, asset_type: 'metal' },

      // Port 7: VTI (30%), EFA (15%), VWO (5%), VNQ (20%), TLT (15%), TIP (15%)
      { portfolio_id: 'port-7', ticker: 'VTI', weight: 0.30, asset_type: 'etf' },
      { portfolio_id: 'port-7', ticker: 'EFA', weight: 0.15, asset_type: 'etf' },
      { portfolio_id: 'port-7', ticker: 'VWO', weight: 0.05, asset_type: 'etf' },
      { portfolio_id: 'port-7', ticker: 'VNQ', weight: 0.20, asset_type: 'etf' },
      { portfolio_id: 'port-7', ticker: 'TLT', weight: 0.15, asset_type: 'etf' },
      { portfolio_id: 'port-7', ticker: 'TIP', weight: 0.15, asset_type: 'etf' },

      // Port 8: VTI (20%), VXUS (20%), BND (20%), VNQ (20%), GSG (20%)
      { portfolio_id: 'port-8', ticker: 'VTI', weight: 0.20, asset_type: 'etf' },
      { portfolio_id: 'port-8', ticker: 'VXUS', weight: 0.20, asset_type: 'etf' },
      { portfolio_id: 'port-8', ticker: 'BND', weight: 0.20, asset_type: 'etf' },
      { portfolio_id: 'port-8', ticker: 'VNQ', weight: 0.20, asset_type: 'etf' },
      { portfolio_id: 'port-8', ticker: 'GSG', weight: 0.20, asset_type: 'etf' }
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
  
  // Clean tickers for DB query
  const cleanedTickers = tickers.map(cleanYahooTicker);
  const tickerMap: Record<string, string> = {}; // Cleaned -> Original
  tickers.forEach((t, idx) => {
    tickerMap[cleanedTickers[idx]] = t;
  });

  // Real Mode DB Query
  const { data, error } = await supabase
    .from('quotes')
    .select('ticker, date, adj_close')
    .in('ticker', cleanedTickers)
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
      const originalTicker = tickerMap[row.ticker] || row.ticker;
      if (result[originalTicker]) {
        result[originalTicker].dates.push(row.date);
        result[originalTicker].prices.push(Number(row.adj_close));
      }
    });
  }

  // Check if any ticker has zero data in DB
  const missingTickers = tickers.filter(t => result[t].dates.length === 0);
  if (missingTickers.length > 0) {
    console.warn(`Tickers [${missingTickers.join(', ')}] have no quotes in DB. Running client-side fetch...`);
    // Run an async backfill trigger
    missingTickers.forEach(async ticker => {
      try {
        const cleanedMissing = cleanYahooTicker(ticker);
        await fetch('/api/cron/sync?ticker=' + encodeURIComponent(cleanedMissing), {
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

export interface DBUser {
  id: string;
  email: string;
  telegram_chat_id: string | null;
  risk_free_rate: number;
  is_admin: boolean;
  is_locked: boolean;
  theme: 'dark' | 'light';
  font_size: 'sm' | 'base' | 'lg' | 'xl';
  created_at?: string;
}

export async function adminGetUsers(): Promise<DBUser[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_users');
    return list ? JSON.parse(list) : [];
  }

  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_all_users');
  if (error) throw error;
  return data || [];
}

export async function adminUpdateUser(
  userId: string,
  isAdmin: boolean,
  isLocked: boolean
): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_users');
    const users = list ? JSON.parse(list) : [];
    const idx = users.findIndex((u: any) => u.id === userId);
    if (idx !== -1) {
      users[idx].is_admin = isAdmin;
      users[idx].is_locked = isLocked;
      localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
      return;
    }
    throw new Error('User not found in Demo Mode.');
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { error } = await supabase.rpc('admin_update_user', {
    target_user_id: userId,
    new_is_admin: isAdmin,
    new_is_locked: isLocked
  });
  if (error) throw error;
}

export async function getUserProfile(userId: string) {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_users');
    const users = list ? JSON.parse(list) : [];
    let profile = users.find((u: any) => u.id === userId);
    if (!profile) {
      profile = {
        id: userId,
        email: 'demo@aurawealth.io',
        telegram_chat_id: '123456789',
        risk_free_rate: 0.04,
        is_admin: false,
        is_locked: false,
        theme: 'dark',
        font_size: 'base'
      };
      users.push(profile);
      localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
    }
    return profile;
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
    const list = localStorage.getItem('aurawealth_demo_users');
    const users = list ? JSON.parse(list) : [];
    const idx = users.findIndex((u: any) => u.id === userId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates };
      localStorage.setItem('aurawealth_demo_users', JSON.stringify(users));
      return users[idx];
    }
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

export interface DBQuote {
  id: string;
  ticker: string;
  date: string;
  adj_close: number;
  volume: number | null;
}

export async function adminGetQuotes(ticker?: string): Promise<DBQuote[]> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    const customQuotes = list ? JSON.parse(list) : [];
    if (ticker) {
      return customQuotes.filter((q: DBQuote) => q.ticker.toUpperCase() === ticker.toUpperCase());
    }
    return customQuotes;
  }

  if (!supabase) return [];
  let query = supabase.from('quotes').select('*');
  if (ticker) {
    query = query.eq('ticker', ticker.toUpperCase());
  }
  const { data, error } = await query.order('date', { ascending: false }).limit(150);
  if (error) throw error;
  return data || [];
}

export async function adminAddQuote(quote: Partial<DBQuote>): Promise<DBQuote> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    const customQuotes = list ? JSON.parse(list) : [];
    const newQuote: DBQuote = {
      id: 'quote-' + Math.random().toString(36).substring(2, 9),
      ticker: (quote.ticker || 'SPY').toUpperCase(),
      date: quote.date || new Date().toISOString().split('T')[0],
      adj_close: Number(quote.adj_close) || 100.0,
      volume: quote.volume !== undefined && quote.volume !== null ? Number(quote.volume) : null
    };
    customQuotes.push(newQuote);
    localStorage.setItem('aurawealth_demo_quotes', JSON.stringify(customQuotes));
    return newQuote;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/quotes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ quote })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add EOD quote.');
  return data;
}

export async function adminUpsertQuotes(quotes: Partial<DBQuote>[]): Promise<{ success: boolean; count: number }> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    const customQuotes = list ? JSON.parse(list) : [];
    
    const existingMap = new Map<string, DBQuote>();
    customQuotes.forEach((q: DBQuote) => {
      existingMap.set(`${q.ticker.toUpperCase()}-${q.date}`, q);
    });

    const quotesToInsert: DBQuote[] = [];
    let newOrModifiedCount = 0;
    
    quotes.forEach(q => {
      const tickerClean = (q.ticker || 'SPY').toUpperCase();
      const dateClean = q.date || new Date().toISOString().split('T')[0];
      const adjCloseClean = Number(q.adj_close) || 100.0;
      const volumeClean = q.volume !== undefined && q.volume !== null ? Number(q.volume) : null;
      
      const key = `${tickerClean}-${dateClean}`;
      const existing = existingMap.get(key);
      
      if (!existing) {
        quotesToInsert.push({
          id: 'quote-' + Math.random().toString(36).substring(2, 9),
          ticker: tickerClean,
          date: dateClean,
          adj_close: adjCloseClean,
          volume: volumeClean
        });
        newOrModifiedCount++;
      } else {
        const priceDiff = Math.abs(existing.adj_close - adjCloseClean);
        const isPriceChanged = priceDiff > 1e-4;
        const isVolumeChanged = existing.volume !== volumeClean;
        
        if (isPriceChanged || isVolumeChanged) {
          existing.adj_close = adjCloseClean;
          existing.volume = volumeClean;
          newOrModifiedCount++;
        }
      }
    });

    const merged = [...customQuotes, ...quotesToInsert];
    localStorage.setItem('aurawealth_demo_quotes', JSON.stringify(merged));
    return { success: true, count: newOrModifiedCount };
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/quotes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ quotes })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to batch upload quotes.');
  return data;
}

export async function adminUpdateQuote(quoteId: string, updates: Partial<DBQuote>): Promise<DBQuote> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    const customQuotes = list ? JSON.parse(list) : [];
    const idx = customQuotes.findIndex((q: DBQuote) => q.id === quoteId);
    if (idx !== -1) {
      customQuotes[idx] = { ...customQuotes[idx], ...updates, ticker: customQuotes[idx].ticker, date: customQuotes[idx].date };
      localStorage.setItem('aurawealth_demo_quotes', JSON.stringify(customQuotes));
      return customQuotes[idx];
    }
    throw new Error('Quote not found.');
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/quotes', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ id: quoteId, updates })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update EOD quote.');
  return data;
}

export async function adminDeleteQuote(quoteId: string): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    const customQuotes = list ? JSON.parse(list) : [];
    const remaining = customQuotes.filter((q: DBQuote) => q.id !== quoteId);
    localStorage.setItem('aurawealth_demo_quotes', JSON.stringify(remaining));
    return;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/quotes', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ id: quoteId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete EOD quote.');
}

export async function adminMassDeleteQuotes(params: { ids?: string[]; ticker?: string }): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_quotes');
    let customQuotes = list ? JSON.parse(list) : [];
    if (params.ids) {
      customQuotes = customQuotes.filter((q: DBQuote) => !params.ids!.includes(q.id));
    } else if (params.ticker) {
      customQuotes = customQuotes.filter((q: DBQuote) => q.ticker.toUpperCase() !== params.ticker!.toUpperCase());
    }
    localStorage.setItem('aurawealth_demo_quotes', JSON.stringify(customQuotes));
    return;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/quotes', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to mass delete EOD quotes.');
}

export async function adminDeleteUser(userId: string): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_users');
    const users = list ? JSON.parse(list) : [];
    const remaining = users.filter((u: any) => u.id !== userId);
    localStorage.setItem('aurawealth_demo_users', JSON.stringify(remaining));
    return;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/users', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ id: userId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete user.');
}

export async function adminMassDeleteUsers(userIds: string[]): Promise<void> {
  if (isDemoMode) {
    const list = localStorage.getItem('aurawealth_demo_users');
    const users = list ? JSON.parse(list) : [];
    const remaining = users.filter((u: any) => !userIds.includes(u.id));
    localStorage.setItem('aurawealth_demo_users', JSON.stringify(remaining));
    return;
  }

  if (!supabase) throw new Error('Supabase client not initialized.');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/users', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ ids: userIds })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to mass delete users.');
}

export async function prepopulateUserPortfolios(userId: string): Promise<void> {
  const defaultPortfolios = [
    {
      name: 'Ray Dalio All-Weather',
      rebalance_type: 'quarterly' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'SPY', weight: 0.30, asset_type: 'etf' as const },
        { ticker: 'TLT', weight: 0.40, asset_type: 'etf' as const },
        { ticker: 'GLD', weight: 0.30, asset_type: 'metal' as const }
      ]
    },
    {
      name: 'Classic 60/40 Balanced',
      rebalance_type: 'annually' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'SPY', weight: 0.60, asset_type: 'etf' as const },
        { ticker: 'TLT', weight: 0.40, asset_type: 'etf' as const }
      ]
    },
    {
      name: 'Aggressive Tech & Crypto',
      rebalance_type: 'deviation' as const,
      deviation_threshold: 10.0,
      benchmark_ticker: 'QQQ',
      assets: [
        { ticker: 'QQQ', weight: 0.50, asset_type: 'etf' as const },
        { ticker: 'BTC', weight: 0.30, asset_type: 'crypto' as const },
        { ticker: 'ETH', weight: 0.20, asset_type: 'crypto' as const }
      ]
    },
    {
      name: 'Rick Ferri Core Four',
      rebalance_type: 'quarterly' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'VTI', weight: 0.48, asset_type: 'etf' as const },
        { ticker: 'VXUS', weight: 0.24, asset_type: 'etf' as const },
        { ticker: 'VNQ', weight: 0.08, asset_type: 'etf' as const },
        { ticker: 'BND', weight: 0.20, asset_type: 'etf' as const }
      ]
    },
    {
      name: 'Bill Bernstein No Brainer',
      rebalance_type: 'annually' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'SPY', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'VB', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'VXUS', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'SHY', weight: 0.25, asset_type: 'etf' as const }
      ]
    },
    {
      name: 'Harry Browne Permanent Portfolio',
      rebalance_type: 'annually' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'VTI', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'TLT', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'BIL', weight: 0.25, asset_type: 'etf' as const },
        { ticker: 'GLD', weight: 0.25, asset_type: 'metal' as const }
      ]
    },
    {
      name: 'David Swensen Yale Endowment',
      rebalance_type: 'annually' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'VTI', weight: 0.30, asset_type: 'etf' as const },
        { ticker: 'EFA', weight: 0.15, asset_type: 'etf' as const },
        { ticker: 'VWO', weight: 0.05, asset_type: 'etf' as const },
        { ticker: 'VNQ', weight: 0.20, asset_type: 'etf' as const },
        { ticker: 'TLT', weight: 0.15, asset_type: 'etf' as const },
        { ticker: 'TIP', weight: 0.15, asset_type: 'etf' as const }
      ]
    },
    {
      name: 'Mebane Faber Ivy Portfolio',
      rebalance_type: 'quarterly' as const,
      deviation_threshold: 5.0,
      benchmark_ticker: 'SPY',
      assets: [
        { ticker: 'VTI', weight: 0.20, asset_type: 'etf' as const },
        { ticker: 'VXUS', weight: 0.20, asset_type: 'etf' as const },
        { ticker: 'BND', weight: 0.20, asset_type: 'etf' as const },
        { ticker: 'VNQ', weight: 0.20, asset_type: 'etf' as const },
        { ticker: 'GSG', weight: 0.20, asset_type: 'etf' as const }
      ]
    }
  ];

  for (const portInfo of defaultPortfolios) {
    const { assets: portAssets, ...portData } = portInfo;
    const newPort = await createPortfolio(userId, portData);
    await savePortfolioAssets(newPort.id, portAssets);
  }
}
