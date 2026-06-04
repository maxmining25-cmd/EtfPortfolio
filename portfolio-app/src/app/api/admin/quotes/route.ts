// route.ts
// Secure admin API route for managing EOD Quotes (insert, update, delete, mass-delete)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

// Secure helper to verify if the request is made by an Admin
async function verifyAdmin(request: Request): Promise<{ isAdmin: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { isAdmin: false, error: 'Database Admin client not configured.' };
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return { isAdmin: false, error: 'No authorization token provided.' };
  }

  try {
    // 1. Get the user from auth using the JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return { isAdmin: false, error: authError?.message || 'Invalid or expired session token.' };
    }

    // 2. Query public.users to see if is_admin is true
    const { data: profile, error: dbError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return { isAdmin: false, error: 'User profile not found.' };
    }

    if (!profile.is_admin) {
      return { isAdmin: false, error: 'Access Denied: Administrator privileges required.' };
    }

    return { isAdmin: true };
  } catch (err: any) {
    return { isAdmin: false, error: err.message || 'Verification failed.' };
  }
}

// POST: Add a new quote row
export async function POST(request: Request) {
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: adminCheck.error }, { status: 403 });
  }

  try {
    const { quote, quotes } = await request.json();

    // Batch upload scenario
    if (quotes && Array.isArray(quotes)) {
      if (quotes.length === 0) {
        return NextResponse.json({ success: true, count: 0, message: 'Empty quotes array provided.' });
      }

      const rows = quotes.map((q: any) => ({
        ticker: q.ticker.toUpperCase(),
        date: q.date,
        adj_close: Number(q.adj_close),
        volume: q.volume ? Number(q.volume) : null
      }));

      const { data, error } = await supabaseAdmin!
        .from('quotes')
        .upsert(rows, { onConflict: 'ticker,date' })
        .select();

      if (error) throw error;
      return NextResponse.json({ success: true, count: rows.length, data });
    }

    // Single quote scenario
    if (!quote || !quote.ticker || !quote.date || !quote.adj_close) {
      return NextResponse.json({ error: 'Missing required quote fields (ticker, date, adj_close or quotes array).' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin!
      .from('quotes')
      .insert([
        {
          ticker: quote.ticker.toUpperCase(),
          date: quote.date,
          adj_close: Number(quote.adj_close),
          volume: quote.volume ? Number(quote.volume) : null
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to add EOD quote.' }, { status: 500 });
  }
}

// PUT: Update an EOD quote price/volume
export async function PUT(request: Request) {
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: adminCheck.error }, { status: 403 });
  }

  try {
    const { id, updates } = await request.json();
    if (!id || !updates) {
      return NextResponse.json({ error: 'Missing quote ID or updates payload.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin!
      .from('quotes')
      .update({
        adj_close: updates.adj_close !== undefined ? Number(updates.adj_close) : undefined,
        volume: updates.volume !== undefined ? (updates.volume ? Number(updates.volume) : null) : undefined
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update EOD quote.' }, { status: 500 });
  }
}

// DELETE: Delete a single quote, mass-delete by IDs, or mass-delete by ticker
export async function DELETE(request: Request) {
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: adminCheck.error }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, ids, ticker } = body;

    let deleteQuery = supabaseAdmin!.from('quotes').delete();

    if (id) {
      // Single delete
      deleteQuery = deleteQuery.eq('id', id);
    } else if (ids && Array.isArray(ids)) {
      // Mass delete by array of IDs
      if (ids.length === 0) {
        return NextResponse.json({ message: 'No quote IDs provided for mass delete.' });
      }
      deleteQuery = deleteQuery.in('id', ids);
    } else if (ticker) {
      // Mass delete all quotes for a ticker
      deleteQuery = deleteQuery.eq('ticker', ticker.toUpperCase());
    } else {
      return NextResponse.json({ error: 'Missing identification parameter (id, ids, or ticker).' }, { status: 400 });
    }

    const { error } = await deleteQuery;
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Quotes deleted successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete EOD quote.' }, { status: 500 });
  }
}
