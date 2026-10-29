import React, { useState, useRef, useEffect } from 'react';
import {
  Wallet,
  Search,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  LayoutDashboard,
  PiggyBank,
  CreditCard,
  Coins,
  Calendar,
  Landmark,
  Settings,
  Clock,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { currencyService } from '../services/currencyService';
import { cardService } from '../services/cardService';
import { getUserStorageKey } from '../services/storageHelper';
import { showToast } from './ToastNotification';
import { playNotificationChime } from '../services/soundService';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenProfile?: () => void;
  onGlobalSearch?: (query: string) => void;
}

interface NotificationItem {
  id: number | string;
  color: string;
  title: string;
  time: string;
  type?: 'due' | 'tx';
}

const TABS = [
  'Dashboard',
  'Budget & Transactions',
  'Calendar',
  'Credit Cards',
  'Accounts',
  'Loans & EMI',
  'Access',
  'Settings'
];

const TAB_ICONS: Record<string, React.FC<any>> = {
  'Dashboard': LayoutDashboard,
  'Budget & Transactions': PiggyBank,
  'Calendar': Calendar,
  'Credit Cards': CreditCard,
  'Accounts': Landmark,
  'Loans & EMI': Coins,
  'Access': Users,
  'Settings': Settings
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, onOpenProfile, onGlobalSearch }) => {
  const { user, logout, isAdmin, demoTimeRemaining } = useAuth();
  const isMember = Boolean(user?.isMember || user?.parentUserId);
  const visibleTabs = TABS.filter(t => !((t === 'Access' || t === 'Settings') && isMember));
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifTab, setNotifTab] = useState<'all' | 'dues' | 'transactions'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const notifRef = useRef<HTMLDivElement>(null);

  const [profilePhoto, setProfilePhoto] = useState<string>(() => user?.photo || '');

  useEffect(() => {
    if (user?.photo) {
      setProfilePhoto(user.photo);
    }
  }, [user?.photo]);

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const p = e.detail?.photo ?? user?.photo ?? '';
      setProfilePhoto(p);
    };
    window.addEventListener('fintrack-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('fintrack-profile-updated', handleProfileUpdate);
  }, [user?.photo]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(fetchUserData, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchUserData = async () => {
    try {
      // Fetch all transactions first to accurately calculate dues
      const res = await api.get('/transactions');
      const allTx: any[] = (res.data && res.data.success && Array.isArray(res.data.data)) ? res.data.data : [];

      const dueAlerts: NotificationItem[] = [];
      const today = new Date().getDate();
      const currentMonth = new Date().getMonth();

      let ccDaysBefore = 3;
      let emiDaysBefore = 3;
      let ccAlertEnabled = true;
      let emiAlertEnabled = true;

      try {
        const storedNotifs = localStorage.getItem('fintrack_notif_settings_' + (user?.email || ''));
        if (storedNotifs) {
          const parsed = JSON.parse(storedNotifs);
          if (parsed.ccBillAlertSoftware === false) ccAlertEnabled = false;
          if (parsed.emiAlertSoftware === false) emiAlertEnabled = false;
          if (parsed.ccBillAlertDays !== undefined) ccDaysBefore = Number(parsed.ccBillAlertDays);
          if (parsed.emiAlertDays !== undefined) emiDaysBefore = Number(parsed.emiAlertDays);
        }
      } catch {}

      // Check Credit Cards: ONLY notify if due amount > 0!
      if (ccAlertEnabled) {
        try {
          const cards = cardService.getCards(user?.email);
          cards.forEach((card, idx) => {
            const diff = card.dueDay - today;
            if (diff >= 0 && diff <= ccDaysBefore) {
              // Calculate actual net due for this card
              const cardTx = allTx.filter((t: any) => {
                const mode = (t.paymentMode || '').toLowerCase();
                const cardMatch = (t.card || '').toLowerCase();
                const descMatch = (t.description || '').toLowerCase();
                const cName = card.name.toLowerCase();
                return mode.includes(cName) || cardMatch.includes(cName) || descMatch.includes(cName);
              });

              let spend = 0;
              let paid = 0;
              cardTx.forEach((t: any) => {
                const amt = Number(t.amount) || 0;
                const cat = (t.category || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                if (cat.includes('credit card bill') || desc.includes('bill payment')) {
                  paid += amt;
                } else if (t.type !== 'income') {
                  spend += amt;
                }
              });

              const netDue = Math.max(0, spend - paid);

              // REQUIREMENT: If due amount is 0, DO NOT notify!
              if (netDue <= 0) return;

              const label = diff === 0 ? 'DUE TODAY' : `Due in ${diff} day${diff > 1 ? 's' : ''}`;
              dueAlerts.push({
                id: 9000 + idx,
                color: diff === 0 ? '#EF4444' : '#F59E0B',
                title: `Card Due: ${card.name} (${card.bank}) ${label} on ${card.dueDay}th • Due: ${currencyService.format(netDue)}`,
                time: label,
                type: 'due'
              });

              // Trigger floating toast and chime once per session
              const alertKey = `alert_shown_card_${card.id}_${today}`;
              if (!sessionStorage.getItem(alertKey)) {
                sessionStorage.setItem(alertKey, 'true');
                showToast({
                  type: diff === 0 ? 'error' : 'warning',
                  title: 'Credit Card Bill Due Alert',
                  message: `${card.name} bill (${currencyService.format(netDue)}) is ${label.toLowerCase()} (${card.dueDay}th of this month).`
                });
                playNotificationChime();
              }

              // Send email notification for credit card due (once per day/month)
              const emailSentKey = `email_due_sent_card_${card.id}_${today}_${currentMonth}`;
              if (!localStorage.getItem(emailSentKey)) {
                localStorage.setItem(emailSentKey, 'true');
                api.post('/notifications/card-due-alert', {
                  cardName: card.name,
                  bank: card.bank,
                  dueDay: card.dueDay,
                  dueAmount: netDue,
                  daysRemaining: diff
                }).catch(() => {});
              }
            }
          });
        } catch {}
      }

      // Check Loans & EMI
      if (emiAlertEnabled) {
        try {
          const savedLoans = localStorage.getItem(getUserStorageKey('fintrack_loans_list', user?.email));
          if (savedLoans) {
            const loans = JSON.parse(savedLoans);
            if (Array.isArray(loans)) {
              loans.forEach((loan: any, idx: number) => {
                const dueDay = Number(loan.dueDay) || 5;
                const diff = dueDay - today;
                if (diff >= 0 && diff <= emiDaysBefore) {
                  const label = diff === 0 ? 'DUE TODAY' : `Due in ${diff} day${diff > 1 ? 's' : ''}`;
                  dueAlerts.push({
                    id: 8000 + idx,
                    color: diff === 0 ? '#EF4444' : '#F59E0B',
                    title: `EMI Due: ${loan.name} ${label} on ${dueDay}th`,
                    time: label,
                    type: 'due'
                  });

                  // Trigger floating toast and chime once per session
                  const alertKey = `alert_shown_loan_${loan.id || idx}_${today}`;
                  if (!sessionStorage.getItem(alertKey)) {
                    sessionStorage.setItem(alertKey, 'true');
                    showToast({
                      type: diff === 0 ? 'error' : 'warning',
                      title: 'Loan EMI Due Alert',
                      message: `${loan.name} EMI is ${label.toLowerCase()} (${dueDay}th of this month).`
                    });
                    playNotificationChime();
                  }

                  // Send email notification for loan EMI
                  const loanEmailKey = `email_due_sent_loan_${loan.id || idx}_${today}_${currentMonth}`;
                  if (!localStorage.getItem(loanEmailKey)) {
                    localStorage.setItem(loanEmailKey, 'true');
                    api.post('/notifications/loan-due-alert', {
                      loanName: loan.name,
                      lender: loan.lender,
                      loanNumber: loan.accountNumber || '',
                      emiAmount: Number(loan.emi) || 0,
                      dueDay: dueDay,
                      remainingAmount: Number(loan.remaining) || 0
                    }).catch(() => {});
                  }
                }
              });
            }
          }
        } catch {}
      }

      // Map transactions (up to 40 entries for rich scroll history!)
      let txItems: NotificationItem[] = [];
      if (allTx.length > 0) {
        txItems = allTx.slice(0, 40).map((t: any, index: number) => {
          let color = '#3B82F6';
          if (t.type === 'income') color = '#10B981';
          else if (t.type === 'expense') color = '#EF4444';
          else if (t.type === 'savings') color = '#8B5CF6';

          const formattedAmt = currencyService.format(t.amount);
          const cat = t.category || t.description || 'Transaction';

          return {
            id: t.id || index,
            color,
            title: `${t.type ? t.type.toUpperCase() : 'ENTRY'}: ${formattedAmt} — ${cat}`,
            time: t.date ? new Date(t.date).toLocaleDateString() : 'Recent',
            type: 'tx'
          };
        });
      }

      const finalItems = [...dueAlerts, ...txItems];
      if (finalItems.length === 0) {
        setNotifications([
          {
            id: 1,
            color: '#3B82F6',
            title: 'No pending dues or recent transactions.',
            time: 'Synced',
            type: 'tx'
          }
        ]);
      } else {
        setNotifications(finalItems);
      }
    } catch {
      setNotifications([
        {
          id: 1,
          color: '#10B981',
          title: 'FinTrack System Active & Synced.',
          time: 'Online',
          type: 'tx'
        }
      ]);
    }
  };

  const getInitials = (n?: string) => {
    if (!n) return 'U';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.substring(0, 2).toUpperCase();
  };

  const handleToggleNotifications = () => {
    setShowNotifications(prev => !prev);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (onGlobalSearch) {
        onGlobalSearch(searchQuery);
      }
    }
  };

  const isTabActive = (tab: string) => {
    if (tab === 'Budget & Transactions') {
      return activeTab === 'Budget & Transactions' || activeTab === 'Budget' || activeTab === 'Transactions';
    }
    return activeTab === tab;
  };

  const formattedLastLogin = user?.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  return (
    <header className="navbar">
      {/* Brand Logo & Title */}
      <div className="navbar-brand">
        <div className="brand-logo" onClick={() => onTabChange('Dashboard')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">
            <Wallet size={20} />
          </div>
          <div>
            <div className="brand-title">FinTrack</div>
            <div className="brand-subtitle">PERSONAL FINANCE</div>
          </div>
        </div>
      </div>

      {/* Main Desktop Tabs */}
      <nav className="nav-tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab}
            className={`nav-tab ${isTabActive(tab) ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Right Controls */}
      <div className="nav-controls">
        {/* Search Input */}
        <div className="search-input-wrapper">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="search-input"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {/* Demo Timer Pill (If demo account) */}
        {demoTimeRemaining !== null && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#60A5FA',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Demo session auto-logout timer"
          >
            <Clock size={12} />
            <span>Demo: {Math.floor(demoTimeRemaining / 60)}:{String(demoTimeRemaining % 60).padStart(2, '0')}</span>
          </div>
        )}

        {/* Workspace Member Badge */}
        {(user?.isMember || user?.parentUserId) && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#60A5FA',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title={`Workspace Member: ${user?.memberPermission === 'CAN_EDIT' ? 'Can Edit' : 'View Only'}`}
          >
            <Users size={12} />
            <span>{user?.memberPermission === 'CAN_EDIT' ? 'Member (Edit)' : 'Member (View-only)'}</span>
          </div>
        )}

        {/* Last Login Timeframe Badge (All users) */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          className="last-login-badge"
          title={`Last login: ${formattedLastLogin}`}
        >
          <Clock size={12} style={{ color: 'var(--text-muted)' }} />
          <span>Last: {formattedLastLogin}</span>
        </div>

        {/* Super Admin Quick Portal Toggle */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => onTabChange(activeTab === 'Admin' ? 'Dashboard' : 'Admin')}
            style={{
              background: activeTab === 'Admin' ? 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)' : 'rgba(124, 58, 237, 0.15)',
              border: '1px solid rgba(124, 58, 237, 0.4)',
              color: activeTab === 'Admin' ? '#FFF' : '#C084FC',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: activeTab === 'Admin' ? '0 2px 10px rgba(124, 58, 237, 0.4)' : 'none'
            }}
            title="Switch between App View and Super Admin Portal"
          >
            <ShieldCheck size={14} />
            <span>{activeTab === 'Admin' ? 'App View' : 'Admin'}</span>
          </button>
        )}

        {/* Notification Bell with SOLID Popover (No Transparency / Mirroring Bug) */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            onClick={handleToggleNotifications}
            style={{
              background: showNotifications ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              border: 'none',
              color: showNotifications ? '#3B82F6' : 'var(--text-secondary)',
              cursor: 'pointer',
              position: 'relative',
              padding: 8,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title="Notifications"
          >
            <Bell size={20} />
            <span
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                background: '#3B82F6',
                borderRadius: '50%',
                boxShadow: '0 0 8px #3B82F6'
              }}
            />
          </button>

          {/* SOLID Notifications Pop-up Box */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: 380,
                background: '#131824',
                border: '1px solid #2A364F',
                borderRadius: 14,
                boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
                padding: 16,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E2638', paddingBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                  Notifications &amp; Activity
                </span>
                <span style={{ fontSize: 11, color: '#60A5FA', fontWeight: 700, background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: 6 }}>
                  {notifications.length} Total
                </span>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'all', label: `All (${notifications.length})` },
                  { id: 'dues', label: `Dues (${notifications.filter(n => n.type === 'due').length})` },
                  { id: 'transactions', label: `Transactions (${notifications.filter(n => n.type === 'tx').length})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNotifTab(tab.id as any)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: notifTab === tab.id ? '1px solid #3B82F6' : '1px solid #2A364F',
                      background: notifTab === tab.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: notifTab === tab.id ? '#60A5FA' : '#94A3B8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Container with Custom Scrollbar */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 380,
                  overflowY: 'auto',
                  paddingRight: 4
                }}
              >
                {notifications
                  .filter(n => {
                    if (notifTab === 'dues') return n.type === 'due';
                    if (notifTab === 'transactions') return n.type === 'tx';
                    return true;
                  })
                  .map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        fontSize: 12,
                        background: item.type === 'due' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: item.type === 'due' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)'
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: item.color,
                          marginTop: 4,
                          flexShrink: 0
                        }}
                      />
                      <div style={{ flexGrow: 1 }}>
                        <div style={{ color: '#F8FAFC', fontWeight: 600, lineHeight: 1.4 }}>
                          {item.title}
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>
                          {item.time}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Badge (Click opens ProfileModal directly) */}
        <div
          onClick={onOpenProfile}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 8,
            transition: 'background 0.2s'
          }}
          title="Click to update Profile & Photo"
        >
          <div className="user-avatar" style={{ overflow: "hidden", padding: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={user?.name || "Profile"}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                onError={() => setProfilePhoto('')}
              />
            ) : (
              getInitials(user?.name)
            )}
          </div>

          <div className="user-name-text" style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {user?.name || 'User'}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 4,
              letterSpacing: '0.04em',
              width: 'fit-content',
              background: user?.subscriptionTier === 'ENTERPRISE' ? 'rgba(168, 85, 247, 0.15)' : user?.subscriptionTier === 'PRO' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
              color: user?.subscriptionTier === 'ENTERPRISE' ? '#C084FC' : user?.subscriptionTier === 'PRO' ? '#60A5FA' : '#94A3B8',
              border: `1px solid ${user?.subscriptionTier === 'ENTERPRISE' ? 'rgba(168, 85, 247, 0.3)' : user?.subscriptionTier === 'PRO' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 116, 139, 0.25)'}`
            }}>
              {user?.subscriptionTier || 'FREE'} PLAN
            </span>
          </div>

          <ChevronDown size={15} style={{ color: 'var(--text-secondary)' }} />
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 6
          }}
          title="Log Out"
        >
          <LogOut size={18} />
        </button>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          className="mobile-menu-toggle-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          title={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Navigation Drawer Backdrop & Panel */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div className="brand-logo" onClick={() => { onTabChange('Dashboard'); setIsMobileMenuOpen(false); }} style={{ cursor: 'pointer' }}>
                <div className="brand-icon">
                  <Wallet size={18} />
                </div>
                <div>
                  <div className="brand-title" style={{ fontSize: 17 }}>FinTrack</div>
                  <div className="brand-subtitle">PERSONAL FINANCE</div>
                </div>
              </div>
              <button
                type="button"
                className="mobile-drawer-close-btn"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Profile Card inside Drawer */}
            <div
              className="mobile-drawer-user-card"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenProfile?.();
              }}
              title="Click to view & edit profile"
            >
              <div className="user-avatar" style={{ width: 40, height: 40, overflow: 'hidden', padding: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt={user?.name || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  getInitials(user?.name)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || 'User'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email || 'user@fintrack.app'}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 4,
                    letterSpacing: '0.04em',
                    background: user?.subscriptionTier === 'ENTERPRISE' ? 'rgba(168, 85, 247, 0.15)' : user?.subscriptionTier === 'PRO' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    color: user?.subscriptionTier === 'ENTERPRISE' ? '#C084FC' : user?.subscriptionTier === 'PRO' ? '#60A5FA' : '#94A3B8',
                    border: `1px solid ${user?.subscriptionTier === 'ENTERPRISE' ? 'rgba(168, 85, 247, 0.3)' : user?.subscriptionTier === 'PRO' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 116, 139, 0.25)'}`
                  }}>
                    {user?.subscriptionTier || 'FREE'} PLAN
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Nav Links */}
            <div className="mobile-drawer-links" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {isAdmin && (
                <button
                  type="button"
                  className={`mobile-drawer-link ${activeTab === 'Admin' ? 'active' : ''}`}
                  onClick={() => {
                    onTabChange(activeTab === 'Admin' ? 'Dashboard' : 'Admin');
                    setIsMobileMenuOpen(false);
                  }}
                  style={{
                    color: '#C084FC',
                    background: activeTab === 'Admin' ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={18} />
                  <span>Super Admin Portal</span>
                </button>
              )}

              {visibleTabs.map(tab => {
                const Icon = TAB_ICONS[tab] || LayoutDashboard;
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`mobile-drawer-link ${isTabActive(tab) ? 'active' : ''}`}
                    onClick={() => {
                      onTabChange(tab);
                      setIsMobileMenuOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: 'none',
                      color: isTabActive(tab) ? 'var(--accent-indigo)' : 'var(--text-primary)',
                      background: isTabActive(tab) ? 'var(--nav-tab-active-bg, rgba(99, 102, 241, 0.12))' : 'transparent',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Icon size={18} />
                    <span>{tab}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 24 }}>
              <button
                type="button"
                onClick={logout}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
