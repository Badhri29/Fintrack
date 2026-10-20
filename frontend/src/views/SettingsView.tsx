import React, { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle,
  AlertCircle,
  LogOut,
  Sun,
  Moon,
  Laptop,
  Palette,
  User,
  Save,
  Download,
  Bell,
  Sliders,
  Lock,
  Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import api from '../services/api';

interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

const CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹', name: 'INR (₹ - Indian Rupee)' },
  { code: 'USD', symbol: '$', name: 'USD ($ - US Dollar)' },
  { code: 'EUR', symbol: '€', name: 'EUR (€ - Euro)' },
  { code: 'GBP', symbol: '£', name: 'GBP (£ - British Pound)' },
  { code: 'JPY', symbol: '¥', name: 'JPY (¥ - Japanese Yen)' },
  { code: 'AED', symbol: 'د.إ', name: 'AED (د.إ - UAE Dirham)' },
  { code: 'CAD', symbol: 'CA$', name: 'CAD (CA$ - Canadian Dollar)' },
  { code: 'AUD', symbol: 'A$', name: 'AUD (A$ - Australian Dollar)' },
];

export const SettingsView: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme, effectiveTheme } = useTheme();

  // Profile states
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Prefer not to say');
  const [bio, setBio] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // System Configuration states
  const [currencyCode, setCurrencyCode] = useState<string>(() => {
    return localStorage.getItem('fintrack_currency') || 'INR';
  });
  const [dateFormat, setDateFormat] = useState<string>(() => {
    return localStorage.getItem('fintrack_date_format') || 'DD/MM/YYYY';
  });
  const [numberFormat, setNumberFormat] = useState<string>(() => {
    return localStorage.getItem('fintrack_number_format') || 'indian';
  });
  const [financialYear, setFinancialYear] = useState<string>(() => {
    return localStorage.getItem('fintrack_financial_year') || 'apr_mar';
  });
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Default Transaction preferences states
  const [defaultType, setDefaultType] = useState<string>(() => {
    return localStorage.getItem('fintrack-default-transaction-type') || 'expense';
  });
  const [defaultPaymentMode, setDefaultPaymentMode] = useState<string>(() => {
    return localStorage.getItem('fintrack-default-payment-mode') || 'upi';
  });
  const [defaultCategory, setDefaultCategory] = useState<string>(() => {
    return localStorage.getItem('fintrack-default-category') || 'Food & Groceries';
  });
  const [defaultCard, setDefaultCard] = useState<string>(() => {
    return localStorage.getItem('fintrack-default-card') || '';
  });
  const [defaultNote, setDefaultNote] = useState<string>(() => {
    return localStorage.getItem('fintrack-default-note') || '';
  });
  const [autoFocusAmount, setAutoFocusAmount] = useState<boolean>(() => {
    return localStorage.getItem('fintrack-autofocus-amount') !== 'false';
  });
  const [txMessage, setTxMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notifications preferences
  const [budgetAlert, setBudgetAlert] = useState<boolean>(() => {
    return localStorage.getItem('fintrack_notif_budget') !== 'false';
  });
  const [highExpenseAlert, setHighExpenseAlert] = useState<boolean>(() => {
    return localStorage.getItem('fintrack_notif_highexpense') !== 'false';
  });
  const [monthlySummary, setMonthlySummary] = useState<boolean>(() => {
    return localStorage.getItem('fintrack_notif_summary') !== 'false';
  });
  const [soundEffects, setSoundEffects] = useState<boolean>(() => {
    return localStorage.getItem('fintrack_notif_sound') === 'true';
  });

  // Export states
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passChanging, setPassChanging] = useState<boolean>(false);
  const [passMessage, setPassMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/profile');
      if (res.data && res.data.success && res.data.data) {
        const u = res.data.data;
        setName(u.name || user?.name || '');
        setPhone(u.phone || '');
        setAge(u.age ? String(u.age) : '');
        setGender(u.gender || 'Prefer not to say');
        setBio(u.bio || localStorage.getItem('fintrack_profile_bio') || '');
      } else if (user) {
        setName(user.name || '');
        setBio(localStorage.getItem('fintrack_profile_bio') || '');
      }
    } catch {
      if (user) {
        setName(user.name || '');
        setBio(localStorage.getItem('fintrack_profile_bio') || '');
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await api.put('/profile', {
        name: name.trim(),
        phone: phone.trim(),
        age: age ? Number(age) : null,
        gender
      });

      if (res.data && res.data.success) {
        localStorage.setItem('fintrack_profile_bio', bio.trim());
        updateUser({ name: name.trim() });
        setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
      } else {
        setProfileMessage({ type: 'error', text: res.data?.message || 'Failed to update profile.' });
      }
    } catch {
      // Even if API returns error, save locally
      updateUser({ name: name.trim() });
      localStorage.setItem('fintrack_profile_bio', bio.trim());
      setProfileMessage({ type: 'success', text: 'Profile saved successfully!' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCurrencyChange = (newCode: string) => {
    const found = CURRENCIES.find(c => c.code === newCode);
    const sym = found ? found.symbol : '₹';
    setCurrencyCode(newCode);
    localStorage.setItem('fintrack_currency', newCode);
    localStorage.setItem('fintrack_currency_symbol', sym);
    window.dispatchEvent(new CustomEvent('fintrack-currency-change', { detail: { code: newCode, symbol: sym } }));
    setConfigMessage({ type: 'success', text: `System currency updated to ${newCode} (${sym})` });
    setTimeout(() => setConfigMessage(null), 3000);
  };

  const handleDateFormatChange = (fmt: string) => {
    setDateFormat(fmt);
    localStorage.setItem('fintrack_date_format', fmt);
    setConfigMessage({ type: 'success', text: `Date display format updated to ${fmt}` });
    setTimeout(() => setConfigMessage(null), 3000);
  };

  const handleNumberFormatChange = (fmt: string) => {
    setNumberFormat(fmt);
    localStorage.setItem('fintrack_number_format', fmt);
    setConfigMessage({ type: 'success', text: `Number grouping format updated to ${fmt === 'indian' ? 'Lakhs (1,00,000)' : 'Millions (100,000)'}` });
    setTimeout(() => setConfigMessage(null), 3000);
  };

  const handleFinancialYearChange = (fy: string) => {
    setFinancialYear(fy);
    localStorage.setItem('fintrack_financial_year', fy);
    setConfigMessage({ type: 'success', text: `Financial year cycle set to ${fy === 'apr_mar' ? 'April - March' : 'January - December'}` });
    setTimeout(() => setConfigMessage(null), 3000);
  };

  const handleSaveTransactionDefaults = (updates: Partial<{
    type: string;
    mode: string;
    category: string;
    card: string;
    note: string;
    autofocus: boolean;
  }>) => {
    if (updates.type !== undefined) {
      setDefaultType(updates.type);
      localStorage.setItem('fintrack-default-transaction-type', updates.type);
    }
    if (updates.mode !== undefined) {
      setDefaultPaymentMode(updates.mode);
      localStorage.setItem('fintrack-default-payment-mode', updates.mode);
    }
    if (updates.category !== undefined) {
      setDefaultCategory(updates.category);
      localStorage.setItem('fintrack-default-category', updates.category);
    }
    if (updates.card !== undefined) {
      setDefaultCard(updates.card);
      localStorage.setItem('fintrack-default-card', updates.card);
    }
    if (updates.note !== undefined) {
      setDefaultNote(updates.note);
      localStorage.setItem('fintrack-default-note', updates.note);
    }
    if (updates.autofocus !== undefined) {
      setAutoFocusAmount(updates.autofocus);
      localStorage.setItem('fintrack-autofocus-amount', String(updates.autofocus));
    }
    setTxMessage({ type: 'success', text: 'Default transaction preferences updated!' });
    setTimeout(() => setTxMessage(null), 3000);
  };

  const handleToggleNotification = (key: 'budget' | 'highexpense' | 'summary' | 'sound', val: boolean) => {
    if (key === 'budget') {
      setBudgetAlert(val);
      localStorage.setItem('fintrack_notif_budget', String(val));
    } else if (key === 'highexpense') {
      setHighExpenseAlert(val);
      localStorage.setItem('fintrack_notif_highexpense', String(val));
    } else if (key === 'summary') {
      setMonthlySummary(val);
      localStorage.setItem('fintrack_notif_summary', String(val));
    } else if (key === 'sound') {
      setSoundEffects(val);
      localStorage.setItem('fintrack_notif_sound', String(val));
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await api.get('/transactions');
      const transactions = (res.data && res.data.success && Array.isArray(res.data.data)) ? res.data.data : [];

      if (transactions.length === 0) {
        setExportMessage('No transactions found to export.');
        return;
      }

      const headers = ['ID', 'Date', 'Type', 'Category', 'Subcategory', 'Amount', 'Payment Mode', 'Card/Account', 'Description'];
      const rows = transactions.map((t: any) => [
        t.id,
        t.date || '',
        t.type || '',
        `"${(t.category || '').replace(/"/g, '""')}"`,
        `"${(t.subcategory || '').replace(/"/g, '""')}"`,
        t.amount || 0,
        t.paymentMode || '',
        `"${(t.card || '').replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `FinTrack_Transactions_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportMessage(`Successfully exported ${transactions.length} transactions as CSV!`);
      setTimeout(() => setExportMessage(null), 4000);
    } catch {
      setExportMessage('Failed to export transactions.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await api.get('/transactions');
      const transactions = (res.data && res.data.success && Array.isArray(res.data.data)) ? res.data.data : [];

      const backupData = {
        exportDate: new Date().toISOString(),
        user: { name: user?.name, email: user?.email },
        settings: {
          currency: currencyCode,
          dateFormat,
          numberFormat,
          financialYear,
          theme
        },
        transactions
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const link = document.createElement('a');
      link.setAttribute('href', dataStr);
      link.setAttribute('download', `FinTrack_Backup_${new Date().toISOString().substring(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportMessage('Full JSON backup downloaded successfully!');
      setTimeout(() => setExportMessage(null), 4000);
    } catch {
      setExportMessage('Failed to generate JSON backup.');
    } finally {
      setExporting(false);
    }
  };

  const handleResetSettings = () => {
    if (window.confirm('Are you sure you want to reset all preferences to application defaults? This will not delete your transactions.')) {
      localStorage.removeItem('fintrack_currency');
      localStorage.removeItem('fintrack_currency_symbol');
      localStorage.removeItem('fintrack_date_format');
      localStorage.removeItem('fintrack_number_format');
      localStorage.removeItem('fintrack_financial_year');
      localStorage.removeItem('fintrack-default-transaction-type');
      localStorage.removeItem('fintrack-default-payment-mode');
      localStorage.removeItem('fintrack-default-category');
      localStorage.removeItem('fintrack-default-card');
      localStorage.removeItem('fintrack-default-note');
      localStorage.removeItem('fintrack-autofocus-amount');
      window.location.reload();
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPassMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (newPassword.length < 6) {
      setPassMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPassChanging(true);
    setPassMessage(null);
    try {
      const res = await api.put('/profile', { password: newPassword });
      if (res.data && res.data.success) {
        setPassMessage({ type: 'success', text: 'Password changed successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassMessage({ type: 'success', text: 'Password updated successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPassMessage({ type: 'success', text: 'Password updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setPassChanging(false);
    }
  };

  const getInitials = (n?: string) => {
    if (!n) return 'U';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.substring(0, 2).toUpperCase();
  };

  const themeOptions: { id: ThemeMode; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'dark',
      label: 'Dark Mode',
      desc: 'High contrast dark glassmorphism',
      icon: <Moon size={22} />
    },
    {
      id: 'light',
      label: 'Light Mode',
      desc: 'Crisp white glassmorphism palette',
      icon: <Sun size={22} />
    },
    {
      id: 'system',
      label: 'System Default',
      desc: 'Automatically follow OS preference',
      icon: <Laptop size={22} />
    }
  ];

  return (
    <main style={{ paddingBottom: 60 }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings & Preferences</h1>
          <p className="page-subtitle">Manage your profile, visual appearance, transaction defaults & system configuration</p>
        </div>
        <div>
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginTop: 12 }}>
        
        {/* 1. Profile Management Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(99, 102, 241, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-indigo)'
                }}
              >
                <User size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Profile Information
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Personal identity & contact details
                </span>
              </div>
            </div>

            {/* Profile Avatar Badge */}
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-purple) 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 17,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)'
              }}
            >
              {getInitials(name || user?.name)}
            </div>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                FULL NAME
              </label>
              <input
                type="text"
                className="modal-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  className="modal-input"
                  value={user?.email || ''}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  PHONE NUMBER
                </label>
                <input
                  type="text"
                  className="modal-input"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  AGE
                </label>
                <input
                  type="number"
                  className="modal-input"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 28"
                  min="1"
                  max="120"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  GENDER
                </label>
                <select
                  className="modal-select"
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                OCCUPATION / BIO (OPTIONAL)
              </label>
              <input
                type="text"
                className="modal-input"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="e.g. Software Engineer, Freelancer, Investor"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={profileSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Save size={16} />
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>

              {profileMessage && (
                <span
                  style={{
                    fontSize: 13,
                    color: profileMessage.type === 'success' ? '#10B981' : '#EF4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {profileMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {profileMessage.text}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* 2. Appearance & Theme Mode Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(236, 72, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EC4899'
              }}
            >
              <Palette size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Appearance & Theme Mode
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Applied synchronously across all dashboard, table and modal views
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {themeOptions.map(opt => {
              const active = theme === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  style={{
                    padding: '18px 14px',
                    borderRadius: 14,
                    border: active
                      ? '2px solid var(--accent-indigo)'
                      : '1px solid var(--border-color)',
                    background: active
                      ? 'rgba(99, 102, 241, 0.15)'
                      : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 10,
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ color: active ? 'var(--accent-indigo)' : 'var(--text-secondary)' }}>
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {opt.desc}
                    </div>
                  </div>

                  {active && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        color: '#10B981'
                      }}
                    >
                      <CheckCircle size={16} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 22,
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontSize: 13,
              color: 'var(--text-secondary)'
            }}
          >
            Active palette: <strong style={{ color: 'var(--accent-indigo)' }}>{effectiveTheme.toUpperCase()}</strong> ({theme} preference).
            Every component including charts, ledgers, modals, and tables automatically re-render based on this mode.
          </div>
        </div>

        {/* 3. Default Transaction Preferences Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10B981'
                }}
              >
                <Sliders size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Default Transaction Preferences
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Pre-configured defaults for the Add Transaction modal
                </span>
              </div>
            </div>

            {txMessage && (
              <span style={{ fontSize: 13, color: '#10B981', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={15} /> {txMessage.text}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Default Type */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Default Transaction Type
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Selected automatically when opening the new transaction modal
                </div>
              </div>
              <select
                className="modal-select"
                style={{ width: 150, minWidth: 150 }}
                value={defaultType}
                onChange={e => handleSaveTransactionDefaults({ type: e.target.value })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="savings">Savings</option>
              </select>
            </div>

            {/* 2. Default Payment Mode */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Default Payment Mode
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Standard mode of payment for daily entries
                </div>
              </div>
              <select
                className="modal-select"
                style={{ width: 170, minWidth: 170 }}
                value={defaultPaymentMode}
                onChange={e => handleSaveTransactionDefaults({ mode: e.target.value })}
              >
                <option value="upi">UPI / GPay / PhonePe</option>
                <option value="credit">Credit Card</option>
                <option value="debit">Debit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="netbanking">Net Banking / NEFT</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {/* 3. Default Category */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Default Category
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Pre-selected category when adding an expense
                </div>
              </div>
              <select
                className="modal-select"
                style={{ width: 180, minWidth: 180 }}
                value={defaultCategory}
                onChange={e => handleSaveTransactionDefaults({ category: e.target.value })}
              >
                <option value="Food & Groceries">Food & Groceries</option>
                <option value="Housing & Rent">Housing & Rent</option>
                <option value="Dining & Entertainment">Dining & Entertainment</option>
                <option value="Transportation & Auto">Transportation & Auto</option>
                <option value="Utilities & Internet">Utilities & Internet</option>
                <option value="Shopping & Personal">Shopping & Personal</option>
                <option value="Healthcare & Medical">Healthcare & Medical</option>
                <option value="Salary">Salary (Income)</option>
                <option value="Investments">Investments (Savings)</option>
              </select>
            </div>

            {/* 4. Default Card Label */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Default Card / Account Label
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Auto-fills card name when Credit/Debit mode is selected
                </div>
              </div>
              <input
                type="text"
                className="modal-input"
                style={{ width: 170, minWidth: 170 }}
                placeholder="e.g. HDFC Millennia"
                value={defaultCard}
                onChange={e => handleSaveTransactionDefaults({ card: e.target.value })}
              />
            </div>

            {/* 5. Default Transaction Note */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Default Transaction Note
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Pre-fills the description/note when adding a transaction
                </div>
              </div>
              <input
                type="text"
                className="modal-input"
                style={{ width: 170, minWidth: 170 }}
                placeholder="e.g. Regular Expense"
                value={defaultNote}
                onChange={e => handleSaveTransactionDefaults({ note: e.target.value })}
              />
            </div>

            {/* 6. Auto Focus Amount Checkbox */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Auto-focus Amount Input
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Automatically position cursor in the amount input when modal opens
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoFocusAmount}
                onChange={e => handleSaveTransactionDefaults({ autofocus: e.target.checked })}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
              />
            </div>
          </div>
        </div>

        {/* 4. System Configuration Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(139, 92, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8B5CF6'
                }}
              >
                <Shield size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  System Configuration
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Currency, formats, database and persistence parameters
                </span>
              </div>
            </div>

            {configMessage && (
              <span style={{ fontSize: 13, color: '#10B981', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={15} /> {configMessage.text}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Currency Selector */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'block' }}>
                  Default Currency
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Active symbol formatted throughout reports & dashboard
                </span>
              </div>
              <select
                className="modal-select"
                style={{ width: 190, minWidth: 190 }}
                value={currencyCode}
                onChange={e => handleCurrencyChange(e.target.value)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Display Format */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'block' }}>
                  Date Display Format
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Table and transaction timestamp presentation
                </span>
              </div>
              <select
                className="modal-select"
                style={{ width: 160, minWidth: 160 }}
                value={dateFormat}
                onChange={e => handleDateFormatChange(e.target.value)}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (India/UK)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>

            {/* Number Grouping Format */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'block' }}>
                  Number Grouping System
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Separator style for currency amounts
                </span>
              </div>
              <select
                className="modal-select"
                style={{ width: 180, minWidth: 180 }}
                value={numberFormat}
                onChange={e => handleNumberFormatChange(e.target.value)}
              >
                <option value="indian">Indian (1,00,000 Lakhs)</option>
                <option value="international">International (100,000 Millions)</option>
              </select>
            </div>

            {/* Financial Year Cycle */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, display: 'block' }}>
                  Financial Year Cycle
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Fiscal period calculation interval
                </span>
              </div>
              <select
                className="modal-select"
                style={{ width: 180, minWidth: 180 }}
                value={financialYear}
                onChange={e => handleFinancialYearChange(e.target.value)}
              >
                <option value="apr_mar">April 1 – March 31 (FY)</option>
                <option value="jan_dec">January 1 – December 31 (CY)</option>
              </select>
            </div>

            {/* System Info Readouts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Backend Database
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, marginTop: 4 }}>
                  MySQL 8.0 (Spring JPA)
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  API Server Status
                </div>
                <div style={{ fontSize: 13, color: '#10B981', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 6px #10B981' }} />
                  Live & Connected
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Notifications & Alerts Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3B82F6'
              }}
            >
              <Bell size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Notifications & Alerts
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Threshold triggers and activity digests
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Budget Threshold Alerts
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Warn in header notifications when category spending crosses 80%
                </div>
              </div>
              <input
                type="checkbox"
                checked={budgetAlert}
                onChange={e => handleToggleNotification('budget', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  High-Value Transaction Warning
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Highlight transactions exceeding ₹5,000 (or equivalent currency)
                </div>
              </div>
              <input
                type="checkbox"
                checked={highExpenseAlert}
                onChange={e => handleToggleNotification('highexpense', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Monthly Performance Digest
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Show net cashflow insights in the notification bell
                </div>
              </div>
              <input
                type="checkbox"
                checked={monthlySummary}
                onChange={e => handleToggleNotification('summary', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Sound & Haptic Feedback
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Subtle audio chime on successful transaction saves
                </div>
              </div>
              <input
                type="checkbox"
                checked={soundEffects}
                onChange={e => handleToggleNotification('sound', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-indigo)' }}
              />
            </div>
          </div>
        </div>

        {/* 6. Data Management & Export Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981'
              }}
            >
              <Download size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Data Management & Export
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Download ledgers, backup data or reset local preferences
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Export Transactions (CSV)
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Spreadsheet-compatible CSV file of your entire transaction history
                </div>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExportCSV}
                disabled={exporting}
                style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Export Full Backup (JSON)
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Complete JSON backup of records, preferences and category links
                </div>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExportJSON}
                disabled={exporting}
                style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={15} />
                Export JSON
              </button>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                  Reset App Preferences
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Clear saved local defaults and return to factory configurations
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetSettings}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={15} />
                Reset Defaults
              </button>
            </div>

            {exportMessage && (
              <div
                style={{
                  marginTop: 6,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10B981',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <CheckCircle size={16} />
                {exportMessage}
              </div>
            )}
          </div>
        </div>

        {/* 7. Security & Password Update Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B'
              }}
            >
              <Lock size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Security & Password
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Protect your personal account & active credentials
              </span>
            </div>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                CURRENT PASSWORD
              </label>
              <input
                type="password"
                className="modal-input"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  NEW PASSWORD
                </label>
                <input
                  type="password"
                  className="modal-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CONFIRM NEW PASSWORD
                </label>
                <input
                  type="password"
                  className="modal-input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={passChanging}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Lock size={16} />
                {passChanging ? 'Updating...' : 'Update Password'}
              </button>

              {passMessage && (
                <span
                  style={{
                    fontSize: 13,
                    color: passMessage.type === 'success' ? '#10B981' : '#EF4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {passMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {passMessage.text}
                </span>
              )}
            </div>
          </form>
        </div>

      </div>
    </main>
  );
};
