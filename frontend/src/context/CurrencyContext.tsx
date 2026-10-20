import { useState, useEffect } from 'react';
import { currencyService, type CurrencyConfig } from '../services/currencyService';

export const useCurrency = () => {
  const [currency, setCurrencyState] = useState<CurrencyConfig>(() =>
    currencyService.getActiveCurrencyConfig()
  );
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    const handleCurrencyChange = () => {
      setCurrencyState(currencyService.getActiveCurrencyConfig());
      setTick((t) => t + 1);
    };

    const handleRatesUpdate = () => {
      setTick((t) => t + 1);
    };

    window.addEventListener('fintrack-currency-change', handleCurrencyChange);
    window.addEventListener('fintrack-currency-rates-updated', handleRatesUpdate);
    return () => {
      window.removeEventListener('fintrack-currency-change', handleCurrencyChange);
      window.removeEventListener('fintrack-currency-rates-updated', handleRatesUpdate);
    };
  }, []);

  const changeCurrency = (code: string) => {
    currencyService.setActiveCurrency(code);
  };

  const format = (amountInr: number) => {
    return currencyService.format(amountInr);
  };

  const convertFromBase = (amountInr: number) => {
    return currencyService.convertFromBase(amountInr);
  };

  const convertToBase = (amountInTarget: number) => {
    return currencyService.convertToBase(amountInTarget);
  };

  const rateDescription = currencyService.getExchangeRateDescription();

  return {
    currency,
    changeCurrency,
    format,
    convertFromBase,
    convertToBase,
    rateDescription,
    currencyService,
  };
};
