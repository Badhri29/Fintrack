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
  Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { currencyService } from '../services/currencyService';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenProfile?: () => void;
  onGlobalSearch?: (query: string) => void;
}

interface NotificationItem {
  id: number;
  color: string;
  title: string;
  time: string;
}

const TABS = [
  'Dashboard',
  'Budget & Transactions',
  'Credit Cards',
  'Loans & EMI',
  'Settings'
];

const TAB_ICONS: Record<string, React.FC<any>> = {
  'Dashboard': LayoutDashboard,
  'Budget & Transactions': PiggyBank,
  'Credit Cards': CreditCard,
  'Loans & EMI': Coins,
  'Settings': Settings
};

const TAB_SHORT_NAMES: Record<string, string> = {
  'Dashboard': 'Dashboard',
  'Budget & Transactions': 'Budget',
  'Credit Cards': 'Cards',
  'Loans & EMI': 'Loans',
  'Settings': 'Settings'
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, onOpenProfile, onGlobalSearch }) => {
  const { user, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const notifRef = useRef<HTMLDivElement>(null);

  const [profilePhoto, setProfilePhoto] = useState<string>(() => {
    return user?.photo || (typeof window !== 'undefined' ? localStorage.getItem('fintrack_user_photo') || '' : '');
  });

  useEffect(() => {
    if (user?.photo) {
      setProfilePhoto(user.photo);
    }
  }, [user?.photo]);

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const p = e.detail?.photo ?? (localStorage.getItem('fintrack_user_photo') || '');
      setProfilePhoto(p);
    };
    window.addEventListener('fintrack-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('fintrack-profile-updated', handleProfileUpdate);
  }, []);

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
      const res = await api.get('/transactions');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const txs = res.data.data;

        if (txs.length === 0) {
          setNotifications([
            {
              id: 1,
              color: '#3B82F6',
              title: 'No transactions recorded yet in your profile.',
              time: 'Just now'
            }
          ]);
          return;
        }

        const items: NotificationItem[] = txs.slice(0, 5).map((t: any, index: number) => {
          let color = '#3B82F6';
          let prefix = 'Transaction';
          if (t.type === 'expense') {
            color = Number(t.amount) >= 5000 ? '#EF4444' : '#F59E0B';
            prefix = Number(t.amount) >= 5000 ? 'High Expense' : 'Expense';
          } else if (t.type === 'income') {
            color = '#10B981';
            prefix = 'Income Received';
          } else if (t.type === 'savings') {
            color = '#3B82F6';
            prefix = 'Savings Added';
          }

          return {
            id: t.id || index,
            color,
            title: `${prefix}: ${t.category} — ${currencyService.format(Number(t.amount || 0))}`,
            time: t.date || 'Recent'
          };
        });

        setNotifications(items);
      }
    } catch (err) {
      setNotifications([
        {
          id: 1,
          color: '#3B82F6',
          title: 'Welcome to your FinTrack profile!',
          time: 'Active'
        }
      ]);
    }
  };

  const handleToggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      fetchUserData();
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    onGlobalSearch?.(val);
    if (val.trim()) {
      onTabChange('Budget & Transactions');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      onGlobalSearch?.(searchQuery.trim());
      onTabChange('Budget & Transactions');
    }
  };

  const isTabActive = (tab: string) => {
    if (tab === 'Budget & Transactions') {
      return activeTab === 'Budget & Transactions' || activeTab === 'Budget' || activeTab === 'Transactions';
    }
    return activeTab === tab;
  };

  return (
    <>
      <header className="navbar">
      {/* Brand Logo */}
      <div className="brand-logo" onClick={() => onTabChange('Dashboard')} style={{ cursor: 'pointer' }}>
        <div className="brand-icon">
          <Wallet size={20} />
        </div>
        <div>
          <div className="brand-title">FinTrack</div>
          <div className="brand-subtitle">PERSONAL FINANCE</div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="nav-tabs">
        {TABS.map(tab => (
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

        {/* Notification Bell with Dynamic User Data Pop-up */}
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

          {/* Notifications Pop-up Box */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: 320,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                padding: 16,
                zIndex: 999,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Notifications
                </span>
                <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600 }}>
                  Live Data
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
                {notifications.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 12
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
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {item.title}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                        {item.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Badge */}
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
          title="Profile Settings"
        >
          <div className="user-avatar" style={{ overflow: "hidden", padding: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={user?.name || "Profile"}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                onError={() => {
                  setProfilePhoto('');
                }}
              />
            ) : (
              getInitials(user?.name)
            )}
          </div>

          <div className="user-name-text" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {user?.name || 'User'}
            </span>
          </div>

          <ChevronDown size={15} style={{ color: 'var(--text-secondary)' }} />
        </div>

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
    </header>

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

          {/* User Profile Info Card inside Drawer */}
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
                {user?.email || 'user@fintrack.io'}
              </div>
            </div>
            <ChevronDown size={14} style={{ transform: 'rotate(-90deg)', color: 'var(--text-muted)' }} />
          </div>

          {/* Mobile Drawer Search Input */}
          <div className="mobile-drawer-search">
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleSearchKeyDown(e);
                  setIsMobileMenuOpen(false);
                }
              }}
            />
          </div>

          {/* Mobile Drawer Navigation Links */}
          <nav className="mobile-drawer-nav">
            {TABS.map(tab => {
              const Icon = TAB_ICONS[tab] || LayoutDashboard;
              const active = isTabActive(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  className={`mobile-drawer-nav-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    onTabChange(tab);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  <div className="mobile-drawer-nav-icon">
                    <Icon size={18} />
                  </div>
                  <span className="mobile-drawer-nav-label">{tab}</span>
                  {active && <span className="mobile-drawer-nav-indicator" />}
                </button>
              );
            })}
          </nav>

          {/* Mobile Drawer Footer: Logout */}
          <div className="mobile-drawer-footer">
            <button
              type="button"
              className="mobile-drawer-logout-btn"
              onClick={() => {
                setIsMobileMenuOpen(false);
                logout();
              }}
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Mobile Bottom Navigation Bar (Thumb-friendly on phones) */}
    <nav className="mobile-bottom-nav">
      {TABS.map(tab => {
        const Icon = TAB_ICONS[tab] || LayoutDashboard;
        const active = isTabActive(tab);
        const shortLabel = TAB_SHORT_NAMES[tab] || tab;
        return (
          <button
            key={tab}
            type="button"
            className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
            title={tab}
          >
            <div className="mobile-bottom-nav-icon">
              <Icon size={18} />
            </div>
            <span className="mobile-bottom-nav-label">{shortLabel}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
};
