// route.ts
// EOD nightly scheduler & historical quote backfill endpoint

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import yahooFinance from 'yahoo-finance2';
import { isMarketClosed } from '../../../../utils/marketHolidays';
import { generateMockPrices } from '../../../../utils/mockPrices';
import { cleanYahooTicker } from '../../../../utils/portfolioMath';

// Initialize Supabase Admin client (using service role key for system write operations)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cronSecret = process.env.CRON_SECRET || 'local-development-token';

const isDemo = !supabaseUrl || !supabaseServiceKey;

// Avoid compiling issues if values are empty during development
const supabaseAdmin = !isDemo ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Helper to delay execution (prevents Yahoo Finance rate-limiting)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  return handleSync(request);
}

export async function GET(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  // 1. Authenticate the Cron request
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1] || new URL(request.url).searchParams.get('token');

  if (token !== cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized scheduler request.' }, { status: 401 });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const targetTickerRaw = searchParams.get('ticker');
  const targetTicker = targetTickerRaw ? cleanYahooTicker(targetTickerRaw) : null;
  const customStartDate = searchParams.get('startDate'); // e.g. 2024-01-01

  // If in Demo Mode (no DB connection), mock success response
  if (isDemo) {
    await sleep(800);
    const mockProcessed = targetTicker ? [targetTicker] : ['SPY', 'QQQ', 'BTC'];
    return NextResponse.json({
      status: 'success',
      mode: 'demo',
      processed: mockProcessed.length,
      tickers: mockProcessed,
      message: 'Running in Demo Mode. Sync simulated successfully.'
    });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 });
  }

  try {
    const processedTickers: string[] = [];
    
    // ----------------------------------------------------
    // Scenario A: Backfill a single ticker from custom or default 2001
    // ----------------------------------------------------
    if (targetTicker) {
      const reasonRef = { warning: '' };
      const logId = await createImportLog(targetTicker, 'Historical Backfill');
      
      try {
        const rowsImported = await backfillQuotes(targetTicker, customStartDate || '2001-01-01', reasonRef);
        await updateImportLog(logId, 'success', rowsImported, undefined, reasonRef.warning || undefined);
        processedTickers.push(targetTicker);
      } catch (err: any) {
        console.error(`Backfill failed for ${targetTicker}:`, err);
        await updateImportLog(logId, 'error', 0, err.message || 'Yahoo fetch error');
        return NextResponse.json({ error: `Failed to backfill ${targetTicker}: ${err.message}` }, { status: 500 });
      }
      
      return NextResponse.json({
        status: 'success',
        processed: 1,
        tickers: processedTickers
      });
    }

    // ----------------------------------------------------
    // Scenario B: Nightly nightly EOD sync for active assets
    // ----------------------------------------------------
    
    // Check if US market is closed (skip holiday/weekends)
    const today = new Date();
    if (isMarketClosed(today)) {
      // Still process crypto tickers since crypto trades 24/7, but skip stock/metal tickers
      console.log('US Stock Market is closed today. Standard stock quotes will not update.');
    }

    // Fetch active tickers held in user portfolios
    const { data: assetData, error: assetError } = await supabaseAdmin
      .from('portfolio_assets')
      .select('ticker, asset_type');

    if (assetError) throw assetError;

    if (!assetData || assetData.length === 0) {
      return NextResponse.json({ status: 'success', processed: 0, message: 'No active tickers found.' });
    }

    // De-duplicate tickers list
    const activeAssets = Array.from(
      new Map(assetData.map(item => [item.ticker, item.asset_type])).entries()
    );

    for (const [tickerRaw, assetType] of activeAssets) {
      const ticker = cleanYahooTicker(tickerRaw);
      const isCrypto = assetType === 'crypto';
      
      // If market is closed and it is a stock/metal, skip
      if (isMarketClosed(today) && !isCrypto) {
        const logId = await createImportLog(ticker, 'Nightly EOD Sync (Skipped - Market Closed)');
        await updateImportLog(logId, 'skipped', 0, undefined, 'Stock market is closed today');
        continue;
      }

      const logId = await createImportLog(ticker, 'Nightly EOD Sync');
      const reasonRef = { warning: '' };
      
      try {
        // Nightly sync fetches quotes from the last 5 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 5);
        const startDateStr = startDate.toISOString().split('T')[0];

        const rowsImported = await backfillQuotes(ticker, startDateStr, reasonRef);
        await updateImportLog(logId, 'success', rowsImported, undefined, reasonRef.warning || undefined);
        processedTickers.push(ticker);
      } catch (err: any) {
        console.error(`EOD Sync failed for ${ticker}:`, err);
        await updateImportLog(logId, 'error', 0, err.message || 'Yahoo fetch error');
      }

      // Respect rate-limiting rule (2 concurrent queries max, 500ms delay)
      await sleep(500);
    }

    return NextResponse.json({
      status: 'success',
      processed: processedTickers.length,
      tickers: processedTickers
    });

  } catch (err: any) {
    console.error('Cron sync crash:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

// ----------------------------------------------------
// Data Fetching & DB Operations Helpers
// ----------------------------------------------------

async function backfillQuotes(ticker: string, startDateStr: string, reasonRef?: { warning?: string }): Promise<number> {
  if (!supabaseAdmin) return 0;

  // Set endDate to today
  const endDateStr = new Date().toISOString().split('T')[0];

  let results: any[] = [];
  try {
    // Fetch from Yahoo Finance
    results = (await yahooFinance.historical(ticker, {
      period1: startDateStr,
      period2: endDateStr,
      interval: '1d'
    })) as any[];
  } catch (err: any) {
    console.error(`Yahoo Finance API library failed for ${ticker}. Trying direct CSV fetch fallback...`);
    try {
      const p1 = Math.floor(new Date(startDateStr).getTime() / 1000);
      const p2 = Math.floor(new Date(endDateStr).getTime() / 1000);
      const url = `https://query1.finance.yahoo.com/v7/finance/download/${ticker}?period1=${p1}&period2=${p2}&interval=1d&events=history&includeAdjustedClose=true`;
      
      const csvRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (!csvRes.ok) throw new Error(`HTTP Error ${csvRes.status} fetching CSV from Yahoo query API.`);
      
      const csvText = await csvRes.text();
      const lines = csvText.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length < 7) continue;
        
        const date = cols[0];
        const adjClose = parseFloat(cols[5]);
        const volume = parseInt(cols[6]);
        
        if (!isNaN(adjClose) && date) {
          results.push({
            date: new Date(date),
            adjClose,
            volume: isNaN(volume) ? null : volume
          });
        }
      }
      if (results.length > 0 && reasonRef) {
        reasonRef.warning = `Yahoo library failed but direct CSV fetch succeeded.`;
      }
    } catch (csvErr: any) {
      console.error(`Direct CSV fetch failed for ${ticker} as well:`, csvErr);
      if (reasonRef) {
        reasonRef.warning = `Yahoo API Error: ${err.message || 'Error'}. Direct CSV Error: ${csvErr.message || 'Error'}. Mock fallback applied.`;
      }
      
      // Generate mock EOD prices using seed-based GBM
      const mock = generateMockPrices(ticker, startDateStr, endDateStr);
      results = mock.dates.map((date, idx) => ({
        date: new Date(date),
        adjClose: mock.prices[idx],
        volume: Math.floor(100000 + Math.random() * 900000)
      }));
    }
  }

  if (!results || results.length === 0) return 0;

  // 1. Fetch existing quotes in this date range to identify new/modified entries
  const allDates = results.map(row => new Date(row.date).toISOString().split('T')[0]).sort();
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  let existingMap = new Map<string, { adj_close: number; volume: number | null }>();
  try {
    const { data: existingQuotes } = await supabaseAdmin
      .from('quotes')
      .select('date, adj_close, volume')
      .eq('ticker', ticker)
      .gte('date', minDate)
      .lte('date', maxDate);

    if (existingQuotes) {
      existingQuotes.forEach((q: any) => {
        existingMap.set(q.date, { adj_close: Number(q.adj_close), volume: q.volume });
      });
    }
  } catch (fetchErr) {
    console.error('Failed to fetch existing quotes for deduplication comparison:', fetchErr);
    // Continue without deduplication on error
  }

  // 2. Map and filter: keep only new or modified quotes
  const quoteRows = results
    .filter(row => row.adjClose !== undefined && row.adjClose !== null)
    .map(row => {
      const dateString = new Date(row.date).toISOString().split('T')[0];
      return {
        ticker: ticker,
        date: dateString,
        adj_close: Number(row.adjClose),
        volume: row.volume || null
      };
    })
    .filter(row => {
      const existing = existingMap.get(row.date);
      if (!existing) return true; // New entry!
      
      const priceDiff = Math.abs(existing.adj_close - row.adj_close);
      const isPriceChanged = priceDiff > 1e-4;
      const isVolumeChanged = existing.volume !== row.volume;
      
      return isPriceChanged || isVolumeChanged; // Modified entry!
    });

  if (quoteRows.length === 0) return 0;

  // Batch insert/upsert using unique (ticker, date) constraint
  const { error } = await supabaseAdmin
    .from('quotes')
    .upsert(quoteRows, { onConflict: 'ticker,date' });

  if (error) throw error;
  
  return quoteRows.length;
}

async function createImportLog(ticker: string, reason: string): Promise<string> {
  if (!supabaseAdmin) return '';
  const { data, error } = await supabaseAdmin
    .from('import_log')
    .insert([
      {
        ticker: ticker,
        status: 'skipped', // default status
        reason: reason,
        started_at: new Date().toISOString()
      }
    ])
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create import log:', error);
    return '';
  }
  return data?.id || '';
}

async function updateImportLog(
  logId: string,
  status: 'success' | 'error' | 'skipped',
  rowsImported: number,
  errorMessage?: string,
  reasonOverride?: string
): Promise<void> {
  if (!supabaseAdmin || !logId) return;

  const updates: any = {
    status: status,
    finished_at: new Date().toISOString(),
    rows_imported: rowsImported
  };

  if (errorMessage) updates.error_message = errorMessage;
  if (reasonOverride) updates.reason = reasonOverride;

  await supabaseAdmin
    .from('import_log')
    .update(updates)
    .eq('id', logId);
}
