import { createContext, useContext } from 'react';

export const CurrencyContext = createContext('INR');
export const useCurrency = () => useContext(CurrencyContext);

export function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  );
}
