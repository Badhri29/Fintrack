import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CreditCard,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Search,
  DollarSign,
  Shield,
  Eye,
  EyeOff,
  Edit2,
  Edit3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PieChart,
  Activity,
  BarChart2,
  Check,
  Lock,
  Calendar,
  RotateCcw,
  X,
  Filter
} from 'lucide-react';
import { playNotificationChime } from '../services/soundService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';
import { cardService, type CardModel } from '../services/cardService';
import { bankAccountService, type BankAccountModel } from '../services/bankAccountService';
import { loanService, type LoanModel, calculateLoanEMIs, generateEmiSchedule } from '../services/loanService';
import { yearService } from '../services/yearService';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { useTheme } from '../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CARD_GRADIENTS = [
  { label: 'Obsidian Midnight', gradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 60%, #334155 100%)', accent: '#F59E0B' },
  { label: 'Sapphire Ocean', gradient: 'linear-gradient(135deg, #0369A1 0%, #075985 60%, #0C4A6E 100%)', accent: '#38BDF8' },
  { label: 'Emerald Forest', gradient: 'linear-gradient(135deg, #047857 0%, #065F46 60%, #064E3B 100%)', accent: '#34D399' },
  { label: 'Imperial Velvet', gradient: 'linear-gradient(135deg, #831843 0%, #4C0519 60%, #1E1B4B 100%)', accent: '#F43F5E' },
  { label: 'Deep Indigo', gradient: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)', accent: '#818CF8' },
  { label: 'Royal Violet', gradient: 'linear-gradient(135deg, #701A75 0%, #86198F 50%, #A21CAF 100%)', accent: '#E879F9' }
];

const CREDIT_CATEGORIES: Record<string, string[]> = {
  'Food & Dining': ['Restaurants', 'Swiggy/Zomato', 'Groceries', 'Cafes & Fast Food'],
  'Shopping': ['Amazon/Flipkart', 'Clothing & Fashion', 'Electronics', 'Home Decor'],
  'Travel & Fuel': ['Flights & Hotels', 'Fuel & Gas', 'Uber/Ola', 'Train/Metro'],
  'Entertainment': ['Movies & Shows', 'OTT Subscriptions', 'Gaming & Events'],
  'Utilities & Bills': ['Electricity/Water', 'Credit Card Bill Payment', 'Mobile & Wifi Recharge', 'Insurance Premium'],
  'Other Expenses': ['Medical & Pharmacy', 'Fitness & Gym', 'Personal Care', 'General']
};

/**
 * Safely evaluates mathematical expressions like "1500+250", "500*4", "2000-150"
 */
export const evaluateMathExpression = (expr: string): number | null => {
  if (!expr) return null;
  const clean = expr.replace(/[,\s₹]/g, '');
  if (!clean) return null;
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
 * Check if a transaction is a credit card bill payment
 */
export const isBillPaymentTx = (t: any): boolean => {
  const sub = String(t.subcategory || '').toLowerCase();
  const desc = String(t.description || '').toLowerCase();
  const cat = String(t.category || '').toLowerCase();
  return (
    sub.includes('credit card bill') ||
    sub.includes('card bill payment') ||
    desc.includes('credit card bill') ||
    desc.includes('card bill payment') ||
    (desc.includes('payment towards') && desc.includes('bill')) ||
    (cat.includes('utilities') && sub.includes('bill payment'))
  );
};

export const CreditCardsView: React.FC = () => {
  const { user } = useAuth();
  const isViewOnly = Boolean(user?.isReadOnly || (user?.isMember && user?.memberPermission === 'VIEW_ONLY'));
  const [isCardLimitModalOpen, setIsCardLimitModalOpen] = useState<boolean>(false);
  const [requestingLimit, setRequestingLimit] = useState<boolean>(false);
  const [limitRequestSuccess, setLimitRequestSuccess] = useState<boolean>(() => {
    return localStorage.getItem(`fintrack_pending_cc_limit_${user?.email}`) === 'true';
  });
  const cardLimit = user?.cardLimit || 2;
  const isEnterprise = (user?.subscriptionTier || '').toUpperCase() === 'ENTERPRISE' || (user?.cardLimit || 0) >= 99;
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';

  useEffect(() => {
    const checkPendingQuotaRequest = async () => {
      const cached = localStorage.getItem(`fintrack_pending_cc_limit_${user?.email}`);
      if (cached === 'true') {
        setLimitRequestSuccess(true);
      }
      try {
        const res = await api.get('/access-requests/my');
        if (res.data?.success && Array.isArray(res.data.data)) {
          const hasPending = res.data.data.some((r: any) =>
            (r.requestType?.includes('CARD') || r.requestType?.includes('PLAN') || r.requestType?.includes('PRO') || r.requestType?.includes('ENTERPRISE')) && r.status === 'PENDING'
          );
          setLimitRequestSuccess(hasPending);
          if (hasPending) {
            localStorage.setItem(`fintrack_pending_cc_limit_${user?.email}`, 'true');
          } else {
            localStorage.removeItem(`fintrack_pending_cc_limit_${user?.email}`);
          }
        }
      } catch {}
    };
    checkPendingQuotaRequest();
  }, [user]);

  // Synchronized Year State (Points 5 & 6)
  const [selectedYear, setSelectedYear] = useState<number>(() => yearService.getSelectedYear());

  // Multi-Month Filter State: Default to current month (Point 5 & 6)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth()]);
  const [isDraggingMonths, setIsDraggingMonths] = useState<boolean>(false);
  const [dragStartMonth, setDragStartMonth] = useState<number | null>(null);

  // Cards state loaded through cardService
  const [cards, setCards] = useState<CardModel[]>(() => cardService.getCards(user?.email));
  const [bankAccounts, setBankAccounts] = useState<BankAccountModel[]>(() => bankAccountService.getAccounts(user?.email));
  const [activeSection, setActiveSection] = useState<'credit_cards' | 'bank_accounts'>('credit_cards');

  // Add-on card modal states
  const [newIsAddon, setNewIsAddon] = useState<boolean>(false);
  const [newPrimaryCardId, setNewPrimaryCardId] = useState<string>('');
  const [newAddonHolderName, setNewAddonHolderName] = useState<string>('');

  // Add Bank Account modal states
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountModel | null>(null);
  const [editBankName, setEditBankName] = useState<string>('');
  const [editAccountType, setEditAccountType] = useState<'Savings' | 'Current' | 'Salary'>('Savings');
  const [editAccountNumberLast4, setEditAccountNumberLast4] = useState<string>('');
  const [editAccountBalance, setEditAccountBalance] = useState<string>('0');

  // Add Card to Account modal state
  const [cardToAccTarget, setCardToAccTarget] = useState<{ accountId: string; type: 'debit' | 'credit' } | null>(null);
  const [cardToAccName, setCardToAccName] = useState<string>('');
  const [cardToAccLast4, setCardToAccLast4] = useState<string>('');
  const [cardToAccExpiry, setCardToAccExpiry] = useState<string>('');
  const [cardToAccLimit, setCardToAccLimit] = useState<string>('');
  const [selectExistingCreditCardId, setSelectExistingCreditCardId] = useState<string>('');
  const [newBankName, setNewBankName] = useState<string>('');
  const [newAccountType, setNewAccountType] = useState<'Savings' | 'Current' | 'Salary'>('Savings');
  const [newAccountNumberLast4, setNewAccountNumberLast4] = useState<string>('');
  const [newHasDebitCard, setNewHasDebitCard] = useState<boolean>(true);
  const [newDebitCardName, setNewDebitCardName] = useState<string>('');
  const [newDebitCardLast4, setNewDebitCardLast4] = useState<string>('');

  useEffect(() => {
    const handleAccounts = () => {
      setBankAccounts(bankAccountService.getAccounts(user?.email));
    };
    window.addEventListener('fintrack-accounts-updated', handleAccounts);
    return () => window.removeEventListener('fintrack-accounts-updated', handleAccounts);
  }, [user]);
  const [allLoans, setAllLoans] = useState<LoanModel[]>(() => loanService.getLoans(user?.email));

  // Utilization calculation toggle: Card Only vs Card + Linked Loans & EMI
  const [includeLoansInUtilization, setIncludeLoansInUtilization] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fintrack_util_with_loans_' + (user?.email || '')) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleLoansUtilization = (withLoans: boolean) => {
    setIncludeLoansInUtilization(withLoans);
    try {
      localStorage.setItem('fintrack_util_with_loans_' + (user?.email || ''), String(withLoans));
    } catch {}
  };

  useEffect(() => {
    const handleLoansChanged = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setAllLoans(e.detail);
      } else {
        setAllLoans(loanService.getLoans(user?.email));
      }
    };
    window.addEventListener('fintrack-loans-changed', handleLoansChanged);
    return () => window.removeEventListener('fintrack-loans-changed', handleLoansChanged);
  }, [user]);
  const [selectedCardId, setSelectedCardId] = useState<string>('all');
  const [actualTransactions, setActualTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Segmented Type Filter ('all' | 'spends' | 'bills')
  const [ccFilterType, setCcFilterType] = useState<'all' | 'spends' | 'bills'>('all');
  // Date and Amount range filters
  const [ccFromDate, setCcFromDate] = useState<string>('');
  const [ccToDate, setCcToDate] = useState<string>('');
  const [ccMinAmount, setCcMinAmount] = useState<string>('');
  const [ccMaxAmount, setCcMaxAmount] = useState<string>('');
  // Popover state for Date & Amount filter dropdowns
  const [showCcDatePopover, setShowCcDatePopover] = useState<boolean>(false);
  const [showCcAmountPopover, setShowCcAmountPopover] = useState<boolean>(false);
  const ccDateFilterRef = useRef<HTMLDivElement>(null);
  const ccAmountFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ccDateFilterRef.current && !ccDateFilterRef.current.contains(e.target as Node)) {
        setShowCcDatePopover(false);
      }
      if (ccAmountFilterRef.current && !ccAmountFilterRef.current.contains(e.target as Node)) {
        setShowCcAmountPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyCcDatePreset = (preset: 'all' | 'this_month' | 'last_month' | 'last_30' | 'this_year') => {
    const now = new Date();
    if (preset === 'all') {
      setCcFromDate('');
      setCcToDate('');
    } else if (preset === 'this_month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setCcFromDate(`${y}-${m}-01`);
      setCcToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      setCcFromDate(`${y}-${m}-01`);
      setCcToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_30') {
      const end = now.toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      setCcFromDate(start);
      setCcToDate(end);
    } else if (preset === 'this_year') {
      setCcFromDate(`${selectedYear}-01-01`);
      setCcToDate(`${selectedYear}-12-31`);
    }
  };

  const applyCcAmountPreset = (preset: 'all' | 'under_1k' | '1k_5k' | '5k_20k' | 'above_20k') => {
    if (preset === 'all') {
      setCcMinAmount('');
      setCcMaxAmount('');
    } else if (preset === 'under_1k') {
      setCcMinAmount('');
      setCcMaxAmount('1000');
    } else if (preset === '1k_5k') {
      setCcMinAmount('1000');
      setCcMaxAmount('5000');
    } else if (preset === '5k_20k') {
      setCcMinAmount('5000');
      setCcMaxAmount('20000');
    } else if (preset === 'above_20k') {
      setCcMinAmount('20000');
      setCcMaxAmount('');
    }
  };

  const getCcDateFilterLabel = () => {
    if (ccFromDate && ccToDate) return `${ccFromDate.slice(5)} to ${ccToDate.slice(5)}`;
    if (ccFromDate) return `From ${ccFromDate.slice(5)}`;
    if (ccToDate) return `Until ${ccToDate.slice(5)}`;
    return 'Date Range';
  };

  const getCcAmountFilterLabel = () => {
    const cur = currencyService.getActiveCurrencyConfig().symbol;
    if (ccMinAmount && ccMaxAmount) return `${cur}${ccMinAmount} - ${cur}${ccMaxAmount}`;
    if (ccMinAmount) return `≥ ${cur}${ccMinAmount}`;
    if (ccMaxAmount) return `≤ ${cur}${ccMaxAmount}`;
    return 'Amount Range';
  };

  const hasActiveCcFilters = Boolean(
    searchQuery ||
    categoryFilter !== 'all' ||
    selectedCardId !== 'all' ||
    ccFilterType !== 'all' ||
    ccFromDate ||
    ccToDate ||
    ccMinAmount ||
    ccMaxAmount
  );

  const handleResetCcFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setSelectedCardId('all');
    setCcFilterType('all');
    setCcFromDate('');
    setCcToDate('');
    setCcMinAmount('');
    setCcMaxAmount('');
    setCurrentPage(1);
  };

  // Hovered Card State: Automatically expands on hover, collapses on mouse leave with smooth grace window
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<any>(null);

  const handleCardMouseEnter = (cardId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredCardId(cardId);
  };

  const handleCardMouseLeave = (cardId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCardId(prev => (prev === cardId ? null : prev));
    }, 70);
  };

  const [isCategorySectionExpanded, setIsCategorySectionExpanded] = useState<boolean>(true);

  // Chart Display Mode: 'flow' (TradeChart Spline Curve) vs 'bars' (Point 8)
  const [chartMode, setChartMode] = useState<'flow' | 'bars'>('flow');

  // Eye icon revealed state per card (mask/unmask sensitive info)
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});

  // Centered Delete Card Confirmation Modal
  const [cardToDelete, setCardToDelete] = useState<CardModel | null>(null);

  // Pagination State for Credit Card Transactions Table (Budget & Transactions style)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Add Card Spend Modal State (with Calculator amount)
  const [isAddSpendOpen, setIsAddSpendOpen] = useState<boolean>(false);
  const [spendDate, setSpendDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [spendDesc, setSpendDesc] = useState<string>('');
  const [spendAmount, setSpendAmount] = useState<string>('');
  const [spendCard, setSpendCard] = useState<string>(() => cards[0]?.name || 'HDFC Regalia Gold');
  const [spendCategory, setSpendCategory] = useState<string>('Shopping');
  const [spendSubcategory, setSpendSubcategory] = useState<string>('Amazon/Flipkart');
  const [spendSaving, setSpendSaving] = useState<boolean>(false);
  const [spendError, setSpendError] = useState<string | null>(null);

  // Live calculator calculation for Add Spend amount
  const evaluatedSpendAmount = useMemo(() => {
    if (/[\+\-\*\/]/.test(spendAmount)) {
      return evaluateMathExpression(spendAmount);
    }
    return null;
  }, [spendAmount]);

  const handleSpendAmountBlur = () => {
    if (evaluatedSpendAmount != null) {
      setSpendAmount(String(evaluatedSpendAmount));
    }
  };

  const handleSpendAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (evaluatedSpendAmount != null) {
        e.preventDefault();
        setSpendAmount(String(evaluatedSpendAmount));
      }
    }
  };

  const handleQuickAddSpend = (val: number) => {
    const cur = (evaluateMathExpression(spendAmount) ?? Number(spendAmount)) || 0;
    setSpendAmount(String(cur + val));
  };

  // Add New Card Modal State (Well-arranged boxes)
  const [isAddCardOpen, setIsAddCardOpen] = useState<boolean>(false);
  const [newCardName, setNewCardName] = useState<string>('');
  const [newCardBank, setNewCardBank] = useState<string>('HDFC Bank');
  const [newCardNetwork, setNewCardNetwork] = useState<'Visa' | 'Mastercard' | 'RuPay' | 'Amex'>('Visa');
  const [newCardFullNumber, setNewCardFullNumber] = useState<string>('');
  const [newCardLast4, setNewCardLast4] = useState<string>('');
  const [newCardExpiryMonth, setNewCardExpiryMonth] = useState<number>(12);
  const [newCardExpiryYear, setNewCardExpiryYear] = useState<number>(28);
  const [newCardCvv, setNewCardCvv] = useState<string>('');
  const [newCardLimit, setNewCardLimit] = useState<string>('100000');
  const [newCardBillingDay, setNewCardBillingDay] = useState<number>(15);
  const [newCardDueDay, setNewCardDueDay] = useState<number>(5);
  const [newCardGradientIdx, setNewCardGradientIdx] = useState<number>(0);

  // Edit Card Modal State (Well-arranged boxes)
  const [editingCard, setEditingCard] = useState<CardModel | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editBank, setEditBank] = useState<string>('');
  const [editNetwork, setEditNetwork] = useState<'Visa' | 'Mastercard' | 'RuPay' | 'Amex'>('Visa');
  const [editFullNumber, setEditFullNumber] = useState<string>('');
  const [editLast4, setEditLast4] = useState<string>('');
  const [editExpiryMonth, setEditExpiryMonth] = useState<number>(12);
  const [editExpiryYear, setEditExpiryYear] = useState<number>(28);
  const [editCvv, setEditCvv] = useState<string>('');
  const [editLimit, setEditLimit] = useState<string>('100000');
  const [editBillingDay, setEditBillingDay] = useState<number>(15);
  const [editDueDay, setEditDueDay] = useState<number>(5);
  const [editGradient, setEditGradient] = useState<string>(CARD_GRADIENTS[0].gradient);
  const [editAccent, setEditAccent] = useState<string>(CARD_GRADIENTS[0].accent);

  // Bill payment quick modal (Calculator amount & reduces outstanding)
  const [isPayBillOpen, setIsPayBillOpen] = useState<boolean>(false);
  const [payCardName, setPayCardName] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<string>('upi');
  const [paySaving, setPaySaving] = useState<boolean>(false);

  // Live calculator calculation for Bill Payment amount
  const evaluatedPayAmount = useMemo(() => {
    if (/[\+\-\*\/]/.test(payAmount)) {
      return evaluateMathExpression(payAmount);
    }
    return null;
  }, [payAmount]);

  const handlePayAmountBlur = () => {
    if (evaluatedPayAmount != null) {
      setPayAmount(String(evaluatedPayAmount));
    }
  };

  const handlePayAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (evaluatedPayAmount != null) {
        e.preventDefault();
        setPayAmount(String(evaluatedPayAmount));
      }
    }
  };

  const handleQuickAddPay = (val: number) => {
    const cur = (evaluateMathExpression(payAmount) ?? Number(payAmount)) || 0;
    setPayAmount(String(cur + val));
  };

  // Notification / message banner
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Currency reactivity
  const [, setCurrencyTick] = useState<number>(0);
  useEffect(() => {
    const onCurChange = () => setCurrencyTick(t => t + 1);
    window.addEventListener('fintrack-currency-change', onCurChange);
    window.addEventListener('fintrack-currency-rates-updated', onCurChange);
    return () => {
      window.removeEventListener('fintrack-currency-change', onCurChange);
      window.removeEventListener('fintrack-currency-rates-updated', onCurChange);
    };
  }, []);

  // Synchronize year changes between Dashboard, Budget & Transactions, and Credit Cards
  useEffect(() => {
    const handleYearChange = (e: any) => {
      if (e.detail && e.detail !== selectedYear) {
        setSelectedYear(e.detail);
      }
    };
    window.addEventListener('fintrack-year-changed', handleYearChange);
    return () => window.removeEventListener('fintrack-year-changed', handleYearChange);
  }, [selectedYear]);

  const changeYear = (yr: number) => {
    setSelectedYear(yr);
    yearService.setSelectedYear(yr);
  };

  // Global mouseup listener for smooth drag-to-select release
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDraggingMonths(false);
      setDragStartMonth(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Listen to cards updates across tabs/components
  useEffect(() => {
    const onCardsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setCards(e.detail);
      } else {
        setCards(cardService.getCards());
      }
    };
    window.addEventListener('fintrack-cards-updated', onCardsUpdated);
    return () => window.removeEventListener('fintrack-cards-updated', onCardsUpdated);
  }, []);

  // Fetch actual transactions from database
  const fetchActualTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/transactions');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setActualTransactions(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.email === 'demo@fintrack.io') {
      seedDemoBudgetData();
      setCards(cardService.getCards('demo@fintrack.io'));
    } else {
      setCards(cardService.getCards(user?.email));
    }
    fetchActualTransactions();

    const onTxChanged = () => fetchActualTransactions();
    window.addEventListener('fintrack-transactions-changed', onTxChanged);
    window.addEventListener('focus', onTxChanged);
    return () => {
      window.removeEventListener('fintrack-transactions-changed', onTxChanged);
      window.removeEventListener('focus', onTxChanged);
    };
  }, [user]);

  // Helper to parse transaction date safely
  const parseTxDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month)) {
        return { year, month, day };
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    }
    return null;
  };

  // Month navigation / drag handlers
  const handleMonthMouseDown = (mIdx: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    setIsDraggingMonths(true);
    setDragStartMonth(mIdx);
    setSelectedMonths([mIdx]);
  };

  const handleMonthMouseEnter = (mIdx: number) => {
    if (isDraggingMonths && dragStartMonth !== null) {
      const start = Math.min(dragStartMonth, mIdx);
      const end = Math.max(dragStartMonth, mIdx);
      const range: number[] = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      setSelectedMonths(range);
    }
  };

  const toggleMonth = (mIdx: number) => {
    setSelectedMonths(prev => {
      if (prev.length === 12) return [mIdx];
      if (prev.includes(mIdx)) {
        if (prev.length === 1) return prev;
        return prev.filter(m => m !== mIdx);
      } else {
        return [...prev, mIdx].sort((a, b) => a - b);
      }
    });
  };

  const selectFullYear = () => {
    setSelectedMonths([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  };

  // Robust check if transaction belongs to a card
  const doesTxMatchCard = (t: any, card: CardModel): boolean => {
    const tCard = String(t.card || '').toLowerCase().trim();
    const cName = card.name.toLowerCase().trim();
    const cLast4 = card.last4 ? card.last4.trim() : '';

    // If card is an Add-on card, strictly match only transactions specifically tagged with this add-on card
    if (card.isAddon) {
      if (tCard && (tCard === cName || (cLast4 && tCard.includes(cLast4)))) return true;
      const tDesc = String(t.description || '').toLowerCase();
      if (tDesc.includes(cName) || (cLast4 && tDesc.includes(cLast4))) return true;
      if (card.holderName && tDesc.includes(card.holderName.toLowerCase().trim())) return true;
      return false;
    }

    // For Primary cards: exact card name or last 4 match
    if (tCard && (tCard === cName || tCard.includes(cName) || cName.includes(tCard))) {
      return true;
    }

    const tDesc = String(t.description || '').toLowerCase();
    if (tDesc.includes(cName)) return true;

    // Specific bank/brand matching (only for primary cards)
    if (card.name.includes('Regalia') && (tCard.includes('regalia') || tDesc.includes('regalia'))) return true;
    if (card.name.includes('Amazon') && (tCard.includes('amazon') || tDesc.includes('amazon'))) return true;
    if (card.name.includes('Cashback') && (tCard.includes('sbi') || tDesc.includes('sbi'))) return true;
    if (card.name.includes('Magnus') && (tCard.includes('magnus') || tDesc.includes('magnus'))) return true;

    // Fallback: If payment mode is credit and no card specified, attribute to first primary card
    const pm = String(t.paymentMode || '').toLowerCase().trim();
    const isCreditMode = pm === 'credit' || pm === 'credit card' || pm === 'card';
    const firstPrimary = cards.find(c => !c.isAddon);
    if (isCreditMode && !tCard && firstPrimary && card.id === firstPrimary.id) {
      return true;
    }

    return false;
  };

  // Filter ONLY credit-related transactions (Purchases + Bill Payments)
  const allCreditTransactions = useMemo(() => {
    return actualTransactions.filter(t => {
      const pm = String(t.paymentMode || '').toLowerCase().trim();
      const isCreditMode = pm === 'credit' || pm === 'credit card' || pm === 'credit_card' || pm === 'card';
      const hasCard = Boolean(t.card && String(t.card).trim());
      const isBillPay = isBillPaymentTx(t);
      return isCreditMode || hasCard || isBillPay;
    });
  }, [actualTransactions]);

  // Year-filtered credit transactions
  const yearCreditTransactions = useMemo(() => {
    return allCreditTransactions.filter(t => {
      const p = parseTxDate(t.date);
      if (!p) return false;
      return p.year === selectedYear;
    });
  }, [allCreditTransactions, selectedYear]);

  // Card-specific year credit transactions (respects selected card tab)
  const cardYearCreditTransactions = useMemo(() => {
    if (selectedCardId === 'all') return yearCreditTransactions;
    const activeCard = cards.find(c => c.id === selectedCardId);
    if (!activeCard) return yearCreditTransactions;
    return yearCreditTransactions.filter(t => doesTxMatchCard(t, activeCard));
  }, [yearCreditTransactions, selectedCardId, cards]);

  // Fully filtered transactions for the ledger table (Year + Month(s) + Card + Search + Category)
  const creditTransactions = useMemo(() => {
    return yearCreditTransactions.filter(t => {
      // Month filter
      const p = parseTxDate(t.date);
      if (!p || !selectedMonths.includes(p.month)) {
        return false;
      }

      // Card filter
      if (selectedCardId !== 'all') {
        const activeCard = cards.find(c => c.id === selectedCardId);
        if (activeCard && !doesTxMatchCard(t, activeCard)) {
          return false;
        }
      }

      // Segmented Type filter (All / Card Spends / Bill Payments)
      const isPayment = isBillPaymentTx(t);
      if (ccFilterType === 'spends' && isPayment) return false;
      if (ccFilterType === 'bills' && !isPayment) return false;

      // Date Range filter
      if (ccFromDate && t.date && t.date < ccFromDate) return false;
      if (ccToDate && t.date && t.date > ccToDate) return false;

      // Amount Range filter
      const amt = Math.abs(Number(t.amount) || 0);
      if (ccMinAmount && amt < Number(ccMinAmount)) return false;
      if (ccMaxAmount && amt > Number(ccMaxAmount)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = (t.description || '').toLowerCase().includes(q);
        const matchCat = (t.category || '').toLowerCase().includes(q);
        const matchSub = (t.subcategory || '').toLowerCase().includes(q);
        const matchCard = (t.card || '').toLowerCase().includes(q);
        if (!matchDesc && !matchCat && !matchSub && !matchCard) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [yearCreditTransactions, selectedMonths, selectedCardId, searchQuery, categoryFilter, ccFilterType, ccFromDate, ccToDate, ccMinAmount, ccMaxAmount, cards]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonths, selectedYear, selectedCardId, searchQuery, categoryFilter, ccFilterType, ccFromDate, ccToDate, ccMinAmount, ccMaxAmount]);

  // Pagination calculations (Budget & Transactions style)
  const totalPages = Math.max(1, Math.ceil(creditTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return creditTransactions.slice(startIndex, startIndex + pageSize);
  }, [creditTransactions, safeCurrentPage, pageSize]);

  // Calculate card-by-card balance and metrics
  // NET OUTSTANDING = TOTAL CREDIT PURCHASES + ACTIVE LINKED LOAN EMIs - TOTAL BILL PAYMENTS
  const cardBalancesMap = useMemo(() => {
    const map: Record<string, { purchases: number; payments: number; activeLoanEmis: number; blockedLoanPrincipal: number; linkedLoans: LoanModel[]; netOutstanding: number; avail: number; util: number }> = {};

    cards.forEach(c => {
      const cleanCardName = (c.name || '').trim().toLowerCase();
      const linked = allLoans.filter(l => {
        if (l.status === 'closed') return false;
        const isCard = l.repaymentSource === 'credit_card';
        const matchesId = l.linkedCardId === c.id;
        const matchesName = l.linkedCardName && l.linkedCardName.trim().toLowerCase() === cleanCardName;
        const matchesLender = l.lender && cleanCardName.includes(l.lender.trim().toLowerCase());
        return (isCard && (matchesId || matchesName)) || matchesId || (isCard && matchesLender);
      });

      let emiSum = 0;
      let blockedLoanPrincipal = 0;
      linked.forEach(l => {
        const m = calculateLoanEMIs(l);
        if (!m.isClosed) {
          const sch = generateEmiSchedule(l, m);
          if (sch.some(s => s.status !== 'paid')) {
            emiSum += m.emi;
            blockedLoanPrincipal += (m.remaining || 0);
          }
        }
      });

      map[c.name] = {
        purchases: 0,
        payments: 0,
        activeLoanEmis: emiSum,
        blockedLoanPrincipal: blockedLoanPrincipal,
        linkedLoans: linked,
        netOutstanding: 0,
        avail: c.limit,
        util: 0
      };
    });

    yearCreditTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      const isPayment = isBillPaymentTx(t);

      cards.forEach(c => {
        if (doesTxMatchCard(t, c)) {
          if (isPayment) {
            map[c.name].payments += amt;
          } else if (t.type !== 'income') {
            map[c.name].purchases += amt;
          }
        }
      });
    });

    // First pass: compute primary card metrics
    cards.forEach(c => {
      const p = map[c.name].purchases;
      const pay = map[c.name].payments;
      const loanBlocked = includeLoansInUtilization ? (map[c.name].blockedLoanPrincipal || 0) : 0;
      const net = Math.max(0, p + loanBlocked - pay);
      const avail = Math.max(0, c.limit - net);
      const util = c.limit > 0 ? (net / c.limit) * 100 : 0;

      map[c.name].netOutstanding = net;
      map[c.name].avail = avail;
      map[c.name].util = util;
    });

    // Second pass: Add-on cards inherit parent card's shared available limit and credit limit, but keep their own 0% or independent usage!
    cards.forEach(c => {
      if (c.isAddon && c.primaryCardId) {
        const parent = cards.find(p => p.id === c.primaryCardId);
        if (parent && map[parent.name]) {
          const parentAvail = map[parent.name].avail;
          const parentLimit = parent.limit;
          map[c.name].avail = parentAvail;
          c.limit = parentLimit;
          // Util on add-on card represents only its own direct purchases against shared limit
          const ownPurchases = map[c.name].purchases;
          map[c.name].util = parentLimit > 0 ? (ownPurchases / parentLimit) * 100 : 0;
        }
      }
    });

    return map;
  }, [yearCreditTransactions, cards, allLoans, includeLoansInUtilization]);

  // Aggregate Metrics Across Cards (Add-on cards share primary limit; no duplicate limit added)
  const totalCreditLimit = useMemo(() => {
    return cards.filter(c => !c.isAddon).reduce((sum, c) => sum + c.limit, 0);
  }, [cards]);

  const totalOutstanding = useMemo(() => {
    return Object.values(cardBalancesMap).reduce((sum, item) => sum + item.netOutstanding, 0);
  }, [cardBalancesMap]);

  const availableCredit = Math.max(0, totalCreditLimit - totalOutstanding);
  const utilizationRatio = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;

  // Monthly Spending for the 12-Month Graph & Month Filter Pills
  const monthlySpendingValues = useMemo(() => {
    const values = new Array(12).fill(0);
    cardYearCreditTransactions.forEach(t => {
      if (t.type === 'income' || isBillPaymentTx(t)) return;
      const p = parseTxDate(t.date);
      if (p && p.month >= 0 && p.month < 12) {
        values[p.month] += Number(t.amount) || 0;
      }
    });
    return values;
  }, [cardYearCreditTransactions]);

  const annualTotalSpent = useMemo(() => {
    return monthlySpendingValues.reduce((a, b) => a + b, 0);
  }, [monthlySpendingValues]);

  const monthlyAverageSpent = useMemo(() => {
    return annualTotalSpent / 12;
  }, [annualTotalSpent]);

  const peakMonthData = useMemo(() => {
    let maxVal = 0;
    let maxIdx = 0;
    monthlySpendingValues.forEach((val, idx) => {
      if (val > maxVal) {
        maxVal = val;
        maxIdx = idx;
      }
    });
    return { month: MONTH_NAMES[maxIdx], val: maxVal };
  }, [monthlySpendingValues]);

  // Active Month Status Text & Metrics for the Month Navigation Bar
  const activeMonthStatusText = useMemo(() => {
    if (selectedMonths.length === 12) {
      return `Full Year ${selectedYear}`;
    }
    if (selectedMonths.length === 1) {
      return `${MONTH_NAMES[selectedMonths[0]]} ${selectedYear}`;
    }
    if (selectedMonths.length === 0) {
      return 'No Month Selected';
    }
    const sorted = [...selectedMonths].sort((a, b) => a - b);
    return `${sorted.length} Months (${MONTH_NAMES[sorted[0]]} – ${MONTH_NAMES[sorted[sorted.length - 1]]})`;
  }, [selectedMonths, selectedYear]);

  const activePeriodSpend = useMemo(() => {
    return selectedMonths.reduce((sum, mIdx) => sum + (monthlySpendingValues[mIdx] || 0), 0);
  }, [selectedMonths, monthlySpendingValues]);

  const activePeriodUsagePct = totalCreditLimit > 0 ? (activePeriodSpend / totalCreditLimit) * 100 : 0;

  // Category Breakdown Data (Global period breakdown)
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    creditTransactions.forEach(t => {
      if (t.type === 'income') return;
      const cat = isBillPaymentTx(t) ? 'Bill Payments' : (t.category || 'General');
      const amt = Number(t.amount) || 0;
      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += amt;
      map[cat].count += 1;
    });

    const totalPeriodSpend = Object.values(map).reduce((sum, item) => sum + item.total, 0);
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        total: data.total,
        count: data.count,
        percentage: totalPeriodSpend > 0 ? (data.total / totalPeriodSpend) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);
  }, [creditTransactions]);

  // Card-Specific Category Usage Helper for the expanded tray
  const getCardCategoryBreakdown = (card: CardModel) => {
    const cardTxs = yearCreditTransactions.filter(t => {
      const p = parseTxDate(t.date);
      if (!p || !selectedMonths.includes(p.month)) return false;
      return doesTxMatchCard(t, card);
    });

    const catMap: Record<string, { total: number; count: number }> = {};
    let totalCardSpend = 0;

    cardTxs.forEach(t => {
      if (t.type === 'income' || isBillPaymentTx(t)) return;
      const cat = t.category || 'General';
      const amt = Number(t.amount) || 0;
      if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
      catMap[cat].total += amt;
      catMap[cat].count += 1;
      totalCardSpend += amt;
    });

    return {
      totalSpent: totalCardSpend,
      categories: Object.entries(catMap)
        .map(([name, data]) => ({
          name,
          amount: data.total,
          count: data.count,
          percentage: totalCardSpend > 0 ? (data.total / totalCardSpend) * 100 : 0
        }))
        .sort((a, b) => b.amount - a.amount)
    };
  };

  // Open Edit Card Modal
  const handleOpenEditCard = (card: CardModel, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCard(card);
    setEditName(card.name);
    setEditBank(card.bank);
    setEditNetwork(card.network);
    setEditFullNumber(card.cardNumber || '');
    setEditLast4(card.last4 || '');
    setEditExpiryMonth(card.expiryMonth || 12);
    setEditExpiryYear(card.expiryYear || 28);
    setEditCvv(card.cvv || '');
    setEditLimit(String(card.limit || 100000));
    setEditBillingDay(card.billingDay || 15);
    setEditDueDay(card.dueDay || 5);
    setEditGradient(card.gradient);
    setEditAccent(card.accent);
  };

  // Submit Edit Card
  const handleEditCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;

    const fullNumClean = editFullNumber.replace(/\s+/g, '');
    const derivedLast4 = editLast4.trim() || (fullNumClean ? fullNumClean.slice(-4) : editingCard.last4);

    const updates: Partial<CardModel> = {
      name: editName.trim() || editingCard.name,
      bank: editBank.trim() || editingCard.bank,
      network: editNetwork,
      cardNumber: fullNumClean || undefined,
      last4: derivedLast4.slice(-4),
      expiryMonth: Number(editExpiryMonth) || 12,
      expiryYear: Number(editExpiryYear) || 28,
      cvv: editCvv.trim() || undefined,
      limit: Number(editLimit) || editingCard.limit,
      billingDay: Number(editBillingDay) || 15,
      dueDay: Number(editDueDay) || 5,
      gradient: editGradient,
      accent: editAccent
    };

    const updated = cardService.updateCard(editingCard.id, updates, user?.email);
    if (updated) {
      setCards(cardService.getCards(user?.email));
      setBannerMsg({ type: 'success', text: `Card ${updated.name} updated successfully!` });
      setTimeout(() => setBannerMsg(null), 3500);
    }
    setEditingCard(null);
  };

  // Add Credit Spend Submission
  const handleAddSpendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpendError(null);

    const evaluated = evaluateMathExpression(spendAmount);
    const numAmt = evaluated != null ? evaluated : parseFloat(spendAmount);

    if (!numAmt || numAmt <= 0) {
      setSpendError('Please enter a valid amount (e.g. 1500 or 1200+300)');
      return;
    }
    if (!spendDesc.trim()) {
      setSpendError('Please enter a description or merchant name');
      return;
    }

    setSpendSaving(true);
    try {
      const baseAmount = currencyService.convertToBase(numAmt);
      const payload = {
        date: spendDate,
        type: 'expense',
        category: spendCategory,
        subcategory: spendSubcategory,
        description: spendDesc.trim(),
        amount: baseAmount,
        paymentMode: 'credit',
        card: spendCard
      };

      const res = await api.post('/transactions', payload);
      if (res.data && res.data.success) {
        setBannerMsg({
          type: 'success',
          text: `Credit spend of ${currencyService.format(baseAmount)} on ${spendCard} saved directly to your ledger!`
        });
        setTimeout(() => setBannerMsg(null), 4000);
        setIsAddSpendOpen(false);
        setSpendAmount('');
        setSpendDesc('');
        await fetchActualTransactions();
        window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
      } else {
        setSpendError(res.data?.message || 'Failed to record credit transaction');
      }
    } catch (err: any) {
      setSpendError(err.response?.data?.message || err.message || 'Error saving transaction to database');
    } finally {
      setSpendSaving(false);
    }
  };

  // Delete actual transaction from database
  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this credit card transaction from the database?')) {
      return;
    }
    try {
      const txToDelete = actualTransactions.find(t => t.id === id);
      const res = await api.delete(`/transactions/${id}`);
      if (res.data && res.data.success) {
        if (txToDelete) {
          bankAccountService.applyTransactionImpact(txToDelete, true, user?.email);
        }
        setActualTransactions(prev => prev.filter(t => t.id !== id));
        window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
        setBannerMsg({ type: 'success', text: 'Transaction removed from credit card ledger.' });
        setTimeout(() => setBannerMsg(null), 3000);
      }
    } catch {
      alert('Failed to delete transaction.');
    }
  };

  // Add New Card Submission
  // Bank Account & Debit Card handlers (Requirement 5)
  const handleAddAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim() || !newAccountNumberLast4.trim()) return;

    bankAccountService.addAccount({
      bankName: newBankName.trim(),
      accountType: newAccountType,
      accountNumberLast4: newAccountNumberLast4.replace(/\D/g, '').slice(0, 4) || '9999',
      hasDebitCard: newHasDebitCard,
      debitCardName: newHasDebitCard ? (newDebitCardName.trim() || `${newBankName.trim()} Debit Card`) : undefined,
      debitCardLast4: newHasDebitCard ? (newDebitCardLast4.replace(/\D/g, '').slice(0, 4) || newAccountNumberLast4.replace(/\D/g, '').slice(0, 4)) : undefined,
      isPrimary: bankAccounts.length === 0
    }, user?.email);

    setBankAccounts(bankAccountService.getAccounts(user?.email));
    setIsAddAccountOpen(false);
    setNewBankName('');
    setNewAccountNumberLast4('');
    setNewDebitCardName('');
    setNewDebitCardLast4('');

    setBannerMsg({
      type: 'success',
      text: 'Bank account and debit card added! Now available in transaction payment modes.'
    });
    setTimeout(() => setBannerMsg(null), 4000);
  };

  const handleDeleteAccount = (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} account?`)) return;
    bankAccountService.deleteAccount(id, user?.email);
    setBankAccounts(bankAccountService.getAccounts(user?.email));
  };

  const handleOpenEditAccount = (acc: BankAccountModel) => {
    setEditingAccount(acc);
    setEditBankName(acc.bankName);
    setEditAccountType(acc.accountType);
    setEditAccountNumberLast4(acc.accountNumberLast4);
    setEditAccountBalance(String(acc.balance || 0));
  };

  const handleSaveEditAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !editBankName.trim() || !editAccountNumberLast4.trim()) return;

    bankAccountService.updateAccount(editingAccount.id, {
      bankName: editBankName.trim(),
      accountType: editAccountType,
      accountNumberLast4: editAccountNumberLast4.replace(/\D/g, '').slice(0, 4) || '9999',
      balance: Number(editAccountBalance) || 0
    }, user?.email);

    setBankAccounts(bankAccountService.getAccounts(user?.email));
    setEditingAccount(null);
    setBannerMsg({ type: 'success', text: 'Bank account updated successfully!' });
    setTimeout(() => setBannerMsg(null), 3000);
  };

  const handleOpenAddCardToAcc = (accountId: string, type: 'debit' | 'credit') => {
    const acc = bankAccounts.find(a => a.id === accountId);
    setCardToAccTarget({ accountId, type });
    setSelectExistingCreditCardId('');
    setCardToAccName(acc ? `${acc.bankName} ${type === 'debit' ? 'Debit' : 'Credit'} Card` : '');
    setCardToAccLast4('');
    setCardToAccExpiry('12/28');
    setCardToAccLimit(type === 'credit' ? '150000' : '');
  };

  const handleSaveCardToAcc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToAccTarget || !cardToAccName.trim() || !cardToAccLast4.trim()) return;

    const last4 = cardToAccLast4.replace(/\D/g, '').slice(0, 4) || '9999';
    if (cardToAccTarget.type === 'debit') {
      bankAccountService.addDebitCardToAccount(cardToAccTarget.accountId, {
        name: cardToAccName.trim(),
        last4,
        expiry: cardToAccExpiry.trim() || undefined
      }, user?.email);
    } else {
      bankAccountService.addCreditCardToAccount(cardToAccTarget.accountId, {
        name: cardToAccName.trim(),
        last4,
        limit: Number(cardToAccLimit) || undefined
      }, user?.email);
    }

    setBankAccounts(bankAccountService.getAccounts(user?.email));
    setCardToAccTarget(null);
    setBannerMsg({ type: 'success', text: `${cardToAccTarget.type === 'debit' ? 'Debit' : 'Credit'} card attached to account!` });
    setTimeout(() => setBannerMsg(null), 3000);
  };

  const handleRemoveDebitCard = (accId: string, cardId: string) => {
    if (!window.confirm('Remove this debit card from account?')) return;
    bankAccountService.removeDebitCardFromAccount(accId, cardId, user?.email);
    setBankAccounts(bankAccountService.getAccounts(user?.email));
  };

  const handleRemoveCreditCardFromAcc = (accId: string, cardId: string) => {
    if (!window.confirm('Remove this credit card from account?')) return;
    bankAccountService.removeCreditCardFromAccount(accId, cardId, user?.email);
    setBankAccounts(bankAccountService.getAccounts(user?.email));
  };

  const handleAddCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    const selectedGrad = CARD_GRADIENTS[newCardGradientIdx] || CARD_GRADIENTS[0];
    const fullNumClean = newCardFullNumber.replace(/\s+/g, '');
    const derivedLast4 = newCardLast4.trim() || (fullNumClean ? fullNumClean.slice(-4) : '9999');

    const card = cardService.addCard({
      name: newCardName.trim(),
      bank: newCardBank.trim() || 'HDFC Bank',
      network: newCardNetwork,
      cardNumber: fullNumClean || undefined,
      last4: derivedLast4.slice(-4),
      expiryMonth: Number(newCardExpiryMonth) || 12,
      expiryYear: Number(newCardExpiryYear) || 28,
      cvv: newCardCvv.trim() || undefined,
      limit: newIsAddon ? (cards.find(c => c.id === newPrimaryCardId)?.limit || Number(newCardLimit) || 100000) : (Number(newCardLimit) || 100000),
      billingDay: Number(newCardBillingDay) || 15,
      dueDay: Number(newCardDueDay) || 5,
      gradient: selectedGrad.gradient,
      accent: selectedGrad.accent,
      isAddon: newIsAddon,
      primaryCardId: newIsAddon ? newPrimaryCardId : undefined,
      holderName: newIsAddon ? newAddonHolderName.trim() : undefined
    }, user?.email);

    setCards(cardService.getCards(user?.email));
    playNotificationChime();
    api.post('/user/log-action', { action: 'ADD_CREDIT_CARD', details: `Added card ${card.name} (${card.bank})` }).catch(() => {});
    setIsAddCardOpen(false);
    setNewIsAddon(false);
    setNewPrimaryCardId('');
    setNewAddonHolderName('');
    setNewCardName('');
    setNewCardFullNumber('');
    setNewCardLast4('');
    setNewCardCvv('');
    setBannerMsg({ type: 'success', text: `Credit card ${card.name} added successfully!` });
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Execute Card Deletion from custom modal
  const confirmDeleteCard = (cardId: string, cardName: string) => {
    cardService.deleteCard(cardId, user?.email);
    api.post('/user/log-action', { action: 'DELETE_CREDIT_CARD', details: `Removed card ${cardName}` }).catch(() => {});
    setCards(cardService.getCards(user?.email));
    if (selectedCardId === cardId) setSelectedCardId('all');
    setBannerMsg({ type: 'success', text: `Card ${cardName} removed. Past transactions remain in your ledger.` });
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Toggle sensitive data visibility
  const toggleCardVisibility = (cardId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRevealedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Record Bill Payment
  const handlePayBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const evaluated = evaluateMathExpression(payAmount);
    const amt = evaluated != null ? evaluated : parseFloat(payAmount);
    if (!amt || amt <= 0) return;

    setPaySaving(true);
    try {
      const baseAmount = currencyService.convertToBase(amt);
      const billPayload = {
        date: new Date().toISOString().substring(0, 10),
        type: 'expense',
        category: 'Utilities & Bills',
        subcategory: 'Credit Card Bill Payment',
        description: `Payment towards ${payCardName} credit card bill`,
        amount: baseAmount,
        paymentMode: payMode,
        card: payCardName
      };
      const res = await api.post('/transactions', billPayload);

      if (res.data && res.data.success) {
        bankAccountService.applyTransactionImpact(billPayload, false, user?.email);
        // Automatically settle linked loan EMI with ZERO duplicate debit
        const cardObj = cards.find(c => c.name === payCardName);
        const cardIdToSettle = cardObj ? cardObj.id : selectedCardId;
        const settleRes = loanService.settleCardLoansOnBillPayment(cardIdToSettle, payCardName, user?.email);

        let bannerText = `Bill payment of ${currencyService.format(baseAmount)} for ${payCardName} recorded! Outstanding balance reduced.`;
        if (settleRes.settledCount > 0) {
          bannerText += ` Linked loan EMI for "${settleRes.settledLoans.join(', ')}" was automatically marked as Paid with ZERO duplicate debit!`;
        }

        setBannerMsg({
          type: 'success',
          text: bannerText
        });
        setTimeout(() => setBannerMsg(null), 5000);
        setIsPayBillOpen(false);
        setPayAmount('');
        await fetchActualTransactions();
        window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
      }
    } catch {
      alert('Failed to record card bill payment.');
    } finally {
      setPaySaving(false);
    }
  };

  const activeSelectedCard = cards.find(c => c.id === selectedCardId);
  const chartCardTitle = selectedCardId === 'all'
    ? 'Monthly Spending Flow — All Cards'
    : `Monthly Spending Flow — ${activeSelectedCard?.name || 'Selected Card'}`;

  // TradeChart Smooth Flow Line Data
  const tradeChartData = {
    labels: MONTH_NAMES,
    datasets: [
      {
        label: 'Credit Spend Flow',
        data: monthlySpendingValues,
        borderColor: '#818CF8',
        borderWidth: 2.5,
        fill: true,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(99, 102, 241, 0.15)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
          gradient.addColorStop(0.65, 'rgba(99, 102, 241, 0.12)');
          gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
          return gradient;
        },
        tension: 0.42,
        cubicInterpolationMode: 'monotone' as const,
        pointRadius: monthlySpendingValues.map((_, idx) => (selectedMonths.includes(idx) ? 6 : 3)),
        pointHoverRadius: 8,
        pointBackgroundColor: monthlySpendingValues.map((_, idx) => (selectedMonths.includes(idx) ? '#818CF8' : '#6366F1')),
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2
      }
    ]
  };

  // Bar Chart Data
  const barChartData = {
    labels: MONTH_NAMES,
    datasets: [
      {
        label: 'Credit Spend',
        data: monthlySpendingValues,
        backgroundColor: monthlySpendingValues.map((_, idx) =>
          selectedMonths.includes(idx)
            ? 'rgba(99, 102, 241, 0.95)'
            : 'rgba(99, 102, 241, 0.35)'
        ),
        hoverBackgroundColor: 'rgba(129, 140, 248, 1)',
        borderColor: monthlySpendingValues.map((_, idx) =>
          selectedMonths.includes(idx) ? '#818CF8' : 'rgba(99, 102, 241, 0.5)'
        ),
        borderWidth: monthlySpendingValues.map((_, idx) => (selectedMonths.includes(idx) ? 2 : 1)),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65
      }
    ]
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const clickedMonth = elements[0].index;
        toggleMonth(clickedMonth);
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: isLight ? '#FFFFFF' : '#1E293B',
        titleColor: isLight ? '#0F172A' : '#F8FAFC',
        bodyColor: isLight ? '#334155' : '#CBD5E1',
        borderColor: isLight ? '#E2E8F0' : '#334155',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (items: any[]) => {
            const mIdx = items[0].dataIndex;
            return `${MONTH_NAMES[mIdx]} ${selectedYear}`;
          },
          label: (ctx: any) => {
            const val = ctx.raw || 0;
            const util = totalCreditLimit > 0 ? ((val / totalCreditLimit) * 100).toFixed(1) : '0';
            return ` Total Spend: ${currencyService.format(val)} (${util}% of limit)`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isLight ? '#64748B' : '#94A3B8',
          font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
        }
      },
      y: {
        border: { dash: [4, 4] },
        grid: {
          color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'
        },
        ticks: {
          color: isLight ? '#64748B' : '#94A3B8',
          font: { family: 'Plus Jakarta Sans', size: 11 },
          callback: (val: any) => {
            const sym = currencyService.getActiveCurrencyConfig().symbol;
            if (val === 0) return `${sym}0`;
            if (val >= 1000000) return `${sym}${(val / 1000000).toFixed(1)}M`;
            if (val >= 1000) return `${sym}${(val / 1000).toFixed(0)}k`;
            return `${sym}${val}`;
          }
        }
      }
    }
  };

  return (
    <main className="fintrack-page-container">
      {/* 1. Page Header with Synchronized Year Carousel */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
            <CreditCard size={22} />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Credit Cards & Statements</h1>
            <p className="page-subtitle" style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Track real credit expenditures, utilization %, statements & live payments in real-time
            </p>
          </div>
        </div>

        {/* Dynamic Year Controls & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Synchronized 5-year carousel controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--bg-secondary)',
              padding: '4px 6px',
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}
          >
            <button
              type="button"
              onClick={() => changeYear(selectedYear - 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Previous Year"
              aria-label="Previous Year"
            >
              <ChevronLeft size={16} />
            </button>

            {[
              selectedYear - 2,
              selectedYear - 1,
              selectedYear,
              selectedYear + 1,
              selectedYear + 2
            ].map(yr => (
              <button
                key={yr}
                type="button"
                onClick={() => changeYear(yr)}
                style={{
                  background: selectedYear === yr ? 'var(--accent-indigo)' : 'transparent',
                  color: selectedYear === yr ? '#FFFFFF' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: selectedYear === yr ? 700 : 500,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {yr}
              </button>
            ))}

            <button
              type="button"
              onClick={() => changeYear(selectedYear + 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Next Year"
              aria-label="Next Year"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => changeYear(new Date().getFullYear())}
            style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
            title={`Go to current year (${new Date().getFullYear()})`}
          >
            <CalendarDays size={14} />
            <span>Current Year</span>
          </button>

                    <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (!isEnterprise && cards.length >= cardLimit) {
                setIsCardLimitModalOpen(true);
              } else {
                setIsAddCardOpen(true);
              }
            }}
            style={{ padding: '6px 14px', fontSize: 13, display: isViewOnly ? 'none' : 'flex', alignItems: 'center', gap: 6 }}
            title={!isEnterprise && cards.length >= cardLimit ? `Card limit reached (${cards.length}/${cardLimit}). Click to request increase.` : 'Add new credit card'}
          >
            <Plus size={15} />
            <span>{isEnterprise ? 'Add Card' : `Add Card (${cards.length}/${cardLimit})`}</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (cards.length === 0) {
                setBannerMsg({ type: 'error', text: 'Please add a credit card first before recording card expenses.' });
                setTimeout(() => setBannerMsg(null), 3500);
                setIsAddCardOpen(true);
                return;
              }
              setSpendCard(cards[0]?.name || '');
              setIsAddSpendOpen(true);
            }}
            style={{ padding: '6px 16px', fontSize: 13, display: isViewOnly ? 'none' : 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            <span>Add Credit Spend</span>
          </button>
        </div>
      </div>

      {/* 2. Month Navigation Pills with Dynamic Width Fit & Active Filter Status */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          background: 'var(--bg-secondary)',
          borderRadius: 14,
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          overflowY: 'hidden',
          marginBottom: 20,
          userSelect: 'none',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Active Filter Status Badge (solves empty space & gives clear active feedback) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 12px',
            borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: 'var(--accent-indigo)',
            flexShrink: 0
          }}
          title={`Active Filter: ${activeMonthStatusText} • Total Spend: ${currencyService.format(activePeriodSpend)} (${activePeriodUsagePct.toFixed(1)}%)`}
        >
          <CalendarDays size={14} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>
              Active Status
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {activeMonthStatusText}
            </span>
          </div>
        </div>

        <div style={{ width: 1, height: 26, background: 'var(--border-color)', margin: '0 2px', flexShrink: 0 }} />

        {/* 12 Months Pills (flex: 1 dynamically expands each month box to fit the full bar width) */}
        {MONTH_NAMES.map((mName, idx) => {
          const isSelected = selectedMonths.includes(idx);
          const monthSpend = monthlySpendingValues[idx] || 0;
          const monthUsagePct = totalCreditLimit > 0 ? (monthSpend / totalCreditLimit) * 100 : 0;
          const utilColor = monthUsagePct > 50 ? '#EF4444' : monthUsagePct > 30 ? '#F59E0B' : '#10B981';

          return (
            <button
              key={mName}
              type="button"
              onMouseDown={(e) => handleMonthMouseDown(idx, e)}
              onMouseEnter={() => handleMonthMouseEnter(idx)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleMonth(idx);
              }}
              style={{
                flex: 1,
                minWidth: 76,
                background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                border: isSelected ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid var(--border-color)',
                color: isSelected ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                fontWeight: isSelected ? 700 : 500,
                padding: '5px 6px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.2)' : 'none'
              }}
              title={`${mName} ${selectedYear}: Total Spend ${currencyService.format(monthSpend)} (${monthUsagePct.toFixed(1)}% usage)`}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1.2 }}>
                <span>{mName}</span>
                <span
                  style={{
                    width: 10,
                    marginLeft: 2,
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'inline-block',
                    textAlign: 'center',
                    opacity: isSelected ? 1 : 0,
                    color: 'var(--accent-indigo)'
                  }}
                >
                  ✓
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700 }}>
                <span style={{ color: monthSpend > 0 ? '#EF4444' : 'var(--text-muted)' }}>
                  {monthSpend > 0 ? `${currencyService.getActiveCurrencyConfig().symbol}${Math.round(monthSpend / 1000)}k` : '—'}
                </span>
                <span style={{ color: utilColor, fontSize: 9, fontWeight: 800, opacity: 0.9 }}>
                  {monthUsagePct > 0 ? `${monthUsagePct.toFixed(1)}%` : '0%'}
                </span>
              </div>
            </button>
          );
        })}

        {/* Full Year Option */}
        {(() => {
          const annualUsagePct = totalCreditLimit > 0 ? (annualTotalSpent / totalCreditLimit) * 100 : 0;
          const isFullYear = selectedMonths.length === 12;

          return (
            <button
              type="button"
              onClick={selectFullYear}
              style={{
                flex: 1.15,
                minWidth: 88,
                background: isFullYear ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                border: isFullYear ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid var(--border-color)',
                color: isFullYear ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                fontWeight: isFullYear ? 700 : 500,
                padding: '5px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2
              }}
              title={`View entire ${selectedYear} (${currencyService.format(annualTotalSpent)})`}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                Full Year {isFullYear ? '✓' : ''}
              </div>
              <div style={{ fontSize: 10, color: '#EF4444', fontWeight: 700 }}>
                {annualTotalSpent > 0 ? `${currencyService.getActiveCurrencyConfig().symbol}${Math.round(annualTotalSpent / 1000)}k` : '0'} • {annualUsagePct.toFixed(1)}%
              </div>
            </button>
          );
        })()}
      </div>

      {bannerMsg && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            background: bannerMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: bannerMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            color: bannerMsg.type === 'success' ? '#10B981' : '#EF4444',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20
          }}
        >
          {bannerMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{bannerMsg.text}</span>
        </div>
      )}

      {/* Credit Utilization Toggle Bar (Requirement: Toggle between Card Only vs With Loans/EMI) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          marginBottom: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Credit Utilization &amp; Outstanding Calculation Mode
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {includeLoansInUtilization
                ? 'Active Mode: Including direct card spend + active linked Loan EMIs & principal'
                : 'Active Mode: Pure direct credit card transactions only (excluding linked loans)'}
            </div>
          </div>
        </div>

        {/* Segmented Toggle Button */}
        <div style={{ display: 'inline-flex', background: 'rgba(255, 255, 255, 0.05)', padding: 3, borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => handleToggleLoansUtilization(false)}
            style={{
              padding: '7px 15px',
              borderRadius: 8,
              border: 'none',
              background: !includeLoansInUtilization ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' : 'transparent',
              color: !includeLoansInUtilization ? '#FFF' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s'
            }}
          >
            <span>💳 Only Credit Card Transactions</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleLoansUtilization(true)}
            style={{
              padding: '7px 15px',
              borderRadius: 8,
              border: 'none',
              background: includeLoansInUtilization ? 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)' : 'transparent',
              color: includeLoansInUtilization ? '#FFF' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s'
            }}
          >
            <span>🏦 With Credit Card Loan &amp; EMI</span>
          </button>
        </div>
      </div>

      {/* 3. KPI Overview Cards */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {/* Total Credit Limit */}
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">TOTAL CREDIT LIMIT</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
              <Shield size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8 }}>
            {currencyService.format(totalCreditLimit)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Across {cards.length} active credit cards
          </div>
        </div>

        {/* Current Outstanding Spends (Reduced by payments) */}
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">CURRENT OUTSTANDING</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: totalOutstanding > 0 ? '#EF4444' : '#10B981' }}>
            {currencyService.format(totalOutstanding)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Net balance (Total Spends minus Bill Payments)
          </div>
        </div>

        {/* Available Credit Limit */}
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">AVAILABLE CREDIT</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#10B981' }}>
            {currencyService.format(availableCredit)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Safe for further purchases
          </div>
        </div>

        {/* Credit Utilization Gauge */}
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">CREDIT UTILIZATION</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: utilizationRatio <= 30 ? 'rgba(16, 185, 129, 0.15)' : utilizationRatio <= 50 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: utilizationRatio <= 30 ? '#10B981' : utilizationRatio <= 50 ? '#F59E0B' : '#EF4444'
              }}
            >
              {utilizationRatio <= 30 ? 'EXCELLENT' : utilizationRatio <= 50 ? 'MODERATE' : 'HIGH'}
            </span>
          </div>
          <div className="kpi-value" style={{ marginTop: 8 }}>
            {utilizationRatio.toFixed(1)}%
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--border-color)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, utilizationRatio)}%`,
                height: '100%',
                background: utilizationRatio <= 30 ? '#10B981' : utilizationRatio <= 50 ? '#F59E0B' : '#EF4444',
                borderRadius: 999
              }}
            />
          </div>
<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Recommended: &lt;30%</span>
            <span style={{ color: includeLoansInUtilization ? '#A78BFA' : '#60A5FA', fontWeight: 700 }}>
              {includeLoansInUtilization ? '• Mode: With Loans & EMI' : '• Mode: Card Only'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Section Switcher: Credit Cards vs Bank Accounts & Debit Cards (Requirement 5) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
        <button
          type="button"
          onClick={() => setActiveSection('credit_cards')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: activeSection === 'credit_cards' ? '1px solid var(--accent-indigo)' : '1px solid transparent',
            background: activeSection === 'credit_cards' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
            color: activeSection === 'credit_cards' ? 'var(--accent-indigo)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <CreditCard size={15} />
          <span>Credit Cards ({cards.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('bank_accounts')}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: activeSection === 'bank_accounts' ? '1px solid var(--accent-indigo)' : '1px solid transparent',
            background: activeSection === 'bank_accounts' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
            color: activeSection === 'bank_accounts' ? 'var(--accent-indigo)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <DollarSign size={15} />
          <span>Bank Accounts & Debit Cards ({bankAccounts.length})</span>
        </button>
      </div>

      {/* 4. Visual Credit Cards Section with Expandable Details & Category Usage Tray */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Your Active Cards ({cards.length})
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Front shows available limit, used %, due & bill dates • Hover over any card to view category spending & total limits
            </span>
          </div>

          {cards.length > 0 && (
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, maxWidth: '100%' }}>
            <button
              type="button"
              onClick={() => setSelectedCardId('all')}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: selectedCardId === 'all' ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                color: selectedCardId === 'all' ? '#FFF' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              All Cards
            </button>
            {cards.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCardId(c.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedCardId === c.id ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                  color: selectedCardId === c.id ? '#FFF' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          )}
        </div>

        {/* Bank Accounts & Debit Cards Section (Requirement 5) */}
      {activeSection === 'bank_accounts' && (
        <div style={{ marginBottom: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                Bank Accounts & Debit Cards
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Linked bank accounts and debit cards automatically show up as selectable payment modes across all transaction and bill payment forms.
              </p>
            </div>
            {!isViewOnly && (
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Plus size={16} />
                <span>Add Bank & Debit Card</span>
              </button>
            )}
          </div>

          {bankAccounts.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 16, background: 'var(--card-bg)' }}>
              <DollarSign size={36} color="var(--accent-indigo)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--text-primary)' }}>No Bank Accounts Added</h4>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Add your bank account details to enable them in payment mode selections.</p>
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(true)}
                className="btn-primary"
              >
                Add Account
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {bankAccounts.map(acc => {
                const debitCards = acc.debitCards || [];
                const creditCards = acc.creditCards || [];

                return (
                  <div
                    key={acc.id}
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 16,
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <DollarSign size={22} />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {acc.bankName}
                          </h4>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {acc.accountType} Account •••• {acc.accountNumberLast4}
                            {acc.balance !== undefined && (
                              <strong style={{ color: '#10B981', marginLeft: 8 }}>
                                {currencyService.format(acc.balance)}
                              </strong>
                            )}
                          </span>
                        </div>
                      </div>
                      {!isViewOnly && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditAccount(acc)}
                            style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818CF8', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Edit Bank Account"
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc.id, acc.bankName)}
                            style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.8, padding: 6 }}
                            title="Remove Account"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Linked Debit Cards List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                          💳 LINKED DEBIT CARDS ({debitCards.length})
                        </span>
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddCardToAcc(acc.id, 'debit')}
                            style={{ background: 'transparent', border: 'none', color: '#38BDF8', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <Plus size={12} /> Add Debit Card
                          </button>
                        )}
                      </div>

                      {debitCards.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                          No debit cards linked yet.
                        </div>
                      ) : (
                        debitCards.map(dc => (
                          <div key={dc.id} style={{ padding: '10px 12px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#FFF' }}>
                                {dc.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.65)', fontFamily: 'monospace' }}>
                                •••• •••• •••• {dc.last4} {dc.expiry ? `• Exp: ${dc.expiry}` : ''}
                              </div>
                            </div>
                            {!isViewOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDebitCard(acc.id, dc.id)}
                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.7 }}
                                title="Remove debit card"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Linked Credit Cards List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                          💎 LINKED CREDIT CARDS ({creditCards.length})
                        </span>
                        {!isViewOnly && (
                          <button
                            type="button"
                            onClick={() => handleOpenAddCardToAcc(acc.id, 'credit')}
                            style={{ background: 'transparent', border: 'none', color: '#A855F7', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <Plus size={12} /> Add Credit Card
                          </button>
                        )}
                      </div>

                      {creditCards.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                          No credit cards linked to this bank.
                        </div>
                      ) : (
                        creditCards.map(cc => (
                          <div key={cc.id} style={{ padding: '10px 12px', background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.3) 0%, rgba(30, 27, 75, 0.6) 100%)', borderRadius: 10, border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#F3E8FF' }}>
                                {cc.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(243, 232, 255, 0.7)', fontFamily: 'monospace' }}>
                                •••• •••• •••• {cc.last4} {cc.limit ? `• Limit: ${currencyService.format(cc.limit)}` : ''}
                              </div>
                            </div>
                            {!isViewOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCreditCardFromAcc(acc.id, cc.id)}
                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', opacity: 0.7 }}
                                title="Remove credit card"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={13} />
                      <span>Available in payment modes across Fintrack</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeSection === "credit_cards" && (
        <div>
          {/* Cards Grid */}
          {cards.length === 0 ? (
          <div
            className="summary-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: 16,
              border: '1px dashed var(--border-color)',
              background: 'var(--card-bg)',
              marginBottom: 30
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <CreditCard size={28} style={{ color: 'var(--accent-indigo)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              No Credit Cards Added Yet
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Add your first credit card to monitor credit limits, billing statements, payment due dates, and track card transactions in real time.
            </p>
            <button
              type="button"
              onClick={() => setIsAddCardOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                color: '#FFF',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
              }}
            >
              <Plus size={16} />
              Add Your First Credit Card
            </button>
          </div>
        ) : (
          <div className="credit-cards-grid">
          {cards.map((c, idx) => {
            const isCardLocked = !isEnterprise && idx >= cardLimit;
            const cardStats = cardBalancesMap[c.name] || { purchases: 0, payments: 0, netOutstanding: 0, avail: c.limit, util: 0 };
            const availOnCard = cardStats.avail;
            const cardUtil = cardStats.util;
            const isSelected = selectedCardId === c.id;
            const isRevealed = Boolean(revealedCards[c.id]);
            const isExpanded = hoveredCardId === c.id;

            // Sensitive data formatting
            let displayedNumber = `•••• •••• •••• ${c.last4}`;
            if (isRevealed) {
              if (c.cardNumber && c.cardNumber.length >= 12) {
                displayedNumber = c.cardNumber.replace(/(\d{4})/g, '$1 ').trim();
              } else {
                displayedNumber = `•••• •••• •••• ${c.last4}`;
              }
            }

            const displayedExpiry = isRevealed
              ? `${c.expiryMonth ? String(c.expiryMonth).padStart(2, '0') : '12'}/${c.expiryYear || '28'}`
              : '••/••';

            const displayedCvv = isRevealed ? (c.cvv || '742') : '•••';

            // Category usage for this card
            const cardCatData = getCardCategoryBreakdown(c);

            const linkedAddons = cards.filter(a => a.isAddon && a.primaryCardId === c.id);

            return (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                className={`credit-card-container ${isExpanded ? 'is-hovered' : ''}`}
                onMouseEnter={() => handleCardMouseEnter(c.id)}
                onMouseLeave={() => handleCardMouseLeave(c.id)}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: isSelected ? '0 14px 34px rgba(99, 102, 241, 0.45)' : '0 8px 24px rgba(0, 0, 0, 0.35)',
                  border: isSelected ? '2px solid #818CF8' : '1px solid rgba(255, 255, 255, 0.14)'
                }}
              >
                {isCardLocked && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCardLimitModalOpen(true);
                    }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      borderRadius: 'inherit',
                      zIndex: 30,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 24,
                      textAlign: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid #EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#EF4444',
                        marginBottom: 10
                      }}
                    >
                      <Lock size={20} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', marginBottom: 4 }}>
                      Card Locked (Quota Limit)
                    </div>
                    <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, maxWidth: 260, margin: '0 0 14px' }}>
                      Your plan quota allows {cardLimit} active card{cardLimit > 1 ? 's' : ''}. Upgrade or request quota increase.
                    </p>
                    <button
                      type="button"
                      style={{
                        background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
                      }}
                    >
                      Request Quota Increase
                    </button>
                  </div>
                )}
                {/* Physical Card Front Frame */}
                <div
                  onClick={() => {
                    setSelectedCardId(isSelected ? 'all' : c.id);
                    setHoveredCardId(prev => (prev === c.id ? null : c.id));
                  }}
                  style={{
                    background: c.gradient,
                    padding: '22px 24px 16px',
                    color: '#FFFFFF',
                    position: 'relative',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 228,
                    height: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* Decorative circles */}
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: -40, right: 30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.03)', pointerEvents: 'none' }} />

                  {/* Card Top: Bank, Network & Action Icons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      {c.isAddon && (
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(99, 102, 241, 0.4)', border: '1px solid rgba(165, 180, 252, 0.5)', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, color: '#FFF' }}>
                            🔗 ADD-ON CARD {c.holderName ? `(${c.holderName})` : ''} • SHARED LIMIT
                          </span>
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.9)' }}>
                        {c.bank}
                      </span>
                      <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', marginTop: 2 }}>
                        {c.name}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', letterSpacing: '0.05em', color: '#FFF' }}>
                        {c.network}
                      </span>

                      {/* Eye Icon: Mask / Unmask Sensitive Card Data */}
                      <button
                        type="button"
                        onClick={(e) => toggleCardVisibility(c.id, e)}
                        title={isRevealed ? 'Hide sensitive card details' : 'Reveal card number, CVV & expiry'}
                        style={{
                          background: 'rgba(255, 255, 255, 0.12)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: isRevealed ? '#FDE047' : 'rgba(255, 255, 255, 0.75)',
                          cursor: 'pointer',
                          padding: 5,
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>

                      {/* Edit Card Button */}
                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditCard(c, e)}
                          title="Edit card details"
                          style={{
                            background: 'rgba(255, 255, 255, 0.12)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: 'rgba(255, 255, 255, 0.75)',
                            cursor: 'pointer',
                            padding: 5,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Edit3 size={14} />
                        </button>
                      )}

                      {/* Delete Card Button */}
                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardToDelete(c);
                          }}
                          title="Delete card"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.45)',
                            cursor: 'pointer',
                            padding: 4
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chip, Contactless Icon and 16-Digit Number aligned side-by-side */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '14px 0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 26, borderRadius: 5, background: 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)', border: '1px solid #B45309', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                        <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                        <div style={{ position: 'absolute', top: 18, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.75)' }}>
                        <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>)))</span>
                      </div>
                    </div>

                    {/* 16-Digit Card Number right next to SIM Chip */}
                    <div style={{ fontSize: 15, letterSpacing: '0.14em', fontFamily: 'monospace', fontWeight: 700, color: '#FFF', textShadow: '0 2px 4px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
                      {displayedNumber}
                    </div>
                  </div>

                  {/* Cardholder, Expiry & CVV */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                    <div>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.05em', display: 'block' }}>
                        CARDHOLDER
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {user?.name || 'CARDMEMBER'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 18 }}>
                      <div>
                        <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.05em', display: 'block' }}>
                          EXPIRES
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                          {displayedExpiry}
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.05em', display: 'block' }}>
                          CVV
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                          {displayedCvv}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Front-of-Card Stats: Available Limit, Used Percentage, Bill & Due Date */}
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.9)' }}>
                        Available Limit: <strong style={{ color: '#10B981' }}>{currencyService.format(availOnCard)}</strong>
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: cardUtil <= 30 ? 'rgba(16, 185, 129, 0.25)' : cardUtil <= 50 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                          color: cardUtil <= 30 ? '#34D399' : cardUtil <= 50 ? '#FBBF24' : '#F87171'
                        }}
                      >
                        {cardUtil.toFixed(1)}% used
                      </span>
                    </div>

                    {/* Utilization Progress bar */}
                    <div style={{ width: '100%', height: 5, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, cardUtil)}%`,
                          height: '100%',
                          background: cardUtil <= 30 ? '#10B981' : cardUtil <= 50 ? '#F59E0B' : '#EF4444',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>

                    {/* Card Due Day, Bill Day & Expand Trigger */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 38 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.75)' }}>
                          Bill day: <strong>{c.billingDay}th</strong> • Due: <strong>{c.dueDay}th</strong>
                        </span>
                        {cardStats.activeLoanEmis > 0 ? (
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#38BDF8', background: 'rgba(56, 189, 248, 0.22)', border: '1px solid rgba(56, 189, 248, 0.45)', padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                            💳 Loan EMI: {currencyService.format(cardStats.activeLoanEmis)}/mo
                          </span>
                        ) : (
                          <span style={{ height: 18 }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayCardName(c.name);
                            setPayAmount(cardStats.netOutstanding > 0 ? String(cardStats.netOutstanding) : '');
                            setIsPayBillOpen(true);
                          }}
                          style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            color: '#FFF',
                            padding: '3px 9px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Pay Bill
                        </button>
                        <div
                          style={{
                            background: isExpanded ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.14)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            color: '#FFF',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            userSelect: 'none',
                            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
                          }}
                          title={isExpanded ? 'Category details expanded' : 'Hover over card to expand category details'}
                        >
                          <span>{isExpanded ? 'Details' : 'Hover to Expand'}</span>
                          <ChevronDown
                            size={13}
                            className={`credit-card-chevron ${isExpanded ? 'is-open' : ''}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expandable Tray: Hardware-Accelerated Fluid CSS Drawer */}
                <div className={`credit-card-drawer ${isExpanded ? 'is-open' : ''}`}>
                  <div className="credit-card-drawer-inner">
                    <div style={{ padding: '16px 20px', fontSize: 12 }}>
                      {/* Header Limits Strip */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px dashed var(--border-color)', marginBottom: 12 }}>
                        <div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                            Total Limit
                          </span>
                          <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                            {currencyService.format(c.limit)}
                          </strong>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                            Spend Limit / Total Spent
                          </span>
                          <strong style={{ fontSize: 14, color: '#EF4444' }}>
                            {currencyService.format(cardStats.purchases)}
                          </strong>
                        </div>
                      </div>

                      {/* Category Usage Breakdown for this card */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                          Category Spending Breakdown ({cardCatData.categories.length})
                        </div>

                        {cardCatData.categories.length === 0 ? (
                          c.isAddon ? (
                            <div style={{ padding: '12px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 10, border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: 11, color: 'var(--text-secondary)' }}>
                              <div style={{ fontWeight: 800, color: '#818CF8', marginBottom: 3 }}>🔗 Independent Add-on Card Activity</div>
                              <div>No direct spending recorded on this add-on card. Transactions from the parent card do not mix here — only purchases made with this add-on card appear in its breakdown.</div>
                            </div>
                          ) : (
                            <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 11 }}>
                              No spending recorded on this card for the selected period.
                            </div>
                          )
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {cardCatData.categories.map(cat => (
                              <div key={cat.name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {cat.name}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                                    <span style={{ fontWeight: 700, color: '#EF4444' }}>
                                      {currencyService.format(cat.amount)}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                      ({cat.percentage.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                                <div style={{ width: '100%', height: 4, background: 'var(--border-color)', borderRadius: 999, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${Math.min(100, cat.percentage)}%`,
                                      height: '100%',
                                      background: 'linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)',
                                      borderRadius: 999
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simplified Linked Add-on Card Indicator */}
              {linkedAddons.length > 0 && (
                <div style={{ padding: '8px 12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 10, border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#818CF8' }}>
                    <span>🔗 {linkedAddons.length} Add-on Card{linkedAddons.length > 1 ? 's' : ''} Linked</span>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#10B981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 4 }}>
                    Shared Limit
                  </span>
                </div>
              )}
              </div>
            );
          })}
        </div>
        )}
        </div>
      )}
      </div>

      {/* 5. Monthly Spending Graph (TradeChart Flow like Dashboard) */}
      <div className="summary-card" style={{ padding: '24px 28px', marginBottom: 24, borderRadius: 16 }}>
        {/* Chart Header with View Toggle (Flow Trend vs Bars) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818CF8' }}>
              <Activity size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {chartCardTitle}
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Jan to Dec monthly spending trajectory for {selectedYear}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Avg: <strong style={{ color: '#818CF8' }}>{currencyService.format(monthlyAverageSpent)}/mo</strong>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Peak: <strong style={{ color: '#10B981' }}>{peakMonthData.month} ({currencyService.format(peakMonthData.val)})</strong>
            </div>

            {/* View Mode Toggle: Flow Curve vs Bars */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setChartMode('flow')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: chartMode === 'flow' ? 'var(--accent-indigo)' : 'transparent',
                  color: chartMode === 'flow' ? '#FFF' : 'var(--text-secondary)'
                }}
                title="TradeChart Flow Curve"
              >
                <Activity size={13} />
                <span>Flow Curve</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('bars')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: chartMode === 'bars' ? 'var(--accent-indigo)' : 'transparent',
                  color: chartMode === 'bars' ? '#FFF' : 'var(--text-secondary)'
                }}
                title="Monthly Bars"
              >
                <BarChart2 size={13} />
                <span>Monthly Bars</span>
              </button>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div style={{ height: 260, width: '100%', position: 'relative' }}>
          {chartMode === 'flow' ? (
            <Line data={tradeChartData} options={chartOptions} />
          ) : (
            <Bar data={barChartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* 6. Expandable Category Breakdown Card (Dashboard Style) */}
      <div className="summary-card" style={{ padding: '20px 26px', marginBottom: 28, borderRadius: 16 }}>
        <div
          onClick={() => setIsCategorySectionExpanded(prev => !prev)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
              <PieChart size={16} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Category Breakdown</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 999 }}>
                  {isCategorySectionExpanded ? 'Click to Collapse' : 'Click to Expand'}
                </span>
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {creditTransactions.length} transaction{creditTransactions.length === 1 ? '' : 's'}
            </span>
            <ChevronDown
              size={18}
              style={{
                color: 'var(--text-secondary)',
                transform: isCategorySectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s ease'
              }}
            />
          </div>
        </div>

        {isCategorySectionExpanded && (
          <div style={{ marginTop: 18, animation: 'fadeIn 0.2s ease' }}>
            {categoryBreakdown.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                0 transactions recorded for the selected period.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {categoryBreakdown.map(cat => (
                  <div
                    key={cat.name}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      padding: '12px 16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cat.name}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.name === 'Bill Payments' ? '#10B981' : '#EF4444' }}>
                        {cat.name === 'Bill Payments' ? '+' : '-'}{currencyService.format(cat.total)}
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--border-color)', borderRadius: 999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, cat.percentage)}%`,
                          height: '100%',
                          background: cat.name === 'Bill Payments'
                            ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                            : 'linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)',
                          borderRadius: 999
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      <span>{cat.count} spend{cat.count === 1 ? '' : 's'}</span>
                      <span>{cat.percentage.toFixed(1)}% of total</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. Actual Credit Card Transactions Ledger with Min/Max Height & Pagination Limits */}
      <div className="summary-card" style={{ padding: 24, borderRadius: 16 }}>
        {/* Table Controls & Segmented Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Credit Card Transactions Ledger ({creditTransactions.length})
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Search, filter, and track credit card spends & bill payments with bounded scroll & pagination
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-btn ${ccFilterType === 'all' ? 'active' : ''}`}
                onClick={() => setCcFilterType('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`segmented-btn ${ccFilterType === 'spends' ? 'active' : ''}`}
                onClick={() => setCcFilterType('spends')}
              >
                Card Spends
              </button>
              <button
                type="button"
                className={`segmented-btn ${ccFilterType === 'bills' ? 'active' : ''}`}
                onClick={() => setCcFilterType('bills')}
              >
                Bill Payments
              </button>
            </div>

            <button
              type="button"
              className="btn-primary"
              style={{ padding: '7px 14px', fontSize: 12 }}
              onClick={() => {
                if (cards.length === 0) {
                  setBannerMsg({ type: 'error', text: 'Please add a credit card first before recording card expenses.' });
                  setTimeout(() => setBannerMsg(null), 3500);
                  setIsAddCardOpen(true);
                  return;
                }
                setSpendCard(cards[0]?.name || '');
                setIsAddSpendOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Add Spend</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar (Search, Card, Category, Date Popover, Amount Popover, Reset) */}
        <div
          className="transactions-filter-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16
          }}
        >
          {/* Fixed-width Search Input */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input, var(--bg-secondary))',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '8px 12px',
              gap: 8
            }}
          >
            <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search card, category, merchant..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--text-primary)',
                width: '100%',
                fontSize: 12
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 2
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Card Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <CreditCard size={14} style={{ color: 'var(--text-secondary)' }} />
            <select
              value={selectedCardId}
              onChange={e => setSelectedCardId(e.target.value)}
              style={{
                background: 'var(--bg-input, var(--bg-secondary))',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Cards ({cards.length})</option>
              {cards.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (•••• {c.last4})
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{
                background: 'var(--bg-input, var(--bg-secondary))',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Categories</option>
              {Object.keys(CREDIT_CATEGORIES).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Date Filter Popover */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={ccDateFilterRef}>
            <button
              type="button"
              onClick={() => {
                setShowCcDatePopover(open => !open);
                setShowCcAmountPopover(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: ccFromDate || ccToDate ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input, var(--bg-secondary))',
                border: ccFromDate || ccToDate ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                color: ccFromDate || ccToDate ? 'var(--accent-indigo)' : 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: ccFromDate || ccToDate ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minWidth: 120,
                whiteSpace: 'nowrap'
              }}
              title="Filter by date range"
            >
              <Calendar size={14} />
              <span>{getCcDateFilterLabel()}</span>
              {(ccFromDate || ccToDate) && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setCcFromDate('');
                    setCcToDate('');
                  }}
                  style={{
                    marginLeft: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.25)',
                    fontSize: 10,
                    lineHeight: 1
                  }}
                  title="Clear date filter"
                >
                  ✕
                </span>
              )}
            </button>

            {showCcDatePopover && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  width: 300,
                  background: 'var(--bg-card, #0d1527)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  QUICK PRESETS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { key: 'all', label: 'All Time' },
                    { key: 'this_month', label: 'This Month' },
                    { key: 'last_month', label: 'Last Month' },
                    { key: 'last_30', label: 'Last 30 Days' },
                    { key: 'this_year', label: 'This Year' }
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyCcDatePreset(p.key as any)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  CUSTOM RANGE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 34 }}>From:</span>
                    <input
                      type="date"
                      value={ccFromDate}
                      onChange={e => setCcFromDate(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 34 }}>To:</span>
                    <input
                      type="date"
                      value={ccToDate}
                      onChange={e => setCcToDate(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: 12
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCcFromDate('');
                      setCcToDate('');
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCcDatePopover(false)}
                    style={{
                      background: 'var(--accent-indigo)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount Filter Popover */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={ccAmountFilterRef}>
            <button
              type="button"
              onClick={() => {
                setShowCcAmountPopover(open => !open);
                setShowCcDatePopover(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: ccMinAmount || ccMaxAmount ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input, var(--bg-secondary))',
                border: ccMinAmount || ccMaxAmount ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                color: ccMinAmount || ccMaxAmount ? 'var(--accent-indigo)' : 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: ccMinAmount || ccMaxAmount ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minWidth: 120,
                whiteSpace: 'nowrap'
              }}
              title="Filter by amount range"
            >
              <DollarSign size={14} />
              <span>{getCcAmountFilterLabel()}</span>
              {(ccMinAmount || ccMaxAmount) && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setCcMinAmount('');
                    setCcMaxAmount('');
                  }}
                  style={{
                    marginLeft: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.25)',
                    fontSize: 10,
                    lineHeight: 1
                  }}
                  title="Clear amount filter"
                >
                  ✕
                </span>
              )}
            </button>

            {showCcAmountPopover && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  width: 300,
                  background: 'var(--bg-card, #0d1527)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  QUICK PRESETS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'under_1k', label: `< ${currencyService.getActiveCurrencyConfig().symbol}1,000` },
                    { key: '1k_5k', label: `${currencyService.getActiveCurrencyConfig().symbol}1k - 5k` },
                    { key: '5k_20k', label: `${currencyService.getActiveCurrencyConfig().symbol}5k - 20k` },
                    { key: 'above_20k', label: `> ${currencyService.getActiveCurrencyConfig().symbol}20,000` }
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyCcAmountPreset(p.key as any)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  CUSTOM RANGE ({currencyService.getActiveCurrencyConfig().symbol})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    placeholder="Min"
                    value={ccMinAmount}
                    onChange={e => setCcMinAmount(e.target.value)}
                    style={{
                      width: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: 'var(--text-primary)',
                      fontSize: 12
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={ccMaxAmount}
                    onChange={e => setCcMaxAmount(e.target.value)}
                    style={{
                      width: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: 'var(--text-primary)',
                      fontSize: 12
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCcMinAmount('');
                      setCcMaxAmount('');
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCcAmountPopover(false)}
                    style={{
                      background: 'var(--accent-indigo)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Actions: Reset & Count Badge */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {hasActiveCcFilters && (
              <button
                type="button"
                onClick={handleResetCcFilters}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                  padding: '7px 12px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Clear all active filters"
              >
                <RotateCcw size={12} />
                <span>Clear Filters</span>
              </button>
            )}

            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                padding: '7px 11px',
                borderRadius: 8,
                whiteSpace: 'nowrap'
              }}
            >
              Showing {creditTransactions.length} of {yearCreditTransactions.length} items
            </div>
          </div>
        </div>

        {/* Transactions Table with Min-Height (doesn't collapse) & Max-Height (bounded scroll) */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading credit card transactions from database...
          </div>
        ) : creditTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#6366F1' }}>
              <CreditCard size={24} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              No Credit Card Transactions Found
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: 450, marginLeft: 'auto', marginRight: 'auto' }}>
              {searchQuery || categoryFilter !== 'all' || selectedCardId !== 'all'
                ? 'No transactions match your current filters. Try resetting the search, month, or card filter.'
                : 'Transactions recorded with Payment Mode "Credit Card" will automatically appear here and sync in real-time.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
              if (cards.length === 0) {
                setBannerMsg({ type: 'error', text: 'Please add a credit card first before recording card expenses.' });
                setTimeout(() => setBannerMsg(null), 3500);
                setIsAddCardOpen(true);
                return;
              }
              setSpendCard(cards[0]?.name || '');
              setIsAddSpendOpen(true);
            }}
            >
              <Plus size={16} />
              <span>Record First Credit Card Expense</span>
            </button>
          </div>
        ) : (
          <div>
            {/* Scrollable table container with strict minHeight (no collapse on 1-2 lines) and maxHeight */}
            <div style={{ overflowX: 'auto', minHeight: 280, maxHeight: 460, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Description / Merchant</th>
                    <th style={{ padding: '12px 14px' }}>Card Used</th>
                    <th style={{ padding: '12px 14px' }}>Category</th>
                    <th style={{ padding: '12px 14px' }}>Subcategory</th>
                    <th style={{ padding: '12px 14px' }}>Payment Mode</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map(tx => {
                    const amt = Number(tx.amount) || 0;
                    const cardLabel = tx.card || cards[0]?.name || 'Credit Card';
                    const isPayment = isBillPaymentTx(tx);

                    return (
                      <tr
                        key={tx.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {tx.date}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                            <span>{tx.description || tx.details || (isPayment ? 'Bill Payment' : 'Card Spend')}</span>
                            {isPayment && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.18)', color: '#10B981' }}>
                                Bill Paid ✓
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-indigo)', fontSize: 11, fontWeight: 700 }}>
                            <CreditCard size={12} />
                            {cardLabel}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {tx.category || (isPayment ? 'Utilities & Bills' : 'General')}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                          {tx.subcategory || (isPayment ? 'Credit Card Bill Payment' : '--')}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: isPayment ? 'rgba(16, 185, 129, 0.12)' : 'rgba(139, 92, 246, 0.12)', color: isPayment ? '#10B981' : '#8B5CF6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                            {tx.paymentMode || (isPayment ? 'UPI' : 'CREDIT')}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: isPayment ? '#10B981' : '#EF4444', whiteSpace: 'nowrap' }}>
                          {isPayment ? `+${currencyService.format(amt)}` : `-${currencyService.format(amt)}`}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {!isViewOnly ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id)}
                              title="Delete transaction"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 4,
                                borderRadius: 6,
                                transition: 'color 0.15s'
                              }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Minimum 5 rows placeholder so height is always stable */}
                  {paginatedTransactions.length < 5 &&
                    Array.from({ length: 5 - paginatedTransactions.length }).map((_, emptyIdx) => (
                      <tr key={`empty-cc-row-${emptyIdx}`} className="empty-placeholder-row">
                        <td style={{ height: 49, padding: '12px 14px' }}>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer Controls (Budget & Transactions style) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px solid var(--border-color)',
                fontSize: 12,
                color: 'var(--text-secondary)'
              }}
            >
              {/* Range Info */}
              <div>
                Showing{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {(safeCurrentPage - 1) * pageSize + 1}
                </strong>{' '}
                to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.min(safeCurrentPage * pageSize, creditTransactions.length)}
                </strong>{' '}
                of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {creditTransactions.length}
                </strong>{' '}
                transactions
              </div>

              {/* Rows Per Page & Page Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      background: 'var(--bg-input, var(--bg-secondary))',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                {/* Page Navigation Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: safeCurrentPage === 1 ? 'transparent' : 'var(--bg-secondary)',
                      color: safeCurrentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                      cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1)
                    .map((page, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && page - prev > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span style={{ padding: '0 4px', color: 'var(--text-muted)' }}>...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 6,
                              border: '1px solid',
                              borderColor: page === safeCurrentPage ? 'var(--accent-indigo)' : 'var(--border-color)',
                              background: page === safeCurrentPage ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                              color: page === safeCurrentPage ? '#FFF' : 'var(--text-primary)',
                              fontWeight: page === safeCurrentPage ? 700 : 500,
                              fontSize: 12,
                              cursor: 'pointer'
                            }}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: safeCurrentPage === totalPages ? 'transparent' : 'var(--bg-secondary)',
                      color: safeCurrentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                      cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Credit Card Spend */}
      {isAddSpendOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 480 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Record Credit Card Spend</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Directly saves to ledger as credit card expense
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSpendOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSpendSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {spendError && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontSize: 12 }}>
                  {spendError}
                </div>
              )}

              {/* Select Active Credit Card */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  SELECT ACTIVE CREDIT CARD
                </label>
                <select
                  value={spendCard}
                  onChange={e => setSpendCard(e.target.value)}
                  className="modal-select"
                  required
                >
                  {cards.map(c => (
                    <option key={c.id} value={c.name}>{c.name} (•••• {c.last4})</option>
                  ))}
                </select>
              </div>

              {/* Amount with Calculator Math & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      AMOUNT ({currencyService.getActiveCurrencyCode()})
                    </label>
                    <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                      Calculator ready
                    </span>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="e.g. 1500 or 1200+300"
                      value={spendAmount}
                      onChange={e => setSpendAmount(e.target.value)}
                      onBlur={handleSpendAmountBlur}
                      onKeyDown={handleSpendAmountKeyDown}
                      className="modal-input"
                      required
                    />
                    {evaluatedSpendAmount != null && (
                      <span
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.18)',
                          padding: '2px 7px',
                          borderRadius: 5,
                          pointerEvents: 'none'
                        }}
                      >
                        = {currencyService.getActiveCurrencyConfig().symbol}{evaluatedSpendAmount}
                      </span>
                    )}
                  </div>

                  {/* Quick Add Buttons */}
                  <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                    {[100, 500, 1000, 5000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleQuickAddSpend(amt)}
                        style={{
                          padding: '2px 7px',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    DATE
                  </label>
                  <input
                    type="date"
                    value={spendDate}
                    onChange={e => setSpendDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Merchant / Description */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  MERCHANT / DESCRIPTION
                </label>
                <input
                  type="text"
                  placeholder="e.g. Amazon, Starbucks, Apple Store, Shell Fuel"
                  value={spendDesc}
                  onChange={e => setSpendDesc(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              {/* Category & Subcategory */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    CATEGORY
                  </label>
                  <select
                    value={spendCategory}
                    onChange={e => {
                      const newCat = e.target.value;
                      setSpendCategory(newCat);
                      setSpendSubcategory(CREDIT_CATEGORIES[newCat]?.[0] || 'General');
                    }}
                    className="modal-select"
                  >
                    {Object.keys(CREDIT_CATEGORIES).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    SUBCATEGORY
                  </label>
                  <select
                    value={spendSubcategory}
                    onChange={e => setSpendSubcategory(e.target.value)}
                    className="modal-select"
                  >
                    {(CREDIT_CATEGORIES[spendCategory] || ['General']).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsAddSpendOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={spendSaving}
                >
                  {spendSaving ? 'Recording...' : 'Record Spend'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Existing Card (Spacious, Well-Organized Layout) */}
      {editingCard && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 520, padding: 26, borderRadius: 18 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Edit Credit Card Details</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Update card numbers, limit, statement cycle and style</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditCardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Row 1: Card Name & Issuing Bank */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    CARD NAME
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBI Cashback"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ISSUING BANK
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBI Card"
                    value={editBank}
                    onChange={e => setEditBank(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Card Network */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CARD NETWORK
                </label>
                <select
                  value={editNetwork}
                  onChange={e => setEditNetwork(e.target.value as any)}
                  className="modal-select"
                >
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="RuPay">RuPay</option>
                  <option value="Amex">American Express (Amex)</option>
                </select>
              </div>

              {/* Section 2: Numbers & Security */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      FULL 16-DIGIT CARD NUMBER <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--accent-indigo)', fontWeight: 600 }}>
                      Protected & masked by default
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={19}
                    placeholder="e.g. 4281 7392 8192 4281 (or leave blank if just using last 4)"
                    value={editFullNumber}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                      setEditFullNumber(raw);
                      if (raw.length >= 4) {
                        setEditLast4(raw.slice(-4));
                      }
                    }}
                    className="modal-input"
                    style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
                  />
                </div>

                {/* Last 4 Digits, Expiry (Clean MM & YY), and CVV */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 0.85fr)', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      LAST 4 DIGITS
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="4281"
                      value={editLast4}
                      onChange={e => setEditLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="modal-input"
                      style={{ fontFamily: 'monospace', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      EXPIRY (MM / YY)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        placeholder="MM"
                        value={editExpiryMonth}
                        onChange={e => setEditExpiryMonth(Number(e.target.value))}
                        className="modal-input"
                        style={{ textAlign: 'center', width: '100%', minWidth: 0, flex: 1, padding: '10px 4px' }}
                        required
                      />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>/</span>
                      <input
                        type="number"
                        min={24}
                        max={45}
                        placeholder="YY"
                        value={editExpiryYear}
                        onChange={e => setEditExpiryYear(Number(e.target.value))}
                        className="modal-input"
                        style={{ textAlign: 'center', width: '100%', minWidth: 0, flex: 1, padding: '10px 4px' }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      CVV <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Opt)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="742"
                      value={editCvv}
                      onChange={e => setEditCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="modal-input"
                      style={{ fontFamily: 'monospace', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Add-on Card Option (Requirement 4) */}
              <div style={{ padding: '12px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 10, border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={newIsAddon}
                    onChange={e => {
                      const checked = e.target.checked;
                      setNewIsAddon(checked);
                      if (checked) {
                        const primCards = cards.filter(c => !c.isAddon);
                        if (primCards.length > 0) {
                          setNewPrimaryCardId(primCards[0].id);
                          setNewCardLimit(String(primCards[0].limit));
                        }
                      }
                    }}
                    style={{ width: 16, height: 16, accentColor: '#6366F1', cursor: 'pointer' }}
                  />
                  <span>🔗 This is an Add-on / Supplementary Card</span>
                </label>

                {newIsAddon && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        LINK TO PRIMARY CREDIT CARD *
                      </label>
                      <select
                        value={newPrimaryCardId}
                        onChange={e => {
                          setNewPrimaryCardId(e.target.value);
                          const parent = cards.find(c => c.id === e.target.value);
                          if (parent) setNewCardLimit(String(parent.limit));
                        }}
                        className="modal-select"
                        required
                      >
                        {cards.filter(c => !c.isAddon).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.bank} •••• {c.last4}) — Limit: {currencyService.format(c.limit)}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 11, color: '#10B981', marginTop: 4, display: 'block' }}>
                        ✓ Add-on card shares the primary card's credit limit. Does NOT duplicate your total limit!
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        ADD-ON CARDHOLDER NAME (e.g. Spouse / Family Member)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sarah Connor"
                        value={newAddonHolderName}
                        onChange={e => setNewAddonHolderName(e.target.value)}
                        className="modal-input"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Credit Limit & Billing Cycle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LIMIT ({currencyService.getActiveCurrencyCode()})
                  </label>
                  <input
                    type="number"
                    placeholder="150000"
                    value={editLimit}
                    onChange={e => setEditLimit(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    BILLING DAY
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={editBillingDay}
                    onChange={e => setEditBillingDay(Number(e.target.value))}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    DUE DAY
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={editDueDay}
                    onChange={e => setEditDueDay(Number(e.target.value))}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Section 4: Card Color Theme */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  CARD COLOR GRADIENT
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {CARD_GRADIENTS.map((g, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setEditGradient(g.gradient);
                        setEditAccent(g.accent);
                      }}
                      style={{
                        width: 46,
                        height: 30,
                        borderRadius: 8,
                        background: g.gradient,
                        border: editGradient === g.gradient ? '2px solid #FFF' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: editGradient === g.gradient ? '0 0 12px rgba(99,102,241,0.6)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFF'
                      }}
                      title={g.label}
                    >
                      {editGradient === g.gradient && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setEditingCard(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Bank Account */}
      {editingAccount && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 460 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Edit Bank Account</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Update bank name, type & balance</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  BANK NAME *
                </label>
                <input
                  type="text"
                  value={editBankName}
                  onChange={e => setEditBankName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ACCOUNT TYPE *
                  </label>
                  <select
                    value={editAccountType}
                    onChange={e => setEditAccountType(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="Savings">Savings Account</option>
                    <option value="Salary">Salary Account</option>
                    <option value="Current">Current Account</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ACCOUNT LAST 4 *
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={editAccountNumberLast4}
                    onChange={e => setEditAccountNumberLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="modal-input"
                    style={{ textAlign: 'center', fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ACCOUNT BALANCE ({currencyService.getActiveCurrencyCode()})
                </label>
                <input
                  type="number"
                  value={editAccountBalance}
                  onChange={e => setEditAccountBalance(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setEditingAccount(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Debit or Credit Card to Bank Account */}
      {cardToAccTarget && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 440 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: cardToAccTarget.type === 'debit' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cardToAccTarget.type === 'debit' ? '#38BDF8' : '#A855F7' }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>
                    Add {cardToAccTarget.type === 'debit' ? 'Debit Card' : 'Credit Card'}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Attach to bank account</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCardToAccTarget(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCardToAcc} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {cardToAccTarget.type === 'credit' && cards.length > 0 && (
                <div style={{ padding: '10px 12px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: 10, border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#C084FC', marginBottom: 5 }}>
                    SELECT FROM EXISTING CREDIT CARDS (QUICK LINK)
                  </label>
                  <select
                    value={selectExistingCreditCardId}
                    onChange={e => {
                      const id = e.target.value;
                      setSelectExistingCreditCardId(id);
                      const chosen = cards.find(c => c.id === id);
                      if (chosen) {
                        setCardToAccName(chosen.name + (chosen.isAddon ? ' (Add-on)' : ''));
                        setCardToAccLast4(chosen.last4);
                        setCardToAccLimit(String(chosen.limit));
                      }
                    }}
                    className="modal-select"
                    style={{ fontSize: 12.5 }}
                  >
                    <option value="">-- Choose an existing card or enter new --</option>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.bank} •••• {c.last4}) {c.isAddon ? '• [Add-on Card]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CARD NAME *
                </label>
                <input
                  type="text"
                  placeholder={cardToAccTarget.type === 'debit' ? 'e.g. Platinum Debit Card' : 'e.g. Regalia Gold Credit Card'}
                  value={cardToAccName}
                  onChange={e => setCardToAccName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LAST 4 DIGITS *
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={cardToAccLast4}
                    onChange={e => setCardToAccLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="modal-input"
                    style={{ textAlign: 'center', fontFamily: 'monospace' }}
                    required
                  />
                </div>

                {cardToAccTarget.type === 'debit' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      EXPIRY (MM/YY)
                    </label>
                    <input
                      type="text"
                      placeholder="12/28"
                      value={cardToAccExpiry}
                      onChange={e => setCardToAccExpiry(e.target.value)}
                      className="modal-input"
                      style={{ textAlign: 'center' }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      CREDIT LIMIT ({currencyService.getActiveCurrencyCode()})
                    </label>
                    <input
                      type="number"
                      placeholder="150000"
                      value={cardToAccLimit}
                      onChange={e => setCardToAccLimit(e.target.value)}
                      className="modal-input"
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setCardToAccTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: cardToAccTarget.type === 'debit' ? '#0284C7' : '#9333EA' }}>
                  Save Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Bank Account & Debit Card (Requirement 5) */}
      {isAddAccountOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 18 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <DollarSign size={20} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Add Bank Account & Debit Card</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Add account details to use in payment modes</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  BANK NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank, State Bank of India, ICICI"
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ACCOUNT TYPE *
                  </label>
                  <select
                    value={newAccountType}
                    onChange={e => setNewAccountType(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="Savings">Savings Account</option>
                    <option value="Salary">Salary Account</option>
                    <option value="Current">Current Account</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ACCOUNT LAST 4 *
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 5678"
                    value={newAccountNumberLast4}
                    onChange={e => setNewAccountNumberLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="modal-input"
                    style={{ textAlign: 'center', fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              {/* Linked Debit Card Checkbox & Fields */}
              <div style={{ padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={newHasDebitCard}
                    onChange={e => setNewHasDebitCard(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#10B981', cursor: 'pointer' }}
                  />
                  <span>💳 Add Linked Debit Card Details</span>
                </label>

                {newHasDebitCard && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        DEBIT CARD NAME
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Platinum Debit Card"
                        value={newDebitCardName}
                        onChange={e => setNewDebitCardName(e.target.value)}
                        className="modal-input"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        DEBIT CARD LAST 4 DIGITS
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="e.g. 9876"
                        value={newDebitCardLast4}
                        onChange={e => setNewDebitCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="modal-input"
                        style={{ textAlign: 'center', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsAddAccountOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#10B981' }}>
                  Save Account & Debit Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Card */}
      {isAddCardOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 520, padding: 26, borderRadius: 18 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Add New Credit Card</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configure credit limit, statement cycle & card security</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCardOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Primary vs Add-on Card Selector at Top */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 4, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setNewIsAddon(false)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: !newIsAddon ? 'var(--accent-indigo, #6366F1)' : 'transparent',
                    color: !newIsAddon ? '#FFFFFF' : 'var(--text-secondary)'
                  }}
                >
                  💳 Primary Card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewIsAddon(true);
                    const primCards = cards.filter(c => !c.isAddon);
                    if (primCards.length > 0 && !newPrimaryCardId) {
                      setNewPrimaryCardId(primCards[0].id);
                      setNewCardLimit(String(primCards[0].limit));
                    }
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: newIsAddon ? 'var(--accent-indigo, #6366F1)' : 'transparent',
                    color: newIsAddon ? '#FFFFFF' : 'var(--text-secondary)'
                  }}
                >
                  🔗 Add-on / Supplementary Card
                </button>
              </div>

              {newIsAddon && (
                <div style={{ padding: '12px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 10, border: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LINK TO PRIMARY CREDIT CARD *
                    </label>
                    <select
                      value={newPrimaryCardId}
                      onChange={e => {
                        setNewPrimaryCardId(e.target.value);
                        const parent = cards.find(c => c.id === e.target.value);
                        if (parent) setNewCardLimit(String(parent.limit));
                      }}
                      className="modal-select"
                      required
                    >
                      {cards.filter(c => !c.isAddon).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.bank} •••• {c.last4}) — Limit: {currencyService.format(c.limit)}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: '#10B981', marginTop: 4, display: 'block' }}>
                      ✓ Add-on card shares the primary card's credit limit. Does NOT duplicate your total credit limit!
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      ADD-ON CARDHOLDER NAME (e.g. Spouse / Family Member)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sarah Connor"
                      value={newAddonHolderName}
                      onChange={e => setNewAddonHolderName(e.target.value)}
                      className="modal-input"
                    />
                  </div>
                </div>
              )}
              {/* Row 1: Card Name & Issuing Bank */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    CARD NAME
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Axis Magnus, HDFC Infinia"
                    value={newCardName}
                    onChange={e => setNewCardName(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ISSUING BANK
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Axis Bank, HDFC"
                    value={newCardBank}
                    onChange={e => setNewCardBank(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Card Network */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CARD NETWORK
                </label>
                <select
                  value={newCardNetwork}
                  onChange={e => setNewCardNetwork(e.target.value as any)}
                  className="modal-select"
                >
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="RuPay">RuPay</option>
                  <option value="Amex">American Express (Amex)</option>
                </select>
              </div>

              {/* Section 2: Numbers & Security */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      FULL 16-DIGIT CARD NUMBER <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--accent-indigo)', fontWeight: 600 }}>
                      Masked with eye toggle
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={19}
                    placeholder="e.g. 4532 8192 3847 4281 (or leave blank if just using last 4)"
                    value={newCardFullNumber}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                      setNewCardFullNumber(raw);
                      if (raw.length >= 4) {
                        setNewCardLast4(raw.slice(-4));
                      }
                    }}
                    className="modal-input"
                    style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}
                  />
                </div>

                {/* Last 4 Digits, Expiry (Clean MM & YY), and CVV */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 0.85fr)', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      LAST 4 DIGITS
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="4242"
                      value={newCardLast4}
                      onChange={e => setNewCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="modal-input"
                      style={{ fontFamily: 'monospace', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      EXPIRY (MM / YY)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        placeholder="MM"
                        value={newCardExpiryMonth}
                        onChange={e => setNewCardExpiryMonth(Number(e.target.value))}
                        className="modal-input"
                        style={{ textAlign: 'center', width: '100%', minWidth: 0, flex: 1, padding: '10px 4px' }}
                        required
                      />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>/</span>
                      <input
                        type="number"
                        min={24}
                        max={45}
                        placeholder="YY"
                        value={newCardExpiryYear}
                        onChange={e => setNewCardExpiryYear(Number(e.target.value))}
                        className="modal-input"
                        style={{ textAlign: 'center', width: '100%', minWidth: 0, flex: 1, padding: '10px 4px' }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      CVV <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Opt)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="358"
                      value={newCardCvv}
                      onChange={e => setNewCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="modal-input"
                      style={{ fontFamily: 'monospace', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Credit Limit & Billing Cycle */}
              <div style={{ display: 'grid', gridTemplateColumns: newIsAddon ? '1fr 1fr' : '1.2fr 1fr 1fr', gap: 12 }}>
                {!newIsAddon && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      CREDIT LIMIT ({currencyService.getActiveCurrencyCode()})
                    </label>
                    <input
                      type="number"
                      placeholder="250000"
                      value={newCardLimit}
                      onChange={e => setNewCardLimit(e.target.value)}
                      className="modal-input"
                      required={!newIsAddon}
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    BILLING DAY
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={newCardBillingDay}
                    onChange={e => setNewCardBillingDay(Number(e.target.value))}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    DUE DAY
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={newCardDueDay}
                    onChange={e => setNewCardDueDay(Number(e.target.value))}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Section 4: Card Color Theme */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  CHOOSE CARD GRADIENT
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {CARD_GRADIENTS.map((g, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewCardGradientIdx(idx)}
                      style={{
                        width: 46,
                        height: 30,
                        borderRadius: 8,
                        background: g.gradient,
                        border: newCardGradientIdx === idx ? '2px solid #FFF' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: newCardGradientIdx === idx ? '0 0 12px rgba(99,102,241,0.6)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFF'
                      }}
                      title={g.label}
                    >
                      {newCardGradientIdx === idx && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsAddCardOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Card Bill */}
      {isPayBillOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 440 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Record Bill Payment</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>For {payCardName} • Reduces card balance</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayBillOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePayBillSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    AMOUNT TO PAY ({currencyService.getActiveCurrencyCode()})
                  </label>
                  <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                    Calculator ready
                  </span>
                </div>

                {cardBalancesMap[payCardName]?.activeLoanEmis > 0 && (
                <div style={{ padding: '10px 12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Card Regular Spends:</span>
                    <span style={{ fontWeight: 600 }}>{currencyService.format(cardBalancesMap[payCardName]?.purchases || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6366F1' }}>
                    <span>Active Loan EMI ({cardBalancesMap[payCardName]?.linkedLoans?.[0]?.name || 'EMI'}):</span>
                    <span style={{ fontWeight: 600 }}>+{currencyService.format(cardBalancesMap[payCardName]?.activeLoanEmis || 0)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed rgba(99, 102, 241, 0.2)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Total Outstanding:</span>
                    <span style={{ color: '#EF4444' }}>{currencyService.format(cardBalancesMap[payCardName]?.netOutstanding || 0)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#10B981', marginTop: 2 }}>
                    ✓ Paying this bill automatically marks the loan EMI as Paid with ZERO duplicate bank debit!
                  </div>
                </div>
              )}

              <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Enter payment amount (e.g. 8000 or 5000+3000)"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    onBlur={handlePayAmountBlur}
                    onKeyDown={handlePayAmountKeyDown}
                    className="modal-input"
                    required
                  />
                  {evaluatedPayAmount != null && (
                    <span
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#10B981',
                        background: 'rgba(16, 185, 129, 0.18)',
                        padding: '2px 7px',
                        borderRadius: 5,
                        pointerEvents: 'none'
                      }}
                    >
                      = {currencyService.getActiveCurrencyConfig().symbol}{evaluatedPayAmount}
                    </span>
                  )}
                </div>

                {/* Quick Add Buttons */}
                <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                  {[500, 1000, 2000, 5000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleQuickAddPay(amt)}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  PAID VIA
                </label>
                <select
                  value={payMode}
                  onChange={e => setPayMode(e.target.value)}
                  className="modal-select"
                >
                  <option value="upi">UPI / GPay / PhonePe</option>
                  <option value="netbanking">Net Banking / NEFT</option>
                  <option value="bank_transfer">Bank Auto-Debit</option>
                  <option value="debit">Debit Card</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsPayBillOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={paySaving}
                >
                  {paySaving ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Center Display Custom Confirmation for Card Deletion */}
      {cardToDelete && (
        <div className="modal-overlay" onClick={() => setCardToDelete(null)}>
          <div
            className="modal-container"
            style={{
              maxWidth: 440,
              width: '90vw',
              textAlign: 'center',
              padding: '28px 24px',
              borderRadius: 18,
              border: '1px solid rgba(239, 68, 68, 0.35)',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.12)'
            }}
            onClick={e => e.stopPropagation()}
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
              <AlertCircle size={30} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>
              Remove Credit Card?
            </h3>

            <div
              style={{
                background: cardToDelete.gradient,
                borderRadius: 12,
                padding: '12px 16px',
                color: '#FFFFFF',
                margin: '14px 0',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{cardToDelete.name}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{cardToDelete.bank} • •••• {cardToDelete.last4}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{currencyService.format(cardToDelete.limit)}</div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 22px', lineHeight: 1.5 }}>
              Are you sure you want to remove <strong>{cardToDelete.name}</strong>?
              Past transactions linked to this card will remain safely recorded in your ledger.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '10px 18px', borderRadius: 10 }}
                onClick={() => setCardToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
                }}
                onClick={() => {
                  confirmDeleteCard(cardToDelete.id, cardToDelete.name);
                  setCardToDelete(null);
                }}
              >
                <Trash2 size={15} />
                <span>Yes, Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Limit Exceeded & Request Access Modal */}
      {isCardLimitModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1100
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 16,
              padding: 28,
              maxWidth: 460,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <CreditCard size={26} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              Credit Card Limit Reached
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              Your account ({user?.subscriptionTier || 'FREE'} Tier) is limited to <strong>{cardLimit} credit cards</strong>. You currently have {cards.length} active cards. To add more cards, request an upgrade to {user?.subscriptionTier === 'FREE' ? 'PRO Plan (5 Cards)' : 'ENTERPRISE Plan (Unlimited Cards)'}.
            </p>

            {limitRequestSuccess ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10B981',
                    padding: '12px 14px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 1.5
                  }}
                >
                  <div>✓ Upgrade request has been sent, approval is pending</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Your subscription upgrade request is pending administrator review. You will receive an in-app and email notification once approved.
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 10,
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'not-allowed',
                    marginBottom: 6
                  }}
                >
                  Pending Administrator Approval
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={requestingLimit}
                onClick={async () => {
                  setRequestingLimit(true);
                  try {
                    const targetTier = user?.subscriptionTier === 'FREE' ? 'PRO' : 'ENTERPRISE';
                    await api.post('/access-requests', {
                      requestType: `PLAN_UPGRADE_${targetTier}`,
                      details: `User on ${user?.subscriptionTier || 'FREE'} requesting upgrade to ${targetTier} for card capacity increase (Current cards: ${cards.length}/${cardLimit})`
                    });
                    setLimitRequestSuccess(true);
                    localStorage.setItem(`fintrack_pending_cc_limit_${user?.email}`, 'true');
                  } catch {
                    alert('Could not submit upgrade request. Please try again.');
                  } finally {
                    setRequestingLimit(false);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 10,
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)'
                }}
              >
                {requestingLimit ? 'Submitting Upgrade Request...' : `Request Upgrade to ${user?.subscriptionTier === 'FREE' ? 'PRO Plan' : 'ENTERPRISE Plan'}`}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCardLimitModalOpen(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>

  );
};
