import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Plus,
  Trash2,
  Edit2,
  CreditCard,
  Wallet,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  bankAccountService,
  type BankAccountModel,
  type BankDebitCard,
  type CashWalletModel
} from '../services/bankAccountService';
import { currencyService } from '../services/currencyService';
import { showToast } from '../components/ToastNotification';

const POPULAR_BANKS = [
  'HDFC Bank',
  'State Bank of India',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
  'IDFC FIRST Bank',
  'Federal Bank'
];

export const AccountsView: React.FC = () => {
  const { user } = useAuth();
  const isViewOnly = Boolean(user?.isReadOnly || (user?.isMember && user?.memberPermission === 'VIEW_ONLY'));

  const [accounts, setAccounts] = useState<BankAccountModel[]>(() =>
    bankAccountService.getAccounts(user?.email)
  );
  const [cashWallet, setCashWallet] = useState<CashWalletModel>(() =>
    bankAccountService.getCashBalance(user?.email)
  );

  // Modal states
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountModel | null>(null);

  // Quick Balance Edit Modal
  const [balanceEditAcc, setBalanceEditAcc] = useState<BankAccountModel | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState<string>('');

  // Cash Balance Edit Modal
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashInputValue, setCashInputValue] = useState<string>('');
  const [cashNotes, setCashNotes] = useState<string>('');

  // Add Debit Card Modal
  const [debitCardModalAcc, setDebitCardModalAcc] = useState<BankAccountModel | null>(null);
  const [newDebitCardName, setNewDebitCardName] = useState('');
  const [newDebitCardLast4, setNewDebitCardLast4] = useState('');
  const [newDebitCardExpiry, setNewDebitCardExpiry] = useState('');

  // Form state for Add / Edit Account
  const [formBankName, setFormBankName] = useState('HDFC Bank');
  const [customBankName, setCustomBankName] = useState('');
  const [formAccountType, setFormAccountType] = useState<'Savings' | 'Current' | 'Salary'>('Savings');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formHolderName, setFormHolderName] = useState(user?.name || '');
  const [formIfsc, setFormIfsc] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formBalance, setFormBalance] = useState<string>('0');

  // Initial Debit Card in Add Account
  const [includeDebitCard, setIncludeDebitCard] = useState(false);
  const [formDebitName, setFormDebitName] = useState('');
  const [formDebitLast4, setFormDebitLast4] = useState('');
  const [formDebitExpiry, setFormDebitExpiry] = useState('');

  useEffect(() => {
    const handleAccountsUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setAccounts(e.detail);
      } else {
        setAccounts(bankAccountService.getAccounts(user?.email));
      }
    };

    const handleCashUpdate = (e: any) => {
      if (e.detail) {
        setCashWallet(e.detail);
      } else {
        setCashWallet(bankAccountService.getCashBalance(user?.email));
      }
    };

    window.addEventListener('fintrack-accounts-updated', handleAccountsUpdate);
    window.addEventListener('fintrack-cash-updated', handleCashUpdate);
    return () => {
      window.removeEventListener('fintrack-accounts-updated', handleAccountsUpdate);
      window.removeEventListener('fintrack-cash-updated', handleCashUpdate);
    };
  }, [user?.email]);

  // Aggregate Calculations
  const totalBankBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const totalLiquidBalance = totalBankBalance + (cashWallet.balance || 0);
  const totalDebitCards = accounts.reduce((sum, acc) => sum + (acc.debitCards?.length || (acc.hasDebitCard ? 1 : 0)), 0);

  // Open Add Account
  const handleOpenAdd = () => {
    setEditingAccount(null);
    setFormBankName('HDFC Bank');
    setCustomBankName('');
    setFormAccountType('Savings');
    setFormAccountNumber('');
    setFormHolderName(user?.name || '');
    setFormIfsc('');
    setFormBranch('');
    setFormBalance('0');
    setIncludeDebitCard(false);
    setFormDebitName('');
    setFormDebitLast4('');
    setFormDebitExpiry('');
    setIsAddAccountOpen(true);
  };

  // Open Edit Account Details
  const handleOpenEdit = (acc: BankAccountModel) => {
    setEditingAccount(acc);
    if (POPULAR_BANKS.includes(acc.bankName)) {
      setFormBankName(acc.bankName);
      setCustomBankName('');
    } else {
      setFormBankName('Other');
      setCustomBankName(acc.bankName);
    }
    setFormAccountType(acc.accountType || 'Savings');
    setFormAccountNumber(acc.accountNumberLast4 || '');
    setFormHolderName(acc.holderName || '');
    setFormIfsc(acc.ifscCode || '');
    setFormBranch(acc.branch || '');
    setFormBalance(String(acc.balance || 0));
    setIncludeDebitCard(false);
    setIsAddAccountOpen(true);
  };

  // Save Account
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewOnly) return;

    const chosenBank = formBankName === 'Other' ? (customBankName.trim() || 'Bank') : formBankName;
    const cleanLast4 = formAccountNumber.slice(-4) || '0000';
    const parsedBalance = Math.max(0, Number(formBalance) || 0);

    if (editingAccount) {
      bankAccountService.updateAccount(editingAccount.id, {
        bankName: chosenBank,
        accountType: formAccountType,
        accountNumberLast4: cleanLast4,
        holderName: formHolderName.trim() || undefined,
        ifscCode: formIfsc.trim().toUpperCase() || undefined,
        branch: formBranch.trim() || undefined,
        balance: parsedBalance
      }, user?.email);
      showToast({ title: 'Account Updated', message: `${chosenBank} account updated successfully.`, type: 'success' });
    } else {
      const debitCardsList: BankDebitCard[] = [];
      if (includeDebitCard && formDebitName.trim()) {
        debitCardsList.push({
          id: `dc-${Date.now()}`,
          name: formDebitName.trim(),
          last4: formDebitLast4.trim().slice(-4) || cleanLast4,
          expiry: formDebitExpiry.trim() || undefined
        });
      }

      bankAccountService.addAccount({
        bankName: chosenBank,
        accountType: formAccountType,
        accountNumberLast4: cleanLast4,
        holderName: formHolderName.trim() || undefined,
        ifscCode: formIfsc.trim().toUpperCase() || undefined,
        branch: formBranch.trim() || undefined,
        balance: parsedBalance,
        debitCards: debitCardsList
      }, user?.email);

      showToast({ title: 'Account Added', message: `${chosenBank} account registered successfully.`, type: 'success' });
    }

    setAccounts(bankAccountService.getAccounts(user?.email));
    setIsAddAccountOpen(false);
  };

  // Delete Account
  const handleDeleteAccount = (acc: BankAccountModel) => {
    if (isViewOnly) return;
    if (window.confirm(`Are you sure you want to delete ${acc.bankName} (•••• ${acc.accountNumberLast4})?`)) {
      bankAccountService.deleteAccount(acc.id, user?.email);
      setAccounts(bankAccountService.getAccounts(user?.email));
      showToast({ title: 'Account Removed', message: `${acc.bankName} removed from accounts list.`, type: 'info' });
    }
  };

  // Save Quick Balance Edit
  const handleSaveBalanceEdit = () => {
    if (!balanceEditAcc || isViewOnly) return;
    const amt = Math.max(0, Number(newBalanceValue) || 0);
    bankAccountService.updateAccountBalance(balanceEditAcc.id, amt, user?.email);
    setAccounts(bankAccountService.getAccounts(user?.email));
    setBalanceEditAcc(null);
    showToast({ title: 'Balance Updated', message: `${balanceEditAcc.bankName} balance updated to ${currencyService.format(amt)}.`, type: 'success' });
  };

  // Save Cash Wallet Balance
  const handleSaveCashBalance = () => {
    if (isViewOnly) return;
    const amt = Math.max(0, Number(cashInputValue) || 0);
    const updated = bankAccountService.updateCashBalance(amt, cashNotes.trim() || 'Manual adjustment', user?.email);
    setCashWallet(updated);
    setIsCashModalOpen(false);
    showToast({ title: 'Cash Updated', message: `Cash balance updated to ${currencyService.format(amt)}.`, type: 'success' });
  };

  // Add Debit Card to Account
  const handleSaveDebitCard = () => {
    if (!debitCardModalAcc || isViewOnly) return;
    if (!newDebitCardName.trim()) {
      showToast({ title: 'Card Name Required', message: 'Please enter a name for the debit card.', type: 'warning' });
      return;
    }
    const last4 = newDebitCardLast4.trim().slice(-4) || debitCardModalAcc.accountNumberLast4;
    bankAccountService.addDebitCardToAccount(debitCardModalAcc.id, {
      name: newDebitCardName.trim(),
      last4,
      expiry: newDebitCardExpiry.trim() || undefined
    }, user?.email);

    setAccounts(bankAccountService.getAccounts(user?.email));
    setDebitCardModalAcc(null);
    setNewDebitCardName('');
    setNewDebitCardLast4('');
    setNewDebitCardExpiry('');
    showToast({ title: 'Debit Card Linked', message: `${newDebitCardName} linked to ${debitCardModalAcc.bankName}.`, type: 'success' });
  };

  // Remove Debit Card
  const handleRemoveDebitCard = (accId: string, cardId: string, cardName: string) => {
    if (isViewOnly) return;
    if (window.confirm(`Remove debit card "${cardName}"?`)) {
      bankAccountService.removeDebitCardFromAccount(accId, cardId, user?.email);
      setAccounts(bankAccountService.getAccounts(user?.email));
      showToast({ title: 'Debit Card Removed', message: `Debit card ${cardName} was removed.`, type: 'info' });
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                Bank Accounts & Cash Reserve
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Manage your bank accounts, update real-time liquid balances, track linked debit cards, and maintain cash in hand.
              </p>
            </div>
          </div>
        </div>

        {!isViewOnly && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setCashInputValue(String(cashWallet.balance || 0));
                setCashNotes(cashWallet.notes || '');
                setIsCashModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#34D399',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              <Wallet size={16} />
              <span>Update Cash Balance</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
              }}
            >
              <Plus size={16} />
              <span>Add Bank Account</span>
            </button>
          </div>
        )}
      </div>

      {/* Top KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Total Liquid Wealth */}
        <div className="kpi-card" style={{ padding: 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Liquid Wealth
            </span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
            {currencyService.format(totalLiquidBalance)}
          </div>
          <span style={{ fontSize: 11.5, color: '#10B981', marginTop: 6, display: 'block' }}>
            Bank Balances + Cash Reserve
          </span>
        </div>

        {/* Bank Balances */}
        <div className="kpi-card" style={{ padding: 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              In Bank Accounts ({accounts.length})
            </span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={16} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#3B82F6' }}>
            {currencyService.format(totalBankBalance)}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            Across {accounts.length} linked bank account{accounts.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Cash in Hand / Wallet */}
        <div className="kpi-card" style={{ padding: 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Cash in Hand (Wallet)
            </span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>
            {currencyService.format(cashWallet.balance || 0)}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            Updated: {cashWallet.lastUpdated ? new Date(cashWallet.lastUpdated).toLocaleDateString() : 'Active'}
          </span>
        </div>

        {/* Linked Debit Cards */}
        <div className="kpi-card" style={{ padding: 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Active Debit Cards
            </span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
            {totalDebitCards}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            Directly connected to accounts
          </span>
        </div>
      </div>

      {/* Cash Management Spotlight Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Wallet size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                Cash in Hand / Physical Cash Wallet
              </h3>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.2)', color: '#10B981' }}>
                CASH OPTION
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Current physical cash reserve: <strong style={{ color: '#10B981' }}>{currencyService.format(cashWallet.balance || 0)}</strong>
              {cashWallet.notes && ` • Note: ${cashWallet.notes}`}
            </p>
          </div>
        </div>

        {!isViewOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setCashInputValue(String(cashWallet.balance || 0));
                setCashNotes(cashWallet.notes || '');
                setIsCashModalOpen(true);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#10B981',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Edit2 size={13} />
              <span>Edit Cash Amount</span>
            </button>
          </div>
        )}
      </div>

      {/* Bank Accounts Section */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
            Your Bank Accounts ({accounts.length})
          </h2>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Click &quot;Update Balance&quot; on any account to reconcile your current bank balance
          </span>
        </div>

        {accounts.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              border: '1px dashed var(--border-color)',
              borderRadius: 20
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Landmark size={28} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              No Bank Accounts Added Yet
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 450, marginLeft: 'auto', marginRight: 'auto' }}>
              Add your salary, savings, and current accounts with their current balances. Linked debit cards will automatically show in payment mode options.
            </p>
            {!isViewOnly && (
              <button
                type="button"
                onClick={handleOpenAdd}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Add Your First Bank Account
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
            {accounts.map(acc => {
              const debitCards = acc.debitCards || [];

              return (
                <div
                  key={acc.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 18,
                    padding: 22,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16
                  }}
                >
                  {/* Top Bar of Account Card */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#3B82F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Landmark size={22} />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                            {acc.bankName}
                          </h4>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {acc.accountType} Account •••• {acc.accountNumberLast4}
                          </span>
                        </div>
                      </div>

                      {!isViewOnly && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(acc)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              borderRadius: 8
                            }}
                            title="Edit Bank Details"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#EF4444',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              borderRadius: 8
                            }}
                            title="Remove Account"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Balance Display with Quick Edit Action */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 14
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Current Account Balance
                        </span>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 2 }}>
                          {currencyService.format(acc.balance || 0)}
                        </div>
                      </div>

                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setBalanceEditAcc(acc);
                            setNewBalanceValue(String(acc.balance || 0));
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#34D399',
                            fontWeight: 700,
                            fontSize: 11.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <RefreshCw size={12} />
                          <span>Update Balance</span>
                        </button>
                      )}
                    </div>

                    {/* Meta info (Holder, IFSC, Branch) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
                      {acc.holderName && (
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Holder: </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{acc.holderName}</strong>
                        </div>
                      )}
                      {acc.ifscCode && (
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>IFSC: </span>
                          <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{acc.ifscCode}</strong>
                        </div>
                      )}
                      {acc.branch && (
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Branch: </span>
                          <span style={{ color: 'var(--text-primary)' }}>{acc.branch}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Linked Debit Cards Section */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CreditCard size={13} style={{ color: '#F59E0B' }} />
                        <span>Linked Debit Cards ({debitCards.length})</span>
                      </span>

                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setDebitCardModalAcc(acc);
                            setNewDebitCardName(`${acc.bankName} Platinum Debit Card`);
                            setNewDebitCardLast4(acc.accountNumberLast4);
                            setNewDebitCardExpiry('');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#60A5FA',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Plus size={12} />
                          <span>Link Debit Card</span>
                        </button>
                      )}
                    </div>

                    {debitCards.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
                        No debit cards linked to this account yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {debitCards.map(dc => (
                          <div
                            key={dc.id}
                            style={{
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: 12
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <CreditCard size={14} style={{ color: '#60A5FA' }} />
                              <div>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dc.name}</span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>•••• {dc.last4}</span>
                                {dc.expiry && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({dc.expiry})</span>}
                              </div>
                            </div>

                            {!isViewOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDebitCard(acc.id, dc.id, dc.name)}
                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.7 }}
                                title="Remove Debit Card"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Add / Edit Bank Account */}
      {isAddAccountOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div style={{ background: '#131824', border: '1px solid #2A364F', borderRadius: 20, width: '100%', maxWidth: 540, padding: 28, boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: '#FFF' }}>
              {editingAccount ? 'Edit Bank Account Details' : 'Add New Bank Account'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94A3B8' }}>
              Enter your bank details and current balance to track it in your financial assets.
            </p>

            <form onSubmit={handleSaveAccount}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Bank Name Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                    Bank Name *
                  </label>
                  <select
                    value={formBankName}
                    onChange={e => setFormBankName(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                  >
                    {POPULAR_BANKS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    <option value="Other">Other Bank (Custom)</option>
                  </select>
                  {formBankName === 'Other' && (
                    <input
                      type="text"
                      placeholder="Enter Bank Name..."
                      value={customBankName}
                      onChange={e => setCustomBankName(e.target.value)}
                      required
                      style={{ width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                    />
                  )}
                </div>

                {/* Account Type & Number */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                      Account Type *
                    </label>
                    <select
                      value={formAccountType}
                      onChange={e => setFormAccountType(e.target.value as any)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                    >
                      <option value="Savings">Savings Account</option>
                      <option value="Salary">Salary Account</option>
                      <option value="Current">Current Account</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                      Account Number (or Last 4) *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 5432"
                      value={formAccountNumber}
                      onChange={e => setFormAccountNumber(e.target.value)}
                      required
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Current Balance */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                    Current Available Balance (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 50000"
                    value={formBalance}
                    onChange={e => setFormBalance(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#10B981', fontWeight: 700, fontSize: 15 }}
                  />
                </div>

                {/* Holder Name & IFSC */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                      Holder Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={formHolderName}
                      onChange={e => setFormHolderName(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0001234"
                      value={formIfsc}
                      onChange={e => setFormIfsc(e.target.value.toUpperCase())}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Optional Branch */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                    Branch Location (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MG Road, Bengaluru"
                    value={formBranch}
                    onChange={e => setFormBranch(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                  />
                </div>

                {/* Option to include Debit Card details right away (when adding) */}
                {!editingAccount && (
                  <div style={{ borderTop: '1px solid #2A364F', paddingTop: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#60A5FA' }}>
                      <input
                        type="checkbox"
                        checked={includeDebitCard}
                        onChange={e => {
                          setIncludeDebitCard(e.target.checked);
                          if (e.target.checked && !formDebitName) {
                            setFormDebitName(`${formBankName} Debit Card`);
                          }
                        }}
                      />
                      <span>Also link Debit Card to this account now</span>
                    </label>

                    {includeDebitCard && (
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Card Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Millennia Debit"
                            value={formDebitName}
                            onChange={e => setFormDebitName(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Last 4</label>
                          <input
                            type="text"
                            placeholder="e.g. 8834"
                            maxLength={4}
                            value={formDebitLast4}
                            onChange={e => setFormDebitLast4(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Expiry (MM/YY)</label>
                          <input
                            type="text"
                            placeholder="08/29"
                            value={formDebitExpiry}
                            onChange={e => setFormDebitExpiry(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 12 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #2A364F', background: 'transparent', color: '#94A3B8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: '#FFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {editingAccount ? 'Update Bank Account' : 'Save Bank Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Bank Balance Edit Modal */}
      {balanceEditAcc && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: 20 }}>
          <div style={{ background: '#131824', border: '1px solid #2A364F', borderRadius: 18, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 16px 40px rgba(0,0,0,0.8)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#FFF' }}>
              Update Bank Balance
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94A3B8' }}>
              Set new reconciled balance for <strong>{balanceEditAcc.bankName}</strong> (•••• {balanceEditAcc.accountNumberLast4}).
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                New Balance Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newBalanceValue}
                onChange={e => setNewBalanceValue(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#1E2638', border: '1px solid #10B981', color: '#10B981', fontWeight: 800, fontSize: 18 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setBalanceEditAcc(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #2A364F', background: 'transparent', color: '#94A3B8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBalanceEdit}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#10B981', color: '#FFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Confirm Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Update Cash Wallet Balance */}
      {isCashModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: 20 }}>
          <div style={{ background: '#131824', border: '1px solid #2A364F', borderRadius: 18, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 16px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFF' }}>
                  Update Cash in Hand Balance
                </h3>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>Physical Cash / Wallet Reserve</span>
              </div>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94A3B8' }}>
              Count your physical cash in hand or wallet and update the balance below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                  Cash Amount (₹) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashInputValue}
                  onChange={e => setCashInputValue(e.target.value)}
                  autoFocus
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: '#1E2638', border: '1px solid #10B981', color: '#10B981', fontWeight: 800, fontSize: 18 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ATM withdrawal, petty cash reserve"
                  value={cashNotes}
                  onChange={e => setCashNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setIsCashModalOpen(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #2A364F', background: 'transparent', color: '#94A3B8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCashBalance}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#10B981', color: '#FFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Update Cash Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Link Debit Card Modal */}
      {debitCardModalAcc && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: 20 }}>
          <div style={{ background: '#131824', border: '1px solid #2A364F', borderRadius: 18, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 16px 40px rgba(0,0,0,0.8)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#FFF' }}>
              Link Debit Card
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94A3B8' }}>
              Add a new debit card linked to <strong>{debitCardModalAcc.bankName}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                  Debit Card Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Millennia Platinum Debit"
                  value={newDebitCardName}
                  onChange={e => setNewDebitCardName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                    Card Last 4 Digits
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 8834"
                    value={newDebitCardLast4}
                    onChange={e => setNewDebitCardLast4(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#E2E8F0', marginBottom: 6 }}>
                    Expiry (MM/YY)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11/29"
                    value={newDebitCardExpiry}
                    onChange={e => setNewDebitCardExpiry(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#1E2638', border: '1px solid #2A364F', color: '#FFF', fontSize: 13 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDebitCardModalAcc(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #2A364F', background: 'transparent', color: '#94A3B8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDebitCard}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: '#FFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Link Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
