// mockPrices.ts
// Seed-based deterministic price generator for offline demo mode

/**
 * Generates deterministic daily adjusted close prices for backtesting in Demo Mode.
 * Uses a seed based on the ticker name so price curves remain consistent.
 */
export function generateMockPrices(
  ticker: string,
  startDateStr: string = '2001-01-01',
  endDateStr: string = new Date().toISOString().split('T')[0]
): { dates: string[]; prices: number[] } {
  // Simple seed-based pseudo-random generator
  let seed = 0;
  const upperTicker = ticker.toUpperCase();
  for (let i = 0; i < upperTicker.length; i++) {
    seed += upperTicker.charCodeAt(i) * (i + 1);
  }
  
  const rand = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  // Set parameters based on ticker asset class character
  let price = 100;
  let drift = 0.00025; // Daily drift (~6.5% annual return)
  let vol = 0.01;     // Daily volatility (~16% annual volatility)

  if (upperTicker === 'BTC') {
    price = 10;
    drift = 0.0016;  // Fast crypto growth
    vol = 0.038;     // High crypto volatility
  } else if (upperTicker === 'ETH') {
    price = 5;
    drift = 0.0018;
    vol = 0.045;
  } else if (upperTicker === 'GLD') {
    price = 32;
    drift = 0.00018;
    vol = 0.0085;    // Safe haven metal
  } else if (upperTicker === 'TLT') {
    price = 85;
    drift = 0.0001;  // Low return treasury
    vol = 0.007;     // Low volatility
  } else if (upperTicker === 'QQQ') {
    price = 45;
    drift = 0.00035; // Tech growth ETF
    vol = 0.013;
  } else if (upperTicker === 'SPY') {
    price = 90;
    drift = 0.00024; // Market benchmark
    vol = 0.0095;
  } else if (upperTicker === 'EEM') {
    price = 25;
    drift = 0.00015;
    vol = 0.015;     // Emerging markets
  } else {
    // Generics based on hash values
    price = 50 + (seed % 100);
    drift = 0.0001 + (seed % 50) / 100000;
    vol = 0.008 + (seed % 30) / 2000;
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const dates: string[] = [];
  const prices: number[] = [];

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isCrypto = upperTicker === 'BTC' || upperTicker === 'ETH';
    
    // US Stock market is closed on weekends
    if (isCrypto || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      const dateString = current.toISOString().split('T')[0];
      dates.push(dateString);

      // Geometric Brownian Motion step
      // Z ~ Normal(0, 1) approximated via central limit theorem on 6 uniform numbers
      const z = (rand() + rand() + rand() + rand() + rand() + rand() - 3) / 1.732;
      price = price * Math.exp(drift + vol * z);
      if (price < 0.01) price = 0.01;
      
      prices.push(parseFloat(price.toFixed(2)));
    }
    
    current.setDate(current.getDate() + 1);
  }

  return { dates, prices };
}
