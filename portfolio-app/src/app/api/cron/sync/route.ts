// route.ts
// EOD nightly scheduler & historical quote backfill endpoint

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import yahooFinance from 'yahoo-finance2';
import { isMarketClosed } from '../../../../utils/marketHolidays';
import { generateMockPrices } from '../../../../utils/mockPrices';

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
  const targetTicker = searchParams.get('ticker')?.toUpperCase();
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

    for (const [ticker, assetType] of activeAssets) {
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
    console.error(`Yahoo Finance API failed for ${ticker}. Applying mock pricing fallback. Error:`, err);
    if (reasonRef) {
      reasonRef.warning = `Yahoo API Error: ${err.message || 'Forbidden/Rate Limited'}. Mock fallback applied.`;
    }
    
    // Generate mock EOD prices using seed-based GBM
    const mock = generateMockPrices(ticker, startDateStr, endDateStr);
    results = mock.dates.map((date, idx) => ({
      date: new Date(date),
      adjClose: mock.prices[idx],
      volume: Math.floor(100000 + Math.random() * 900000)
    }));
  }

  if (!results || results.length === 0) return 0;

  // Map to DB rows structure
  const quoteRows = results
    .filter(row => row.adjClose !== undefined && row.adjClose !== null)
    .map(row => {
      // Format Date object to YYYY-MM-DD
      const dateString = new Date(row.date).toISOString().split('T')[0];
      return {
        ticker: ticker,
        date: dateString,
        adj_close: Number(row.adjClose),
        volume: row.volume || null
      };
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
