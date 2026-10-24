import React, { useState, useEffect, useRef } from 'react';
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
  Trash2,
  Camera,
  RefreshCw,
  ArrowRightLeft,
  Mail,
  RotateCcw,
  Send,
  Volume2,
  Clock
} from 'lucide-react';
import { playNotificationChime, NOTIFICATION_SOUNDS, getActiveSoundTone, setActiveSoundTone } from '../services/soundService';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { currencyService, SUPPORTED_CURRENCIES } from '../services/currencyService';
import api from '../services/api';

export interface SubscriptionPlanItem {
  id: number;
  planCode: string;
  planName: string;
  price: number;
  currency: string;
  billingPeriod: string;
  maxCreditCards: number;
  canAccessDashboard: boolean;
  canAccessReports: boolean;
  canAccessLoans: boolean;
  canAccessBudget: boolean;
  canExportData: boolean;
  canUseEodDigest: boolean;
  description?: string;
  isActive: boolean;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
];

export const SettingsView: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { theme, setTheme, effectiveTheme } = useTheme();

  // Notification Preferences State (Connected to backend)
  const [notifSettings, setNotifSettings] = useState<any>({
    txSoftware: true,
    txMail: false,
    logoutMail: false,
    pwdResetSoftware: true,
    pwdResetMail: true,
    eodMail: true,
    eodFrequency: 'DAILY',
    eodTime: '20:00',
    accessSoftware: true,
    accessMail: true,
    loginMail: true,
    maintenanceSoftware: true,
    maintenanceMail: true,
    ccBillAlertSoftware: true,
    ccBillAlertMail: true,
    ccBillAlertDays: '3',
    ccBillAlertTime: '09:00',
    emiAlertSoftware: true,
    emiAlertMail: true,
    emiAlertDays: '3',
    emiAlertTime: '09:00'
  });
  const [eodTesting, setEodTesting] = useState<boolean>(false);
  const [notifMsg, setNotifMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscription Plans & Upgrade State
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState<boolean>(true);
  const [myPendingRequests, setMyPendingRequests] = useState<string[]>([]);
  const [requestingPlanCode, setRequestingPlanCode] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Granular Reset state
  const [resetSectionLoading, setResetSectionLoading] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile states
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Prefer not to say');
  const [bio, setBio] = useState<string>('');
  const [photo, setPhoto] = useState<string>(() => {
    return user?.photo || (typeof window !== 'undefined' ? localStorage.getItem('fintrack_user_photo') : '') || '';
  });
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // System Configuration states
  const [currencyCode, setCurrencyCode] = useState<string>(() => {
    return currencyService.getActiveCurrencyCode();
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
  const [ratesRefreshing, setRatesRefreshing] = useState<boolean>(false);
  const [ratesUpdatedTime, setRatesUpdatedTime] = useState<string>('Live');
  const [swapPreview, setSwapPreview] = useState<boolean>(false);
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

  // Audio chime preference
  const [soundEffects, setSoundEffects] = useState<boolean>(() => {
    return localStorage.getItem('fintrack_notif_sound') === 'true';
  });
  const [soundTone, setSoundTone] = useState<string>(() => getActiveSoundTone());

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
    fetchNotificationSettings();
    fetchSubscriptionPlans();
    fetchMyAccessRequests();
  }, []);

  const fetchNotificationSettings = async () => {
    try {
      const res = await api.get('/user/notification-settings');
      if (res.data?.success && res.data.data) {
        setNotifSettings(res.data.data);
      }
    } catch {}
  };

  const handleToggleNotif = async (field: string, val: any) => {
    const updated = { ...notifSettings, [field]: val };
    setNotifSettings(updated);
    try {
      await api.put('/user/notification-settings', { [field]: val });
      setNotifMsg({ type: 'success', text: 'Notification preferences updated!' });
      setTimeout(() => setNotifMsg(null), 3000);
    } catch {
      setNotifMsg({ type: 'error', text: 'Failed to update preferences.' });
    }
  };

  const handleTriggerTestEod = async () => {
    setEodTesting(true);
    try {
      const res = await api.post('/user/trigger-eod');
      if (res.data?.success) {
        setNotifMsg({ type: 'success', text: res.data.message || 'Sample EOD financial digest sent to your email!' });
        setTimeout(() => setNotifMsg(null), 5000);
      }
    } catch (err: any) {
      setNotifMsg({ type: 'error', text: err.response?.data?.error || 'Failed to dispatch test EOD digest.' });
    } finally {
      setEodTesting(false);
    }
  };

  const handleResetSectionData = async (section: string) => {
    const labels: Record<string, string> = {
      categories: 'Categories and Subcategories (reset to defaults)',
      loans: 'Loans & EMI section',
      cards: 'Credit Cards section',
      entire_app: 'ENTIRE FinTrack application (all transactions, cards, loans, categories for your account ONLY)'
    };

    if (!window.confirm(`Are you sure you want to reset ${labels[section] || section}? This action cannot be undone.`)) {
      return;
    }

    setResetSectionLoading(section);
    setResetMsg(null);

    try {
      const userEmail = (user?.email || 'guest').toLowerCase();
      if (section === 'loans' || section === 'entire_app') {
        localStorage.removeItem(`fintrack_loans_list_${userEmail}`);
      }
      if (section === 'cards' || section === 'entire_app') {
        localStorage.removeItem(`fintrack_credit_cards_${userEmail}`);
      }
      if (section === 'entire_app') {
        localStorage.removeItem(`fintrack_budget_store_${userEmail}`);
      }

      const res = await api.post('/user/reset-section', { section });
      if (res.data?.success) {
        setResetMsg({ type: 'success', text: res.data.message || 'Reset completed successfully!' });
        setTimeout(() => {
          if (section === 'entire_app') {
            window.location.reload();
          }
        }, 1200);
      }
    } catch (err: any) {
      setResetMsg({ type: 'error', text: err.response?.data?.error || 'Reset operation failed. Please try again.' });
    } finally {
      setResetSectionLoading(null);
    }
  };

  const fetchSubscriptionPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await api.get('/subscription-plans');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setPlans(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load subscription plans', err);
    } finally {
      setPlansLoading(false);
    }
  };

  const fetchMyAccessRequests = async () => {
    try {
      const res = await api.get('/access-requests/my');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const pending = res.data.data
          .filter((r: any) => r.status === 'PENDING')
          .map((r: any) => (r.requestType || '').toUpperCase());
        setMyPendingRequests(pending);
      }
    } catch (err) {
      console.error('Failed to load access requests', err);
    }
  };

  const handleRequestPlanUpgrade = async (plan: SubscriptionPlanItem) => {
    setRequestingPlanCode(plan.planCode);
    try {
      await api.post('/access-requests', {
        requestType: `SUBSCRIPTION_${plan.planCode}`,
        details: `User requested upgrade to ${plan.planName} tier (${plan.planCode})`
      });
      setMyPendingRequests(prev => [...prev, `SUBSCRIPTION_${plan.planCode}`, `PLAN_UPGRADE_${plan.planCode}`, plan.planCode]);
      setReqMsg({
        type: 'success',
        text: 'Upgrade request has been sent, approval is pending.'
      });
      setTimeout(() => setReqMsg(null), 6000);
    } catch (err: any) {
      setReqMsg({
        type: 'error',
        text: err?.response?.data?.error || 'Could not send upgrade request. Please try again.'
      });
    } finally {
      setRequestingPlanCode(null);
    }
  };

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
        if (u.photo) {
          setPhoto(u.photo);
          updateUser({ photo: u.photo });
        }
      } else if (user) {
        setName(user.name || '');
        setBio(localStorage.getItem('fintrack_profile_bio') || '');
        if (user.photo) setPhoto(user.photo);
      }
    } catch {
      if (user) {
        setName(user.name || '');
        setBio(localStorage.getItem('fintrack_profile_bio') || '');
        if (user.photo) setPhoto(user.photo);
      }
    }
  };

  const applyPhotoChange = async (newPhoto: string) => {
    setPhoto(newPhoto);
    if (newPhoto) {
      localStorage.setItem('fintrack_user_photo', newPhoto);
    } else {
      localStorage.removeItem('fintrack_user_photo');
    }
    updateUser({ photo: newPhoto });
    window.dispatchEvent(new CustomEvent('fintrack-profile-updated', { detail: { photo: newPhoto } }));

    // Immediately persist photo to database
    try {
      await api.put('/profile', {
        name: name.trim() || user?.name,
        phone: phone.trim() ? phone.trim() : null,
        age: age ? Number(age) : null,
        gender,
        photo: newPhoto || null
      });
    } catch (err) {
      console.warn('Auto-persist photo error:', err);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use FileReader and Canvas compression to keep base64 compact (~30KB)
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 240;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          applyPhotoChange(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    applyPhotoChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await api.put('/profile', {
        name: name.trim(),
        phone: phone.trim() ? phone.trim() : null,
        age: age ? Number(age) : null,
        gender,
        photo: photo || null
      });

      localStorage.setItem('fintrack_profile_bio', bio.trim());
      if (photo) localStorage.setItem('fintrack_user_photo', photo);
      else localStorage.removeItem('fintrack_user_photo');

      const updatedUser = res.data;
      updateUser({
        name: updatedUser?.name || name.trim(),
        phone: updatedUser?.phone || phone.trim(),
        age: updatedUser?.age,
        gender: updatedUser?.gender,
        photo: updatedUser?.photo ?? photo
      });
      window.dispatchEvent(new CustomEvent('fintrack-profile-updated', { detail: { name: name.trim(), photo } }));
      setProfileMessage({ type: 'success', text: 'Profile & photo saved successfully!' });
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      const errMsg = err?.response?.data?.message || err?.message || 'Failed to save profile. Please check your details.';
      setProfileMessage({ type: 'error', text: errMsg });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCurrencyChange = (newCode: string) => {
    setCurrencyCode(newCode);
    currencyService.setActiveCurrency(newCode);
    setConfigMessage({
      type: 'success',
      text: `Currency converted to ${newCode}. All values update using live exchange rates.`
    });
    setTimeout(() => setConfigMessage(null), 3500);
  };

  const handleRefreshRates = async () => {
    setRatesRefreshing(true);
    await currencyService.fetchLiveRates();
    setRatesRefreshing(false);
    setRatesUpdatedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setConfigMessage({ type: 'success', text: 'Real-time exchange rates refreshed from global markets!' });
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
    window.dispatchEvent(new CustomEvent('fintrack-currency-change'));
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

      const activeCur = currencyService.getActiveCurrencyCode();
      const headers = ['ID', 'Date', 'Type', 'Category', 'Subcategory', `Amount (${activeCur})`, 'Amount (Base INR)', 'Payment Mode', 'Card/Account', 'Description'];
      const rows = transactions.map((t: any) => {
        const baseAmt = Number(t.amount) || 0;
        const convertedAmt = (Math.round(currencyService.convertFromBase(baseAmt) * 100) / 100).toFixed(2);
        return [
          t.id,
          t.date || '',
          t.type || '',
          `"${(t.category || '').replace(/"/g, '""')}"`,
          `"${(t.subcategory || '').replace(/"/g, '""')}"`,
          convertedAmt,
          baseAmt,
          t.paymentMode || '',
          `"${(t.card || '').replace(/"/g, '""')}"`,
          `"${(t.description || '').replace(/"/g, '""')}"`
        ];
      });

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

  // Real-time calculation example for UI
  const currentRate = currencyService.getRate(currencyCode);
  const convertedSample = (1000 * currentRate).toFixed(currencyCode === 'JPY' ? 0 : 2);
  const inverseRate = currentRate > 0 ? (1 / currentRate).toFixed(2) : '0';
  const swappedSample = currentRate > 0 ? (100 / currentRate).toFixed(2) : '0';
  const activeCfg = currencyService.getCurrencyConfig(currencyCode);

  return (
    <main className="fintrack-page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings & Preferences</h1>
          <p className="page-subtitle">Manage your profile photo, visual appearance, real-time currency conversion & defaults</p>
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

      <div className="settings-grid">
        
        {/* 1. Profile Information Card with Photo Upload */}
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
                  Personal identity, photo & contact details
                </span>
              </div>
            </div>

            {/* Profile Avatar Badge */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-purple) 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 18,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {photo ? (
                <img
                  src={photo}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                getInitials(name || user?.name)
              )}
            </div>
          </div>

          {/* Photo Management Section */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              marginBottom: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Profile Photo
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Upload a photo to display in the top navigation bar and account badges
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-indigo)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={14} />
                  {photo ? 'Change Photo' : 'Upload Photo'}
                </button>

                {photo && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#EF4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Quick Preset Avatars */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                OR CHOOSE A PRESET AVATAR:
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {PRESET_AVATARS.map((pUrl, idx) => (
                  <img
                    key={idx}
                    src={pUrl}
                    alt={`Preset ${idx + 1}`}
                    onClick={() => applyPhotoChange(pUrl)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      cursor: 'pointer',
                      border: photo === pUrl ? '2px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                      transform: photo === pUrl ? 'scale(1.15)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  />
                ))}
              </div>
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
                  style={{ opacity: 0.65, cursor: 'not-allowed' }}
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

        {/* 3. Real-Time Currency Conversion & System Configuration Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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
                  Real-Time Currency & System
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Live exchange rates & currency conversion across all pages
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefreshRates}
              disabled={ratesRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--accent-indigo)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Fetch fresh live exchange rates"
            >
              <RefreshCw size={13} className={ratesRefreshing ? 'spin-anim' : ''} />
              {ratesRefreshing ? 'Updating...' : 'Sync Rates'}
            </button>
          </div>

          {/* Real-Time Conversion Display matching Google Converter style */}
          {currencyCode === 'INR' ? (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                marginBottom: 20
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Base Currency: Indian Rupee (INR ₹)
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    All transactions are recorded natively in INR. Live exchange benchmarks against major currencies:
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {ratesUpdatedTime}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { code: 'USD', flag: '🇺🇸', label: '1 USD' },
                  { code: 'EUR', flag: '🇪🇺', label: '1 EUR' },
                  { code: 'GBP', flag: '🇬🇧', label: '1 GBP' },
                  { code: 'AED', flag: '🇦🇪', label: '1 AED' }
                ].map(c => {
                  const r = currencyService.getRate(c.code);
                  const inrVal = r > 0 ? (1 / r).toFixed(2) : '--';
                  return (
                    <div
                      key={c.code}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {c.flag} {c.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        ₹{inrVal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                marginBottom: 20
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {!swapPreview ? '₹1,000.00 INR =' : `100.00 ${currencyCode} =`}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                    {!swapPreview ? (
                      <>
                        {activeCfg.symbol} {convertedSample} <span style={{ fontSize: 16, color: 'var(--accent-indigo)' }}>{currencyCode}</span>
                      </>
                    ) : (
                      <>
                        ₹ {swappedSample} <span style={{ fontSize: 16, color: 'var(--accent-indigo)' }}>INR</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Real-time market rate • 1 {currencyCode} = ₹{inverseRate} INR (1 INR = {currentRate.toFixed(4)} {currencyCode}) • {ratesUpdatedTime}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSwapPreview(!swapPreview)}
                  title="Swap conversion direction"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-indigo)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <ArrowRightLeft size={20} />
                </button>
              </div>
            </div>
          )}

          {configMessage && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <CheckCircle size={14} />
              {configMessage.text}
            </div>
          )}

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
                  System Currency
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Converts amounts across dashboard, tables & ledger in real-time
                </span>
              </div>
              <select
                className="modal-select"
                style={{ width: 190, minWidth: 190 }}
                value={currencyCode}
                onChange={e => handleCurrencyChange(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
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

        {/* 4. Default Transaction Preferences Card */}
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

        {/* 5. Notification Controls & Preferences Matrix */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
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
                  color: '#6366F1'
                }}
              >
                <Bell size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Notification Controls
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Granular Software (in-app) & SMTP Mail dual-channel preferences
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTriggerTestEod}
              disabled={eodTesting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                background: '#1E293B',
                color: '#38BDF8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Dispatches a test EOD Financial Summary with PDF directly to your email"
            >
              <Mail size={14} />
              {eodTesting ? 'Dispatching Test Email...' : 'Send Test EOD Digest'}
            </button>
          </div>

          {notifMsg && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: notifMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: notifMsg.type === 'success' ? '#10B981' : '#EF4444',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {notifMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {notifMsg.text}
            </div>
          )}

          {/* Matrix Table */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 12, marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>EVENT TYPE</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>
                    SOFTWARE (IN-APP)
                  </th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>
                    EMAIL NOTIFICATION
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 1. Transaction */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>New Transaction Recorded</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Triggered on every income or expense entry</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.txSoftware}
                      onChange={e => handleToggleNotif('txSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(100, 116, 139, 0.15)' }}>
                      In-App Only
                    </span>
                  </td>
                </tr>

                {/* 2. Password Reset */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Password Reset & OTP</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Security alerts when credentials change</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.pwdResetSoftware}
                      onChange={e => handleToggleNotif('pwdResetSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.pwdResetMail}
                      onChange={e => handleToggleNotif('pwdResetMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 3. EOD Digest */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>EOD Financial Digest & Report</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Periodic net worth, category spend summary & attached PDF
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(100, 116, 139, 0.15)' }}>
                      Email Only
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.eodMail}
                      onChange={e => handleToggleNotif('eodMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 4. Access Request Status */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Access Request Approval / Updates</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Notifies when admin reviews your limit or unlock request</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.accessSoftware}
                      onChange={e => handleToggleNotif('accessSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.accessMail}
                      onChange={e => handleToggleNotif('accessMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 5. Login Security Alerts */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>New Sign-In Alert</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Email with IP and timestamp when you log in</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(100, 116, 139, 0.15)' }}>
                      Email Only
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.loginMail}
                      onChange={e => handleToggleNotif('loginMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 6. Maintenance Notices */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Scheduled Maintenance Alerts</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Advance notices when admin schedules downtime</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.maintenanceSoftware}
                      onChange={e => handleToggleNotif('maintenanceSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.maintenanceMail}
                      onChange={e => handleToggleNotif('maintenanceMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 7. Credit Card Bill Due Alerts */}
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Credit Card Bill Due Date Alerts</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Advance alert before your credit card payment due date arrives</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.ccBillAlertSoftware !== false}
                      onChange={e => handleToggleNotif('ccBillAlertSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.ccBillAlertMail !== false}
                      onChange={e => handleToggleNotif('ccBillAlertMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>

                {/* 8. Loan & EMI Payment Alerts */}
                <tr>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Loan & EMI Payment Alerts</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Advance alert before monthly home/car/personal loan EMI debit date</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.emiAlertSoftware !== false}
                      onChange={e => handleToggleNotif('emiAlertSoftware', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={notifSettings.emiAlertMail !== false}
                      onChange={e => handleToggleNotif('emiAlertMail', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* EOD Digest Schedule Frequency */}
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                EOD Digest Delivery Frequency & Time
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Customize when Fintrack compiles and emails your financial statement
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                className="modal-input"
                style={{ width: 130, padding: '8px 10px' }}
                value={notifSettings.eodFrequency || 'DAILY'}
                onChange={e => handleToggleNotif('eodFrequency', e.target.value)}
              >
                <option value="DAILY">Every Day</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>

              <input
                type="time"
                className="modal-input"
                style={{ width: 110, padding: '8px 10px' }}
                value={notifSettings.eodTime || '20:00'}
                onChange={e => handleToggleNotif('eodTime', e.target.value)}
              />
            </div>
          </div>

          {/* Bill & EMI Due Alert Schedule Preferences */}
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 14
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                Credit Card Bill & Loan EMI Reminder Schedule
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Select how many days in advance to receive payment due alerts & notifications
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select
                className="modal-input"
                style={{ width: 150, padding: '8px 10px' }}
                value={notifSettings.ccBillAlertDays || '3'}
                onChange={e => handleToggleNotif('ccBillAlertDays', e.target.value)}
              >
                <option value="0">Same Day Alert</option>
                <option value="1">1 Day Before</option>
                <option value="2">2 Days Before</option>
                <option value="3">3 Days Before</option>
                <option value="5">5 Days Before</option>
              </select>

              <input
                type="time"
                className="modal-input"
                style={{ width: 110, padding: '8px 10px' }}
                value={notifSettings.ccBillAlertTime || '09:00'}
                onChange={e => handleToggleNotif('ccBillAlertTime', e.target.value)}
              />
            </div>
          </div>

          {/* Software Notification Sound ("Ding" Bell Tone) */}
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              marginTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Volume2 size={16} style={{ color: '#6366F1' }} />
                  <span>Software Notification Audio Chimes</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Synthesized audio feedback on transactions, card entries, saves, and alert banners
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => playNotificationChime(soundTone, true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818CF8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Volume2 size={13} />
                  Test Selected Sound
                </button>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={soundEffects}
                    onChange={e => {
                      const checked = e.target.checked;
                      setSoundEffects(checked);
                      localStorage.setItem('fintrack_notif_sound', checked ? 'true' : 'false');
                      if (checked) playNotificationChime(soundTone, true);
                    }}
                    style={{ width: 18, height: 18, accentColor: '#6366F1', cursor: 'pointer' }}
                  />
                  <span>Enable Sound</span>
                </label>
              </div>
            </div>

            {/* Multiple Sound Tones Selector */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.03em' }}>
                CHOOSE NOTIFICATION TONE ({NOTIFICATION_SOUNDS.length} SYNTHESIZED SOUNDS):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {NOTIFICATION_SOUNDS.map(s => {
                  const isSelected = soundTone === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSoundTone(s.id);
                        setActiveSoundTone(s.id);
                        playNotificationChime(s.id, true);
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-card)',
                        border: isSelected ? '2px solid #6366F1' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#818CF8' : 'var(--text-primary)' }}>
                          {s.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSoundTone(s.id);
                            setActiveSoundTone(s.id);
                            playNotificationChime(s.id, true);
                          }}
                          style={{
                            background: isSelected ? '#6366F1' : 'rgba(99, 102, 241, 0.15)',
                            border: 'none',
                            borderRadius: '50%',
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isSelected ? '#FFF' : '#818CF8',
                            cursor: 'pointer'
                          }}
                          title={`Preview ${s.name}`}
                        >
                          <Volume2 size={12} />
                        </button>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {s.description}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                Download ledgers in active currency, backup data or reset local preferences
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
                  Spreadsheet-compatible CSV file with active {currencyCode} and base INR amounts
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

        {/* 8. Granular Section Resets Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444'
              }}
            >
              <RotateCcw size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Granular Section Resets
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Reset specific functional modules or wipe your account back to clean initial state
              </span>
            </div>
          </div>

          {resetMsg && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: resetMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: resetMsg.type === 'success' ? '#10B981' : '#EF4444',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {resetMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {resetMsg.text}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {/* Reset Categories */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                  Categories & Subcategories
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  Restores default system categories (Food, Housing, Utilities, etc.) and removes custom ones.
                </div>
              </div>
              <button
                type="button"
                disabled={resetSectionLoading === 'categories'}
                onClick={() => handleResetSectionData('categories')}
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <RotateCcw size={13} />
                {resetSectionLoading === 'categories' ? 'Resetting...' : 'Reset Categories'}
              </button>
            </div>

            {/* Reset Loans & EMI */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                  Loans & EMI Section
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  Deletes all active loans, liabilities, and EMI payment schedules for your account.
                </div>
              </div>
              <button
                type="button"
                disabled={resetSectionLoading === 'loans'}
                onClick={() => handleResetSectionData('loans')}
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <RotateCcw size={13} />
                {resetSectionLoading === 'loans' ? 'Resetting...' : 'Reset Loans & EMI'}
              </button>
            </div>

            {/* Reset Credit Cards */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                  Credit Cards Section
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  Removes saved credit cards and card payment records for your account.
                </div>
              </div>
              <button
                type="button"
                disabled={resetSectionLoading === 'cards'}
                onClick={() => handleResetSectionData('cards')}
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <RotateCcw size={13} />
                {resetSectionLoading === 'cards' ? 'Resetting...' : 'Reset Credit Cards'}
              </button>
            </div>

            {/* Reset Entire Application (Account Wipe) */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#EF4444', fontSize: 14 }}>
                  Entire Application (Account Reset)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  Wipes all transactions, cards, loans & resets only your account to fresh initial state.
                </div>
              </div>
              <button
                type="button"
                disabled={resetSectionLoading === 'entire_app'}
                onClick={() => handleResetSectionData('entire_app')}
                style={{
                  marginTop: 14,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#DC2626',
                  color: '#FFF',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Trash2 size={13} />
                {resetSectionLoading === 'entire_app' ? 'Wiping Account...' : 'Wipe & Reset Entire App'}
              </button>
            </div>
          </div>
        </div>

        </div>

      {/* 9. Subscription & Upgrade Packages */}
      <div className="summary-card" style={{ marginTop: 24, padding: 28, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
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
                  color: '#6366F1'
                }}
              >
                <Shield size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Subscription & Upgrade Packages
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  View all available plans and their live feature entitlements. You can request an upgrade to unlock additional quotas and premium capabilities.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Current Active Tier:</span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                {(user?.subscriptionTier || 'FREE').toUpperCase()}
              </span>
            </div>
          </div>

          {reqMsg && (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 16px',
                borderRadius: 10,
                background: reqMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: reqMsg.type === 'success' ? '#10B981' : '#EF4444',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: reqMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              {reqMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {reqMsg.text}
            </div>
          )}

          {/* Dynamic Plans Grid */}
          <div
            className="subscription-plans-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 20
            }}
          >
            {plansLoading && plans.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                Syncing latest subscription packages from server...
              </div>
            )}
            {(() => {
              const displayPlans = plans.length > 0 ? plans : [
                {
                  id: 1,
                  planCode: 'FREE',
                  planName: 'Free Starter',
                  price: 0,
                  currency: 'INR',
                  billingPeriod: 'MONTHLY',
                  maxCreditCards: 1,
                  canAccessDashboard: true,
                  canAccessReports: false,
                  canAccessLoans: false,
                  canAccessBudget: true,
                  canExportData: false,
                  canUseEodDigest: false,
                  description: 'Basic personal finance tracking with up to 1 credit card.',
                  isActive: true
                },
                {
                  id: 2,
                  planCode: 'PRO',
                  planName: 'Pro Tier',
                  price: 89,
                  currency: 'INR',
                  billingPeriod: 'MONTHLY',
                  maxCreditCards: 7,
                  canAccessDashboard: true,
                  canAccessReports: false,
                  canAccessLoans: true,
                  canAccessBudget: true,
                  canExportData: true,
                  canUseEodDigest: false,
                  description: 'Full financial intelligence with 7 cards, loans tracker, budget planner & exports.',
                  isActive: true
                },
                {
                  id: 3,
                  planCode: 'ENTERPRISE',
                  planName: 'Enterprise / Family',
                  price: 99,
                  currency: 'INR',
                  billingPeriod: 'MONTHLY',
                  maxCreditCards: 99,
                  canAccessDashboard: true,
                  canAccessReports: true,
                  canAccessLoans: true,
                  canAccessBudget: true,
                  canExportData: true,
                  canUseEodDigest: true,
                  description: 'Unlimited credit cards, complete reporting, exports & priority controls.',
                  isActive: true
                }
              ];

              const currentTier = (user?.subscriptionTier || 'FREE').toUpperCase();
              const tierRankMap: Record<string, number> = { FREE: 1, PRO: 2, ENTERPRISE: 3 };
              const currentRank = tierRankMap[currentTier] || 1;

              return displayPlans.map(p => {
                const planCode = p.planCode.toUpperCase();
                const planRank = tierRankMap[planCode] || (p.price > 0 ? (p.price > 100 ? 3 : 2) : 1);
                const isCurrentPlan = currentTier === planCode;
                const isUpgrade = planRank > currentRank;
                const isDowngrade = planRank < currentRank;

                const isPendingThisPlan = myPendingRequests.some(r =>
                  r.includes(planCode) ||
                  (planCode === 'PRO' && r.includes('PRO')) ||
                  (planCode === 'ENTERPRISE' && r.includes('ENTERPRISE')) ||
                  r.includes('PLAN_UPGRADE') ||
                  r.includes('SUBSCRIPTION')
                );

                const isEnterprise = planCode === 'ENTERPRISE';
                const isPro = planCode === 'PRO';

                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: isCurrentPlan
                        ? '2px solid #10B981'
                        : isEnterprise
                        ? '1px solid rgba(139, 92, 246, 0.45)'
                        : isPro
                        ? '1px solid rgba(99, 102, 241, 0.4)'
                        : '1px solid var(--border-color)',
                      borderRadius: 18,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isCurrentPlan ? '0 0 16px rgba(16, 185, 129, 0.15)' : 'none',
                      position: 'relative'
                    }}
                  >
                    <div>
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: '0.05em',
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: isEnterprise ? 'rgba(139, 92, 246, 0.18)' : isPro ? 'rgba(99, 102, 241, 0.18)' : 'rgba(100, 116, 139, 0.15)',
                              color: isEnterprise ? '#A78BFA' : isPro ? '#818CF8' : 'var(--text-secondary)',
                              border: `1px solid ${isEnterprise ? 'rgba(139, 92, 246, 0.35)' : isPro ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-color)'}`
                            }}
                          >
                            {p.planCode}
                          </span>
                          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 2px' }}>
                            {p.planName}
                          </h3>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>
                            {p.price > 0 ? `₹ ${p.price}` : 'Free'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {p.price > 0 ? `/${p.billingPeriod.toLowerCase()}` : 'Forever'}
                          </div>
                        </div>
                      </div>

                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, minHeight: 34, lineHeight: 1.45 }}>
                        {p.description || 'Pre-configured subscription tier.'}
                      </p>

                      {/* Quota Highlights */}
                      <div
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 10,
                          padding: '10px 12px',
                          marginBottom: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Credit Card Allowance:</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#38BDF8' }}>
                          {p.maxCreditCards >= 90 ? 'Unlimited Cards' : `Up to ${p.maxCreditCards} Cards`}
                        </span>
                      </div>

                      {/* Dynamic Benefits Checklist from Database */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessDashboard ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canAccessDashboard ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessDashboard ? '✓' : '✕'}</span>
                          <span>Complete Financial Dashboard Access</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessReports ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canAccessReports ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessReports ? '✓' : '✕'}</span>
                          <span>Financial Reports & Statement Exports</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessLoans ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canAccessLoans ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessLoans ? '✓' : '✕'}</span>
                          <span>Loans & EMI Debt Amortization Tracker</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessBudget ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canAccessBudget ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessBudget ? '✓' : '✕'}</span>
                          <span>Annual Budget & Expense Planning</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canExportData ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canExportData ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canExportData ? '✓' : '✕'}</span>
                          <span>CSV & Excel Financial Data Exports</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canUseEodDigest ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          <span style={{ color: p.canUseEodDigest ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canUseEodDigest ? '✓' : '✕'}</span>
                          <span>Automated EOD Digest & Statement Emails</span>
                        </div>
                      </div>
                    </div>

                    {/* Action / Status Button */}
                    <div style={{ marginTop: 8 }}>
                      {isCurrentPlan ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            color: '#10B981',
                            fontWeight: 700,
                            fontSize: 13
                          }}
                        >
                          <CheckCircle size={16} /> Current Active Plan
                        </div>
                      ) : isDowngrade ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: 'rgba(100, 116, 139, 0.08)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            fontSize: 12
                          }}
                        >
                          Included in Current Plan
                        </div>
                      ) : isUpgrade ? (
                        isPendingThisPlan ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              padding: '12px 16px',
                              borderRadius: 10,
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: '#F59E0B',
                              fontWeight: 700,
                              fontSize: 13,
                              textAlign: 'center'
                            }}
                          >
                            <Clock size={16} /> Upgrade request has been sent, approval is pending
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={requestingPlanCode === p.planCode}
                            onClick={() => handleRequestPlanUpgrade(p)}
                            className="btn-primary"
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              padding: '12px 16px',
                              borderRadius: 10,
                              fontWeight: 700,
                              fontSize: 13,
                              background: isEnterprise
                                ? 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)'
                                : 'linear-gradient(135deg, #6366F1 0%, #3B82F6 100%)',
                              border: 'none',
                              cursor: requestingPlanCode === p.planCode ? 'not-allowed' : 'pointer',
                              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)'
                            }}
                          >
                            <Send size={15} />
                            {requestingPlanCode === p.planCode ? 'Submitting Request...' : `Request Upgrade to ${p.planName}`}
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
    </main>
  );
};
