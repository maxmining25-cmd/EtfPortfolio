import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanYahooTicker } from '../../../../../utils/portfolioMath';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cronSecret = process.env.CRON_SECRET || 'local-development-token';

const isDemo = !supabaseUrl || !supabaseServiceKey;
const supabaseAdmin = !isDemo ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Secure helper to verify if request is from Admin session OR has valid secret token
async function verifyAccess(request: Request): Promise<{ isAuthorized: boolean; error?: string }> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1] || new URL(request.url).searchParams.get('token');

  // 1. Check if token matches cronSecret
  if (token === cronSecret) {
    return { isAuthorized: true };
  }

  // Fallback to Admin Auth check
  if (!supabaseAdmin) {
    return { isAuthorized: false, error: 'Database Admin client not configured.' };
  }

  if (!token) {
    return { isAuthorized: false, error: 'No authorization token provided.' };
  }

  try {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return { isAuthorized: false, error: authError?.message || 'Invalid session token.' };
    }

    const { data: profile, error: dbError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return { isAuthorized: false, error: 'User profile not found.' };
    }

    if (!profile.is_admin) {
      return { isAuthorized: false, error: 'Access Denied: Administrator privileges required.' };
    }

    return { isAuthorized: true };
  } catch (err: any) {
    return { isAuthorized: false, error: err.message || 'Verification failed.' };
  }
}

export async function POST(request: Request) {
  const authCheck = await verifyAccess(request);
  if (!authCheck.isAuthorized) {
    return NextResponse.json({ error: authCheck.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let tickerParam = searchParams.get('ticker');
    const mode = searchParams.get('mode') || 'delta'; // 'delta' or 'full'

    let csvText = '';
    let fileName = '';

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: 'No file uploaded in form data.' }, { status: 400 });
      }
      csvText = await file.text();
      fileName = file.name;
    } else {
      csvText = await request.text();
    }

    if (!csvText || csvText.trim() === '') {
      return NextResponse.json({ error: 'Empty request body or file.' }, { status: 400 });
    }

    // Try to determine ticker if not provided in query param
    if (!tickerParam && fileName) {
      const dotIdx = fileName.lastIndexOf('.');
      const nameWithoutExt = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
      tickerParam = nameWithoutExt.replace('-USD', '').replace('_', '').toUpperCase();
    }

    if (!tickerParam) {
      return NextResponse.json({ error: 'Ticker symbol is required (via ?ticker=... or filename).' }, { status: 400 });
    }

    const ticker = cleanYahooTicker(tickerParam).toUpperCase();

    // Parse CSV
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      return NextResponse.json({ error: 'CSV file is empty or missing headers.' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = headers.indexOf('date');
    const adjCloseIdx = headers.indexOf('adj close');
    const closeIdx = headers.indexOf('close');
    const volIdx = headers.indexOf('volume');

    const targetCloseIdx = adjCloseIdx !== -1 ? adjCloseIdx : closeIdx;

    if (dateIdx === -1 || targetCloseIdx === -1) {
      return NextResponse.json({ error: 'Missing required columns: Date, and Adj Close or Close.' }, { status: 400 });
    }

    let parsedQuotes: { ticker: string; date: string; adj_close: number; volume: number | null }[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= Math.max(dateIdx, targetCloseIdx)) continue;
      const rawDate = cols[dateIdx];
      const rawClose = parseFloat(cols[targetCloseIdx]);
      const rawVol = volIdx !== -1 ? parseInt(cols[volIdx]) : null;

      if (rawDate && !isNaN(rawClose)) {
        let formattedDate = rawDate;
        try {
          formattedDate = new Date(rawDate).toISOString().split('T')[0];
        } catch (_) {}

        parsedQuotes.push({
          ticker,
          date: formattedDate,
          adj_close: rawClose,
          volume: isNaN(rawVol as any) || rawVol === null ? null : rawVol
        });
      }
    }

    if (parsedQuotes.length === 0) {
      return NextResponse.json({ error: 'No valid quote rows found in CSV.' }, { status: 400 });
    }

    if (isDemo) {
      return NextResponse.json({
        success: true,
        mode: 'demo',
        ticker,
        uploadMode: mode,
        processed: parsedQuotes.length,
        count: parsedQuotes.length,
        message: `[Demo Mode] Parsed ${parsedQuotes.length} quotes for ${ticker} successfully.`
      });
    }

    // Determine latest quote date in DB for delta upload
    let quotesToUpsert = parsedQuotes;
    let latestDate: string | null = null;

    if (mode === 'delta') {
      const { data: latestQuote, error: latestError } = await supabaseAdmin!
        .from('quotes')
        .select('date')
        .eq('ticker', ticker)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error('Error fetching latest quote date:', latestError);
      }

      if (latestQuote && latestQuote.date) {
        latestDate = latestQuote.date;
        quotesToUpsert = parsedQuotes.filter(q => q.date > latestQuote.date);
      }
    }

    if (quotesToUpsert.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        ticker,
        latestDate,
        message: `All quotes in CSV are already up to date. Latest date in DB is ${latestDate || 'none'}.`
      });
    }

    const { error: upsertError } = await supabaseAdmin!
      .from('quotes')
      .upsert(quotesToUpsert, { onConflict: 'ticker,date' });

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({
      success: true,
      count: quotesToUpsert.length,
      ticker,
      uploadMode: mode,
      latestDateInDb: latestDate,
      message: `Successfully uploaded ${quotesToUpsert.length} quotes for ${ticker}.`
    });

  } catch (err: any) {
    console.error('CSV upload endpoint error:', err);
    return NextResponse.json({ error: err.message || 'Failed to process CSV upload.' }, { status: 500 });
  }
}
