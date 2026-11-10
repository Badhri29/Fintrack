import React, { useState, useEffect } from 'react';
import { Coins, Check, ArrowRight, Sparkles } from 'lucide-react';
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
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', country: 'China' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', country: 'Japan' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', country: 'United Arab Emirates' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', country: 'Canada' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', country: 'Singapore' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', country: 'Australia' }
];

export const CurrencyOnboardingModal: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('DEFAULT');
  const [adminDefault, setAdminDefault] = useState<{ code: string; symbol: string }>({ code: 'INR', symbol: '₹' });

  useEffect(() => {
    // Fetch live Admin system default currency
    api.get('/system/public-defaults')
      .then(res => {
        if (res.data?.success && res.data.defaultCurrency) {
          setAdminDefault({
            code: res.data.defaultCurrency,
            symbol: res.data.defaultCurrencySymbol || '₹'
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const key = `fintrack_currency_configured_${user.id}`;
    const configured = localStorage.getItem(key);
    const isNewRegistration = sessionStorage.getItem('fintrack_is_new_registration') === 'true';

    // Prompt currency selection upon account creation or first access on new device
    if (isNewRegistration || !configured) {
      setSelectedCurrency('DEFAULT');
      setIsOpen(true);
    }
  }, [user]);

  const handleConfirm = async () => {
    if (!user) return;
    const finalCurrency = selectedCurrency === 'DEFAULT' ? adminDefault.code : selectedCurrency;

    currencyService.setActiveCurrency(finalCurrency, true);
    localStorage.setItem(`fintrack_currency_configured_${user.id}`, 'true');
    sessionStorage.removeItem('fintrack_is_new_registration');

    try {
      await api.put('/user/preferences', { currency: finalCurrency });
    } catch {}

    try {
      await api.put('/profile', { currency: finalCurrency });
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
          maxWidth: 540,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9)',
          boxSizing: 'border-box'
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

        {/* 1. Special Admin Default Option (Highlight at Top) */}
        <div
          onClick={() => setSelectedCurrency('DEFAULT')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 14,
            border: selectedCurrency === 'DEFAULT' ? '2px solid #7C3AED' : '1px solid rgba(124, 58, 237, 0.3)',
            background: selectedCurrency === 'DEFAULT' ? 'rgba(124, 58, 237, 0.16)' : 'rgba(124, 58, 237, 0.06)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                width: 36,
                height: 36,
                borderRadius: 8,
                background: selectedCurrency === 'DEFAULT' ? '#7C3AED' : 'rgba(124, 58, 237, 0.25)',
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {adminDefault.symbol}
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: selectedCurrency === 'DEFAULT' ? '#A78BFA' : '#FFF' }}>
                  (Default) - {adminDefault.code} ({adminDefault.symbol})
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: '#7C3AED',
                    color: '#FFF',
                    padding: '2px 6px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                >
                  <Sparkles size={10} />
                  Admin Default
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                System-configured default currency set by administrator
              </div>
            </div>
          </div>

          {selectedCurrency === 'DEFAULT' && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#7C3AED',
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Check size={14} />
            </div>
          )}
        </div>

        {/* 2. Grid of Individual Currencies */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18, maxHeight: 240, overflowY: 'auto' }}>
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
                  padding: '10px 12px',
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
                      fontSize: 15,
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
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: isSelected ? '#A78BFA' : '#FFF' }}>
                      {curr.code}
                    </div>
                    <div style={{ fontSize: 9.5, color: '#64748B' }}>{curr.name}</div>
                  </div>
                </div>

                {isSelected && <Check size={15} style={{ color: '#A78BFA' }} />}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 18, textAlign: 'center' }}>
          * Default currency is <strong>{adminDefault.code} ({adminDefault.symbol})</strong>. You can change this at any time in Settings.
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
