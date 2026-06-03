// marketHolidays.ts
// Calculates US stock market holidays and trading closures (including Easter / Good Friday)

/**
 * Checks if the stock market is closed on a given date (weekends and US stock market holidays).
 */
export function isMarketClosed(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const dayOfMonth = date.getDate();
  
  // Format MM-DD
  const mmDd = `${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
  
  // 1. Fixed Stock Market Holidays
  if (mmDd === '01-01') return true; // New Year's Day
  if (mmDd === '06-19') return true; // Juneteenth
  if (mmDd === '07-04') return true; // Independence Day
  if (mmDd === '12-25') return true; // Christmas Day
  
  // 2. Floating Stock Market Holidays
  
  // Helper to find nth Monday/Thursday of a month
  const getNthDayOfMonth = (n: number, targetDayOfWeek: number, m: number, y: number) => {
    const firstDayOfWeek = new Date(y, m, 1).getDay();
    const dateOfFirst = 1 + (targetDayOfWeek - firstDayOfWeek + 7) % 7 + (n - 1) * 7;
    return dateOfFirst;
  };

  // Helper to find last Monday of May (Memorial Day)
  const getLastMondayOfMay = (y: number) => {
    const lastDay = new Date(y, 5, 0); // May 31 (month 5 = June, date 0 = last day of May)
    const day = lastDay.getDay();
    const diff = (day >= 1) ? (day - 1) : 6;
    return lastDay.getDate() - diff;
  };

  // Martin Luther King Jr. Day: Third Monday in January (month 0)
  if (month === 0 && dayOfMonth === getNthDayOfMonth(3, 1, 0, year)) return true;
  
  // Presidents' Day / Washington's Birthday: Third Monday in February (month 1)
  if (month === 1 && dayOfMonth === getNthDayOfMonth(3, 1, 1, year)) return true;
  
  // Memorial Day: Last Monday in May (month 4)
  if (month === 4 && dayOfMonth === getLastMondayOfMay(year)) return true;
  
  // Labor Day: First Monday in September (month 8)
  if (month === 8 && dayOfMonth === getNthDayOfMonth(1, 1, 8, year)) return true;
  
  // Thanksgiving Day: Fourth Thursday in November (month 10)
  if (month === 10 && dayOfMonth === getNthDayOfMonth(4, 4, 10, year)) return true;

  // 3. Good Friday (Easter Sunday - 2 days)
  // Meeus/Jones/Butcher algorithm to calculate Easter Sunday date
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  
  const goodFriday = new Date(year, easterMonth, easterDay - 2);
  if (month === goodFriday.getMonth() && dayOfMonth === goodFriday.getDate()) return true;

  return false;
}
