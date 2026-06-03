// mathClient.ts
// Promise-based client wrapper for the portfolio optimization Web Worker

import { BacktestInput, BacktestResult, OptimizationInput } from './portfolioMath';

let worker: Worker | null = null;
const pendingRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason: any) => void }
>();

/**
 * Initializes the Web Worker on the client side and registers message handlers.
 */
function getWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Web Workers cannot be executed on the server side.');
  }

  if (!worker) {
    // Instantiate Next.js Worker (supports ES modules inside new URL context)
    worker = new Worker(new URL('./math.worker.ts', import.meta.url));
    
    worker.onmessage = (event: MessageEvent) => {
      const { id, success, result, error } = event.data;
      const callbacks = pendingRequests.get(id);
      
      if (callbacks) {
        pendingRequests.delete(id);
        if (success) {
          callbacks.resolve(result);
        } else {
          callbacks.reject(new Error(error));
        }
      }
    };

    worker.onerror = (err) => {
      console.error('Math Worker error:', err);
    };
  }

  return worker;
}

/**
 * Run a portfolio backtest in the background Web Worker.
 */
export function calculateBacktest(data: BacktestInput): Promise<BacktestResult> {
  return new Promise((resolve, reject) => {
    try {
      const w = getWorker();
      const id = Math.random().toString(36).substring(2, 11);
      pendingRequests.set(id, { resolve, reject });
      w.postMessage({ id, type: 'backtest', data });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Run a portfolio optimization solver in the background Web Worker.
 */
export function calculateOptimization(
  data: OptimizationInput
): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    try {
      const w = getWorker();
      const id = Math.random().toString(36).substring(2, 11);
      pendingRequests.set(id, { resolve, reject });
      w.postMessage({ id, type: 'optimize', data });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Terminates the active worker and rejects any pending promises.
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    pendingRequests.forEach(callbacks => {
      callbacks.reject(new Error('Math Worker was terminated.'));
    });
    pendingRequests.clear();
  }
}
