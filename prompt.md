# Agent Prompt: Premium Personal Portfolio Optimization & Backtesting Platform

> **For agentic tools with real system access.**
> Review all Stop Conditions and Forbidden Actions before executing any step.
> Confirm file paths, directories, and permissions match the actual project before writing files.

---

## Objective

Create a premium, design-forward personal web application for investment portfolio modeling, backtesting, and mathematical optimization (supporting sector ETFs, major indexes, precious metals, and crypto). The system must support secure user authentication, daily Yahoo Finance EOD data synchronization (starting from 01.01.2001), detailed financial reports with interactive charts, and automated Telegram alerts for rebalancing events.

---

## Context

- **Stack:** Next.js 14/15 (App Router, TypeScript) + Tailwind CSS + Supabase (Postgres & Supabase Auth).
- **Data API:** Yahoo Finance API (`yahoo-finance2`).
- **Charts Library:** Recharts (React-native SVG charts optimized for responsive layouts).
- **Integration:** Telegram Bot API (via serverless fetch calls).
- **Database Engine:** Supabase Postgres. Store user records, portfolios, daily adjusted close prices, asset classes, and EOD update logs.

---

## Target State & Features

### 1. High-End UI/UX Dashboard (UI Expert Perspective)
- **Visual Design:** Immersive, premium dark theme by default (Tailwind `slate-900` background, glassmorphism card overlays with border-transparency, subtle indigo/violet glow accents, and Outfit/Inter typography).
- **Interactive Portfolio Sandbox:**
  - Sidebar showing saved portfolios with quick-switch toggles.
  - Interactive sliders to dynamically adjust weights of each asset. Modifying sliders must instantly recalculate and redraw the backtest results using local memory (no server-side delays).
  - Allocation visualizer: a beautiful donut chart grouping assets by category (`etf`, `crypto`, `metal`) and sector concentration.
- **Rich Interactive Charts:**
  - **Equity Curve Chart:** Logarithmic/Linear scale toggle, showing the portfolio value vs. the benchmark over time.
  - **Drawdown Area Chart:** A synchronized filled red-gradient area chart below the equity curve to visualize historical drawdowns.
  - **Correlation Heatmap:** A visual grid showing the correlation matrix between assets in the portfolio based on historical daily returns.
  - **Efficient Frontier Scatter Plot:** A tabbed visualization plotting expected return vs. volatility. Draws the indigo frontier curve line (traced with 20 lambda coordinate points), Standalone Assets (green squares, labeled with ticker names), and the Current Portfolio (dynamic orange dot).
- **Sync Status Widget:** Clear visual banner showing when the database was last updated, next scheduled run, and log of the latest import run.

### 2. Portfolio Optimization & Theories (Stock Portfolio Expert Perspective)
- **Automatic Allocation Engines:** One-click optimization to automatically reweight current assets based on:
  - **Equal Weight (EW):** Simple $1/N$ allocation.
  - **Mean-Variance (Markowitz):** Maximize Sharpe Ratio (tangency portfolio) or Minimize Global Volatility.
  - **Global Minimum Variance (GMV):** Weight allocation minimizing overall portfolio variance.
  - **Risk Parity (ERC):** Iterative Equal Risk Contribution algorithm (weights adjusted so each asset contributes equally to total portfolio risk).
  - **Maximum Diversification (MD):** Weights optimized to maximize the diversification ratio.
  - **Maximum Sortino:** Optimization focusing on maximizing return relative to downside semi-deviation.
- **Math Solver:** Implement TypeScript-side matrix math (`ml-matrix` or custom matrix functions) for efficient calculations of daily returns, covariance matrices, and semi-covariance matrices.

### 3. Backtesting & Advanced Statistics
- **Benchmark Comparison:** Compare performance against a customizable benchmark ticker (default: `SPY`, saved per-portfolio, dynamic fetch supported).
- **Statistical Report Cards:**
  - **CAGR:** Compound Annual Growth Rate.
  - **Max Drawdown:** Peak-to-trough drop percentage and duration.
  - **Sharpe Ratio:** Volatility-adjusted return (using risk-free rate customizable in UI, default 4%).
  - **Sortino Ratio:** Downside-risk-adjusted return (focusing only on negative daily deviations).
  - **Calmar Ratio:** Return-to-drawdown ratio (CAGR / Max Drawdown).
  - **Portfolio Beta & Jensen's Alpha:** Systematic risk and excess return relative to the selected benchmark.
  - **Tracking Error & Information Ratio:** Benchmark replication consistency.
  - **Best Year / Worst Year:** Best and worst calendar year returns (January-December).
  - **Downside Deviation:** Volatility of negative daily returns, annualized.
  - **Daily 95% VaR & daily 95% CVaR:** 95% Value at Risk (5th percentile of daily returns) and 95% Conditional Value at Risk (mean of daily returns below the 95% VaR threshold).
- **Historical Assumptions:** Assume daily reinvestment of dividends (`adjClose` prices from Yahoo Finance).

### 4. Data Import & Scheduler
- **Historical Backfill:** Adding any new ticker must initiate a background job fetching historical adjusted close (`adjClose`) data from `01.01.2001` to the current date.
- **EOD Scheduler:** A Vercel Cron route (`/api/cron/sync`) running nightly (e.g., 01:00 EST).
  - Skips US market holidays (using `market-holidays`) and weekends.
  - Fetch EOD prices only for active tickers present in any user portfolio.
  - Update last sync timestamp on the dashboard database status widget.
  - **API Fallback:** Intercepts Yahoo Finance fetch failures (such as cloud IP blocks on Vercel) and gracefully falls back to generating deterministic mock prices via seed-based Geometric Brownian Motion, logging detailed warnings in the `import_log` table.

### 5. Telegram Integration & Rebalancing Alerts
- **Dispatch Scheduling:** Selectable dispatch time (HH:MM) and per-portfolio toggle to enable Telegram alerts.
- **Rebalancing Rules:** Custom options (No Rebalancing, Monthly, Quarterly, Annually, or when a weight deviates from the target weight by more than the threshold, e.g., ±5%).
- **Formatted Tele-Alerts:**
  ```text
  📊 Portfolio: [Portfolio Name]
  Date: [Current Date]
  Reason: [Scheduled Rebalancing / Threshold Deviation Alert]
  
  Current Valuation: $XX,XXX
  
  Recommended Trades:
  🟢 BUY  [Ticker A]  +[Weight]%  (New Target: [Target]%)
  🔴 SELL [Ticker B]  -[Weight]%  (New Target: [Target]%)
  
  Metrics Update:
  • CAGR: XX.X% (vs Benchmark: XX.X%)
  • Sharpe: X.XX | Max Drawdown: -XX.X%
  ```

### 6. Administration & Auto-Population
- **Workspace Auto-Population:** When a user logs in and their saved portfolio list is empty, automatically seed their account with 8 pre-defined popular lazy portfolios (Ray Dalio All-Weather, Classic 60/40 Balanced, Aggressive Tech & Crypto, Rick Ferri Core Four, Bill Bernstein No Brainer, Harry Browne Permanent Portfolio, David Swensen Yale Endowment, and Mebane Faber Ivy Portfolio) and their assets.
- **Administrative Deletion APIs & UI:**
  - Secure server-side routes (`/api/admin/users` and `/api/admin/quotes`) utilizing the Supabase service-role client to allow administrators to perform CRUD deletions that bypass normal RLS policies.
  - Multi-select checkboxes, selection headers, and bulk deletion controls in the Admin Panel for both User Directory and EOD Quotes tables.
  - A "Wipe Ticker" action in the Quotes tab allowing admins to delete all EOD quotes for a searched ticker at once.
  - Account locking overlays and administrator demotion buttons with failsafe checks that prevent self-deletion or self-demotion.

---

## Database Schema

```sql
-- Users and Settings
users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  telegram_chat_id  TEXT,
  risk_free_rate    NUMERIC DEFAULT 0.04,
  created_at        TIMESTAMPTZ DEFAULT now()
)

-- Portfolios
portfolios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  rebalance_type      TEXT CHECK (rebalance_type IN ('none', 'monthly', 'quarterly', 'annually', 'deviation')),
  deviation_threshold NUMERIC DEFAULT 5.0,
  benchmark_ticker    TEXT DEFAULT 'SPY',
  telegram_enabled    BOOLEAN DEFAULT false,
  telegram_send_time  TIME DEFAULT '09:00:00',
  created_at          TIMESTAMPTZ DEFAULT now()
)

-- Portfolio Assets
portfolio_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  weight       NUMERIC NOT NULL CHECK (weight > 0 AND weight <= 1.0),
  asset_type   TEXT CHECK (asset_type IN ('etf', 'crypto', 'metal'))
)

-- EOD Quotes (adjClose)
quotes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker    TEXT NOT NULL,
  date      DATE NOT NULL,
  adj_close NUMERIC NOT NULL,
  volume    BIGINT,
  UNIQUE (ticker, date)
)

-- System Import Log
import_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT CHECK (status IN ('success', 'error', 'skipped')),
  rows_imported INTEGER DEFAULT 0,
  error_message TEXT,
  reason        TEXT
)
```

---

## Security & Reliability Requirements

- **Supabase RLS:** Row Level Security must be active on all tables. All client queries for portfolios and assets must validate `user_id = auth.uid()`.
- **Database Indexing:** Ensure index optimizations are set up on the `quotes` table for `(ticker, date ASC)` to maximize query performance during long historical backtests.
- **Vercel Cron Protection:** Protect the cron endpoint. Validate `Authorization: Bearer ${CRON_SECRET}` for all incoming `/api/cron/*` routes.
- **API Rate Limiting (Yahoo Finance):** Limit historical fetches to maximum 2 concurrent queries with a 500ms sleep between them to prevent HTTP 429 errors.
- **Memory & Main-Thread Optimization:** Offload Markowitz and Risk Parity optimization solvers to a Web Worker. Keep weight slider calculations highly responsive and non-blocking. Implement a downsampling utility (e.g., weekly data consolidation) for charts spanning >5 years to prevent Recharts rendering bottlenecks.
- **Telegram Integration UX:** Provide a clear user guide inside the Dashboard settings showing how to message the bot to retrieve their Chat ID, ensuring a smooth onboarding experience.

---

## Autonomy & Action Rules

1. **Create `implementation_plan.md` first** outlining: the UI wireframe structure (with chart placement), Supabase schema, mathematical implementation of Markowitz & Risk Parity optimization in TypeScript, and cron job lifecycle.
2. Use the built-in browser to verify the visual quality of the charts, the correlation matrix layout, and dashboard reactivity during slider updates.
3. **Ask for confirmation** before deploying to Vercel and before pushing to GitHub.

---

## Stop Conditions & Forbidden Actions

- Stop and request confirmation before running destructive operations (`DROP`, `DELETE` without `WHERE`).
- Stop if the local Node.js environment misses `ml-matrix` or other math libraries needed for optimization.
- **FORBIDDEN:** Exposing `SUPABASE_SERVICE_ROLE_KEY` to the client.
- **Scope Lock:** Do not modify any files outside `./portfolio-app/`.
