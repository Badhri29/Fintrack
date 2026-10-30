import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Calendar,
  IndianRupee,
  Tag,
  Layers,
  CreditCard,
  FileText,
  Calculator
} from 'lucide-react';
import api from '../services/api';
import { currencyService } from '../services/currencyService';
import { useAuth } from '../context/AuthContext';
import { getDeletedCategorySet } from '../views/BudgetTransactionsView';
import { cardService, type CardModel } from '../services/cardService';
import { bankAccountService } from '../services/bankAccountService';
import { playNotificationChime } from '../services/soundService';
import { showToast } from './ToastNotification';

export type TransactionType = 'expense' | 'income' | 'savings';

export interface TransactionToEdit {
  id: number;
  type?: 'income' | 'expense' | 'savings' | string;
  date?: string;
  amount?: number | string;
  category?: string;
  subcategory?: string;
  paymentMode?: string;
  card?: string;
  description?: string;
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCategory?: string;
  initialSubcategory?: string;
  initialType?: 'income' | 'expense' | 'savings';
  initialPaymentMode?: string;
  initialCard?: string;
  transactionToEdit?: TransactionToEdit | null;
}

interface TypeConfig {
  label: string;
  color: string;
  bg: string;
  borderColor: string;
  shadow: string;
  cardBorder: string;
  cardShadow: string;
  buttonGradient: string;
  buttonShadow: string;
  icon: React.ReactNode;
}

const TYPE_CONFIGS: Record<TransactionType, TypeConfig> = {
  expense: {
    label: 'Expense',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.42)',
    shadow: '0 0 14px rgba(239, 68, 68, 0.18)',
    cardBorder: 'rgba(239, 68, 68, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(239, 68, 68, 0.08)',
    buttonGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    buttonShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
    icon: <ArrowDownRight size={18} />,
  },
  income: {
    label: 'Income',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.42)',
    shadow: '0 0 14px rgba(16, 185, 129, 0.18)',
    cardBorder: 'rgba(16, 185, 129, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(16, 185, 129, 0.08)',
    buttonGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    buttonShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
    icon: <ArrowUpRight size={18} />,
  },
  savings: {
    label: 'Savings',
    color: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.42)',
    shadow: '0 0 14px rgba(59, 130, 246, 0.18)',
    cardBorder: 'rgba(59, 130, 246, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(59, 130, 246, 0.08)',
    buttonGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    buttonShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
    icon: <PiggyBank size={18} />,
  },
};

const CATEGORIES_BY_TYPE: Record<TransactionType, Record<string, string[]>> = {
  expense: {
    'Housing & Rent': ['Rent/Mortgage', 'Property Tax', 'Home Insurance', 'Maintenance & Repairs', 'HOA Fees', 'Other'],
    'Food & Groceries': ['Supermarket Groceries', 'Organic & Farmers Market', 'Household Supplies', 'Snacks & Beverages', 'Other'],
    'Utilities & Internet': ['Electricity', 'Water & Sewer', 'High-Speed Internet', 'Mobile Phone Bill', 'Gas / Heating', 'Other'],
    'Dining & Entertainment': ['Restaurants & Cafes', 'Food Delivery (Swiggy/Zomato)', 'Streaming (Netflix/Prime)', 'Movies & Concerts', 'Gaming & Hobbies', 'Other'],
    'Transportation & Auto': ['Fuel / Petrol', 'Car Insurance & EMI', 'Public Transit & Metro', 'Uber / Taxi / Auto', 'Vehicle Servicing', 'Other'],
    'Healthcare & Medical': ['Doctor Consultation', 'Pharmacy & Medicines', 'Health Insurance Premium', 'Gym & Fitness', 'Dental / Vision', 'Other'],
    'Shopping & Personal': ['Clothing & Footwear', 'Electronics & Gadgets', 'Personal Care & Grooming', 'Gifts & Donations', 'Other'],
  },
  income: {
    'Salary': ['Monthly Base Salary', 'Performance Bonus', 'Overtime Pay', 'Annual Incentive', 'Other'],
    'Freelance & Business': ['Consulting Fees', 'Client Project Payment', 'Royalties & Licensing', 'Side Hustle Income', 'Other'],
    'Investments': ['Stock Dividend', 'Fixed Deposit Interest', 'Crypto / NFT Returns', 'Real Estate Income', 'Capital Gains', 'Other'],
  },
  savings: {
    'Investments': ['Mutual Fund SIP', 'Stock Purchase', 'Fixed Deposit (FD)', 'Public Provident Fund (PPF)', 'Gold / SGB', 'Crypto / Web3', 'Other'],
    'Savings': ['Emergency Fund', 'Recurring Deposit (RD)', 'Retirement Savings (NPS)', 'High-Yield Savings', 'Other'],
    'Mutual Funds': ['Equity SIP', 'Debt SIP', 'Index Fund', 'ELSS (Tax Saving)', 'Other'],
    'Emergency Fund': ['Liquid Fund', 'Savings Account Buffer', 'Cash Reserve', 'Other'],
  },
};

/**
 * Safely evaluates mathematical expressions like "1700+100", "500 * 3", "2500 - 300"
 */
export const evaluateMathExpression = (expr: string): number | null => {
  if (!expr) return null;
  const clean = expr.replace(/[,\s₹]/g, '');
  if (!clean) return null;
  // Allow digits and pure arithmetic operators: + - * / . ( )
  if (!/^[\d+\-*/.()]+$/.test(clean)) return null;
  try {
    const result = new Function(`"use strict"; return (${clean});`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Math.round(result * 100) / 100;
    }
  } catch {
    return null;
  }
  return null;
};

/**
 * Ensures any date representation (YYYY-MM-DD or DD-MM-YYYY) is converted to YYYY-MM-DD
 */
export const toInputDate = (d?: string): string => {
  if (!d) return new Date().toISOString().substring(0, 10);
  const str = String(d).trim();
  const dmyMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return str.substring(0, 10);
};

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCategory,
  initialSubcategory,
  initialType,
  initialPaymentMode,
  initialCard,
  transactionToEdit,
}) => {
  const isEditing = Boolean(transactionToEdit && transactionToEdit.id);
  const { user } = useAuth();

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('Housing & Rent');
  const [subcategory, setSubcategory] = useState<string>('Rent/Mortgage');
  const [isCustomSubcategory, setIsCustomSubcategory] = useState<boolean>(false);
  const [customSubcategoryText, setCustomSubcategoryText] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('upi');
  const [paymentModeOptions, setPaymentModeOptions] = useState(() => bankAccountService.getPaymentModeOptions(user?.email));

  useEffect(() => {
    const handleAccUpdated = () => {
      setPaymentModeOptions(bankAccountService.getPaymentModeOptions(user?.email));
    };
    window.addEventListener('fintrack-accounts-updated', handleAccUpdated);
    return () => window.removeEventListener('fintrack-accounts-updated', handleAccUpdated);
  }, [user]);
  const [card, setCard] = useState<string>('');
  const [activeCards, setActiveCards] = useState<CardModel[]>(() => cardService.getActiveCards());

  useEffect(() => {
    const handleCardsUpdated = () => {
      setActiveCards(cardService.getActiveCards());
    };
    window.addEventListener('fintrack-cards-updated', handleCardsUpdated);
    return () => window.removeEventListener('fintrack-cards-updated', handleCardsUpdated);
  }, []);
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = TYPE_CONFIGS[type] || TYPE_CONFIGS.expense;

  const currencySymbol = useMemo(() => {
    try {
      return localStorage.getItem('fintrack_currency_symbol') || '₹';
    } catch {
      return '₹';
    }
  }, [isOpen]);

  // Live calculator calculation for amount box
  const evaluatedAmount = useMemo(() => {
    if (/[\+\-\*\/]/.test(amount)) {
      return evaluateMathExpression(amount);
    }
    return null;
  }, [amount]);

  const handleAmountBlur = () => {
    if (evaluatedAmount != null) {
      setAmount(String(evaluatedAmount));
    }
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (evaluatedAmount != null) {
        e.preventDefault();
        setAmount(String(evaluatedAmount));
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    if (transactionToEdit) {
      const rawType = String(transactionToEdit.type || '').toLowerCase();
      const existingCategory = String(transactionToEdit.category || '').trim();
      const editType: TransactionType =
        rawType === 'savings' || ['Investments', 'Savings', 'Mutual Funds', 'Emergency Fund'].includes(existingCategory)
          ? 'savings'
          : rawType === 'income' || ['Salary', 'Bonus & Incentives', 'Other Income', 'Freelance & Business'].includes(existingCategory)
          ? 'income'
          : 'expense';
      setType(editType);

      setDate(toInputDate(transactionToEdit.date));
      const displayAmt = transactionToEdit.amount != null
        ? Math.round(currencyService.convertFromBase(Number(transactionToEdit.amount)) * 100) / 100
        : '';
      setAmount(displayAmt !== '' ? String(displayAmt) : '');

      const typeMap = CATEGORIES_BY_TYPE[editType] || CATEGORIES_BY_TYPE.expense;
      const defaultCategory = Object.keys(typeMap)[0];
      const cat = existingCategory || defaultCategory;
      setCategory(cat);

      const knownSubcategories = typeMap[cat] || [];
      const sub = transactionToEdit.subcategory || '';
      if (sub && !knownSubcategories.includes(sub)) {
        setSubcategory('Other');
        setIsCustomSubcategory(true);
        setCustomSubcategoryText(sub);
      } else {
        setSubcategory(sub || knownSubcategories[0] || 'Other');
        setIsCustomSubcategory(false);
        setCustomSubcategoryText('');
      }

      const pm = transactionToEdit.paymentMode
        ? transactionToEdit.paymentMode.toLowerCase()
        : 'upi';
      const isKnownPm =
        paymentModeOptions.some(opt => opt.value.toLowerCase() === pm) ||
        ['upi', 'credit', 'debit', 'netbanking', 'cash', 'bank_transfer', 'cheque', 'auto_debit'].includes(pm) ||
        pm.startsWith('bank_') ||
        pm.startsWith('debit_') ||
        pm.startsWith('cc_');
      setPaymentMode(isKnownPm ? pm : 'upi');
      setCard(transactionToEdit.card || '');
      setDescription(transactionToEdit.description || '');
      setError(null);
    } else {
      let defaultTypePref = (localStorage.getItem('fintrack-default-transaction-type') as TransactionType) || 'expense';
      if (!['expense', 'income', 'savings'].includes(defaultTypePref)) defaultTypePref = 'expense';
      const startingType: TransactionType =
        initialType === 'income'
          ? 'income'
          : initialType === 'savings'
          ? 'savings'
          : initialType === 'expense'
          ? 'expense'
          : defaultTypePref;
      setType(startingType);

      const typeMap = CATEGORIES_BY_TYPE[startingType] || CATEGORIES_BY_TYPE.expense;
      const savedCategory = localStorage.getItem('fintrack-default-category');
      const deletedSet = getDeletedCategorySet(user?.email);
      const availableCategories = Object.keys(typeMap).filter(c => !deletedSet.has(c.toLowerCase()));
      const fallbackCat = availableCategories[0] || Object.keys(typeMap)[0];
      const defaultCategory = (savedCategory && typeMap[savedCategory] && !deletedSet.has(savedCategory.toLowerCase())) ? savedCategory : fallbackCat;
      const cat = initialCategory || defaultCategory;
      setCategory(cat);

      const options = typeMap[cat] || ['Other'];
      const defaultSub = initialSubcategory || options[0];
      setSubcategory(defaultSub);
      setIsCustomSubcategory(defaultSub === 'Other');
      setCustomSubcategoryText('');

      const defaultMode = (initialPaymentMode || localStorage.getItem('fintrack-default-payment-mode') || 'upi').toLowerCase();
      const isKnownDefault =
        paymentModeOptions.some(opt => opt.value.toLowerCase() === defaultMode) ||
        ['upi', 'credit', 'debit', 'netbanking', 'cash', 'bank_transfer', 'cheque', 'auto_debit'].includes(defaultMode) ||
        defaultMode.startsWith('bank_') ||
        defaultMode.startsWith('debit_') ||
        defaultMode.startsWith('cc_');
      setPaymentMode(isKnownDefault ? defaultMode : 'upi');

      const currentActiveCards = cardService.getActiveCards();
      const defCard = initialCard || localStorage.getItem('fintrack-default-card') || currentActiveCards[0]?.name || '';
      setCard(defCard);

      const defaultDesc = localStorage.getItem('fintrack-default-note') || '';
      setDescription(defaultDesc);

      setDate(new Date().toISOString().substring(0, 10));
      setAmount('');
      setError(null);
    }
  }, [isOpen, initialCategory, initialSubcategory, initialType, initialPaymentMode, initialCard, transactionToEdit]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const typeMap = CATEGORIES_BY_TYPE[newType];
    if (!typeMap[category]) {
      const defaultCat = Object.keys(typeMap)[0];
      setCategory(defaultCat);
      const defaultSub = typeMap[defaultCat]?.[0] || 'Other';
      setSubcategory(defaultSub);
      setIsCustomSubcategory(defaultSub === 'Other');
      setCustomSubcategoryText('');
    }
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    const typeMap = CATEGORIES_BY_TYPE[type];
    const options = typeMap[newCat] || ['Other'];
    const defaultSub = options[0];
    setSubcategory(defaultSub);
    setIsCustomSubcategory(defaultSub === 'Other');
    if (defaultSub !== 'Other') {
      setCustomSubcategoryText('');
    }
  };

  const handleSubcategoryChange = (newSub: string) => {
    setSubcategory(newSub);
    if (newSub === 'Other') {
      setIsCustomSubcategory(true);
    } else {
      setIsCustomSubcategory(false);
      setCustomSubcategoryText('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const evaluated = evaluateMathExpression(amount);
    const finalNumericAmount = evaluated != null ? evaluated : Number(amount);

    if (isNaN(finalNumericAmount) || finalNumericAmount <= 0) {
      setError('Please enter a valid amount (e.g. 500 or 1700+100)');
      return;
    }

    const finalSubcategory = isCustomSubcategory
      ? customSubcategoryText.trim() || 'General'
      : subcategory;

    setSubmitting(true);
    setError(null);

    const payload = {
      date: toInputDate(date),
      type,
      category,
      subcategory: finalSubcategory,
      amount: Math.round(currencyService.convertToBase(finalNumericAmount) * 100) / 100,
      paymentMode,
      card: paymentMode === 'credit' ? (card || activeCards[0]?.name || null) : null,
      description,
    };

    try {
      if (isEditing && transactionToEdit?.id) {
        bankAccountService.applyTransactionImpact(transactionToEdit, true, user?.email);
        try {
          await api.put(`/transactions/${transactionToEdit.id}`, payload);
        } catch (err: any) {
          console.warn('PUT failed, falling back to delete + post:', err);
          await api.delete(`/transactions/${transactionToEdit.id}`);
          await api.post('/transactions', payload);
        }
      } else {
        await api.post('/transactions', payload);
      }
      bankAccountService.applyTransactionImpact(payload, false, user?.email);
      playNotificationChime();
      showToast({
        title: isEditing ? 'Transaction Updated' : 'Transaction Recorded',
        message: `${type.toUpperCase()}: ${currencyService.format(finalNumericAmount)} for ${category} (${finalSubcategory})`,
        type: 'success'
      });
      api.post('/user/log-action', {
        action: isEditing ? 'EDIT_TRANSACTION' : 'ADD_TRANSACTION',
        details: `${type.toUpperCase()}: ${currencyService.format(finalNumericAmount)} in ${category}`
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          (isEditing ? 'Failed to update transaction' : 'Failed to save transaction'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const currentTypeCategories = CATEGORIES_BY_TYPE[type] || {};
  const deletedSet = getDeletedCategorySet(user?.email);
  const rawList = Array.from(new Set([...Object.keys(currentTypeCategories), category]));
  const categoryList = rawList.filter(c => !deletedSet.has(c.toLowerCase()) || c === category);
  const subcategoryList = Array.from(
    new Set([...(currentTypeCategories[category] || []), subcategory, 'Other']),
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-input, #161f30)',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
    borderRadius: 9,
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{
          width: '100%',
          maxWidth: 520,
          border: `1px solid ${activeConfig.cardBorder}`,
          boxShadow: activeConfig.cardShadow,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: activeConfig.bg,
                border: `1px solid ${activeConfig.borderColor}`,
                color: activeConfig.color,
                transition: 'all 0.25s ease',
              }}
            >
              {activeConfig.icon}
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.3px',
                }}
              >
                {isEditing ? 'Update Transaction' : 'Add New Transaction'}
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  margin: '3px 0 0',
                }}
              >
                {isEditing
                  ? 'Modify transaction details in your personal financial record'
                  : 'Log income, savings, or expense into your personal financial record'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              borderRadius: 8,
              transition: 'all 0.2s ease',
            }}
            title="Close modal"
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Type Selector (Expense, Income, Savings) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {(['expense', 'income', 'savings'] as TransactionType[]).map((t) => {
            const config = TYPE_CONFIGS[t];
            const isSelected = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: isSelected
                    ? `1px solid ${config.borderColor}`
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isSelected ? config.bg : 'var(--bg-secondary, rgba(15, 23, 42, 0.55))',
                  color: isSelected ? config.color : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  boxShadow: isSelected ? config.shadow : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {config.icon}
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: Date & Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <Calendar size={13} style={{ color: activeConfig.color }} />
                <span>Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = activeConfig.borderColor;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <IndianRupee size={13} style={{ color: activeConfig.color }} />
                  <span>Amount</span>
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calculator size={11} />
                  <span>Supports math (+,-,*,/)</span>
                </span>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    color: activeConfig.color,
                    fontWeight: 700,
                    fontSize: 14,
                    pointerEvents: 'none',
                  }}
                >
                  {currencySymbol}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00 (e.g. 1700+100)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={handleAmountBlur}
                  onKeyDown={handleAmountKeyDown}
                  style={{
                    ...inputStyle,
                    paddingLeft: 30,
                    paddingRight: evaluatedAmount != null ? 90 : 14,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = activeConfig.borderColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                  }}
                  required
                />

                {evaluatedAmount != null && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 8,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: activeConfig.bg,
                      border: `1px solid ${activeConfig.borderColor}`,
                      color: activeConfig.color,
                      fontSize: 12,
                      fontWeight: 700,
                      pointerEvents: 'none',
                    }}
                    title="Calculated total"
                  >
                    = {currencySymbol}{evaluatedAmount.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Quick Amount Chips */}
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {[100, 500, 1000, 5000].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => {
                      const cur = (evaluateMathExpression(amount) ?? Number(amount)) || 0;
                      setAmount(String(cur + quick));
                    }}
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 5,
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      color: 'var(--text-secondary, #94a3b8)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = activeConfig.borderColor;
                      e.currentTarget.style.color = activeConfig.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                    }}
                  >
                    +{currencySymbol}{quick.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Category & Subcategory */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <Tag size={13} style={{ color: activeConfig.color }} />
                <span>Category</span>
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = activeConfig.borderColor;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {categoryList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <Layers size={13} style={{ color: activeConfig.color }} />
                <span>Subcategory</span>
              </label>
              <select
                value={subcategory}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = activeConfig.borderColor;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {subcategoryList.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Subcategory Text Input */}
          {isCustomSubcategory && (
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Custom Subcategory Name
              </label>
              <input
                type="text"
                value={customSubcategoryText}
                onChange={(e) => setCustomSubcategoryText(e.target.value)}
                placeholder="e.g. Special Holiday Gift"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = activeConfig.borderColor;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* Row 3: Payment Mode & Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: paymentMode === 'credit' ? '1fr 1fr' : '1fr',
              gap: 12,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <CreditCard size={13} style={{ color: activeConfig.color }} />
                <span>Payment Mode</span>
              </label>
              <select
                value={paymentMode}
                onChange={(e) => {
                  const newMode = e.target.value;
                  setPaymentMode(newMode);
                  if (newMode === 'credit' && (!card || !activeCards.some(c => c.name === card))) {
                    setCard(activeCards[0]?.name || '');
                  }
                }}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = activeConfig.borderColor;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {paymentModeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {paymentMode === 'credit' && (
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Select Active Card
                </label>
                <select
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = activeConfig.borderColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  required
                >
                  <option value="">Select Card</option>
                  {activeCards.length > 0 ? (
                    activeCards.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} (•••• {c.last4})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No active cards configured
                    </option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Row 4: Description */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginBottom: 6,
              }}
            >
              <FileText size={13} style={{ color: activeConfig.color }} />
              <span>Description / Notes</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly apartment rent or grocery bill"
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = activeConfig.borderColor;
                e.currentTarget.style.boxShadow = `0 0 0 3px ${activeConfig.bg}`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Actions Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 8,
              paddingTop: 12,
              borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary, #94a3b8)',
                padding: '10px 18px',
                borderRadius: 9,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)';
                e.currentTarget.style.color = 'var(--text-primary, #ffffff)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: activeConfig.buttonGradient,
                boxShadow: activeConfig.buttonShadow,
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 9,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                transition: 'all 0.2s ease',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              <Check size={16} />
              <span>
                {submitting
                  ? 'Saving...'
                  : isEditing
                  ? `Update ${activeConfig.label}`
                  : `Add ${activeConfig.label}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
