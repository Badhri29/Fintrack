// Real-time Currency Conversion Service

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'INR (₹ - Indian Rupee)', flag: '🇮🇳', decimals: 0 },
  { code: 'USD', symbol: '$', name: 'USD ($ - US Dollar)', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'EUR (€ - Euro)', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'GBP (£ - British Pound)', flag: '🇬🇧', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'JPY (¥ - Japanese Yen)', flag: '🇯🇵', decimals: 0 },
  { code: 'AED', symbol: 'د.إ', name: 'AED (د.إ - UAE Dirham)', flag: '🇦🇪', decimals: 2 },
  { code: 'CAD', symbol: 'CA$', name: 'CAD (CA$ - Canadian Dollar)', flag: '🇨🇦', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'AUD (A$ - Australian Dollar)', flag: '🇦🇺', decimals: 2 },
];

// Fallback real-world exchange rates base INR (1 INR = X target currency)
const DEFAULT_RATES: Record<string, number> = {
  INR: 1.0,
  USD: 0.01053, // 1000 INR = 10.53 USD
  EUR: 0.00939,
  GBP: 0.00791,
  JPY: 1.582,
  AED: 0.03867,
  CAD: 0.01452,
  AUD: 0.01594,
};

class CurrencyService {
  private rates: Record<string, number> = { ...DEFAULT_RATES };
  private lastFetchTime: number = 0;
  private isFetching: boolean = false;

  constructor() {
    this.loadCachedRates();
    this.fetchLiveRates();
  }

  private loadCachedRates() {
    try {
      const cached = localStorage.getItem('fintrack_exchange_rates');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.rates && typeof parsed.rates === 'object') {
          this.rates = { ...DEFAULT_RATES, ...parsed.rates };
          this.lastFetchTime = parsed.timestamp || 0;
        }
      }
    } catch {
      // Use defaults
    }
  }

  public async fetchLiveRates(): Promise<boolean> {
    const now = Date.now();
    if (this.isFetching || (now - this.lastFetchTime < 15 * 60 * 1000 && this.lastFetchTime > 0)) {
      return true;
    }

    this.isFetching = true;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/INR', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          const newRates: Record<string, number> = { ...DEFAULT_RATES };
          for (const cur of SUPPORTED_CURRENCIES) {
            if (data.rates[cur.code]) {
              newRates[cur.code] = Number(data.rates[cur.code]);
            }
          }
          this.rates = newRates;
          this.lastFetchTime = now;
          localStorage.setItem(
            'fintrack_exchange_rates',
            JSON.stringify({ rates: this.rates, timestamp: now })
          );
          window.dispatchEvent(new CustomEvent('fintrack-currency-rates-updated', { detail: { rates: this.rates } }));
          return true;
        }
      }
    } catch (err) {
      console.warn('Could not fetch latest live rates, using cached/default rates:', err);
    } finally {
      this.isFetching = false;
    }
    return false;
  }

  public getActiveCurrencyCode(): string {
    return localStorage.getItem('fintrack_currency') || 'INR';
  }

  public getActiveCurrencyConfig(): CurrencyConfig {
    const code = this.getActiveCurrencyCode();
    return (
      SUPPORTED_CURRENCIES.find((c) => c.code === code) ||
      SUPPORTED_CURRENCIES[0]
    );
  }

  public getCurrencyConfig(code: string): CurrencyConfig {
    return (
      SUPPORTED_CURRENCIES.find((c) => c.code === code) ||
      SUPPORTED_CURRENCIES[0]
    );
  }

  public getRate(targetCode: string): number {
    return this.rates[targetCode] || DEFAULT_RATES[targetCode] || 1;
  }

  public setActiveCurrency(code: string) {
    const cfg = this.getCurrencyConfig(code);
    localStorage.setItem('fintrack_currency', cfg.code);
    localStorage.setItem('fintrack_currency_symbol', cfg.symbol);
    this.fetchLiveRates();
    window.dispatchEvent(
      new CustomEvent('fintrack-currency-change', {
        detail: { code: cfg.code, symbol: cfg.symbol },
      })
    );
  }

  /**
   * Converts base INR amount into target currency
   */
  public convertFromBase(amountInr: number, targetCode?: string): number {
    const code = targetCode || this.getActiveCurrencyCode();
    const rate = this.getRate(code);
    return (Number(amountInr) || 0) * rate;
  }

  /**
   * Converts user-input amount in target currency back to base INR for database persistence
   */
  public convertToBase(amountInTarget: number, sourceCode?: string): number {
    const code = sourceCode || this.getActiveCurrencyCode();
    const rate = this.getRate(code);
    if (!rate || rate <= 0) return Number(amountInTarget) || 0;
    return (Number(amountInTarget) || 0) / rate;
  }

  /**
   * Formats a base INR amount into active currency with proper symbol and decimal precision
   */
  public format(amountInr: number, targetCode?: string): string {
    const code = targetCode || this.getActiveCurrencyCode();
    const cfg = this.getCurrencyConfig(code);
    const converted = this.convertFromBase(amountInr, code);

    const isNegative = converted < 0;
    const absVal = Math.abs(converted);

    const isIndianGrouping =
      code === 'INR' &&
      localStorage.getItem('fintrack_number_format') !== 'international';

    let formatted: string;
    if (cfg.decimals === 0) {
      const rounded = Math.round(absVal);
      formatted = isIndianGrouping
        ? rounded.toLocaleString('en-IN')
        : rounded.toLocaleString('en-US');
    } else {
      formatted = absVal.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    return isNegative ? `-${cfg.symbol}${formatted}` : `${cfg.symbol}${formatted}`;
  }

  public getExchangeRateDescription(code?: string): string {
    const target = code || this.getActiveCurrencyCode();
    if (target === 'INR') return 'Base Currency (1.00)';
    const rate = this.getRate(target);
    const exampleConverted = (1000 * rate).toFixed(2);
    const sym = this.getCurrencyConfig(target).symbol;
    return `1,000 INR = ${sym}${exampleConverted} ${target} (Rate: ${rate.toFixed(5)})`;
  }
}

export const currencyService = new CurrencyService();
