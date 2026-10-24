import React, { useState, useEffect } from 'react';
import { Coins, Check, ArrowRight } from 'lucide-react';
import { currencyService } from '../services/currencyService';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  country: string;
}

const POPULAR_CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', country: 'India' },
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'United States' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'European Union' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', country: 'United Arab Emirates' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', country: 'Canada' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', country: 'Singapore' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', country: 'Australia' }
];

export const CurrencyOnboardingModal: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('INR');

  useEffect(() => {
    if (!user) return;
    const key = `fintrack_currency_configured_${user.id}`;
    const configured = localStorage.getItem(key);
    const isNewRegistration = sessionStorage.getItem('fintrack_is_new_registration') === 'true';

    // Only prompt currency selection upon account creation (new registration)
    if (isNewRegistration) {
      setSelectedCurrency(currencyService.getActiveCurrencyCode() || 'INR');
      setIsOpen(true);
    } else {
      // Normal login: do not prompt, ensure preference is stored so it never asks
      if (!configured) {
        localStorage.setItem(key, 'true');
      }
    }
  }, [user]);

  const handleConfirm = async () => {
    if (!user) return;
    currencyService.setActiveCurrency(selectedCurrency);
    localStorage.setItem(`fintrack_currency_configured_${user.id}`, 'true');
    sessionStorage.removeItem('fintrack_is_new_registration');
    try {
      await api.put('/profile', { currency: selectedCurrency });
    } catch {}
    setIsOpen(false);
  };

  if (!isOpen || !user) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 2500
      }}
    >
      <div
        style={{
          background: '#0F131D',
          border: '1px solid #2B354C',
          borderRadius: 20,
          padding: 28,
          maxWidth: 500,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(124, 58, 237, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#A78BFA'
            }}
          >
            <Coins size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFF' }}>
              Select Account Currency
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94A3B8' }}>
              Choose your primary currency for financial metrics, income, and expenses.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, margin: '20px 0' }}>
          {POPULAR_CURRENCIES.map(curr => {
            const isSelected = selectedCurrency === curr.code;
            return (
              <div
                key={curr.code}
                onClick={() => setSelectedCurrency(curr.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: isSelected ? '2px solid #7C3AED' : '1px solid #1E2638',
                  background: isSelected ? 'rgba(124, 58, 237, 0.12)' : '#090C13',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isSelected ? '#7C3AED' : '#1E2638',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {curr.symbol}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#A78BFA' : '#FFF' }}>
                      {curr.code}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{curr.name}</div>
                  </div>
                </div>

                {isSelected && <Check size={16} style={{ color: '#A78BFA' }} />}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 20, textAlign: 'center' }}>
          * Default currency is <strong>INR (₹)</strong>. You can change this at any time in Settings.
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)',
            color: '#FFF',
            border: 'none',
            borderRadius: 10,
            padding: '13px',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.35)'
          }}
        >
          <span>Confirm & Enter Dashboard</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};
