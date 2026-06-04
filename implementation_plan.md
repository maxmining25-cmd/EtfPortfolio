# Implementation Plan: Predefined Portfolios Expansion, Backtesting & Risk Analytics, and Efficient Frontier Visualization

We will expand the ETFPortfolio application's analytical depth to match industry-standard capabilities found in platforms like Portfolio Visualizer by:
1. **Predefined Portfolios Expansion:** Adding a wide selection of 8 popular lazy portfolios (Ray Dalio All-Seasons, Core Four, Permanent Portfolio, Yale Endowment, Ivy Portfolio, etc.) to the demo and default workspace generators.
2. **Backtesting & Risk Metrics:** Calculating Best calendar year return, Worst calendar year return, Downside Deviation, Daily 95% Value at Risk (VaR), and Daily 95% Conditional Value at Risk (CVaR).
3. **Efficient Frontier Engine:** Implementing a convex optimization solver in the Web Worker to trace the Efficient Frontier curve (Expected Return vs. Volatility), locating individual assets, and the current portfolio position relative to the frontier.
4. **Enhanced Analytics Tab UI:** Creating a tab-based Analytics view to switch between the performance charts and the new interactive Efficient Frontier scatter plot.
5. **Yahoo Finance Sync Robustness:** Adding automated currency/metal/crypto ticker cleaning rules, and implementing a direct HTTP CSV download fallback if the official library fails.
6. **EOD CSV Upload Tool:** Implementing a batch quotes insert API and a drag/select CSV uploader in the Quotes tab of the Admin Panel, supporting file previewing and auto-populating tickers.
7. **Report & Optimization Tooltips:** Adding interactive group-hover tooltips explaining all 12 statistics cards and 6 sandbox optimizers.

---

## User Review Required

> [!IMPORTANT]
> **Efficient Frontier Computation:**
> The calculations for the Efficient Frontier trace 20+ points using quadratic programming (Projected Gradient Descent) inside the Web Worker. This ensures the solver runs in the background and does not lag the UI sliders when users adjust allocations.

> [!TIP]
> **Yahoo Sync Fallback:**
> Sync requests now use a secondary direct HTTP query download of Yahoo's CSV data, which lets us configure authentic desktop headers. This resolves standard Serverless IP blocks that trigger Yahoo library failures.

---

## Proposed Changes

### 1. Mathematical and Statistical Layer

#### [MODIFY] [portfolioMath.ts](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/utils/portfolioMath.ts)
* Update `MetricReport` to include new fields:
  ```typescript
  bestYear: number;
  worstYear: number;
  downsideDeviation: number;
  var95: number;
  cvar95: number;
  ```
* Update `BacktestResult` to include:
  ```typescript
  efficientFrontier?: { expectedReturn: number; volatility: number }[];
  individualAssets?: { ticker: string; expectedReturn: number; volatility: number }[];
  ```
* Add the helper function `solveEfficientFrontierPoint(mu, sigma, lambda)` to solve:
  $$\min_{w \in \Delta} -w^T \mu + \lambda w^T \Sigma w$$
* Add the helper function `cleanYahooTicker(ticker)` to clean user/system input tickers:
  * Remove slashes (`EUR/USD` -> `EURUSD`).
  * Add `=X` for standard 6-letter fiat currency pairs (e.g. `EURUSD` -> `EURUSD=X`).
  * Add `-USD` for crypto pairs (e.g. `BTCUSD` -> `BTC-USD`).
  * Remap commodities (e.g. `GOLD` -> `GC=F`, `SILVER` -> `SI=F`).
* Inside `runBacktest(input)`:
  * Calculate Best and Worst calendar years by grouping values by date year and computing returns from start-of-year to end-of-year.
  * Compute 95% Daily VaR (the 5th percentile of daily returns) and 95% Daily CVaR (the average of daily returns below the VaR threshold).
  * Compute expected annual returns ($\mu$) and covariance ($\Sigma$) for all assets.
  * Trace the Efficient Frontier by varying the risk-aversion parameter $\lambda$ over 20 points, and append the Max Sharpe and Min Vol points.
  * Populate individual assets' risk-return positions.

---

### 2. Database & Data Initializers

#### [MODIFY] [dbClient.ts](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/utils/dbClient.ts)
* Expand the `initializeDemoData()` function to include 8 default portfolios and their respective asset allocations.
* Update `getQuotesForTickers` to run search queries using cleaned tickers, and map matching results back to original ticker keys returned to the backtest client.
* Add `adminUpsertQuotes(quotes)` helper function to support bulk insert/upsert of EOD quotes in both Supabase database and Demo offline mode.

#### [MODIFY] [/api/admin/quotes/route.ts](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/app/api/admin/quotes/route.ts)
* Update POST handler to detect `{ quotes: [...] }` arrays and execute batch `upsert` queries to database, resolving conflicts on `(ticker, date)`.

#### [MODIFY] [/api/cron/sync/route.ts](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/app/api/cron/sync/route.ts)
* Clean incoming sync requests and EOD loop queries using `cleanYahooTicker`.
* Update `backfillQuotes` to attempt a direct HTTP fetch of Yahoo's CSV download URL if the official Yahoo Finance library request throws an exception, parsing CSV and upserting records.

---

### 3. User Interface & Tooltips

#### [MODIFY] [Sandbox.tsx](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/components/Sandbox.tsx)
* Add `cleanYahooTicker` to ticker inputs when adding assets.
* Wrap all 6 optimizer buttons in `group relative` styling and inject absolute hover card tooltips detailing the strategy algorithms (Equal Weight, Sharpe, GMV Risk, ERC Parity, MD, Max Sortino).

#### [MODIFY] [Analytics.tsx](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/components/Analytics.tsx)
* Add a tab selector at the top of the Analytics panel to choose between **Performance Charts** and **Efficient Frontier**.
* Expand the **Metrics Grid** to render the new fields.
* Add interactive dashes and tooltips next to all 12 report metrics, displaying definitions when hovered.
* Implement the **Efficient Frontier Chart**:
  * Plot volatility (x-axis) vs. expected annual return (y-axis).
  * Draw the frontier curve using a Recharts `Scatter` line connection with `shape={() => null}` to display a continuous curve without plot points.
  * Render scatter nodes representing **Individual Assets** and **Current Portfolio** coordinates.

#### [MODIFY] [AdminPanel.tsx](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/components/AdminPanel.tsx)
* Clean tickers when manual EOD rows are added, wiped, or sync triggered.
* Add an **EOD CSV File Upload Card** in the Quotes manager sidebar:
  * Guess ticker from selected filename (e.g. `SPY.csv` -> sets ticker input `SPY`).
  * Run client-side file reading (`FileReader`) to parse and validate CSV headers and row count.
  * Trigger batch `adminUpsertQuotes` upload on confirm, refresh table results.

---

## Verification Plan

### Automated Tests
* Run Next.js build compilation check: `npm run build` in `/portfolio-app` folder.

### Manual Verification
1. **Lazy Portfolios Initialization:**
   * Run the app in Demo Mode. Verify that all 8 portfolios load in the sidebar.
2. **Backtesting & Advanced Statistics:**
   * Hover over metric abbreviations (e.g. CAGR, Sharpe, CVaR). Verify that explanation tooltips display correctly above the cards.
3. **Optimizers Sandbox:**
   * Hover over sandbox optimization buttons. Verify that mathematical explanation tooltips pop up.
   * Add a ticker like `EUR/USD`. Verify it cleans to `EURUSD=X` and backfills/displays correctly.
4. **CSV File Upload:**
   * Go to the Admin panel -> Quotes tab -> Upload EOD CSV.
   * Select a Yahoo Finance historical CSV file. Observe the ticker populate from the filename and the row count validate.
   * Click upload and verify quotes import successfully and display in the list.
