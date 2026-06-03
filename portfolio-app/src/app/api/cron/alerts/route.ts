// route.ts
// Telegram Alert Dispatcher Endpoint for portfolio rebalancing events

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuotesForTickers } from '../../../../utils/dbClient';
import { calculateBacktest } from '../../../../utils/mathClient';
import { runBacktest } from '../../../../utils/portfolioMath';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cronSecret = process.env.CRON_SECRET || 'local-development-token';
const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

const isDemo = !supabaseUrl || !supabaseServiceKey;
const supabaseAdmin = !isDemo ? createClient(supabaseUrl, supabaseServiceKey) : null;

export async function POST(request: Request) {
  return handleAlerts(request);
}

export async function GET(request: Request) {
  return handleAlerts(request);
}

async function handleAlerts(request: Request) {
  // 1. Auth check
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1] || new URL(request.url).searchParams.get('token');

  if (token !== cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized alerts trigger.' }, { status: 401 });
  }

  if (isDemo || !supabaseAdmin) {
    console.log('Demo mode active. Telegram alerts check simulated.');
    return NextResponse.json({
      status: 'success',
      mode: 'demo',
      message: 'Demo mode simulated alerts check. Set up database and TELEGRAM_BOT_TOKEN to enable.'
    });
  }

  try {
    // 2. Fetch all portfolios with telegram enabled
    const { data: portfolios, error: portError } = await supabaseAdmin
      .from('portfolios')
      .select('*, users(telegram_chat_id, risk_free_rate)')
      .eq('telegram_enabled', true);

    if (portError) throw portError;
    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ status: 'success', sent: 0, message: 'No portfolios with alerts enabled.' });
    }

    let alertCount = 0;
    const sentTo: string[] = [];

    const today = new Date();
    const dayOfMonth = today.getDate();
    const month = today.getMonth();

    for (const port of portfolios) {
      const chatTarget = port.users?.telegram_chat_id;
      const rfRate = port.users?.risk_free_rate || 0.04;
      
      if (!chatTarget) {
        console.warn(`Portfolio "${port.name}" has alerts enabled but no user Telegram Chat ID is set.`);
        continue;
      }

      // Fetch assets
      const { data: assets, error: assetsError } = await supabaseAdmin
        .from('portfolio_assets')
        .select('*')
        .eq('portfolio_id', port.id);

      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) continue;

      // 3. Evaluate Rebalancing Rules
      let triggerReason: string | null = null;
      const type = port.rebalance_type;
      
      if (type === 'monthly' && dayOfMonth === 1) {
        triggerReason = 'Scheduled Monthly Rebalancing';
      } else if (type === 'quarterly' && dayOfMonth === 1 && [0, 3, 6, 9].includes(month)) {
        triggerReason = 'Scheduled Quarterly Rebalancing';
      } else if (type === 'annually' && dayOfMonth === 1 && month === 0) {
        triggerReason = 'Scheduled Annual Rebalancing';
      } else if (type === 'deviation') {
        // Evaluate weight deviations due to price drift over the last 30 calendar days
        const tickers = assets.map(a => a.ticker);
        const quotesMap = await getQuotesForTickers(tickers, '2001-01-01');
        
        let hasDeviated = false;
        const driftData: Array<{ ticker: string; target: number; actual: number; dev: number }> = [];

        // Calculate drifted weights
        let totalDriftValue = 0;
        const rawValues: Record<string, number> = {};

        assets.forEach(asset => {
          const prices = quotesMap[asset.ticker]?.prices || [];
          if (prices.length >= 22) { // Need at least 22 trading days (~30 calendar days)
            const pToday = prices[prices.length - 1];
            const pPrev = prices[prices.length - 22]; // Price 30 calendar days ago (approx)
            const ratio = pPrev !== 0 ? pToday / pPrev : 1.0;
            const driftedValue = asset.weight * ratio;
            
            rawValues[asset.ticker] = driftedValue;
            totalDriftValue += driftedValue;
          } else {
            rawValues[asset.ticker] = asset.weight;
            totalDriftValue += asset.weight;
          }
        });

        if (totalDriftValue > 0) {
          assets.forEach(asset => {
            const actualWeight = rawValues[asset.ticker] / totalDriftValue;
            const deviation = actualWeight - asset.weight; // actual - target
            
            driftData.push({
              ticker: asset.ticker,
              target: asset.weight,
              actual: actualWeight,
              dev: deviation
            });

            // If deviation exceeds threshold (e.g. ±5% represented as 5.0 in DB)
            const threshold = (port.deviation_threshold || 5.0) / 100;
            if (Math.abs(deviation) >= threshold) {
              hasDeviated = true;
            }
          });
        }

        if (hasDeviated) {
          triggerReason = `Threshold Deviation Alert (exceeded ±${port.deviation_threshold}%)`;
        }
      }

      // If rebalancing is triggered, compose and dispatch Telegram message
      if (triggerReason) {
        // Run backtest to fetch updated CAGR and Sharpe stats
        const tickers = assets.map(a => a.ticker);
        const bench = port.benchmark_ticker || 'SPY';
        const allTickers = Array.from(new Set([...tickers, bench]));
        const quotesMap = await getQuotesForTickers(allTickers, '2001-01-01');

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

        // Calculate statistics
        const bt = runBacktest({
          assets: assetDatas,
          weights: weightsRecord,
          riskFreeRate: rfRate,
          benchmarkPrices: benchData
        });

        // 4. Construct BUY/SELL recommendations
        // We recommend trades that bring actual drifted weights back to target weights.
        // Let's compute actual drifted weights
        let totalDriftValue = 0;
        const valMap: Record<string, number> = {};
        assets.forEach(asset => {
          const prices = quotesMap[asset.ticker]?.prices || [];
          const pToday = prices[prices.length - 1] || 1;
          const pPrev = prices[prices.length - Math.min(22, prices.length)] || 1;
          valMap[asset.ticker] = asset.weight * (pToday / pPrev);
          totalDriftValue += valMap[asset.ticker];
        });

        const trades: string[] = [];
        assets.forEach(asset => {
          const actualW = totalDriftValue > 0 ? valMap[asset.ticker] / totalDriftValue : asset.weight;
          const dev = actualW - asset.weight; // actual - target
          const devPct = (dev * 100).toFixed(1);
          const targetPct = (asset.weight * 100).toFixed(0);

          if (dev > 0.005) {
            trades.push(`🔴 SELL  *${asset.ticker}*  -${devPct}%  (New Target: ${targetPct}%)`);
          } else if (dev < -0.005) {
            trades.push(`🟢 BUY   *${asset.ticker}*  +${Math.abs(dev) * 100}%  (New Target: ${targetPct}%)`);
          }
        });

        if (trades.length === 0) {
          trades.push('No trades required. Portfolio weights are balanced.');
        }

        // Compose Message
        const message = `📊 *Portfolio: ${port.name}*
*Date:* ${today.toLocaleDateString()}
*Reason:* ${triggerReason}

*Recommended Trades:*
${trades.join('\n')}

*Metrics Update:*
• CAGR: ${(bt.metrics.cagr * 100).toFixed(1)}% (vs Benchmark: ${((bt.metrics.alpha + bt.metrics.cagr) * 100).toFixed(1)}% est)
• Sharpe: ${bt.metrics.sharpeRatio.toFixed(2)}
• Max Drawdown: -${(bt.metrics.maxDrawdown * 100).toFixed(1)}%`;

        // 5. Send to Telegram API
        if (botToken) {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatTarget,
              text: message,
              parse_mode: 'Markdown'
            })
          });
          if (!res.ok) {
            const errBody = await res.text();
            console.error(`Telegram Bot API Error for portfolio ${port.name}:`, errBody);
          } else {
            alertCount++;
            sentTo.push(port.name);
          }
        } else {
          // Dev log print
          console.log(`Telegram Bot Token missing. Simulated dispatch:\n${message}`);
          alertCount++;
          sentTo.push(`${port.name} (Simulated)`);
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      sent: alertCount,
      portfolios: sentTo
    });

  } catch (err: any) {
    console.error('Alerts dispatcher error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
