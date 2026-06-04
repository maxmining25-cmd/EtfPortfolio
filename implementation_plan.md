# Implementation Plan: Predefined Portfolios Expansion, Backtesting & Risk Analytics, and Efficient Frontier Visualization

We will expand the ETFPortfolio application's analytical depth to match industry-standard capabilities found in platforms like Portfolio Visualizer by:
1. **Predefined Portfolios Expansion:** Adding a wide selection of 8 popular lazy portfolios (Ray Dalio All-Seasons, Core Four, Permanent Portfolio, Yale Endowment, Ivy Portfolio, etc.) to the demo and default workspace generators.
2. **Backtesting & Risk Metrics:** Calculating Best calendar year return, Worst calendar year return, Downside Deviation, Daily 95% Value at Risk (VaR), and Daily 95% Conditional Value at Risk (CVaR).
3. **Efficient Frontier Engine:** Implementing a convex optimization solver in the Web Worker to trace the Efficient Frontier curve (Expected Return vs. Volatility), locating individual assets, and the current portfolio position relative to the frontier.
4. **Enhanced Analytics Tab UI:** Creating a tab-based Analytics view to switch between the performance charts and the new interactive Efficient Frontier scatter plot.

---

## User Review Required

> [!IMPORTANT]
> **Efficient Frontier Computation:**
> The calculations for the Efficient Frontier trace 20+ points using quadratic programming (Projected Gradient Descent) inside the Web Worker. This ensures the solver runs in the background and does not lag the UI sliders when users adjust allocations.

> [!TIP]
> **Risk Analytics:**
> VaR and CVaR are computed as daily statistical metrics. Best/Worst years represent calendar year returns (January-December) based on the backtested historical pricing data.

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
* Inside `runBacktest(input)`:
  * Calculate Best and Worst calendar years by grouping values by date year and computing returns from start-of-year to end-of-year.
  * Compute 95% Daily VaR (the 5th percentile of daily returns) and 95% Daily CVaR (the average of daily returns below the VaR threshold).
  * Compute expected annual returns ($\mu$) and covariance ($\Sigma$) for all assets.
  * Trace the Efficient Frontier by varying the risk-aversion parameter $\lambda$ over 20 points, and append the Max Sharpe and Min Vol points.
  * Populate individual assets' risk-return positions.

---

### 2. Database & Data Initializers

#### [MODIFY] [dbClient.ts](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/utils/dbClient.ts)
* Expand the `initializeDemoData()` function to include 8 default portfolios and their respective asset allocations:
  1. **Ray Dalio All-Weather:** SPY (30%), TLT (40%), GLD (30%)
  2. **Classic Stocks/Bonds (60/40):** SPY (60%), TLT (40%)
  3. **Rick Ferri Core Four:** VTI (48%), VXUS (24%), VNQ (8%), BND (20%)
  4. **Bill Bernstein No Brainer:** SPY (25%), VB (25%), VXUS (25%), SHY (25%)
  5. **Harry Browne Permanent Portfolio:** VTI (25%), TLT (25%), BIL (25%), GLD (25%)
  6. **David Swensen Yale Endowment:** VTI (30%), EFA (15%), VWO (5%), VNQ (20%), TLT (15%), TIP (15%)
  7. **Mebane Faber Ivy Portfolio:** VTI (20%), VXUS (20%), BND (20%), VNQ (20%), GSG (20%)
  8. **Aggressive Tech & Crypto:** QQQ (50%), BTC (30%), ETH (20%)
* Update the SQL/Supabase auto-populator function `prepopulateUserPortfolios(userId)` to seed these portfolios when a new workspace is created.

---

### 3. Analytics User Interface

#### [MODIFY] [Analytics.tsx](file:///c:/Users/MMonakhov/Documents/ChatAI/EtfPortfolio/portfolio-app/src/components/Analytics.tsx)
* Add a tab selector at the top of the Analytics panel to choose between **Performance Charts** and **Efficient Frontier**.
* Expand the **Metrics Grid** to render the new fields:
  * Best Year / Worst Year
  * Downside Deviation (annualized)
  * Daily 95% VaR
  * Daily 95% CVaR
* Implement the **Efficient Frontier Chart**:
  * Plot volatility (x-axis) vs. expected annual return (y-axis).
  * Draw the frontier curve using a Recharts `Scatter` line connection with `shape={() => null}` to display a continuous curve without plot points.
  * Render a distinct marker representing the **Current Portfolio**'s coordinates.
  * Render scatter nodes representing **Individual Assets** so users can see how asset diversification pulls the portfolio towards the frontier curve.
  * Draw distinct markers for the optimized portfolios (Max Sharpe & Min Volatility).

---

## Verification Plan

### Automated Tests
* Run Next.js build compilation check: `npm run build` in `/portfolio-app` folder.

### Manual Verification
1. **Lazy Portfolios Initialization:**
   * Run the app in Demo Mode (or clear localStorage). Verify that all 8 portfolios are loaded in the sidebar.
2. **Backtesting & Advanced Statistics:**
   * Select various lazy portfolios. Observe the advanced risk report metrics (Best/Worst Year, Daily VaR/CVaR, Downside Deviation) populate in the dashboard.
   * Verify that VaR and CVaR are displayed as positive percentage risk indicators.
3. **Efficient Frontier Plotting:**
   * Navigate to the "Efficient Frontier" tab.
   * Observe the curve plotting, showing where the Current Portfolio sits in relation to the frontier line and the underlying assets.
   * Drag slider weights. Verify that the Current Portfolio dot shifts dynamically and in real-time.
