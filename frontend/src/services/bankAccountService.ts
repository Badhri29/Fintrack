import { getActiveUserEmail } from './cardService';

export interface BankDebitCard {
  id: string;
  name: string; // e.g. HDFC Millennia Debit Card
  last4: string;
  expiry?: string;
}

export interface BankCreditCard {
  id: string;
  name: string; // e.g. HDFC Regalia Credit Card
  last4: string;
  limit?: number;
  linkedCardId?: string; // Optional link to primary credit card in creditCards tab
}

export interface BankAccountModel {
  id: string;
  bankName: string; // e.g. HDFC Bank, State Bank of India
  accountType: 'Savings' | 'Current' | 'Salary';
  accountNumberLast4: string;
  holderName?: string;
  ifscCode?: string;
  branch?: string;
  balance?: number;
  isPrimary?: boolean;
  debitCards?: BankDebitCard[];
  creditCards?: BankCreditCard[];
  // Legacy fields for backward compatibility
  hasDebitCard?: boolean;
  debitCardName?: string;
  debitCardLast4?: string;
}

export interface CashWalletModel {
  balance: number;
  lastUpdated: string;
  notes?: string;
}

const DEFAULT_ACCOUNTS: BankAccountModel[] = [
  {
    id: 'acc-1',
    bankName: 'HDFC Bank',
    accountType: 'Salary',
    accountNumberLast4: '7412',
    holderName: 'Primary User',
    balance: 85000,
    hasDebitCard: true,
    debitCardName: 'HDFC Millennia Debit Card',
    debitCardLast4: '8834',
    debitCards: [
      { id: 'dc-1', name: 'HDFC Millennia Platinum Debit Card', last4: '8834', expiry: '08/29' }
    ],
    creditCards: [
      { id: 'cc-1', name: 'HDFC Regalia Gold Credit Card', last4: '4512', limit: 300000 }
    ],
    isPrimary: true
  },
  {
    id: 'acc-2',
    bankName: 'State Bank of India',
    accountType: 'Savings',
    accountNumberLast4: '3091',
    holderName: 'Primary User',
    balance: 42000,
    hasDebitCard: true,
    debitCardName: 'SBI Global Debit Card',
    debitCardLast4: '4190',
    debitCards: [
      { id: 'dc-2', name: 'SBI Global International Debit Card', last4: '4190', expiry: '11/28' }
    ],
    creditCards: [],
    isPrimary: false
  }
];

const getStorageKey = (email?: string): string => {
  const userEmail = getActiveUserEmail(email);
  return `fintrack_bank_accounts_${userEmail}`;
};

const getCashStorageKey = (email?: string): string => {
  const userEmail = getActiveUserEmail(email);
  return `fintrack_cash_wallet_${userEmail}`;
};

export const bankAccountService = {
  getAccounts(email?: string): BankAccountModel[] {
    const userEmail = getActiveUserEmail(email);
    try {
      const stored = localStorage.getItem(getStorageKey(userEmail));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Normalize accounts so debitCards and creditCards arrays always exist
          return parsed.map((acc: BankAccountModel) => {
            const debitCards = acc.debitCards ? [...acc.debitCards] : [];
            if (debitCards.length === 0 && acc.hasDebitCard) {
              debitCards.push({
                id: `dc-${acc.id}`,
                name: acc.debitCardName || `${acc.bankName} Debit Card`,
                last4: acc.debitCardLast4 || acc.accountNumberLast4
              });
            }
            return {
              ...acc,
              balance: typeof acc.balance === 'number' ? acc.balance : 0,
              debitCards,
              creditCards: acc.creditCards || []
            };
          });
        }
      }
    } catch (err) {
      console.error('Error reading bank accounts:', err);
    }

    if (userEmail === 'demo@fintrack.io') {
      return DEFAULT_ACCOUNTS;
    }
    return [];
  },

  saveAccounts(accounts: BankAccountModel[], email?: string): void {
    const userEmail = getActiveUserEmail(email);
    try {
      localStorage.setItem(getStorageKey(userEmail), JSON.stringify(accounts));
      window.dispatchEvent(new CustomEvent('fintrack-accounts-updated', { detail: accounts }));
    } catch (err) {
      console.error('Error saving bank accounts:', err);
    }
  },

  addAccount(data: Omit<BankAccountModel, 'id'>, email?: string): BankAccountModel {
    const current = this.getAccounts(email);
    const debitCards: BankDebitCard[] = data.debitCards ? [...data.debitCards] : [];
    if (debitCards.length === 0 && data.hasDebitCard) {
      debitCards.push({
        id: `dc-${Date.now()}`,
        name: data.debitCardName || `${data.bankName} Debit Card`,
        last4: data.debitCardLast4 || data.accountNumberLast4
      });
    }

    const newAcc: BankAccountModel = {
      ...data,
      id: `acc-${Date.now()}`,
      balance: typeof data.balance === 'number' ? data.balance : 0,
      debitCards,
      creditCards: data.creditCards || []
    };
    const updated = [...current, newAcc];
    this.saveAccounts(updated, email);
    return newAcc;
  },

  updateAccount(id: string, updates: Partial<BankAccountModel>, email?: string): BankAccountModel | null {
    const current = this.getAccounts(email);
    const index = current.findIndex(a => a.id === id);
    if (index === -1) return null;

    const existing = current[index];
    const updatedAcc: BankAccountModel = {
      ...existing,
      ...updates,
      balance: updates.balance !== undefined ? updates.balance : existing.balance,
      debitCards: updates.debitCards !== undefined ? updates.debitCards : existing.debitCards,
      creditCards: updates.creditCards !== undefined ? updates.creditCards : existing.creditCards
    };

    current[index] = updatedAcc;
    this.saveAccounts(current, email);
    return updatedAcc;
  },

  updateAccountBalance(id: string, newBalance: number, email?: string): BankAccountModel | null {
    return this.updateAccount(id, { balance: Number(newBalance) || 0 }, email);
  },

  deleteAccount(id: string, email?: string): boolean {
    const current = this.getAccounts(email);
    const updated = current.filter(a => a.id !== id);
    this.saveAccounts(updated, email);
    return true;
  },

  addDebitCardToAccount(accountId: string, card: Omit<BankDebitCard, 'id'>, email?: string): BankAccountModel | null {
    const current = this.getAccounts(email);
    const acc = current.find(a => a.id === accountId);
    if (!acc) return null;

    const newCard: BankDebitCard = {
      ...card,
      id: `dc-${Date.now()}`
    };
    const debitCards = [...(acc.debitCards || []), newCard];
    return this.updateAccount(accountId, { debitCards, hasDebitCard: true }, email);
  },

  addCreditCardToAccount(accountId: string, card: Omit<BankCreditCard, 'id'>, email?: string): BankAccountModel | null {
    const current = this.getAccounts(email);
    const acc = current.find(a => a.id === accountId);
    if (!acc) return null;

    const newCard: BankCreditCard = {
      ...card,
      id: `cc-${Date.now()}`
    };
    const creditCards = [...(acc.creditCards || []), newCard];
    return this.updateAccount(accountId, { creditCards }, email);
  },

  removeDebitCardFromAccount(accountId: string, cardId: string, email?: string): BankAccountModel | null {
    const current = this.getAccounts(email);
    const acc = current.find(a => a.id === accountId);
    if (!acc) return null;

    const debitCards = (acc.debitCards || []).filter(c => c.id !== cardId);
    return this.updateAccount(accountId, { debitCards, hasDebitCard: debitCards.length > 0 }, email);
  },

  removeCreditCardFromAccount(accountId: string, cardId: string, email?: string): BankAccountModel | null {
    const current = this.getAccounts(email);
    const acc = current.find(a => a.id === accountId);
    if (!acc) return null;

    const creditCards = (acc.creditCards || []).filter(c => c.id !== cardId);
    return this.updateAccount(accountId, { creditCards }, email);
  },

  /**
   * Applies the financial impact of a transaction to the corresponding bank account or cash wallet.
   * If revert is true, reverses the effect (used when deleting a transaction or before updating it).
   */
  applyTransactionImpact(
    tx: { type?: string; amount?: number | string; paymentMode?: string; card?: string | null },
    revert: boolean = false,
    email?: string
  ): void {
    const rawAmt = Number(tx.amount);
    if (isNaN(rawAmt) || rawAmt <= 0) return;

    const type = String(tx.type || 'expense').toLowerCase();
    const mode = String(tx.paymentMode || '').toLowerCase().trim();

    // Determine balance delta:
    // For expense: normally reduces balance (-amt). If revert, adds back (+amt).
    // For income: normally increases balance (+amt). If revert, reduces (-amt).
    const isIncome = type === 'income';
    const delta = isIncome ? (revert ? -rawAmt : rawAmt) : (revert ? rawAmt : -rawAmt);

    // 1. Cash In Hand
    if (mode === 'cash' || mode.includes('cash')) {
      const currentCash = this.getCashBalance(email);
      const newCashBalance = Math.max(0, (currentCash.balance || 0) + delta);
      this.updateCashBalance(
        newCashBalance,
        isIncome
          ? (revert ? 'Reverted Cash Income' : 'Cash Income Received')
          : (revert ? 'Reverted Cash Expense' : 'Cash Expense Spent'),
        email
      );
      return;
    }

    // 2. Bank Accounts & Debit Cards & UPI / Net Banking
    const accounts = this.getAccounts(email);
    if (accounts.length === 0) return;

    // Check if mode points to a specific bank account or debit card
    let targetAccount = accounts.find(acc => {
      if (acc.id && (mode === acc.id.toLowerCase() || mode.includes(acc.id.toLowerCase()))) return true;
      // bank_{name}_{last4}
      if (acc.accountNumberLast4 && acc.accountNumberLast4.length >= 4 && mode.includes(acc.accountNumberLast4)) return true;
      // debit cards
      if (acc.debitCards?.some(dc => dc.last4 && dc.last4.length >= 4 && mode.includes(dc.last4))) return true;
      if (acc.debitCardLast4 && acc.debitCardLast4.length >= 4 && mode.includes(acc.debitCardLast4)) return true;
      const bClean = acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const mClean = mode.replace(/[^a-z0-9]/g, '');
      if (bClean && bClean.length >= 3 && mClean.includes(bClean)) return true;
      return false;
    });

    // If generic mode like 'upi', 'netbanking', 'bank_transfer', 'debit', 'bank':
    // assign to primary account or the first account
    if (!targetAccount && !mode.includes('credit')) {
      targetAccount = accounts.find(a => a.isPrimary) || accounts[0];
    }

    if (targetAccount) {
      const currentBal = Number(targetAccount.balance) || 0;
      const newBal = Math.max(0, currentBal + delta);
      this.updateAccountBalance(targetAccount.id, newBal, email);
    }
  },

  // =========================================================================
  // CASH IN HAND & WALLET MANAGEMENT (Requirement: Cash Option)
  // =========================================================================
  getCashBalance(email?: string): CashWalletModel {
    const userEmail = getActiveUserEmail(email);
    try {
      const stored = localStorage.getItem(getCashStorageKey(userEmail));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.balance === 'number') {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error reading cash balance:', err);
    }

    if (userEmail === 'demo@fintrack.io') {
      return { balance: 15000, lastUpdated: new Date().toISOString(), notes: 'Demo Cash Reserve' };
    }
    return { balance: 0, lastUpdated: new Date().toISOString(), notes: 'Cash in Hand' };
  },

  updateCashBalance(newBalance: number, notes?: string, email?: string): CashWalletModel {
    const userEmail = getActiveUserEmail(email);
    const model: CashWalletModel = {
      balance: Math.max(0, Number(newBalance) || 0),
      lastUpdated: new Date().toISOString(),
      notes: notes || 'Updated cash balance'
    };
    try {
      localStorage.setItem(getCashStorageKey(userEmail), JSON.stringify(model));
      window.dispatchEvent(new CustomEvent('fintrack-cash-updated', { detail: model }));
    } catch (err) {
      console.error('Error saving cash balance:', err);
    }
    return model;
  },

  /**
   * Returns formatted dynamic payment modes including all custom Bank Accounts, Debit Cards, Cash & Bank Credit Cards
   */
  getPaymentModeOptions(email?: string): { value: string; label: string; group?: string }[] {
    const accounts = this.getAccounts(email);
    const options: { value: string; label: string; group?: string }[] = [
      { value: 'upi', label: '📱 UPI / GPay / PhonePe', group: 'Standard' },
      { value: 'credit', label: '💳 Credit Card', group: 'Standard' },
      { value: 'netbanking', label: '🌐 Net Banking / NEFT', group: 'Standard' },
      { value: 'cash', label: '💵 Cash in Hand', group: 'Standard' }
    ];

    if (accounts.length > 0) {
      accounts.forEach(acc => {
        // Add Bank Account
        const accLabel = `🏦 ${acc.bankName} (${acc.accountType} •••• ${acc.accountNumberLast4})`;
        const accVal = `bank_${acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${acc.accountNumberLast4}`;
        options.push({
          value: accVal,
          label: accLabel,
          group: 'Bank Accounts'
        });

        // Add Debit Cards
        if (acc.debitCards && acc.debitCards.length > 0) {
          acc.debitCards.forEach(dc => {
            const debitLabel = `💳 ${dc.name} (•••• ${dc.last4})`;
            const debitVal = `debit_${acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${dc.last4}`;
            options.push({
              value: debitVal,
              label: debitLabel,
              group: 'Debit Cards'
            });
          });
        } else if (acc.hasDebitCard) {
          const debitLabel = `💳 ${acc.debitCardName || `${acc.bankName} Debit`} (•••• ${acc.debitCardLast4 || acc.accountNumberLast4})`;
          const debitVal = `debit_${acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${acc.debitCardLast4 || acc.accountNumberLast4}`;
          options.push({
            value: debitVal,
            label: debitLabel,
            group: 'Debit Cards'
          });
        }

        // Add Credit Cards under this Bank
        if (acc.creditCards && acc.creditCards.length > 0) {
          acc.creditCards.forEach(cc => {
            const ccLabel = `💳 ${cc.name} (•••• ${cc.last4})`;
            const ccVal = `cc_${acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${cc.last4}`;
            options.push({
              value: ccVal,
              label: ccLabel,
              group: 'Bank Credit Cards'
            });
          });
        }
      });
    } else {
      // Fallback default options
      options.push({ value: 'debit', label: '💳 Debit Card', group: 'Standard' });
      options.push({ value: 'bank_transfer', label: '🏦 Bank Transfer', group: 'Standard' });
    }

    return options;
  }
};
