import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { DashboardView } from './views/DashboardView';
import { BudgetTransactionsView } from './views/BudgetTransactionsView';
import { CreditCardsView } from './views/CreditCardsView';
import { LoansEmiView } from './views/LoansEmiView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { AdminView } from './views/AdminView';
import { TransactionModal } from './components/TransactionModal';
import { ProfileModal } from './components/ProfileModal';
import { TempPasswordResetModal } from './components/TempPasswordResetModal';
import { CurrencyOnboardingModal } from './components/CurrencyOnboardingModal';
import { InactivityTracker } from './components/InactivityTracker';
import { ToastNotification } from './components/ToastNotification';
import { AlertTriangle, Lock } from 'lucide-react';
import api from './services/api';

function AppContent() {
  const { user, loading, maintenanceInfo, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('Dashboard');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [transactionDefaults, setTransactionDefaults] = useState<{ category?: string; subcategory?: string; type?: 'income' | 'expense' | 'savings' }>({});
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [requestSent, setRequestSent] = useState<boolean>(false);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [requestingUpgrade, setRequestingUpgrade] = useState<boolean>(false);

  // Fetch pending user access requests
  useEffect(() => {
    if (!user) return;
    api.get('/access-requests/my')
      .then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          const pendings = res.data.data
            .filter((r: any) => r.status === 'PENDING')
            .map((r: any) => r.requestType?.toUpperCase() || '');
          setPendingRequests(pendings);
        }
      })
      .catch(() => {});
  }, [user, refreshKey]);

  // If user is Super Admin, default to Admin portal or allow easy switching
  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
      // Keep active tab as chosen or Dashboard
    }
  }, [user?.role]);

  // User active heartbeat (every 20s) so Admin portal sees live Online status in real time
  useEffect(() => {
    if (!user) return;
    const sendHeartbeat = () => {
      api.post('/user/heartbeat').catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 20000);
    return () => clearInterval(interval);
  }, [user]);

  const handleTransactionSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const openTransactionModal = (category?: string, subcategory?: string, type?: 'income' | 'expense' | 'savings') => {
    setTransactionDefaults({ category: typeof category === 'string' ? category : undefined, subcategory, type });
    setIsModalOpen(true);
  };

  const handleProfileSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleRequestDashboardAccess = async () => {
    try {
      await api.post('/access-requests', {
        requestType: 'DASHBOARD_ACCESS',
        details: 'User requesting unlock of Dashboard View'
      });
      setRequestSent(true);
      setPendingRequests(prev => [...prev, 'DASHBOARD_ACCESS']);
    } catch {}
  };

  const handleRequestProUpgrade = async () => {
    setRequestingUpgrade(true);
    try {
      await api.post('/access-requests', {
        requestType: 'PLAN_UPGRADE_PRO',
        details: 'User requesting upgrade to PRO plan for Loans & EMI tracker'
      });
      setPendingRequests(prev => [...prev, 'PLAN_UPGRADE_PRO']);
    } catch {
      alert('Could not submit upgrade request. Please try again.');
    } finally {
      setRequestingUpgrade(false);
    }
  };

  const hasPendingDashboardRequest = requestSent || pendingRequests.some(r => r.includes('DASHBOARD'));
  const hasPendingUpgrade = pendingRequests.some(r => r.includes('PRO') || r.includes('PLAN') || r.includes('LOAN') || r.includes('ENTERPRISE'));

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)'
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>Loading FinTrack...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={() => setActiveTab(isAdmin ? 'Admin' : 'Dashboard')} />;
  }

  // Admin users strictly manage & control all application systems (no normal user views)
  if (isAdmin) {
    return (
      <div className="app-container">
        {maintenanceInfo?.active && (
          <div
            style={{
              background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
              color: '#000',
              padding: '10px 24px',
              fontSize: 13,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
              zIndex: 999
            }}
          >
            <AlertTriangle size={18} style={{ color: '#000' }} />
            <span>
              [ADMIN ACTIVE] Scheduled System Maintenance Underway: {maintenanceInfo.message}
              {maintenanceInfo.endTime && ` • Expected Completion: ${maintenanceInfo.endTime}`}
            </span>
          </div>
        )}
        <AdminView />
        <TempPasswordResetModal />
        <InactivityTracker />
        <ToastNotification />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Persistent Maintenance Announcement Banner if Active */}
      {maintenanceInfo?.active && (
        <div
          style={{
            background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
            color: '#000',
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            zIndex: 999
          }}
        >
          <AlertTriangle size={18} style={{ color: '#000' }} />
          <span>
            Scheduled System Maintenance Underway: {maintenanceInfo.message}
            {maintenanceInfo.endTime && ` • Expected Completion: ${maintenanceInfo.endTime}`}
          </span>
        </div>
      )}

      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenProfile={() => setIsProfileOpen(true)}
        onGlobalSearch={(query) => {
          setGlobalSearchQuery(query);
          setActiveTab('Budget & Transactions');
        }}
      />

      {/* If Dashboard view is restricted by Admin */}
      {activeTab === 'Dashboard' && user.canAccessDashboard === false ? (
        <div
          style={{
            maxWidth: 600,
            margin: '80px auto',
            padding: 40,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 20,
            textAlign: 'center',
            boxShadow: '0 12px 30px rgba(0,0,0,0.3)'
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Dashboard Access Restricted
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            Access to the financial dashboard is currently restricted for your account by the administrator. You can submit an access request to unlock this view.
          </p>

          {hasPendingDashboardRequest ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                ✓ Access Request Pending Administrator Approval
              </div>
              <button
                type="button"
                disabled
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: '1px solid rgba(100, 116, 139, 0.3)',
                  background: 'rgba(100, 116, 139, 0.15)',
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'not-allowed'
                }}
              >
                Pending Administrator Approval
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRequestDashboardAccess}
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                color: '#FFF',
                border: 'none',
                borderRadius: 10,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
              }}
            >
              Request Dashboard Access
            </button>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'Dashboard' && (
            <DashboardView key={refreshKey} onOpenNewTransaction={() => openTransactionModal()} />
          )}
        </>
      )}

      {(activeTab === 'Budget & Transactions' || activeTab === 'Budget' || activeTab === 'Transactions') && (
        <BudgetTransactionsView
          key={refreshKey}
          globalSearchQuery={globalSearchQuery}
          onOpenNewTransaction={openTransactionModal}
        />
      )}

      {activeTab === 'Credit Cards' && (
        <CreditCardsView key={refreshKey} />
      )}

      {activeTab === 'Loans & EMI' && (
        user.subscriptionTier === 'FREE' ? (
          <div
            style={{
              maxWidth: 600,
              margin: '80px auto',
              padding: 40,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              textAlign: 'center',
              boxShadow: '0 12px 30px rgba(0,0,0,0.3)'
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(124, 58, 237, 0.15)',
                color: '#7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Lock size={28} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Loans & EMI Tracker Requires PRO Plan
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Your account is currently on the <strong>FREE Basic Plan</strong>. Tracking loans, amortization schedules, and principal payoff progress is exclusively unlocked on <strong>PRO</strong> and <strong>ENTERPRISE</strong> packages.
            </p>

            {hasPendingUpgrade ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                  ✓ Plan Upgrade Request Pending Administrator Approval
                </div>
                <button
                  type="button"
                  disabled
                  style={{
                    padding: '12px 24px',
                    borderRadius: 10,
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'not-allowed'
                  }}
                >
                  Pending Administrator Approval
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRequestProUpgrade}
                disabled={requestingUpgrade}
                style={{
                  background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 28px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)'
                }}
              >
                {requestingUpgrade ? 'Submitting Upgrade Request...' : 'Request Upgrade to PRO Plan'}
              </button>
            )}
          </div>
        ) : (
          <LoansEmiView key={refreshKey} />
        )
      )}

      {activeTab === 'Settings' && (
        <SettingsView key={refreshKey} />
      )}

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleTransactionSuccess}
        initialCategory={transactionDefaults.category}
        initialSubcategory={transactionDefaults.subcategory}
        initialType={transactionDefaults.type}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSuccess={handleProfileSuccess}
      />

      <TempPasswordResetModal />
      <CurrencyOnboardingModal />
      <InactivityTracker />
      <ToastNotification />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
