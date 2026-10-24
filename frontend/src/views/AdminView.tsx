import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  CheckCircle,
  UserPlus,
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  RotateCcw,
  LogOut,
  CreditCard,
  Mail,
  Activity,
  X,
  TrendingUp,
  KeyRound,
  Copy,
  Check,
  Sliders,
  Trash2,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

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
import api from '../services/api';
import { useAuth, type User } from '../context/AuthContext';

interface AdminViewProps {}

interface AccessRequestItem {
  id: number;
  userId: number;
  userEmail: string;
  userName?: string;
  requestType: string;
  details?: string;
  status: string; // PENDING, APPROVED, REJECTED
  adminNote?: string;
  createdAt: string;
}

interface ActivityLogItem {
  id: number;
  userId: number;
  userEmail: string;
  action: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export const AdminView: React.FC<AdminViewProps> = () => {
  const { logout } = useAuth();
  const { theme, setTheme, effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';

  // Navigation
  const [activeTab, setActiveTab] = useState<'accounts' | 'plans' | 'requests' | 'maintenance' | 'logs' | 'deepdive'>('accounts');

  // Subscription plans state
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<SubscriptionPlanItem | null>(null);
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState<boolean>(false);

  // Temporary password modal state
  const [selectedUserForTempPass, setSelectedUserForTempPass] = useState<User | null>(null);
  const [tempPassDuration, setTempPassDuration] = useState<number>(15);
  const [tempPassLoading, setTempPassLoading] = useState<boolean>(false);
  const [generatedTempPass, setGeneratedTempPass] = useState<{
    tempPassword: string;
    expiresAt: string;
    durationMinutes: number;
    copied?: boolean;
  } | null>(null);

  // User list state
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Access Requests state
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>([]);

  // Activity logs & Live stream state
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [liveFeedLogs, setLiveFeedLogs] = useState<ActivityLogItem[]>([]);
  const [selectedFeedUser, setSelectedFeedUser] = useState<User | null>(null);

  // System Controls: Default Plan & Inactivity Timeout
  const [defaultPlan, setDefaultPlan] = useState<string>('FREE');
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(15);

  // Maintenance state
  const [maintenanceActive, setMaintenanceActive] = useState<boolean>(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('Scheduled system maintenance underway.');
  const [maintenanceStart, setMaintenanceStart] = useState<string>('');
  const [maintenanceEnd, setMaintenanceEnd] = useState<string>('');
  const [savingMaintenance, setSavingMaintenance] = useState<boolean>(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [selectedUserForLock, setSelectedUserForLock] = useState<User | null>(null);
  const [selectedUserForTier, setSelectedUserForTier] = useState<User | null>(null);
  const [selectedUserForDeepDive, setSelectedUserForDeepDive] = useState<User | null>(null);
  const [deepDiveData, setDeepDiveData] = useState<any>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState<boolean>(false);

  // Form states for Create User
  const [newEmail, setNewEmail] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('USER');
  const [newTier, setNewTier] = useState<string>('FREE');

  // Form states for Lock Control
  const [lockType, setLockType] = useState<string>('NONE');
  const [lockHours, setLockHours] = useState<number>(24);
  const [lockReason, setLockReason] = useState<string>('');

  // Form states for Subscription
  const [editTier, setEditTier] = useState<string>('FREE');

  // Status messages
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchRequests();
    fetchMaintenance();
    fetchLogs();
    fetchPlans();
    fetchDefaultPlan();
    fetchInactivityTimeout();
  }, []);

  // Poll live activity stream and user online states every 4 seconds
  useEffect(() => {
    fetchLiveFeed();
    fetchUsers(false);
    const interval = setInterval(() => {
      fetchLiveFeed();
      fetchUsers(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedFeedUser]);

  const fetchDefaultPlan = async () => {
    try {
      const res = await api.get('/admin/default-plan');
      if (res.data?.success && res.data.defaultPlan) {
        setDefaultPlan(res.data.defaultPlan);
      }
    } catch {}
  };

  const handleUpdateDefaultPlan = async (plan: string) => {
    try {
      const res = await api.put('/admin/default-plan', { defaultPlan: plan });
      if (res.data?.success) {
        setDefaultPlan(plan);
        showNotice('success', `Default plan for new accounts set to ${plan}`);
      }
    } catch {
      showNotice('error', 'Failed to update default plan.');
    }
  };

  const fetchInactivityTimeout = async () => {
    try {
      const res = await api.get('/system/inactivity-timeout');
      if (res.data?.success && res.data.inactivityTimeoutMinutes) {
        setInactivityTimeout(res.data.inactivityTimeoutMinutes);
      }
    } catch {}
  };

  const handleUpdateInactivityTimeout = async (mins: number) => {
    try {
      const res = await api.put('/admin/inactivity-timeout', { inactivityTimeoutMinutes: mins });
      if (res.data?.success) {
        setInactivityTimeout(mins);
        showNotice('success', `Inactivity auto-logout timeout set to ${mins} minutes`);
      }
    } catch {
      showNotice('error', 'Failed to update inactivity timeout.');
    }
  };

  const fetchLiveFeed = async () => {
    try {
      const url = selectedFeedUser ? `/admin/logs?userId=${selectedFeedUser.id}&limit=40` : '/admin/logs?limit=40';
      const res = await api.get(url);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setLiveFeedLogs(res.data.data);
      }
    } catch {}
  };

  const showNotice = (type: 'success' | 'error', text: string) => {
    setBannerNotice({ type, text });
    setTimeout(() => setBannerNotice(null), 5000);
  };

  const fetchPlans = async () => {
    try {
      const res = await api.get('/subscription-plans');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setPlans(res.data.data);
      }
    } catch {
      showNotice('error', 'Could not load subscription packages.');
    }
  };

  const handleGenerateTempPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForTempPass) return;

    setTempPassLoading(true);
    try {
      const res = await api.post(`/admin/users/${selectedUserForTempPass.id}/generate-temp-password`, {
        durationMinutes: tempPassDuration
      });
      if (res.data?.success) {
        setGeneratedTempPass({
          tempPassword: res.data.tempPassword,
          expiresAt: res.data.expiresAt,
          durationMinutes: res.data.durationMinutes,
          copied: false
        });
        showNotice('success', `Temporary password generated for ${selectedUserForTempPass.email} (Valid for ${res.data.durationMinutes}m)`);
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.error || 'Failed to generate temporary password.');
    } finally {
      setTempPassLoading(false);
    }
  };

  const handleSavePlanSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForEdit) return;

    try {
      const res = await api.put(`/admin/subscription-plans/${selectedPlanForEdit.id}`, selectedPlanForEdit);
      if (res.data?.success) {
        showNotice('success', `Package '${selectedPlanForEdit.planCode}' updated successfully! Synced ${res.data.affectedUsers || 0} user accounts.`);
        setIsEditPlanModalOpen(false);
        fetchPlans();
        fetchUsers();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.error || 'Failed to update subscription package.');
    }
  };

  const fetchUsers = async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get('/admin/users');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setUsers(res.data.data);
      }
    } catch {
      if (showLoading) showNotice('error', 'Failed to fetch user accounts.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await api.get('/admin/access-requests');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setAccessRequests(res.data.data);
      }
    } catch {}
  };

  const fetchMaintenance = async () => {
    try {
      const res = await api.get('/system/maintenance');
      if (res.data?.success && res.data.data) {
        const d = res.data.data;
        setMaintenanceActive(d.active || false);
        if (d.message) setMaintenanceMessage(d.message);
        if (d.startTime) setMaintenanceStart(d.startTime);
        if (d.endTime) setMaintenanceEnd(d.endTime);
      }
    } catch {}
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/admin/logs?limit=50');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setLogs(res.data.data);
      }
    } catch {}
  };



  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/users', {
        email: newEmail.trim().toLowerCase(),
        name: newName.trim(),
        password: newPassword,
        role: newRole,
        subscriptionTier: newTier
      });

      if (res.data?.success) {
        showNotice('success', `Account created for ${newEmail}`);
        setIsCreateModalOpen(false);
        setNewEmail('');
        setNewName('');
        setNewPassword('');
        fetchUsers();
        fetchLiveFeed();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.error || 'Failed to create user account.');
    }
  };

  // Delete User
  const handleDeleteUser = async (user: User) => {
    if (user.role === 'SUPER_ADMIN' || user.email === 'admin@fintrack.app') {
      showNotice('error', 'Super Administrator account cannot be deleted.');
      return;
    }

    if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE user ${user.name || user.email} (${user.email})?\n\nThis will permanently erase all transactions, categories, credit cards, and activity data for this user!`)) {
      return;
    }

    try {
      const res = await api.delete(`/admin/users/${user.id}`);
      if (res.data?.success) {
        showNotice('success', `Account ${user.email} permanently deleted.`);
        if (selectedFeedUser?.id === user.id) setSelectedFeedUser(null);
        fetchUsers();
        fetchLiveFeed();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.error || 'Failed to delete user account.');
    }
  };

  const isUserOnline = (u: User): boolean => {
    if (typeof u.isOnline === 'boolean') return u.isOnline;
    if (!u.lastLoginAt) return false;
    const loginTime = new Date(u.lastLoginAt).getTime();
    if (u.lastLogoutAt) {
      const logoutTime = new Date(u.lastLogoutAt).getTime();
      if (logoutTime >= loginTime) return false;
    }
    const diffMinutes = (Date.now() - loginTime) / (1000 * 60);
    return diffMinutes < (inactivityTimeout || 15);
  };

  const formatTimeAgo = (dateStr?: string): string => {
    if (!dateStr) return 'Never';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Apply Lock
  const handleApplyLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForLock) return;

    let lockUntil: string | null = null;
    if (lockType === 'TEMP') {
      const d = new Date();
      d.setHours(d.getHours() + Number(lockHours));
      lockUntil = d.toISOString();
    }

    try {
      const res = await api.put(`/admin/users/${selectedUserForLock.id}/lock`, {
        lockType,
        lockUntil,
        lockHours: Number(lockHours),
        lockReason
      });

      if (res.data?.success) {
        showNotice('success', `Lock updated for ${selectedUserForLock.email}`);
        setSelectedUserForLock(null);
        fetchUsers();
      }
    } catch {
      showNotice('error', 'Failed to update lock status.');
    }
  };

  // Apply Subscription Package
  const handleApplySubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForTier) return;

    try {
      const res = await api.put(`/admin/users/${selectedUserForTier.id}/subscription`, {
        subscriptionTier: editTier
      });

      if (res.data?.success) {
        showNotice('success', `Subscription package updated to ${editTier} for ${selectedUserForTier.email}`);
        setSelectedUserForTier(null);
        fetchUsers();
      }
    } catch {
      showNotice('error', 'Failed to update subscription.');
    }
  };

  // Reset User Account
  const handleAdminResetUser = async (user: User) => {
    if (!window.confirm(`Are you sure you want to factory reset all data for ${user.name || user.email}? This will wipe their transactions and reset them like a brand new account.`)) {
      return;
    }

    try {
      const res = await api.post('/user/reset-section', { section: 'entire_app' });
      if (res.data?.success) {
        showNotice('success', `Reset completed for ${user.email}`);
        fetchUsers();
      }
    } catch {
      showNotice('error', 'Failed to reset user data.');
    }
  };

  // Review Access Request
  const handleReviewRequest = async (id: number, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await api.put(`/admin/access-requests/${id}/status`, {
        status,
        adminNote: `Request ${status.toLowerCase()} by Super Administrator`
      });

      if (res.data?.success) {
        showNotice('success', `Request #${id} ${status}`);
        fetchRequests();
        fetchUsers();
      }
    } catch {
      showNotice('error', 'Failed to update access request.');
    }
  };

  // Save Maintenance Settings
  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMaintenance(true);
    try {
      const res = await api.post('/admin/maintenance', {
        active: maintenanceActive,
        message: maintenanceMessage,
        startTime: maintenanceStart,
        endTime: maintenanceEnd
      });

      if (res.data?.success) {
        showNotice('success', 'Maintenance configuration updated & broadcasted.');
      }
    } catch {
      showNotice('error', 'Failed to update maintenance configuration.');
    } finally {
      setSavingMaintenance(false);
    }
  };

  // Deep dive user
  const handleOpenDeepDive = async (user: User) => {
    setSelectedUserForDeepDive(user);
    setDeepDiveLoading(true);
    try {
      const res = await api.get(`/admin/users/${user.id}/dashboard`);
      if (res.data?.success) {
        setDeepDiveData(res.data.data);
      }
    } catch {
      showNotice('error', 'Failed to load user financial overview.');
    } finally {
      setDeepDiveLoading(false);
    }
  };

  // Filtered accounts
  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.subscriptionTier && u.subscriptionTier.toLowerCase().includes(q))
    );
  });

  // Stats calculation (matching Figma Screenshot 3)
  const totalAccounts = users.length;
  const activeUsers = users.filter(u => u.status === 'ACTIVE' && (!u.lockType || u.lockType === 'NONE')).length;

  const pendingRequestsCount = accessRequests.filter(r => r.status === 'PENDING').length;
  const lockedCount = users.filter(u => u.lockType && u.lockType !== 'NONE').length;

  const containerBg = isLight ? '#F8FAFC' : '#090C13';
  const headerBg = isLight ? '#FFFFFF' : '#0D111A';
  const cardBg = isLight ? '#FFFFFF' : '#0F131D';
  const cardInnerBg = isLight ? '#F8FAFC' : '#090C13';
  const modalBg = isLight ? '#FFFFFF' : '#131824';
  const borderColor = isLight ? '#E2E8F0' : '#1E2638';
  const borderColorSubtle = isLight ? '#F1F5F9' : '#1A2234';
  const textColor = isLight ? '#0F172A' : '#F8FAFC';
  const mutedText = isLight ? '#64748B' : '#94A3B8';
  const inputBg = isLight ? '#FFFFFF' : '#090C13';
  const tableHeadBg = isLight ? '#F1F5F9' : '#0D111A';

  return (
    <div style={{ minHeight: '100vh', background: containerBg, color: textColor, paddingBottom: 60, transition: 'background-color 0.25s ease, color 0.25s ease' }}>
      {/* Top Admin Header Bar (Figma Screenshot 3) */}
      <header
        style={{
          background: headerBg,
          borderBottom: `1px solid ${borderColor}`,
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)'
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: textColor, display: 'flex', alignItems: 'center', gap: 8 }}>
              FinTrack Admin
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  background: 'rgba(124, 58, 237, 0.2)',
                  border: '1px solid rgba(124, 58, 237, 0.4)',
                  color: '#C084FC',
                  padding: '2px 8px',
                  borderRadius: 100,
                  letterSpacing: '0.05em'
                }}
              >
                SUPER ADMINISTRATOR
              </span>
            </div>
            <div style={{ fontSize: 11, color: mutedText }}>Application Level Governance & User Control</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Theme Selector: Light, Dark, System */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: isLight ? '#E2E8F0' : '#141A26',
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
              padding: 2
            }}
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              title="Light theme"
              style={{
                background: theme === 'light' ? (isLight ? '#FFFFFF' : '#2A364F') : 'transparent',
                color: theme === 'light' ? '#F59E0B' : (isLight ? '#64748B' : '#94A3B8'),
                border: 'none',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Sun size={14} />
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              title="Dark theme"
              style={{
                background: theme === 'dark' ? (isLight ? '#FFFFFF' : '#2A364F') : 'transparent',
                color: theme === 'dark' ? '#818CF8' : (isLight ? '#64748B' : '#94A3B8'),
                border: 'none',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Moon size={14} />
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              title="System theme"
              style={{
                background: theme === 'system' ? (isLight ? '#FFFFFF' : '#2A364F') : 'transparent',
                color: theme === 'system' ? '#10B981' : (isLight ? '#64748B' : '#94A3B8'),
                border: 'none',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme === 'system' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Laptop size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={logout}
            style={{
              background: 'transparent',
              border: `1px solid ${borderColor}`,
              color: mutedText,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Banner Notice Alert */}
      {bannerNotice && (
        <div
          style={{
            maxWidth: 1560,
            margin: '16px auto 0',
            padding: '12px 20px',
            borderRadius: 10,
            background: bannerNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${bannerNotice.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            color: bannerNotice.type === 'success' ? '#34D399' : '#F87171',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          {bannerNotice.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{bannerNotice.text}</span>
        </div>
      )}

      {/* Main Container */}
      <div style={{ maxWidth: 1560, margin: '24px auto', padding: '0 24px' }}>
        {/* Title & Create Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: textColor, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Account administration
            </h1>
            <p style={{ fontSize: 14, color: mutedText, margin: 0 }}>
              Create users and control application level permissions, subscriptions & locking
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)',
                color: '#FFF',
                border: 'none',
                borderRadius: 10,
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)'
              }}
            >
              <UserPlus size={16} />
              <span>+ Create user account</span>
            </button>
          </div>
        </div>

        {/* 4 Top Stat Cards (From Figma Screenshot 3) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 32
          }}
        >
          {/* Card 1: Total accounts */}
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: '20px 24px', boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#60A5FA', marginBottom: 12 }}>
              <Users size={20} />
              <span style={{ fontSize: 13, color: mutedText, fontWeight: 600 }}>Total accounts</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: textColor }}>{totalAccounts}</div>
          </div>

          {/* Card 2: Active users */}
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: '20px 24px', boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#10B981', marginBottom: 12 }}>
              <CheckCircle size={20} />
              <span style={{ fontSize: 13, color: mutedText, fontWeight: 600 }}>Active users</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: textColor }}>{activeUsers}</div>
          </div>

          {/* Card 3: Subscription Breakdown */}
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#A855F7', marginBottom: 12 }}>
              <ShieldCheck size={20} />
              <span style={{ fontSize: 13, color: mutedText, fontWeight: 600 }}>Subscription Breakdown</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700, color: textColor, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: mutedText }}>FREE =</span>
                <span style={{ color: textColor, fontWeight: 800 }}>{users.filter(u => !u.subscriptionTier || u.subscriptionTier === 'FREE').length}</span>
              </div>
              <span style={{ color: borderColor }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#A855F7' }}>PRO =</span>
                <span style={{ color: '#A855F7', fontWeight: 800 }}>{users.filter(u => u.subscriptionTier === 'PRO').length}</span>
              </div>
              <span style={{ color: borderColor }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#F59E0B' }}>ENTERPRISE =</span>
                <span style={{ color: '#F59E0B', fontWeight: 800 }}>{users.filter(u => u.subscriptionTier === 'ENTERPRISE').length}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Access Requests / Locks */}
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: '20px 24px', boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#F59E0B', marginBottom: 12 }}>
              <Lock size={20} />
              <span style={{ fontSize: 13, color: mutedText, fontWeight: 600 }}>Locked / Requests</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: textColor }}>
              {lockedCount} <span style={{ fontSize: 14, color: '#F59E0B', fontWeight: 600 }}>({pendingRequestsCount} pending)</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            borderBottom: `1px solid ${borderColor}`,
            paddingBottom: 12,
            marginBottom: 24,
            overflowX: 'auto'
          }}
        >
          {[
            { id: 'accounts', label: 'User accounts', icon: Users },
            { id: 'plans', label: `Subscription Packages (${plans.length || 3})`, icon: CreditCard },
            { id: 'requests', label: `Access Requests (${pendingRequestsCount})`, icon: Mail },
            { id: 'maintenance', label: 'Scheduled Maintenance', icon: AlertTriangle },
            { id: 'logs', label: 'Activity & Audit Logs', icon: Activity }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  background: isActive ? (isLight ? '#EDE9FE' : '#1E2638') : 'transparent',
                  border: isActive ? (isLight ? '1px solid #C4B5FD' : '1px solid #2A364F') : '1px solid transparent',
                  color: isActive ? (isLight ? '#7C3AED' : '#FFF') : mutedText,
                  padding: '10px 18px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={16} style={{ color: isActive ? '#7C3AED' : (isLight ? '#94A3B8' : '#64748B') }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* =========================================================================
            TAB 1: ACCOUNTS TABLE (Figma Screenshot 3)
            ========================================================================= */}
        {/* =========================================================================
            TAB 1: ACCOUNTS TABLE & LIVE STREAM (Split 2-Box Screen)
            ========================================================================= */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* Left Big Box: User Accounts Table & Controls */}
            <div
              style={{
                flex: '1 1 64%',
                minWidth: 580,
                background: cardBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              {/* Table Header Controls */}
              <div
                style={{
                  padding: '20px 24px',
                  borderBottom: `1px solid ${borderColor}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: textColor }}>User accounts</div>
                  <div style={{ fontSize: 12, color: mutedText }}>Select any account to view isolated live activity feed</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* Default New Account Plan */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: '6px 12px' }}>
                    <span style={{ fontSize: 11, color: mutedText, fontWeight: 600 }}>Default Plan:</span>
                    <select
                      value={defaultPlan}
                      onChange={e => handleUpdateDefaultPlan(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#7C3AED', fontSize: 12, fontWeight: 800, outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="FREE" style={{ background: cardBg, color: textColor }}>FREE</option>
                      <option value="PRO" style={{ background: cardBg, color: textColor }}>PRO</option>
                      <option value="ENTERPRISE" style={{ background: cardBg, color: textColor }}>ENTERPRISE</option>
                    </select>
                  </div>

                  {/* Inactivity Timeout */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: '6px 12px' }}>
                    <span style={{ fontSize: 11, color: mutedText, fontWeight: 600 }}>Auto-Logout:</span>
                    <select
                      value={inactivityTimeout}
                      onChange={e => handleUpdateInactivityTimeout(Number(e.target.value))}
                      style={{ background: 'transparent', border: 'none', color: '#F59E0B', fontSize: 12, fontWeight: 800, outline: 'none', cursor: 'pointer' }}
                    >
                      <option value={5} style={{ background: cardBg, color: textColor }}>5 Mins</option>
                      <option value={10} style={{ background: cardBg, color: textColor }}>10 Mins</option>
                      <option value={15} style={{ background: cardBg, color: textColor }}>15 Mins</option>
                      <option value={30} style={{ background: cardBg, color: textColor }}>30 Mins</option>
                      <option value={60} style={{ background: cardBg, color: textColor }}>60 Mins</option>
                    </select>
                  </div>

                  {/* Search Accounts */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: cardInnerBg,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 10,
                      padding: '8px 14px',
                      minWidth: 200
                    }}
                  >
                    <Search size={15} style={{ color: mutedText }} />
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: textColor,
                        fontSize: 13,
                        outline: 'none',
                        width: '100%'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Responsive Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 680 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${borderColor}`, background: isLight ? '#F1F5F9' : '#0D111A' }}>
                      <th style={{ padding: '16px 24px', color: isLight ? '#0F172A' : '#FFFFFF', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textAlign: 'left' }}>ACCOUNT</th>
                      <th style={{ padding: '16px 16px', color: isLight ? '#0F172A' : '#FFFFFF', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textAlign: 'left' }}>SUBSCRIPTION PACKAGE</th>
                      <th style={{ padding: '16px 16px', color: isLight ? '#0F172A' : '#FFFFFF', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textAlign: 'left' }}>STATUS & ACTIVITY</th>
                      <th style={{ padding: '16px 16px', color: isLight ? '#0F172A' : '#FFFFFF', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textAlign: 'left' }}>LOCK STATUS</th>
                      <th style={{ padding: '16px 24px', color: isLight ? '#0F172A' : '#FFFFFF', fontWeight: 800, fontSize: 12, letterSpacing: '0.06em', textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '36px 0', color: '#94A3B8' }}>
                          Loading account list...
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '36px 0', color: '#94A3B8' }}>
                          No accounts found matching search.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => {
                        const isLocked = u.lockType && u.lockType !== 'NONE';
                        const isTemp = u.lockType === 'TEMP';
                        const online = isUserOnline(u);
                        const isSelectedFeed = selectedFeedUser?.id === u.id;

                        return (
                          <tr
                            key={u.id}
                            onClick={() => setSelectedFeedUser(isSelectedFeed ? null : u)}
                            style={{
                              borderBottom: '1px solid #151A26',
                              fontSize: 13,
                              background: isSelectedFeed ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                              borderLeft: isSelectedFeed ? '3px solid #7C3AED' : '3px solid transparent',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Click row to view user's live stream actions on the right"
                          >
                            {/* Account Name & Email */}
                            <td style={{ padding: '16px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ position: 'relative' }}>
                                  <div
                                    style={{
                                      width: 38,
                                      height: 38,
                                      borderRadius: '50%',
                                      background: isLight ? '#E2E8F0' : '#1E2638',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 700,
                                      color: textColor,
                                      overflow: 'hidden'
                                    }}
                                  >
                                    {u.photo ? (
                                      <img src={u.photo} alt={u.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      (u.name || u.email || 'U').slice(0, 2).toUpperCase()
                                    )}
                                  </div>
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: -1,
                                      right: -1,
                                      width: 12,
                                      height: 12,
                                      borderRadius: '50%',
                                      border: isLight ? '2px solid #FFFFFF' : '2px solid #0F131D',
                                      background: online ? '#10B981' : '#EF4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                    title={online ? 'Online now' : 'Offline'}
                                  >
                                    {online && (
                                      <span
                                        style={{
                                          position: 'absolute',
                                          width: '100%',
                                          height: '100%',
                                          borderRadius: '50%',
                                          background: '#10B981',
                                          opacity: 0.75,
                                          animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
                                        }}
                                      />
                                    )}
                                  </span>
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>{u.name || 'User'}</span>
                                    {u.role === 'SUPER_ADMIN' && (
                                      <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(124, 58, 237, 0.2)', color: '#7C3AED', padding: '1px 5px', borderRadius: 4 }}>
                                        ADMIN
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 12, color: mutedText }}>{u.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Subscription Package Badge / Trigger */}
                            <td style={{ padding: '16px 16px' }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserForTier(u);
                                  setEditTier(u.subscriptionTier || 'FREE');
                                }}
                                style={{
                                  background: u.subscriptionTier === 'ENTERPRISE'
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : u.subscriptionTier === 'PRO'
                                      ? 'rgba(139, 92, 246, 0.15)'
                                      : 'rgba(100, 116, 139, 0.15)',
                                  border: `1px solid ${
                                    u.subscriptionTier === 'ENTERPRISE'
                                      ? 'rgba(245, 158, 11, 0.35)'
                                      : u.subscriptionTier === 'PRO'
                                        ? 'rgba(139, 92, 246, 0.35)'
                                        : 'rgba(100, 116, 139, 0.35)'
                                  }`,
                                  color: u.subscriptionTier === 'ENTERPRISE'
                                    ? '#FBBF24'
                                    : u.subscriptionTier === 'PRO'
                                      ? '#C084FC'
                                      : '#94A3B8',
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  letterSpacing: '0.04em',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                                title="Click to assign subscription package"
                              >
                                <ShieldCheck size={12} />
                                <span>{u.subscriptionTier || 'FREE'}</span>
                              </button>
                            </td>

                            {/* Status & Online Activity */}
                            <td style={{ padding: '16px 16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                  <span style={{ position: 'relative', display: 'flex', height: 8, width: 8 }}>
                                    {online && (
                                      <span style={{ position: 'absolute', height: '100%', width: '100%', borderRadius: '50%', background: '#10B981', opacity: 0.75, animation: 'ping 1.5s infinite' }} />
                                    )}
                                    <span style={{ borderRadius: '50%', height: 8, width: 8, background: online ? '#10B981' : '#EF4444' }} />
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: online ? '#34D399' : '#94A3B8' }}>
                                    {online ? 'Online now' : 'Offline'}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748B' }}>
                                  {u.lastLoginAt ? `Last: ${formatTimeAgo(u.lastLoginAt)}` : 'Never logged in'}
                                </div>
                              </div>
                            </td>

                            {/* Lock Status Pill & Button */}
                            <td style={{ padding: '16px 16px' }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserForLock(u);
                                  setLockType(u.lockType || 'NONE');
                                  setLockReason(u.lockReason || '');
                                }}
                                style={{
                                  background: isLocked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                                  border: `1px solid ${isLocked ? 'rgba(239, 68, 68, 0.4)' : '#1E2638'}`,
                                  color: isLocked ? '#F87171' : '#94A3B8',
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                              >
                                {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                <span>
                                  {isTemp ? 'Temp Locked' : u.lockType === 'PERMANENT' ? 'Perm Locked' : u.lockType === 'FULL' ? 'Full Locked' : 'Unlocked'}
                                </span>
                              </button>
                            </td>

                            {/* Actions: Temp Password, Deep Dive, Reset & Delete */}
                            <td style={{ padding: '16px 24px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUserForTempPass(u);
                                    setTempPassDuration(15);
                                    setGeneratedTempPass(null);
                                  }}
                                  style={{
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    border: '1px solid rgba(245, 158, 11, 0.4)',
                                    color: '#F59E0B',
                                    padding: '5px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="Generate single-use temporary password for this user"
                                >
                                  <KeyRound size={12} />
                                  <span>Temp Pass</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenDeepDive(u)}
                                  style={{
                                    background: '#1E2638',
                                    border: 'none',
                                    color: '#60A5FA',
                                    padding: '5px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="View current month finances & 10 transactions"
                                >
                                  <TrendingUp size={12} />
                                  <span>Deep Dive</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAdminResetUser(u)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#EF4444',
                                    padding: '5px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="Reset all account data for this user"
                                >
                                  <RotateCcw size={12} />
                                  <span>Reset</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#EF4444',
                                    padding: '5px 9px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="Permanently delete user account and wipe all data"
                                >
                                  <Trash2 size={12} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Small Box: Always-Open Live Activity Stream Window */}
            <div
              style={{
                flex: '0 0 340px',
                minWidth: 300,
                background: cardBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 20,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 740,
                overflow: 'hidden',
                boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : '0 12px 36px rgba(0,0,0,0.4)'
              }}
            >
              {/* Stream Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: `1px solid ${borderColor}`, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ position: 'relative', display: 'flex', height: 9, width: 9 }}>
                      <span style={{ position: 'absolute', height: '100%', width: '100%', borderRadius: '50%', background: '#10B981', opacity: 0.75, animation: 'ping 1.5s infinite' }} />
                      <span style={{ borderRadius: '50%', height: 9, width: 9, background: '#10B981' }} />
                    </span>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: textColor, letterSpacing: '0.04em' }}>
                      LIVE ACTIVITY STREAM
                    </h4>
                  </div>
                  <div style={{ fontSize: 11, color: mutedText, marginTop: 4 }}>
                    {selectedFeedUser ? (
                      <span>Filtered: <strong style={{ color: '#7C3AED' }}>{selectedFeedUser.name || selectedFeedUser.email}</strong></span>
                    ) : (
                      <span>Real-time actions • All Users</span>
                    )}
                  </div>
                </div>

                {selectedFeedUser && (
                  <button
                    type="button"
                    onClick={() => setSelectedFeedUser(null)}
                    style={{
                      background: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${borderColor}`,
                      color: textColor,
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Clear filter to view all users"
                  >
                    ✕ All Users
                  </button>
                )}
              </div>

              {/* Feed Items Container */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                {liveFeedLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 12px', color: mutedText, fontSize: 12 }}>
                    No recent activities recorded yet.
                  </div>
                ) : (
                  liveFeedLogs.map(log => {
                    const isTx = log.action.includes('TRANSACTION');
                    const isProfile = log.action.includes('PROFILE');
                    const isCard = log.action.includes('CARD');

                    const chipBg = isTx ? 'rgba(16, 185, 129, 0.15)' : isProfile ? 'rgba(139, 92, 246, 0.15)' : isCard ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)';
                    const chipColor = isTx ? '#10B981' : isProfile ? '#7C3AED' : isCard ? '#F59E0B' : mutedText;

                    return (
                      <div
                        key={log.id}
                        style={{
                          background: cardInnerBg,
                          border: `1px solid ${borderColor}`,
                          borderRadius: 10,
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: chipBg, color: chipColor, letterSpacing: '0.04em' }}>
                            {log.action.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: 10, color: mutedText }}>
                            {formatTimeAgo(log.createdAt)}
                          </span>
                        </div>

                        <div style={{ color: textColor, fontSize: 12, lineHeight: 1.4 }}>
                          {log.details || log.action}
                        </div>

                        <div style={{ fontSize: 10, color: mutedText }}>
                          {log.userEmail || `User #${log.userId}`}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: SUBSCRIPTION PACKAGES & QUOTAS MANAGEMENT
            ========================================================================= */}
        {activeTab === 'plans' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div
              style={{
                background: cardBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 20,
                padding: '24px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: textColor, margin: '0 0 6px' }}>
                  Subscription Packages & Feature Governance
                </h2>
                <p style={{ fontSize: 13, color: mutedText, margin: 0 }}>
                  Pre-configured subscription tiers. Editing card limits or feature permissions here automatically cascades to all enrolled users.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.25)', fontWeight: 600 }}>
                  Live Auto-Sync Active
                </span>
              </div>
            </div>

            {/* Plans Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {plans.map(p => {
                const enrolledCount = users.filter(u => u.subscriptionTier === p.planCode).length;
                const isEnterprise = p.planCode === 'ENTERPRISE';
                const isPro = p.planCode === 'PRO';

                return (
                  <div
                    key={p.id}
                    style={{
                      background: cardBg,
                      border: isEnterprise ? '1px solid rgba(139, 92, 246, 0.4)' : isPro ? '1px solid rgba(99, 102, 241, 0.35)' : `1px solid ${borderColor}`,
                      borderRadius: 18,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isEnterprise ? '0 8px 24px rgba(139, 92, 246, 0.15)' : isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none',
                      position: 'relative'
                    }}
                  >
                    <div>
                      {/* Top Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: '0.05em',
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: isEnterprise ? 'rgba(139, 92, 246, 0.18)' : isPro ? 'rgba(99, 102, 241, 0.18)' : (isLight ? '#F1F5F9' : 'rgba(100, 116, 139, 0.2)'),
                              color: isEnterprise ? '#7C3AED' : isPro ? '#6366F1' : mutedText,
                              border: `1px solid ${isEnterprise ? 'rgba(139, 92, 246, 0.4)' : isPro ? 'rgba(99, 102, 241, 0.4)' : borderColor}`
                            }}
                          >
                            {p.planCode}
                          </span>
                          <h3 style={{ fontSize: 20, fontWeight: 800, color: textColor, margin: '10px 0 2px' }}>
                            {p.planName}
                          </h3>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: textColor }}>
                            {p.price > 0 ? `₹ ${p.price}` : 'Free'}
                          </div>
                          <div style={{ fontSize: 11, color: mutedText }}>
                            {p.price > 0 ? `/${p.billingPeriod.toLowerCase()}` : 'Forever'}
                          </div>
                        </div>
                      </div>

                      <p style={{ fontSize: 12, color: mutedText, marginBottom: 18, minHeight: 36, lineHeight: 1.4 }}>
                        {p.description || 'Predefined subscription tier with tailored feature quotas.'}
                      </p>

                      {/* Quota Highlights */}
                      <div
                        style={{
                          background: cardInnerBg,
                          border: `1px solid ${borderColor}`,
                          borderRadius: 12,
                          padding: '12px 14px',
                          marginBottom: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: mutedText }}>Credit Card Allowance:</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#38BDF8' }}>
                          {p.maxCreditCards >= 90 ? 'Unlimited Cards' : `Up to ${p.maxCreditCards} Cards`}
                        </span>
                      </div>

                      {/* Feature Entitlements Checklist */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessDashboard ? textColor : mutedText }}>
                          <span style={{ color: p.canAccessDashboard ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessDashboard ? '✓' : '✕'}</span>
                          <span>Complete Financial Dashboard Access</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessReports ? textColor : mutedText }}>
                          <span style={{ color: p.canAccessReports ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessReports ? '✓' : '✕'}</span>
                          <span>Financial Reports & Statement Exports</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessLoans ? textColor : mutedText }}>
                          <span style={{ color: p.canAccessLoans ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessLoans ? '✓' : '✕'}</span>
                          <span>Loans & EMI Amortization Tracker</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canAccessBudget ? textColor : mutedText }}>
                          <span style={{ color: p.canAccessBudget ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canAccessBudget ? '✓' : '✕'}</span>
                          <span>Annual Budget Planner Matrix</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: p.canUseEodDigest ? textColor : mutedText }}>
                          <span style={{ color: p.canUseEodDigest ? '#10B981' : '#EF4444', fontWeight: 800 }}>{p.canUseEodDigest ? '✓' : '✕'}</span>
                          <span>Automated EOD Financial Email Digests</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row Actions */}
                    <div>
                      <div style={{ fontSize: 11, color: mutedText, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Enrolled Users:</span>
                        <strong style={{ color: textColor }}>{enrolledCount} user{enrolledCount !== 1 ? 's' : ''}</strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlanForEdit({ ...p });
                          setIsEditPlanModalOpen(true);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: '#7C3AED',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Sliders size={14} />
                        <span>Edit Package & Quotas</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        
        {/* =========================================================================
            TAB 2: ACCESS REQUESTS (USER REQUESTS APPROVAL)
            ========================================================================= */}
        {activeTab === 'requests' && (
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 24, boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: textColor, margin: '0 0 16px' }}>
              User Access Requests & Permission Escalations
            </h2>

            {accessRequests.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: mutedText }}>
                No pending or historical access requests.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {accessRequests.map(req => {
                  const isPending = req.status === 'PENDING';
                  return (
                    <div
                      key={req.id}
                      style={{
                        background: cardInnerBg,
                        border: `1px solid ${borderColor}`,
                        borderRadius: 12,
                        padding: '16px 20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 16
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: textColor }}>{req.userEmail}</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: req.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : req.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: req.status === 'APPROVED' ? '#10B981' : req.status === 'REJECTED' ? '#EF4444' : '#F59E0B'
                            }}
                          >
                            {req.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: textColor }}>
                          <strong>Request:</strong> {req.requestType} • {req.details}
                        </div>
                        <div style={{ fontSize: 11, color: mutedText, marginTop: 4 }}>
                          Submitted: {new Date(req.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {isPending && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleReviewRequest(req.id, 'APPROVED')}
                            style={{
                              background: '#10B981',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: 6,
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Approve & Grant
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewRequest(req.id, 'REJECTED')}
                            style={{
                              background: isLight ? '#FEE2E2' : '#1E2638',
                              color: '#EF4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 6,
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: SCHEDULED SYSTEM MAINTENANCE
            ========================================================================= */}
        {activeTab === 'maintenance' && (
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 28, maxWidth: 680, boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: textColor, margin: 0 }}>
                  Scheduled Maintenance Mode
                </h2>
                <span style={{ fontSize: 12, color: mutedText }}>
                  Restricts regular user logins and broadcasts banner across user sessions
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveMaintenance} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Toggle Active */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: cardInnerBg,
                  padding: '16px 20px',
                  borderRadius: 12,
                  border: `1px solid ${borderColor}`
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: textColor }}>Maintenance Active Status</div>
                  <div style={{ fontSize: 12, color: mutedText }}>When active, normal accounts are blocked with notice</div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={maintenanceActive}
                    onChange={e => setMaintenanceActive(e.target.value === 'true' || e.target.checked)}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 48,
                      height: 26,
                      borderRadius: 100,
                      background: maintenanceActive ? '#F59E0B' : (isLight ? '#CBD5E1' : '#334155'),
                      position: 'relative',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#FFF',
                        position: 'absolute',
                        top: 3,
                        left: maintenanceActive ? 25 : 3,
                        transition: 'left 0.2s'
                      }}
                    />
                  </div>
                </label>
              </div>

              {/* Maintenance Broadcast Message */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>
                  Maintenance Announcement Message
                </label>
                <textarea
                  rows={3}
                  value={maintenanceMessage}
                  onChange={e => setMaintenanceMessage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${borderColor}`,
                    background: inputBg,
                    color: textColor,
                    fontSize: 13,
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>

              {/* Scheduled Window */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>
                    Start Time
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2:00 PM (Oct 23)"
                    value={maintenanceStart}
                    onChange={e => setMaintenanceStart(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${borderColor}`,
                      background: inputBg,
                      color: textColor,
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>
                    Expected Completion (End Time)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 4:00 PM (Oct 23)"
                    value={maintenanceEnd}
                    onChange={e => setMaintenanceEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${borderColor}`,
                      background: inputBg,
                      color: textColor,
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingMaintenance}
                style={{
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 10,
                  padding: '14px',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                }}
              >
                {savingMaintenance ? 'Saving...' : 'Save & Broadcast Maintenance'}
              </button>
            </form>
          </div>
        )}

        {/* =========================================================================
            TAB 4: ACTIVITY LOGS
            ========================================================================= */}
        {activeTab === 'logs' && (
          <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 24, boxShadow: isLight ? '0 4px 14px rgba(0,0,0,0.04)' : 'none' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: textColor, margin: '0 0 16px' }}>
              Security & Activity Telemetry Logs
            </h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${borderColor}`, background: tableHeadBg, color: mutedText, fontSize: 11, fontWeight: 800 }}>
                    <th style={{ padding: '12px 16px' }}>TIME</th>
                    <th style={{ padding: '12px 16px' }}>USER</th>
                    <th style={{ padding: '12px 16px' }}>ACTION</th>
                    <th style={{ padding: '12px 16px' }}>DETAILS</th>
                    <th style={{ padding: '12px 16px' }}>IP / AGENT</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${borderColorSubtle}`, fontSize: 12 }}>
                      <td style={{ padding: '12px 16px', color: mutedText, whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: textColor }}>
                        {log.userEmail}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 800,
                            background:
                              log.action === 'LOGIN'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : log.action === 'LOGOUT'
                                ? 'rgba(59, 130, 246, 0.15)'
                                : log.action === 'FAILED_LOGIN'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                            color:
                              log.action === 'LOGIN'
                                ? '#10B981'
                                : log.action === 'LOGOUT'
                                ? '#3B82F6'
                                : log.action === 'FAILED_LOGIN'
                                ? '#EF4444'
                                : '#F59E0B'
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: textColor }}>{log.details || '—'}</td>
                      <td style={{ padding: '12px 16px', color: mutedText, fontSize: 11 }}>{log.ipAddress || 'Local'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: CREATE USER ACCOUNT
          ========================================================================= */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div style={{ background: modalBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor }}>Create User Account</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Email Address</label>
                <input type="email" required placeholder="user@fintrack.app" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Full Name</label>
                <input type="text" placeholder="e.g. Priya Badrinarayanan" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Initial Password</label>
                <input type="password" required placeholder="Min 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Subscription Tier</label>
                  <select value={newTier} onChange={e => setNewTier(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}>
                    <option value="FREE">FREE</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
              </div>



              <button type="submit" style={{ background: '#7C3AED', color: '#FFF', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: LOCK CONTROL
          ========================================================================= */}
      {selectedUserForLock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div style={{ background: modalBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor }}>Lock Account Access</h3>
              <button type="button" onClick={() => setSelectedUserForLock(null)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: 13, color: mutedText, marginBottom: 16 }}>
              Target user: <strong style={{ color: textColor }}>{selectedUserForLock.email}</strong>
            </div>

            <form onSubmit={handleApplyLock} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 8 }}>Select Lock Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 'NONE', label: 'Unlock (Active)' },
                    { id: 'TEMP', label: 'Temp Lock' },
                    { id: 'FULL', label: 'Full Lock' },
                    { id: 'PERMANENT', label: 'Perm Lock' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLockType(item.id)}
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        border: lockType === item.id ? '1px solid #EF4444' : `1px solid ${borderColor}`,
                        background: lockType === item.id ? 'rgba(239, 68, 68, 0.15)' : cardInnerBg,
                        color: lockType === item.id ? '#EF4444' : mutedText,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {lockType === 'TEMP' && (
                <div>
                  <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Duration (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={lockHours}
                    onChange={e => setLockHours(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, color: mutedText, display: 'block', marginBottom: 6 }}>Lock Reason Notice (Shown to user)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Account suspended for verification review."
                  value={lockReason}
                  onChange={e => setLockReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, resize: 'none', outline: 'none' }}
                />
              </div>

              <button type="submit" style={{ background: '#EF4444', color: '#FFF', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Save Lock Status
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ASSIGN SUBSCRIPTION PACKAGE (Quotas determined by Package)
          ========================================================================= */}
      {selectedUserForTier && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div style={{ background: modalBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 28, maxWidth: 460, width: '100%', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor }}>Assign Subscription Package</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: mutedText }}>
                  User: <strong style={{ color: textColor }}>{selectedUserForTier.name || selectedUserForTier.email}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setSelectedUserForTier(null)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12, color: '#7C3AED', lineHeight: 1.5 }}>
              Card limit quotas and feature entitlements are automatically configured from the package settings.
            </div>

            <form onSubmit={handleApplySubscription} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: mutedText, display: 'block', marginBottom: 10, letterSpacing: '0.04em' }}>
                  SELECT SUBSCRIPTION PACKAGE
                </label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(plans.length > 0 ? plans : [
                    { id: 1, planCode: 'FREE', planName: 'Free Basic', maxCreditCards: 2, canAccessDashboard: true, canAccessReports: false },
                    { id: 2, planCode: 'PRO', planName: 'Pro Tier', maxCreditCards: 5, canAccessDashboard: true, canAccessReports: true },
                    { id: 3, planCode: 'ENTERPRISE', planName: 'Enterprise Unlimited', maxCreditCards: 99, canAccessDashboard: true, canAccessReports: true }
                  ]).map((p: any) => {
                    const isSelected = editTier === p.planCode;
                    return (
                      <div
                        key={p.planCode}
                        onClick={() => setEditTier(p.planCode)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid #7C3AED' : `1px solid ${borderColor}`,
                          background: isSelected ? 'rgba(124, 58, 237, 0.12)' : cardInnerBg,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: isSelected ? '#7C3AED' : textColor }}>
                              {p.planCode}
                            </span>
                            <span style={{ fontSize: 12, color: mutedText }}>— {p.planName}</span>
                          </div>
                          <div style={{ fontSize: 11, color: mutedText, marginTop: 3 }}>
                            Card limit: <strong style={{ color: textColor }}>{p.maxCreditCards >= 90 ? 'Unlimited Cards' : `${p.maxCreditCards} Cards`}</strong>
                            {' • '}Dashboard: {p.canAccessDashboard ? '✓' : '✗'}
                            {' • '}Reports: {p.canAccessReports ? '✓' : '✗'}
                          </div>
                        </div>

                        <div style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: isSelected ? '5px solid #7C3AED' : (isLight ? '2px solid #CBD5E1' : '2px solid #334155'),
                          background: isLight ? '#FFFFFF' : '#FFF'
                        }} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedUserForTier(null)}
                  style={{
                    flex: 1,
                    background: isLight ? '#F1F5F9' : '#1E2638',
                    color: mutedText,
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Save Subscription Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: USER DEEP DIVE MINI DASHBOARD
          ========================================================================= */}
      {selectedUserForDeepDive && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div style={{ background: modalBg, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 28, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor }}>
                  User Financial Summary: {selectedUserForDeepDive.name || selectedUserForDeepDive.email}
                </h3>
                <span style={{ fontSize: 12, color: mutedText }}>{selectedUserForDeepDive.email} • Current Month Overview</span>
              </div>
              <button type="button" onClick={() => setSelectedUserForDeepDive(null)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {deepDiveLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: mutedText }}>Loading user financial metrics...</div>
            ) : deepDiveData ? (
              <div>
                {/* 4 Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
                  <div style={{ background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: mutedText, fontWeight: 600 }}>CURRENT NET WORTH</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: textColor, marginTop: 4 }}>
                      ₹ {Number(deepDiveData.netWorth || 0).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>MONTHLY INCOME</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981', marginTop: 4 }}>
                      ₹ {Number(deepDiveData.income || 0).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>MONTHLY EXPENSES</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
                      ₹ {Number(deepDiveData.expense || 0).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ background: cardInnerBg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600 }}>MONTHLY SAVINGS</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#3B82F6', marginTop: 4 }}>
                      ₹ {Number(deepDiveData.savings || 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Last 10 Transactions */}
                <div>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: textColor }}>
                    Last 10 Transactions
                  </h4>
                  {deepDiveData.last10Transactions && deepDiveData.last10Transactions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {deepDiveData.last10Transactions.map((tx: any) => (
                        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cardInnerBg, border: `1px solid ${borderColor}`, padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: textColor }}>{tx.category || tx.description || 'Transaction'}</div>
                            <div style={{ color: mutedText, fontSize: 11 }}>{tx.date} • {tx.paymentMode}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: tx.type === 'income' ? '#10B981' : '#EF4444' }}>
                            {tx.type === 'income' ? '+' : '-'} ₹ {Number(tx.amount).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: mutedText, fontSize: 12, textAlign: 'center', padding: 20 }}>No transactions recorded for this user yet.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {/* =========================================================================
          MODAL: GENERATE TEMPORARY PASSWORD (ONE-TIME USE)
          ========================================================================= */}
      {selectedUserForTempPass && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 2000 }}>
          <div style={{ background: modalBg, border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 18, padding: 28, maxWidth: 460, width: '100%', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 50px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: textColor }}>Temporary Password</h3>
                  <div style={{ fontSize: 11, color: mutedText }}>{selectedUserForTempPass.email}</div>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedUserForTempPass(null)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {!generatedTempPass ? (
              <form onSubmit={handleGenerateTempPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 12, color: mutedText, margin: 0, lineHeight: 1.5 }}>
                  Generate a single-use, time-bound temporary password for <strong>{selectedUserForTempPass.name || selectedUserForTempPass.email}</strong>. Upon login, the user will be strictly required to configure a new password.
                </p>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>
                    TEMPORARY PASSWORD VALIDITY
                  </label>
                  <select
                    value={tempPassDuration}
                    onChange={e => setTempPassDuration(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}
                  >
                    <option value={5}>5 Minutes (Quick Reset)</option>
                    <option value={10}>10 Minutes</option>
                    <option value={15}>15 Minutes (Recommended)</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>60 Minutes (1 Hour)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={tempPassLoading}
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: tempPassLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 4
                  }}
                >
                  <KeyRound size={16} />
                  <span>{tempPassLoading ? 'Generating...' : 'Generate & Issue Temp Password'}</span>
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px dashed #F59E0B', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>
                    ONE-TIME TEMPORARY PASSWORD
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: textColor, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 12 }}>
                    {generatedTempPass.tempPassword}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedTempPass.tempPassword);
                      setGeneratedTempPass(prev => prev ? { ...prev, copied: true } : null);
                      setTimeout(() => setGeneratedTempPass(prev => prev ? { ...prev, copied: false } : null), 2000);
                    }}
                    style={{
                      background: generatedTempPass.copied ? '#10B981' : (isLight ? '#E2E8F0' : '#1E293B'),
                      color: generatedTempPass.copied ? '#FFF' : textColor,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {generatedTempPass.copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{generatedTempPass.copied ? 'Copied to Clipboard!' : 'Copy Password'}</span>
                  </button>
                </div>

                <div style={{ fontSize: 12, color: mutedText, lineHeight: 1.5 }}>
                  • <strong>Expiry:</strong> Valid for {generatedTempPass.durationMinutes} minutes.<br/>
                  • <strong>Email Alert:</strong> Dispatched to user inbox with instructions.<br/>
                  • <strong>Mandatory Reset:</strong> User will be prompted to set a permanent password right after login.
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedUserForTempPass(null)}
                  style={{
                    background: isLight ? '#F1F5F9' : '#1E2638',
                    color: textColor,
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT SUBSCRIPTION PLAN & QUOTAS
          ========================================================================= */}
      {isEditPlanModalOpen && selectedPlanForEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 2000 }}>
          <div style={{ background: modalBg, border: `1px solid ${borderColor}`, borderRadius: 18, padding: 28, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: isLight ? '0 20px 40px rgba(0,0,0,0.1)' : '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: textColor }}>Edit {selectedPlanForEdit.planCode} Package</h3>
                  <div style={{ fontSize: 11, color: mutedText }}>Changes automatically update all subscribed user accounts</div>
                </div>
              </div>
              <button type="button" onClick={() => setIsEditPlanModalOpen(false)} style={{ background: 'none', border: 'none', color: mutedText, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSavePlanSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>PACKAGE DISPLAY NAME</label>
                <input
                  type="text"
                  value={selectedPlanForEdit.planName}
                  onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, planName: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>PRICE (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={selectedPlanForEdit.price}
                    onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, price: Number(e.target.value) })}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>MAX CREDIT CARDS</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={selectedPlanForEdit.maxCreditCards}
                    onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, maxCreditCards: Number(e.target.value) })}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 6 }}>PACKAGE DESCRIPTION</label>
                <textarea
                  rows={2}
                  value={selectedPlanForEdit.description || ''}
                  onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, description: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${borderColor}`, background: inputBg, color: textColor, fontSize: 13, resize: 'vertical', outline: 'none' }}
                />
              </div>

              {/* Feature Toggles */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: textColor, display: 'block', marginBottom: 10 }}>
                  FEATURE ENTITLEMENT CONTROLS
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: cardInnerBg, padding: 14, borderRadius: 10, border: `1px solid ${borderColor}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: textColor }}>
                    <span>Dashboard Analytics Access</span>
                    <input
                      type="checkbox"
                      checked={selectedPlanForEdit.canAccessDashboard}
                      onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, canAccessDashboard: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#6366F1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: textColor }}>
                    <span>Financial Reports & Data Exports</span>
                    <input
                      type="checkbox"
                      checked={selectedPlanForEdit.canAccessReports}
                      onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, canAccessReports: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#6366F1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: textColor }}>
                    <span>Loans & EMI Schedules</span>
                    <input
                      type="checkbox"
                      checked={selectedPlanForEdit.canAccessLoans}
                      onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, canAccessLoans: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#6366F1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: textColor }}>
                    <span>Annual Budget Planner Matrix</span>
                    <input
                      type="checkbox"
                      checked={selectedPlanForEdit.canAccessBudget}
                      onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, canAccessBudget: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#6366F1' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: textColor }}>
                    <span>Automated EOD Statement Digest Emails</span>
                    <input
                      type="checkbox"
                      checked={selectedPlanForEdit.canUseEodDigest}
                      onChange={e => setSelectedPlanForEdit({ ...selectedPlanForEdit, canUseEodDigest: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#6366F1' }}
                    />
                  </label>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginTop: 6
                }}
              >
                Save Package & Sync All Users
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
