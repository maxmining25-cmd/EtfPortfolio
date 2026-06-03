// math.worker.ts
// Web Worker for offloading portfolio backtests and optimization solvers

import { runBacktest, optimizePortfolio, BacktestInput, OptimizationInput } from './portfolioMath';

// Listen to message events from the main thread
self.onmessage = (event: MessageEvent) => {
  const { id, type, data } = event.data;
  
  try {
    if (type === 'backtest') {
      const result = runBacktest(data as BacktestInput);
      self.postMessage({ id, type, success: true, result });
    } else if (type === 'optimize') {
      const result = optimizePortfolio(data as OptimizationInput);
      self.postMessage({ id, type, success: true, result });
    } else {
      throw new Error(`Unknown calculation type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({
      id,
      type,
      success: false,
      error: error.message || 'An error occurred during math solver computation.'
    });
  }
};
