import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { DashboardView } from './views/DashboardView';
import { BudgetPlanningView } from './views/BudgetPlanningView';
import { TransactionsView } from './views/TransactionsView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { TransactionModal } from './components/TransactionModal';
import { ProfileModal } from './components/ProfileModal';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('Dashboard');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const handleTransactionSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleProfileSuccess = () => {
    setRefreshKey(prev => prev + 1);
  };

  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

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
    return <LoginView onLoginSuccess={() => setActiveTab('Dashboard')} />;
  }

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenProfile={() => setIsProfileOpen(true)}
        onGlobalSearch={(query) => {
          setGlobalSearchQuery(query);
          setActiveTab('Transactions');
        }}
      />

      {activeTab === 'Dashboard' && (
        <DashboardView key={refreshKey} onOpenNewTransaction={() => setIsModalOpen(true)} />
      )}

      {activeTab === 'Budget Planning' && (
        <BudgetPlanningView key={refreshKey} onOpenNewTransaction={() => setIsModalOpen(true)} />
      )}

      {activeTab === 'Transactions' && (
        <TransactionsView
          key={refreshKey}
          globalSearchQuery={globalSearchQuery}
          onOpenNewTransaction={() => setIsModalOpen(true)}
        />
      )}

      {activeTab === 'Settings' && (
        <SettingsView key={refreshKey} />
      )}

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleTransactionSuccess}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSuccess={handleProfileSuccess}
      />
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
