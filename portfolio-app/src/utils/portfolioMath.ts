// portfolioMath.ts
// Mathematical optimization and backtesting engine for investment portfolios

// Interfaces for input and output data
export interface AssetData {
  ticker: string;
  dates: string[];
  prices: number[]; // Adjusted close prices
}

export interface BacktestInput {
  assets: AssetData[];
  weights: Record<string, number>; // ticker -> weight (0 to 1)
  riskFreeRate: number; // default: 0.04 (4% annual)
  benchmarkPrices?: { dates: string[]; prices: number[] }; // benchmark ticker (e.g. SPY)
}

export interface OptimizationInput {
  assets: AssetData[];
  riskFreeRate: number;
  type: 'equal' | 'sharpe' | 'min_vol' | 'risk_parity' | 'max_div' | 'sortino';
}

export interface MetricReport {
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  maxDrawdownDuration: number; // in trading days
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  beta: number;
  alpha: number;
  trackingError: number;
  informationRatio: number;
}

export interface BacktestResult {
  dates: string[];
  portfolioValue: number[]; // normalized to starting at 10,000
  benchmarkValue?: number[]; // normalized to starting at 10,000
  drawdowns: number[]; // portfolio drawdown over time
  metrics: MetricReport;
  correlationMatrix: Record<string, Record<string, number>>;
}

// ----------------------------------------------------
// Helper Math & Matrix Functions
// ----------------------------------------------------

/**
 * Calculates daily returns for a set of prices
 */
function getDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

/**
 * Projects a vector onto the probability simplex (w >= 0, sum(w) = 1)
 */
export function projectToSimplex(y: number[]): number[] {
  const n = y.length;
  // Sort y in descending order
  const sorted = [...y].map((val, idx) => ({ val, idx })).sort((a, b) => b.val - a.val);
  
  let runningSum = 0;
  let rho = 0;
  
  for (let j = 0; j < n; j++) {
    runningSum += sorted[j].val;
    const val = sorted[j].val + (1 - runningSum) / (j + 1);
    if (val > 0) {
      rho = j;
    }
  }
  
  const sumRho = sorted.slice(0, rho + 1).reduce((sum, item) => sum + item.val, 0);
  const theta = (1 - sumRho) / (rho + 1);
  
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    x[i] = Math.max(y[i] + theta, 0);
  }
  
  // Clean up floating point tiny errors so they sum EXACTLY to 1
  const sumX = x.reduce((a, b) => a + b, 0);
  return x.map(val => val / sumX);
}

/**
 * Matrix multiplication utility: Vector^T * Matrix * Vector
 */
function quadForm(w: number[], sigma: number[][]): number {
  let result = 0;
  const n = w.length;
  for (let i = 0; i < n; i++) {
    let temp = 0;
    for (let j = 0; j < n; j++) {
      temp += sigma[i][j] * w[j];
    }
    result += w[i] * temp;
  }
  return result;
}

/**
 * Matrix multiplication utility: Matrix * Vector
 */
function matMulVec(sigma: number[][], w: number[]): number[] {
  const n = w.length;
  const result = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result[i] += sigma[i][j] * w[j];
    }
  }
  return result;
}

/**
 * Calculates mean, covariance and semi-covariance matrices from daily returns
 */
function calculateStats(returnsMatrix: number[][]) {
  const numAssets = returnsMatrix.length;
  const numDays = returnsMatrix[0].length;
  
  // Means
  const means = returnsMatrix.map(assetReturns => {
    return assetReturns.reduce((sum, r) => sum + r, 0) / numDays;
  });
  
  // Covariance Matrix
  const cov = Array.from({ length: numAssets }, () => new Array(numAssets).fill(0));
  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      let sum = 0;
      for (let t = 0; t < numDays; t++) {
        sum += (returnsMatrix[i][t] - means[i]) * (returnsMatrix[j][t] - means[j]);
      }
      cov[i][j] = sum / (numDays - 1);
    }
  }

  // Downside Semi-Covariance Matrix (using returns below 0)
  const semiCov = Array.from({ length: numAssets }, () => new Array(numAssets).fill(0));
  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      let sum = 0;
      for (let t = 0; t < numDays; t++) {
        const ri = Math.min(returnsMatrix[i][t], 0);
        const rj = Math.min(returnsMatrix[j][t], 0);
        sum += ri * rj;
      }
      semiCov[i][j] = sum / (numDays - 1);
    }
  }
  
  return { means, cov, semiCov };
}

// ----------------------------------------------------
// Optimizers Implementation
// ----------------------------------------------------

/**
 * Solves for portfolio weights based on criteria input
 */
export function optimizePortfolio(input: OptimizationInput): Record<string, number> {
  const { assets, riskFreeRate, type } = input;
  const n = assets.length;
  const result: Record<string, number> = {};
  
  if (n === 0) return result;
  if (n === 1) {
    result[assets[0].ticker] = 1.0;
    return result;
  }
  
  // 1. Equal Weight
  if (type === 'equal') {
    const w = 1 / n;
    assets.forEach(asset => {
      result[asset.ticker] = w;
    });
    return result;
  }
  
  // Pre-process prices to returns
  // Ensure we align dates
  // For simplicity, we find the common date range
  const commonDates = findCommonDates(assets);
  if (commonDates.length < 5) {
    // Fall back to equal weight if data is insufficient
    const w = 1 / n;
    assets.forEach(asset => {
      result[asset.ticker] = w;
    });
    return result;
  }
  
  const alignedReturns: number[][] = assets.map(asset => {
    const alignedPrices: number[] = [];
    let dateIdx = 0;
    for (const date of commonDates) {
      while (dateIdx < asset.dates.length && asset.dates[dateIdx] < date) {
        dateIdx++;
      }
      if (dateIdx < asset.dates.length && asset.dates[dateIdx] === date) {
        alignedPrices.push(asset.prices[dateIdx]);
      } else {
        // Fallback or interpolation if date missing
        alignedPrices.push(alignedPrices[alignedPrices.length - 1] || asset.prices[0]);
      }
    }
    return getDailyReturns(alignedPrices);
  });
  
  const { means, cov, semiCov } = calculateStats(alignedReturns);
  
  // Annualized means and covariances (assume 252 trading days per year)
  const annualMeans = means.map(m => m * 252);
  const annualCov = cov.map(row => row.map(val => val * 252));
  const annualSemiCov = semiCov.map(row => row.map(val => val * 252));
  const annualVols = annualCov.map((_, i) => Math.sqrt(annualCov[i][i]));
  
  const rfDaily = riskFreeRate / 252;
  
  let weights: number[];
  
  switch (type) {
    case 'min_vol':
      weights = solveMinVol(annualCov);
      break;
    case 'sharpe':
      weights = solveMaxSharpe(annualMeans, annualCov, riskFreeRate);
      break;
    case 'sortino':
      weights = solveMaxSortino(annualMeans, annualSemiCov, riskFreeRate);
      break;
    case 'risk_parity':
      weights = solveRiskParity(annualCov);
      break;
    case 'max_div':
      weights = solveMaxDiv(annualCov, annualVols);
      break;
    default:
      weights = new Array(n).fill(1 / n);
  }
  
  assets.forEach((asset, idx) => {
    result[asset.ticker] = weights[idx];
  });
  
  return result;
}

/**
 * Projects gradient descent to minimize w^T * Sigma * w
 */
function solveMinVol(sigma: number[][]): number[] {
  const n = sigma.length;
  let w = new Array(n).fill(1 / n);
  
  const maxIter = 500;
  let lr = 0.1;
  
  for (let iter = 0; iter < maxIter; iter++) {
    const grad = matMulVec(sigma, w).map(v => 2 * v);
    const nextW = projectToSimplex(w.map((val, i) => val - lr * grad[i]));
    
    // Check convergence
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(nextW[i] - w[i]);
    w = nextW;
    
    if (diff < 1e-6) break;
    lr *= 0.99; // decay
  }
  
  return w;
}

/**
 * Solve Max Sharpe ratio using PGD: Maximize (w^T * mu - rf) / sqrt(w^T * Sigma * w)
 */
function solveMaxSharpe(mu: number[], sigma: number[][], rf: number): number[] {
  const n = sigma.length;
  let w = new Array(n).fill(1 / n);
  
  const maxIter = 800;
  let lr = 0.05;
  
  for (let iter = 0; iter < maxIter; iter++) {
    const rp = w.reduce((sum, val, idx) => sum + val * mu[idx], 0);
    const vp = Math.sqrt(quadForm(w, sigma));
    
    if (vp < 1e-8) break;
    
    const excess = rp - rf;
    const sigmaW = matMulVec(sigma, w);
    
    // Gradient of Sharpe Ratio S(w) = (rp - rf) / vp
    // dS/dw = (mu * vp - (rp - rf) * (Sigma * w / vp)) / vp^2
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      grad[i] = (mu[i] * vp - excess * (sigmaW[i] / vp)) / (vp * vp);
    }
    
    // We want to maximize, so we add the gradient
    const nextW = projectToSimplex(w.map((val, i) => val + lr * grad[i]));
    
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(nextW[i] - w[i]);
    w = nextW;
    
    if (diff < 1e-6) break;
    lr *= 0.985;
  }
  
  return w;
}

/**
 * Solve Max Sortino ratio using PGD with Downside Semi-Covariance
 */
function solveMaxSortino(mu: number[], semiSigma: number[][], rf: number): number[] {
  const n = semiSigma.length;
  let w = new Array(n).fill(1 / n);
  
  const maxIter = 800;
  let lr = 0.05;
  
  for (let iter = 0; iter < maxIter; iter++) {
    const rp = w.reduce((sum, val, idx) => sum + val * mu[idx], 0);
    const downsideVp = Math.sqrt(quadForm(w, semiSigma));
    
    if (downsideVp < 1e-8) break;
    
    const excess = rp - rf;
    const semiSigmaW = matMulVec(semiSigma, w);
    
    // Gradient of Sortino Ratio
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      grad[i] = (mu[i] * downsideVp - excess * (semiSigmaW[i] / downsideVp)) / (downsideVp * downsideVp);
    }
    
    const nextW = projectToSimplex(w.map((val, i) => val + lr * grad[i]));
    
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(nextW[i] - w[i]);
    w = nextW;
    
    if (diff < 1e-6) break;
    lr *= 0.985;
  }
  
  return w;
}

/**
 * Solve Risk Parity (ERC)
 * Minimizes F(x) = 0.5 * x^T * Sigma * x - sum(ln(x_i))
 * Then w = x / sum(x)
 */
function solveRiskParity(sigma: number[][]): number[] {
  const n = sigma.length;
  let x = new Array(n).fill(1 / n);
  
  const maxIter = 200;
  const alpha = 0.1;
  const beta = 0.5;
  
  // Objective function
  const F = (valX: number[]): number => {
    let sumLn = 0;
    for (let i = 0; i < n; i++) {
      if (valX[i] <= 0) return Infinity;
      sumLn += Math.log(valX[i]);
    }
    return 0.5 * quadForm(valX, sigma) - sumLn;
  };
  
  for (let iter = 0; iter < maxIter; iter++) {
    const sigmaX = matMulVec(sigma, x);
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      grad[i] = sigmaX[i] - 1 / x[i];
    }
    
    // Descent direction
    const d = grad.map(g => -g);
    
    // Backtracking line search
    let t = 1.0;
    const fx = F(x);
    let gradD = 0;
    for (let i = 0; i < n; i++) gradD += grad[i] * d[i];
    
    while (t > 1e-10) {
      const nextX = x.map((val, i) => val + t * d[i]);
      if (nextX.every(v => v > 0) && F(nextX) <= fx + alpha * t * gradD) {
        break;
      }
      t *= beta;
    }
    
    const nextX = x.map((val, i) => val + t * d[i]);
    
    // Convergence check
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(nextX[i] - x[i]);
    x = nextX;
    
    if (diff < 1e-6) break;
  }
  
  // Normalize
  const sumX = x.reduce((a, b) => a + b, 0);
  return x.map(val => val / sumX);
}

/**
 * Solve Max Diversification Ratio: Maximize (w^T * vol) / sqrt(w^T * Sigma * w)
 */
function solveMaxDiv(sigma: number[][], vols: number[]): number[] {
  const n = sigma.length;
  let w = new Array(n).fill(1 / n);
  
  const maxIter = 500;
  let lr = 0.05;
  
  for (let iter = 0; iter < maxIter; iter++) {
    const sumWVol = w.reduce((sum, val, idx) => sum + val * vols[idx], 0);
    const vp = Math.sqrt(quadForm(w, sigma));
    
    if (vp < 1e-8) break;
    
    const sigmaW = matMulVec(sigma, w);
    
    // dD/dw = (vol * vp - sumWVol * (Sigma * w / vp)) / vp^2
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      grad[i] = (vols[i] * vp - sumWVol * (sigmaW[i] / vp)) / (vp * vp);
    }
    
    const nextW = projectToSimplex(w.map((val, i) => val + lr * grad[i]));
    
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(nextW[i] - w[i]);
    w = nextW;
    
    if (diff < 1e-6) break;
    lr *= 0.98;
  }
  
  return w;
}

// ----------------------------------------------------
// Backtester Implementation
// ----------------------------------------------------

/**
 * Runs the portfolio backtest engine based on input
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  const { assets, weights, riskFreeRate, benchmarkPrices } = input;
  
  // 1. Find common date range across all assets in portfolio
  const commonDates = findCommonDates(assets);
  
  if (commonDates.length === 0) {
    throw new Error('No common dates found across the selected assets.');
  }
  
  const numDays = commonDates.length;
  const normalizedPortfolioValue: number[] = new Array(numDays).fill(10000);
  const normalizedBenchmarkValue: number[] | undefined = benchmarkPrices ? new Array(numDays).fill(10000) : undefined;
  
  // Cache prices and daily returns for portfolio and assets
  const returnsMatrix: number[][] = [];
  const initialAssetPrices: number[] = [];
  
  // Find baseline prices for each asset on the first day
  assets.forEach(asset => {
    const idx = asset.dates.indexOf(commonDates[0]);
    initialAssetPrices.push(idx !== -1 ? asset.prices[idx] : asset.prices[0]);
  });
  
  // Compute daily returns matrix for correlation
  assets.forEach(asset => {
    const alignedPrices: number[] = [];
    let dateIdx = 0;
    for (const date of commonDates) {
      while (dateIdx < asset.dates.length && asset.dates[dateIdx] < date) {
        dateIdx++;
      }
      if (dateIdx < asset.dates.length && asset.dates[dateIdx] === date) {
        alignedPrices.push(asset.prices[dateIdx]);
      } else {
        alignedPrices.push(alignedPrices[alignedPrices.length - 1] || asset.prices[0]);
      }
    }
    returnsMatrix.push(getDailyReturns(alignedPrices));
  });
  
  // Calculate Portfolio Value over time (assuming daily rebalancing to target weights)
  // Let's compute portfolio daily returns
  const portfolioDailyReturns: number[] = [];
  
  for (let t = 1; t < numDays; t++) {
    let dayReturn = 0;
    assets.forEach((asset, assetIdx) => {
      const ticker = asset.ticker;
      const w = weights[ticker] || 0;
      
      const prevPriceIdx = asset.dates.indexOf(commonDates[t - 1]);
      const currPriceIdx = asset.dates.indexOf(commonDates[t]);
      
      const pPrev = prevPriceIdx !== -1 ? asset.prices[prevPriceIdx] : asset.prices[0];
      const pCurr = currPriceIdx !== -1 ? asset.prices[currPriceIdx] : asset.prices[0];
      const assetReturn = pPrev !== 0 ? (pCurr - pPrev) / pPrev : 0;
      
      dayReturn += w * assetReturn;
    });
    portfolioDailyReturns.push(dayReturn);
    normalizedPortfolioValue[t] = normalizedPortfolioValue[t - 1] * (1 + dayReturn);
  }
  
  // Benchmark simulation
  let benchmarkDailyReturns: number[] = [];
  if (benchmarkPrices && normalizedBenchmarkValue) {
    let p0 = 0;
    // Map benchmark prices to commonDates
    const alignedBenchmarkPrices: number[] = [];
    let dateIdx = 0;
    for (const date of commonDates) {
      while (dateIdx < benchmarkPrices.dates.length && benchmarkPrices.dates[dateIdx] < date) {
        dateIdx++;
      }
      if (dateIdx < benchmarkPrices.dates.length && benchmarkPrices.dates[dateIdx] === date) {
        alignedBenchmarkPrices.push(benchmarkPrices.prices[dateIdx]);
      } else {
        alignedBenchmarkPrices.push(alignedBenchmarkPrices[alignedBenchmarkPrices.length - 1] || benchmarkPrices.prices[0]);
      }
    }
    
    benchmarkDailyReturns = getDailyReturns(alignedBenchmarkPrices);
    for (let t = 1; t < numDays; t++) {
      const r = benchmarkDailyReturns[t - 1] || 0;
      normalizedBenchmarkValue[t] = normalizedBenchmarkValue[t - 1] * (1 + r);
    }
  }
  
  // 2. Correlation Matrix
  const correlationMatrix: Record<string, Record<string, number>> = {};
  assets.forEach((a1, i) => {
    correlationMatrix[a1.ticker] = {};
    assets.forEach((a2, j) => {
      if (i === j) {
        correlationMatrix[a1.ticker][a2.ticker] = 1.0;
      } else {
        correlationMatrix[a1.ticker][a2.ticker] = pearsonCorrelation(returnsMatrix[i], returnsMatrix[j]);
      }
    });
  });
  
  // 3. Compute Metrics
  // Time span in years
  const startDate = new Date(commonDates[0]);
  const endDate = new Date(commonDates[commonDates.length - 1]);
  const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  
  // CAGR
  const cagr = Math.pow(normalizedPortfolioValue[numDays - 1] / normalizedPortfolioValue[0], 1 / Math.max(years, 0.01)) - 1;
  
  // Daily returns mean & vol
  const avgDailyReturn = portfolioDailyReturns.reduce((s, r) => s + r, 0) / portfolioDailyReturns.length;
  const dailyVol = Math.sqrt(
    portfolioDailyReturns.reduce((s, r) => s + Math.pow(r - avgDailyReturn, 2), 0) / (portfolioDailyReturns.length - 1)
  );
  const volatility = dailyVol * Math.sqrt(252);
  
  // Drawdowns
  const drawdowns: number[] = new Array(numDays).fill(0);
  let peak = normalizedPortfolioValue[0];
  let maxDD = 0;
  
  // Track peak-to-trough durations
  let currentDrawdownDuration = 0;
  let maxDrawdownDuration = 0;
  
  for (let t = 0; t < numDays; t++) {
    const val = normalizedPortfolioValue[t];
    if (val > peak) {
      peak = val;
      maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDuration);
      currentDrawdownDuration = 0;
    } else {
      currentDrawdownDuration++;
    }
    const dd = (peak - val) / peak;
    drawdowns[t] = dd;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }
  maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDuration);
  
  // Sharpe & Sortino (annualized)
  const sharpeRatio = volatility > 0 ? (cagr - riskFreeRate) / volatility : 0;
  
  // Downside Vol
  const negativeReturns = portfolioDailyReturns.filter(r => r < 0);
  const downsideDailyVol = Math.sqrt(
    negativeReturns.reduce((sum, r) => sum + r * r, 0) / portfolioDailyReturns.length
  );
  const downsideVol = downsideDailyVol * Math.sqrt(252);
  const sortinoRatio = downsideVol > 0 ? (cagr - riskFreeRate) / downsideVol : 0;
  
  // Calmar
  const calmarRatio = maxDD > 0 ? cagr / maxDD : 0;
  
  // Beta & Alpha
  let beta = 0;
  let alpha = 0;
  let trackingError = 0;
  let informationRatio = 0;
  
  if (benchmarkDailyReturns.length > 0) {
    const pCovB = covariance(portfolioDailyReturns, benchmarkDailyReturns);
    const bVar = variance(benchmarkDailyReturns);
    beta = bVar > 0 ? pCovB / bVar : 0;
    
    // Benchmark CAGR
    const bStart = normalizedBenchmarkValue![0];
    const bEnd = normalizedBenchmarkValue![numDays - 1];
    const bCagr = Math.pow(bEnd / bStart, 1 / Math.max(years, 0.01)) - 1;
    
    alpha = cagr - (riskFreeRate + beta * (bCagr - riskFreeRate));
    
    // Tracking Error
    const activeReturns = portfolioDailyReturns.map((r, idx) => r - (benchmarkDailyReturns[idx] || 0));
    const meanActiveReturn = activeReturns.reduce((s, r) => s + r, 0) / activeReturns.length;
    const activeVol = Math.sqrt(
      activeReturns.reduce((s, r) => s + Math.pow(r - meanActiveReturn, 2), 0) / (activeReturns.length - 1)
    );
    trackingError = activeVol * Math.sqrt(252);
    
    informationRatio = trackingError > 0 ? (cagr - bCagr) / trackingError : 0;
  }
  
  return {
    dates: commonDates,
    portfolioValue: normalizedPortfolioValue,
    benchmarkValue: normalizedBenchmarkValue,
    drawdowns,
    metrics: {
      cagr,
      volatility,
      maxDrawdown: maxDD,
      maxDrawdownDuration,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      beta,
      alpha,
      trackingError,
      informationRatio
    },
    correlationMatrix
  };
}

// ----------------------------------------------------
// Stats Helpers
// ----------------------------------------------------

function findCommonDates(assets: AssetData[]): string[] {
  if (assets.length === 0) return [];
  // Start with dates of the first asset
  let common = new Set(assets[0].dates);
  for (let i = 1; i < assets.length; i++) {
    const currentDates = new Set(assets[i].dates);
    common = new Set([...common].filter(x => currentDates.has(x)));
  }
  return Array.from(common).sort();
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((s, val) => s + val, 0) / n;
  const meanY = y.reduce((s, val) => s + val, 0) / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function covariance(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const meanX = x.reduce((s, val) => s + val, 0) / n;
  const meanY = y.reduce((s, val) => s + val, 0) / n;
  
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / (n - 1);
}

function variance(x: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mean = x.reduce((s, val) => s + val, 0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.pow(x[i] - mean, 2);
  }
  return sum / (n - 1);
}
