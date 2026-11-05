import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { currencyService } from '../services/currencyService';
import { cardService, type CardModel } from '../services/cardService';
import { loanService, type LoanModel, calculateLoanEMIs, generateEmiSchedule } from '../services/loanService';
import { isBillPaymentTx } from './CreditCardsView';
import { yearService } from '../services/yearService';
import { getUserStorageKey } from '../services/storageHelper';

interface CalendarViewProps {
  onOpenNewTransaction?: (category?: string, subcategory?: string, type?: 'income' | 'expense' | 'savings') => void;
  onNavigateToLoan?: (loanId: string) => void;
}

interface DueItem {
  id: string;
  type: 'card' | 'loan';
  loanId?: string;
  cardId?: string;
  name: string;
  subtext: string;
  amount: number;
  dueDay: number;
  dueDate: string; // YYYY-MM-DD
  isOverdue: boolean;
  isDueToday: boolean;
  isUpcoming: boolean;
  isPaid: boolean;
}

export interface PlannedItem {
  id: string;
  name: string;
  amount: number;
  day: number;
  dateStr: string;
  type: 'income' | 'expense' | 'savings';
  category: string;
  paymentMode?: string;
  subcategory?: string;
}

export interface PrecomputedLoanSchedule {
  loan: LoanModel;
  dueDay: number;
  scheduleMap: Map<string, { emiAmount: number; index: number; status: string }>;
}

export interface MonthData {
  transactions: any[];
  income: number;
  expense: number;
  savings: number;
  expectedIncome: number;
  expectedExpense: number;
  expectedSavings: number;
  plannedItems: PlannedItem[];
  activeDaysCount: number;
  duesMap: Record<number, DueItem[]>;
  duesTotal: number;
  itemCount: number;
}

export const EMPTY_MONTH_DATA: MonthData = {
  transactions: [],
  income: 0,
  expense: 0,
  savings: 0,
  expectedIncome: 0,
  expectedExpense: 0,
  expectedSavings: 0,
  plannedItems: [],
  activeDaysCount: 0,
  duesMap: {},
  duesTotal: 0,
  itemCount: 0
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Formats a currency amount into compact Indian format (Lakhs, Crores, Thousands)
 * Examples:
 *   1,00,000 -> "₹1L"
 *   1,50,000 -> "₹1.5L"
 *   1,53,400 -> "₹1.53L"
 *   4,35,000 -> "₹4.35L"
 *   18,02,525 -> "₹18.03L"
 *   1,00,00,000 -> "₹1Cr"
 *   16,000 -> "₹16k"
 *   28,320 -> "₹28.3k"
 *   9,436 -> "₹9,436"
 */
export const formatCompactIndian = (num: number): string => {
  const abs = Math.abs(num);
  if (abs >= 10000000) {
    const cr = abs / 10000000;
    const formatted = parseFloat(cr.toFixed(2));
    return `₹${formatted}Cr`;
  }
  if (abs >= 100000) {
    const lk = abs / 100000;
    const formatted = parseFloat(lk.toFixed(2));
    return `₹${formatted}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const formatted = parseFloat(k.toFixed(1));
    return `₹${formatted}k`;
  }
  return `₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const formatYmd = (y: number, m: number, d: number) => {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
};

const dateToYmd = (d: Date) => formatYmd(d.getFullYear(), d.getMonth(), d.getDate());

// Load planned/expected budget transactions from localStorage
const getPlannedTransactionsForMonth = (
  year: number,
  monthIdx: number,
  userEmail?: string,
  categoriesList: any[] = [],
  subcategoriesList: any[] = []
): PlannedItem[] => {
  const items: PlannedItem[] = [];
  try {
    const key = getUserStorageKey(`fintrack-budget-transactions-${year}`, userEmail);
    const stored = localStorage.getItem(key) || localStorage.getItem(`fintrack-budget-transactions-${year}`);
    if (stored) {
      const bMap: Record<string, any[]> = JSON.parse(stored);

      const defaultCategoryMap: Record<string, { type: 'income' | 'savings' | 'expense'; name: string }> = {
        'salary': { type: 'income', name: 'Salary' },
        'bonus & incentives': { type: 'income', name: 'Bonus & Incentives' },
        'bonus': { type: 'income', name: 'Bonus & Incentives' },
        'other income': { type: 'income', name: 'Other Income' },
        'investments': { type: 'savings', name: 'Investments' },
        'emergency fund': { type: 'savings', name: 'Emergency Fund' },
        'mutual funds': { type: 'savings', name: 'Mutual Funds' },
        'housing & rent': { type: 'expense', name: 'Housing & Rent' },
        'food & groceries': { type: 'expense', name: 'Food & Groceries' },
        'utilities & internet': { type: 'expense', name: 'Utilities & Internet' },
        'dining & entertainment': { type: 'expense', name: 'Dining & Entertainment' },
        'shopping & travel': { type: 'expense', name: 'Shopping & Travel' },
        'health & insurance': { type: 'expense', name: 'Health & Insurance' },
      };

      // Build robust lookup map from categories & subcategories & cached lookup
      const subcatLookup = new Map<string, { type: 'income' | 'savings' | 'expense'; categoryName: string; subcategoryName: string }>();

      // 1. Read cached sections lookup from localStorage if available
      try {
        const cachedLookupStr = localStorage.getItem('fintrack_category_sections_lookup');
        if (cachedLookupStr) {
          const cachedMap = JSON.parse(cachedLookupStr);
          Object.entries(cachedMap).forEach(([k, v]: [string, any]) => {
            if (v && v.type) {
              subcatLookup.set(k.toLowerCase().trim(), {
                type: v.type,
                categoryName: v.categoryName || 'General',
                subcategoryName: v.subcategoryName || 'General'
              });
              subcatLookup.set(k, {
                type: v.type,
                categoryName: v.categoryName || 'General',
                subcategoryName: v.subcategoryName || 'General'
              });
            }
          });
        }
      } catch {}

      const incomeKeywords = ['income', 'salary', 'bonus', 'wage', 'stipend', 'revenue', 'freelance', 'interest'];
      const savingsKeywords = ['saving', 'invest', 'sip', 'deposit', 'mutual', 'fund', 'emergency'];

      // 2. Map subcategories from API
      subcategoriesList.forEach((sub: any) => {
        const parent = categoriesList.find((c: any) => 
          String(c.id) === String(sub.categoryId || sub.category_id || '') ||
          (c.name && sub.categoryName && String(c.name).toLowerCase() === String(sub.categoryName).toLowerCase())
        );
        const parentType = (parent?.type || '').toLowerCase();
        const parentNameLow = (parent?.name || '').toLowerCase();
        let type: 'income' | 'savings' | 'expense' = 'expense';
        if (parentType === 'income' || defaultCategoryMap[parentNameLow]?.type === 'income' || incomeKeywords.some(k => parentNameLow.includes(k))) {
          type = 'income';
        } else if (parentType === 'savings' || defaultCategoryMap[parentNameLow]?.type === 'savings' || savingsKeywords.some(k => parentNameLow.includes(k))) {
          type = 'savings';
        }
        const info = {
          type,
          categoryName: parent?.name || (type === 'income' ? 'Salary' : type === 'savings' ? 'Investments' : 'General'),
          subcategoryName: sub.name || 'General'
        };
        subcatLookup.set(String(sub.id), info);
        subcatLookup.set(`sub:${sub.id}`, info);
        subcatLookup.set(String(sub.name).toLowerCase().trim(), info);
      });

      // 3. Map categories from API
      categoriesList.forEach((cat: any) => {
        const catType = (cat.type || '').toLowerCase();
        const catNameLow = (cat.name || '').toLowerCase();
        let type: 'income' | 'savings' | 'expense' = 'expense';
        if (catType === 'income' || defaultCategoryMap[catNameLow]?.type === 'income' || incomeKeywords.some(k => catNameLow.includes(k))) {
          type = 'income';
        } else if (catType === 'savings' || defaultCategoryMap[catNameLow]?.type === 'savings' || savingsKeywords.some(k => catNameLow.includes(k))) {
          type = 'savings';
        }
        const info = {
          type,
          categoryName: cat.name,
          subcategoryName: cat.name
        };
        subcatLookup.set(String(cat.id), info);
        subcatLookup.set(String(cat.name).toLowerCase().trim(), info);
        subcatLookup.set(`income:${cat.name}`.toLowerCase().trim(), { type: 'income', categoryName: cat.name, subcategoryName: cat.name });
        subcatLookup.set(`expense:${cat.name}`.toLowerCase().trim(), { type: 'expense', categoryName: cat.name, subcategoryName: cat.name });
        subcatLookup.set(`savings:${cat.name}`.toLowerCase().trim(), { type: 'savings', categoryName: cat.name, subcategoryName: cat.name });
      });

      Object.entries(bMap).forEach(([catKey, txList]) => {
        if (!Array.isArray(txList)) return;
        const lowKey = catKey.toLowerCase().trim();
        
        let itemType: 'income' | 'expense' | 'savings' = 'expense';
        let categoryName = 'General';

        const mapped = subcatLookup.get(catKey) || 
                       (catKey.startsWith('sub:') ? subcatLookup.get(catKey.slice(4)) : undefined) ||
                       subcatLookup.get(lowKey);
        if (mapped) {
          itemType = mapped.type;
          categoryName = mapped.categoryName;
        } else if (
          lowKey.startsWith('income') ||
          incomeKeywords.some(k => lowKey.includes(k)) ||
          defaultCategoryMap[lowKey]?.type === 'income'
        ) {
          itemType = 'income';
          categoryName = 'Salary & Income';
        } else if (
          lowKey.startsWith('saving') ||
          savingsKeywords.some(k => lowKey.includes(k)) ||
          defaultCategoryMap[lowKey]?.type === 'savings'
        ) {
          itemType = 'savings';
          categoryName = 'Savings & Investments';
        } else {
          categoryName = catKey.split(':').pop() || 'Expense';
        }

        txList.forEach(t => {
          const amt = Number(t.values?.[monthIdx]) || 0;
          if (amt <= 0) return;

          let txType: 'income' | 'expense' | 'savings' = itemType;

          // Check if subcategory / name maps directly
          const tNameLow = String(t.name || '').toLowerCase().trim();
          const tSubLow = String(t.subcategory || '').toLowerCase().trim();
          const tCatLow = String(t.category || '').toLowerCase().trim();
          const tTypeLow = String(t.type || '').toLowerCase().trim();

          const subMapped = (tSubLow && subcatLookup.get(tSubLow)) || (tNameLow && subcatLookup.get(tNameLow));
          if (subMapped) {
            txType = subMapped.type;
            if (categoryName === 'General' || categoryName === 'Expense' || /^\d+$/.test(categoryName)) {
              categoryName = subMapped.categoryName;
            }
          } else if (mapped) {
            txType = mapped.type;
          } else {
            if (tTypeLow === 'income' || tCatLow.includes('salary') || tCatLow.includes('income') || incomeKeywords.some(k => tNameLow.includes(k))) {
              txType = 'income';
              if (categoryName === 'General' || categoryName === 'Expense' || /^\d+$/.test(categoryName)) categoryName = 'Salary';
            } else if (tTypeLow === 'savings' || tCatLow.includes('saving') || tCatLow.includes('invest') || savingsKeywords.some(k => tNameLow.includes(k))) {
              txType = 'savings';
              if (categoryName === 'General' || categoryName === 'Expense' || /^\d+$/.test(categoryName)) categoryName = 'Savings & Investments';
            } else if (tTypeLow === 'expense') {
              txType = 'expense';
            }
          }

          let day = 1;
          if (t.monthPaymentModes?.[monthIdx] && String(t.monthPaymentModes[monthIdx]).trim() !== '') {
            day = Number(t.monthPaymentModes[monthIdx]);
          } else if (t.paymentMode && String(t.paymentMode).trim() !== '') {
            day = Number(t.paymentMode);
          } else if (t.date) {
            day = Number(String(t.date).slice(8, 10));
          }
          if (isNaN(day) || day < 1 || day > 31) day = 1;

          // Ensure finalCat is never numeric or 'sub:...'
          let finalCat = t.category;
          if (!finalCat || finalCat.startsWith('sub:') || /^\d+$/.test(finalCat)) {
            finalCat = categoryName;
          }
          if (!finalCat || /^\d+$/.test(finalCat) || finalCat === 'Expense' || finalCat === 'General') {
            finalCat = txType === 'income' ? 'Salary' : txType === 'savings' ? 'Investments' : 'General';
          }

          items.push({
            id: t.id || `plan-${catKey}-${day}`,
            name: t.name || finalCat,
            amount: amt,
            day,
            dateStr: formatYmd(year, monthIdx, day),
            type: txType,
            category: finalCat,
            subcategory: t.subcategory || (subMapped ? subMapped.subcategoryName : (mapped ? mapped.subcategoryName : undefined)),
            paymentMode: t.paymentMode || 'Bank Transfer'
          });
        });
      });
    }
  } catch {}
  return items;
};

// Reusable function to compute dues for any given month & year
const computeDuesForMonth = (
  year: number,
  month: number,
  cardsList: CardModel[],
  loanSchedules: PrecomputedLoanSchedule[],
  transactionsList: any[],
  todayY: number,
  todayM: number,
  todayD: number
): Record<number, DueItem[]> => {
  const duesByDay: Record<number, DueItem[]> = {};

  const isViewingCurrentMonth = year === todayY && month === todayM;
  const isPastMonth = year < todayY || (year === todayY && month < todayM);
  const isFutureMonth = year > todayY || (year === todayY && month > todayM);

  // 1. Credit Cards dues (Strictly show on card's due date only if due > 0 and unpaid)
  cardsList.forEach(card => {
    if (!card.isActive) return;
    const dueDay = Number(card.dueDay) || 5;

    const cleanCardName = (card.name || '').toLowerCase().trim();
    const cleanBank = (card.bank || '').toLowerCase().trim();
    const cleanLast4 = card.last4 ? card.last4.trim() : '';

    const billPaymentInViewedMonth = transactionsList.find(t => {
      if (!t.date) return false;
      const tDate = String(t.date).slice(0, 10);
      const [y, m] = tDate.split('-').map(Number);
      if (y !== year || m !== (month + 1)) return false;
      if (!isBillPaymentTx(t)) return false;
      const tCard = String(t.card || '').toLowerCase().trim();
      const tDesc = String(t.description || '').toLowerCase().trim();
      const mode = String(t.paymentMode || '').toLowerCase().trim();
      return (
        (tCard && (tCard === cleanCardName || tCard.includes(cleanCardName) || cleanCardName.includes(tCard))) ||
        (cleanBank && (tCard.includes(cleanBank) || tDesc.includes(cleanBank) || mode.includes(cleanBank))) ||
        (cleanLast4 && (tCard.includes(cleanLast4) || tDesc.includes(cleanLast4))) ||
        tDesc.includes(cleanCardName) || mode.includes(cleanCardName)
      );
    });

    // If bill payment was already made for this month, do NOT display (user requested only pending due > 0)
    if (billPaymentInViewedMonth) {
      return;
    }

    let monthSpend = 0;
    let spendUpToMonth = 0;
    let paidUpToMonth = 0;
    let totalAllTimeSpends = 0;
    let totalAllTimePayments = 0;

    transactionsList.forEach(t => {
      if (!t.date) return;
      const tDate = String(t.date).slice(0, 10);
      const [y, m] = tDate.split('-').map(Number);

      const tCard = String(t.card || '').toLowerCase().trim();
      const tDesc = String(t.description || '').toLowerCase().trim();
      const mode = String(t.paymentMode || '').toLowerCase().trim();

      const isThisCard =
        (tCard && (tCard === cleanCardName || tCard.includes(cleanCardName) || cleanCardName.includes(tCard))) ||
        (cleanBank && (tCard.includes(cleanBank) || tDesc.includes(cleanBank) || mode.includes(cleanBank))) ||
        (cleanLast4 && (tCard.includes(cleanLast4) || tDesc.includes(cleanLast4))) ||
        tDesc.includes(cleanCardName) || mode.includes(cleanCardName);

      if (!isThisCard) return;

      const amt = Number(t.amount) || 0;
      const isPayment = isBillPaymentTx(t);

      if (isPayment) {
        totalAllTimePayments += amt;
      } else if (t.type !== 'income') {
        totalAllTimeSpends += amt;
      }

      const txPeriodVal = y * 12 + (m - 1);
      const viewPeriodVal = year * 12 + month;

      if (y === year && m === (month + 1)) {
        if (!isPayment && t.type !== 'income') {
          monthSpend += amt;
        }
      }

      if (txPeriodVal <= viewPeriodVal) {
        if (isPayment) {
          paidUpToMonth += amt;
        } else if (t.type !== 'income') {
          spendUpToMonth += amt;
        }
      }
    });

    // Include any active linked loan EMIs on this credit card for this viewed month
    let linkedLoanEmisInMonth = 0;
    loanSchedules.forEach(({ loan, scheduleMap }) => {
      if (loan.repaymentSource !== 'credit_card') return;
      const matchesCard = loan.linkedCardId === card.id ||
        (loan.linkedCardName && loan.linkedCardName.toLowerCase().trim() === cleanCardName) ||
        (loan.lender && cleanCardName.includes(loan.lender.toLowerCase().trim()));
      if (matchesCard) {
        const item = scheduleMap.get(`${year}-${month}`);
        if (item && item.status !== 'paid' && item.emiAmount > 0) {
          linkedLoanEmisInMonth += item.emiAmount;
        }
      }
    });

    let cardDueAmount = 0;
    const historicalUnpaid = Math.max(0, spendUpToMonth - paidUpToMonth);

    if (isPastMonth) {
      const liveCurrentOutstanding = Math.max(0, totalAllTimeSpends - totalAllTimePayments);
      cardDueAmount = (liveCurrentOutstanding === 0 ? monthSpend : historicalUnpaid) + linkedLoanEmisInMonth;
    } else if (isViewingCurrentMonth) {
      const liveOutstanding = Math.max(0, totalAllTimeSpends - totalAllTimePayments);
      cardDueAmount = Math.max(0, liveOutstanding + linkedLoanEmisInMonth);
    } else {
      cardDueAmount = monthSpend + linkedLoanEmisInMonth;
    }

    // STRICT USER REQUIREMENT: Only display if credit card due > 0
    if (cardDueAmount <= 0) {
      return;
    }

    const isOverdue = isPastMonth || (isViewingCurrentMonth && dueDay < todayD);
    const isDueToday = isViewingCurrentMonth && dueDay === todayD;
    const isUpcoming = isFutureMonth || (isViewingCurrentMonth && dueDay > todayD);

    const dueItem: DueItem = {
      id: `card-due-${card.id}-${year}-${month}`,
      type: 'card',
      cardId: card.id,
      name: card.name,
      subtext: `Credit Card Bill (•••• ${card.last4})`,
      amount: cardDueAmount,
      dueDay,
      dueDate: formatYmd(year, month, dueDay),
      isOverdue,
      isDueToday,
      isUpcoming,
      isPaid: false
    };

    if (!duesByDay[dueDay]) duesByDay[dueDay] = [];
    duesByDay[dueDay].push(dueItem);
  });

  // 2. Loans dues (Strictly EXCLUDE credit_card repayment loans & hide paid amounts)
  loanSchedules.forEach(({ loan, dueDay, scheduleMap }) => {
    const monthItem = scheduleMap.get(`${year}-${month}`);
    if (!monthItem) return;

    const isPaid = monthItem.status === 'paid';
    // STRICT USER REQUIREMENT: Only show the Due amount, and the Paid amount is not displayed!
    if (isPaid || monthItem.emiAmount <= 0) return;

    const isOverdue = isPastMonth || (isViewingCurrentMonth && dueDay < todayD);
    const isDueToday = isViewingCurrentMonth && dueDay === todayD;
    const isUpcoming = isFutureMonth || (isViewingCurrentMonth && dueDay > todayD);

    const dueItem: DueItem = {
      id: `loan-due-${loan.id}-${year}-${month}`,
      type: 'loan',
      loanId: loan.id,
      name: loan.name,
      subtext: `${loan.lender} • ${loan.type || 'Loan EMI'} (Inst #${monthItem.index})`,
      amount: monthItem.emiAmount,
      dueDay,
      dueDate: formatYmd(year, month, dueDay),
      isOverdue,
      isDueToday,
      isUpcoming,
      isPaid: false
    };

    if (!duesByDay[dueDay]) duesByDay[dueDay] = [];
    duesByDay[dueDay].push(dueItem);
  });

  return duesByDay;
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  onOpenNewTransaction,
  onNavigateToLoan
}) => {
  const { user } = useAuth();

  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  // Multi-year selection state (defaults to [currentYear])
  const [selectedYears, setSelectedYears] = useState<number[]>([todayYear]);
  const [isDraggingYears, setIsDraggingYears] = useState<boolean>(false);
  const [dragStartYear, setDragStartYear] = useState<number | null>(null);

  // Multi-month selection state (defaults to [currentMonth])
  const [selectedMonths, setSelectedMonths] = useState<number[]>([todayMonth]);
  const [isDraggingMonths, setIsDraggingMonths] = useState<boolean>(false);
  const [dragStartMonth, setDragStartMonth] = useState<number | null>(null);

  // Selected date and Date Range state (supports drag range selection across dates)
  const [selectedDateRange, setSelectedDateRange] = useState<{ start: Date; end: Date }>({ start: today, end: today });
  const [isDraggingDates, setIsDraggingDates] = useState<boolean>(false);
  const [dragStartDate, setDragStartDate] = useState<Date | null>(null);

  // Expected amounts display toggle (persisted in localStorage)
  const [showExpectedAmounts, setShowExpectedAmounts] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fintrack_calendar_show_expected');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleShowExpectedAmounts = () => {
    setShowExpectedAmounts(prev => {
      const next = !prev;
      try {
        localStorage.setItem('fintrack_calendar_show_expected', String(next));
      } catch {}
      return next;
    });
  };

  // Top 4 Category Filters: Income, Expense, Savings, Credit Card & Loan EMI (all enabled by default)
  const [filterIncome, setFilterIncome] = useState<boolean>(true);
  const [filterExpense, setFilterExpense] = useState<boolean>(true);
  const [filterSavings, setFilterSavings] = useState<boolean>(true);
  const [filterDues, setFilterDues] = useState<boolean>(true);

  // Live state from backend & services
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cards, setCards] = useState<CardModel[]>([]);
  const [loans, setLoans] = useState<LoanModel[]>([]);
  const [apiCategories, setApiCategories] = useState<any[]>([]);
  const [apiSubcategories, setApiSubcategories] = useState<any[]>([]);
  const [budgetTxRefreshKey, setBudgetTxRefreshKey] = useState<number>(0);

  useEffect(() => {
    const onBudgetTxChanged = () => {
      setBudgetTxRefreshKey(k => k + 1);
    };
    window.addEventListener('fintrack-budget-transactions-changed', onBudgetTxChanged);
    return () => window.removeEventListener('fintrack-budget-transactions-changed', onBudgetTxChanged);
  }, []);

  // Available year list for selector
  const availableYears = useMemo(() => {
    const list: number[] = [];
    for (let y = todayYear - 2; y <= todayYear + 3; y++) {
      list.push(y);
    }
    return list;
  }, [todayYear]);

  // Fetch transactions and categories from backend
  const fetchMetadata = async () => {
    try {
      const [catsRes, subcatsRes] = await Promise.all([
        api.get('/categories').catch(() => ({ data: { data: [] } })),
        api.get('/subcategories').catch(() => ({ data: { data: [] } })),
      ]);
      if (catsRes.data?.success && Array.isArray(catsRes.data.data)) {
        setApiCategories(catsRes.data.data);
      }
      if (subcatsRes.data?.success && Array.isArray(subcatsRes.data.data)) {
        setApiSubcategories(subcatsRes.data.data);
      }
    } catch {}
  };

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      if (res.data?.success && Array.isArray(res.data.data)) {
        setTransactions(res.data.data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchTransactions();
    fetchMetadata();
    setCards(cardService.getCards(user?.email));
    setLoans(loanService.getLoans(user?.email));
  }, [user]);

  useEffect(() => {
    const handleCards = () => setCards(cardService.getCards(user?.email));
    const handleLoans = () => setLoans(loanService.getLoans(user?.email));
    const handleTx = () => fetchTransactions();
    const handleCats = () => fetchMetadata();
    window.addEventListener('fintrack-cards-updated', handleCards);
    window.addEventListener('fintrack-loans-changed', handleLoans);
    window.addEventListener('fintrack-transactions-changed', handleTx);
    window.addEventListener('fintrack-categories-changed', handleCats);
    window.addEventListener('fintrack-category-updated', handleCats);
    return () => {
      window.removeEventListener('fintrack-cards-updated', handleCards);
      window.removeEventListener('fintrack-loans-changed', handleLoans);
      window.removeEventListener('fintrack-transactions-changed', handleTx);
      window.removeEventListener('fintrack-categories-changed', handleCats);
      window.removeEventListener('fintrack-category-updated', handleCats);
    };
  }, [user?.email]);

  // Global mouseup release listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDraggingYears(false);
      setDragStartYear(null);
      setIsDraggingMonths(false);
      setDragStartMonth(null);
      setIsDraggingDates(false);
      setDragStartDate(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  // Total activities across selected years
  const totalYearEventsCount = useMemo(() => {
    return transactions.filter(t => {
      if (!t.date) return false;
      const y = Number(String(t.date).slice(0, 4));
      return selectedYears.includes(y);
    }).length;
  }, [transactions, selectedYears]);

  // Year drag & click handler
  const handleYearMouseDown = (yr: number, event?: React.MouseEvent) => {
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      setSelectedYears(prev => {
        if (prev.includes(yr)) {
          if (prev.length === 1) return prev;
          return prev.filter(item => item !== yr);
        }
        return [...prev, yr].sort((a, b) => a - b);
      });
      return;
    }
    setIsDraggingYears(true);
    setDragStartYear(yr);
    setSelectedYears([yr]);
    yearService.setSelectedYear(yr);
  };

  const handleYearMouseEnter = (yr: number) => {
    if (isDraggingYears && dragStartYear !== null) {
      const start = Math.min(dragStartYear, yr);
      const end = Math.max(dragStartYear, yr);
      const range: number[] = [];
      for (let y = start; y <= end; y++) {
        range.push(y);
      }
      setSelectedYears(range);
    }
  };

  // Month drag & click handler (multi-select supported)
  const handleMonthMouseDown = (mIdx: number, event?: React.MouseEvent) => {
    const primaryYear = selectedYears[0] || todayYear;

    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      setSelectedMonths(prev => {
        let next: number[];
        if (prev.includes(mIdx)) {
          if (prev.length === 1) return prev;
          next = prev.filter(m => m !== mIdx);
        } else {
          next = [...prev, mIdx].sort((a, b) => a - b);
        }
        const minM = Math.min(...next);
        const maxM = Math.max(...next);
        setSelectedDateRange({
          start: new Date(primaryYear, minM, 1),
          end: new Date(primaryYear, maxM + 1, 0)
        });
        return next;
      });
      return;
    }

    setIsDraggingMonths(true);
    setDragStartMonth(mIdx);
    setSelectedMonths([mIdx]);
    const newDate = new Date(primaryYear, mIdx, 1);
    setSelectedDateRange({ start: newDate, end: newDate });
  };

  const handleMonthMouseEnter = (mIdx: number) => {
    if (isDraggingMonths && dragStartMonth !== null) {
      const start = Math.min(dragStartMonth, mIdx);
      const end = Math.max(dragStartMonth, mIdx);
      const range: number[] = [];
      for (let m = start; m <= end; m++) {
        range.push(m);
      }
      setSelectedMonths(range);
      const primaryYear = selectedYears[0] || todayYear;
      setSelectedDateRange({
        start: new Date(primaryYear, start, 1),
        end: new Date(primaryYear, end + 1, 0)
      });
    }
  };

  // Date drag & click handler (supports dragging ranges across days)
  const handleDateMouseDown = (dateObj: Date, event?: React.MouseEvent) => {
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      const currentStart = selectedDateRange.start;
      const s = currentStart <= dateObj ? currentStart : dateObj;
      const e = currentStart <= dateObj ? dateObj : currentStart;
      setSelectedDateRange({ start: s, end: e });
      return;
    }
    setIsDraggingDates(true);
    setDragStartDate(dateObj);
    setSelectedDateRange({ start: dateObj, end: dateObj });
  };

  const handleDateMouseEnter = (dateObj: Date) => {
    if (isDraggingDates && dragStartDate !== null) {
      const s = dragStartDate <= dateObj ? dragStartDate : dateObj;
      const e = dragStartDate <= dateObj ? dateObj : dragStartDate;
      setSelectedDateRange({ start: s, end: e });
    }
  };

  // Precomputed Loan EMI schedules for zero-overhead dues calculation
  const precomputedLoanSchedules = useMemo<PrecomputedLoanSchedule[]>(() => {
    return loans
      .filter(loan => loan.status !== 'closed' && loan.repaymentSource !== 'credit_card')
      .map(loan => {
        const dueDay = Number(loan.dueDay) || 5;
        const metrics = calculateLoanEMIs(loan);
        const schedule = generateEmiSchedule(loan, metrics);
        const scheduleMap = new Map<string, { emiAmount: number; index: number; status: string }>();
        schedule.forEach(s => {
          scheduleMap.set(`${s.year}-${s.month}`, {
            emiAmount: s.emiAmount,
            index: s.index,
            status: s.status
          });
        });
        return { loan, dueDay, scheduleMap };
      });
  }, [loans]);

  // Cached planned/expected budget items for all selected years
  const plannedItemsCache = useMemo(() => {
    const cache = new Map<string, PlannedItem[]>();
    selectedYears.forEach(year => {
      for (let m = 0; m < 12; m++) {
        cache.set(
          `${year}-${m}`,
          getPlannedTransactionsForMonth(year, m, user?.email, apiCategories, apiSubcategories)
        );
      }
    });
    return cache;
  }, [selectedYears, user?.email, apiCategories, apiSubcategories, budgetTxRefreshKey]);

  // Cached dues for all months across selected years
  const duesByMonthCache = useMemo(() => {
    const cache = new Map<string, Record<number, DueItem[]>>();
    selectedYears.forEach(year => {
      for (let m = 0; m < 12; m++) {
        const dMap = computeDuesForMonth(
          year,
          m,
          cards,
          precomputedLoanSchedules,
          transactions,
          todayYear,
          todayMonth,
          todayDay
        );
        cache.set(`${year}-${m}`, dMap);
      }
    });
    return cache;
  }, [selectedYears, cards, precomputedLoanSchedules, transactions, todayYear, todayMonth, todayDay]);

  // Memoized month metrics & summaries map for instant (0ms) filter reactions
  const monthDataMap = useMemo(() => {
    const map = new Map<string, MonthData>();
    selectedYears.forEach(year => {
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const key = `${year}-${mIdx}`;
        const monthTxs = transactions.filter(t => {
          if (!t.date) return false;
          const tDate = String(t.date).slice(0, 10);
          const [y, m] = tDate.split('-').map(Number);
          return y === year && m === (mIdx + 1);
        });

        let income = 0;
        let expense = 0;
        let savings = 0;
        const activeDaysSet = new Set<number>();

        monthTxs.forEach(t => {
          const amt = Number(t.amount) || 0;
          const type = (t.type || 'expense').toLowerCase();
          const cat = String(t.category || '').toLowerCase();
          const isInvest = cat.includes('invest') || cat.includes('saving') || cat.includes('sip') || cat.includes('mutual');

          const d = Number(String(t.date).slice(0, 10).split('-')[2]);
          if (d) activeDaysSet.add(d);

          if (type === 'income') income += amt;
          else if (type === 'savings' || isInvest) savings += amt;
          else expense += amt;
        });

        const duesMap = duesByMonthCache.get(key) || {};
        const duesTotal = Object.values(duesMap).reduce((acc, list) => {
          return acc + list.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        }, 0);

        const plannedItems = plannedItemsCache.get(key) || [];
        const plannedIncomeTotal = plannedItems
          .filter(p => p.type === 'income')
          .reduce((sum, p) => sum + p.amount, 0);
        const plannedExpenseTotal = plannedItems
          .filter(p => p.type === 'expense')
          .reduce((sum, p) => sum + p.amount, 0);
        const plannedSavingsTotal = plannedItems
          .filter(p => p.type === 'savings')
          .reduce((sum, p) => sum + p.amount, 0);

        const expectedIncome = income > 0 ? (income + plannedIncomeTotal) : plannedIncomeTotal;
        const expectedExpense = expense + duesTotal + plannedExpenseTotal;
        const expectedSavings = savings + plannedSavingsTotal;

        const totalScheduledActivities = monthTxs.length + Object.values(duesMap).reduce((acc, list) => acc + list.length, 0) + (showExpectedAmounts ? plannedItems.length : 0);

        map.set(key, {
          transactions: monthTxs,
          income,
          expense,
          savings,
          expectedIncome,
          expectedExpense,
          expectedSavings,
          plannedItems,
          activeDaysCount: activeDaysSet.size,
          duesMap,
          duesTotal,
          itemCount: totalScheduledActivities
        });
      }
    });
    return map;
  }, [selectedYears, transactions, duesByMonthCache, plannedItemsCache, showExpectedAmounts]);

  // Helper: Get cached transactions, metrics, and dues for a specific month & year
  const getMonthData = (year: number, monthIdx: number): MonthData => {
    return monthDataMap.get(`${year}-${monthIdx}`) || EMPTY_MONTH_DATA;
  };

  // Month navigation in Panel 3
  const handlePrevMonth = () => {
    setSelectedMonths(prev => {
      const current = prev[0] ?? todayMonth;
      const nextMonth = current === 0 ? 11 : current - 1;
      if (current === 0) {
        setSelectedYears(yPrev => {
          const y = yPrev[0] ?? todayYear;
          return [y - 1];
        });
      }
      const primaryYear = current === 0 ? (selectedYears[0] ?? todayYear) - 1 : (selectedYears[0] ?? todayYear);
      setSelectedDateRange({
        start: new Date(primaryYear, nextMonth, 1),
        end: new Date(primaryYear, nextMonth, 1)
      });
      return [nextMonth];
    });
  };

  const handleNextMonth = () => {
    setSelectedMonths(prev => {
      const current = prev[0] ?? todayMonth;
      const nextMonth = current === 11 ? 0 : current + 1;
      if (current === 11) {
        setSelectedYears(yPrev => {
          const y = yPrev[0] ?? todayYear;
          return [y + 1];
        });
      }
      const primaryYear = current === 11 ? (selectedYears[0] ?? todayYear) + 1 : (selectedYears[0] ?? todayYear);
      setSelectedDateRange({
        start: new Date(primaryYear, nextMonth, 1),
        end: new Date(primaryYear, nextMonth, 1)
      });
      return [nextMonth];
    });
  };

  // Day navigation in Panel 4 (navigate day by day within the month)
  const handlePrevDay = () => {
    setSelectedDateRange(prev => {
      const current = new Date(prev.start);
      const year = current.getFullYear();
      const month = current.getMonth();
      const day = current.getDate();
      const prevDate = day > 1 ? new Date(year, month, day - 1) : new Date(year, month, 1);
      return { start: prevDate, end: prevDate };
    });
  };

  const handleNextDay = () => {
    setSelectedDateRange(prev => {
      const current = new Date(prev.start);
      const year = current.getFullYear();
      const month = current.getMonth();
      const day = current.getDate();
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const nextDate = day < lastDayOfMonth ? new Date(year, month, day + 1) : new Date(year, month, lastDayOfMonth);
      return { start: nextDate, end: nextDate };
    });
  };

  // Selected Date Range details for Panel 4 Ledger
  const rangeStartStr = dateToYmd(selectedDateRange.start);
  const rangeEndStr = dateToYmd(selectedDateRange.end);
  const isSingleDateSelected = rangeStartStr === rangeEndStr;

  const singleDateFullMonthDay = useMemo(() => {
    const d = selectedDateRange.start;
    return `${MONTH_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDateRange.start]);

  const singleDateWeekday = useMemo(() => {
    return selectedDateRange.start.toLocaleDateString('en-US', { weekday: 'long' });
  }, [selectedDateRange.start]);

  const rangeStartLabel = useMemo(() => {
    const d = selectedDateRange.start;
    return `${MONTH_SHORT_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDateRange.start]);

  const rangeEndLabel = useMemo(() => {
    const d = selectedDateRange.end;
    return `${MONTH_SHORT_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDateRange.end]);

  const selectedDaysCount = useMemo(() => {
    const diff = Math.round((selectedDateRange.end.getTime() - selectedDateRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [selectedDateRange]);

  // Actual transactions strictly in the selected date range
  const rangeTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.date) return false;
      const tDate = String(t.date).slice(0, 10);
      return tDate >= rangeStartStr && tDate <= rangeEndStr;
    });
  }, [transactions, rangeStartStr, rangeEndStr]);

  // Dues strictly in the selected date range (retrieved instantly from cache)
  const rangeDues = useMemo(() => {
    const list: DueItem[] = [];
    selectedYears.forEach(year => {
      selectedMonths.forEach(mIdx => {
        const dMap = duesByMonthCache.get(`${year}-${mIdx}`) || {};
        Object.entries(dMap).forEach(([dStr, dueItems]) => {
          const day = Number(dStr);
          const dueYmd = formatYmd(year, mIdx, day);
          if (dueYmd >= rangeStartStr && dueYmd <= rangeEndStr) {
            list.push(...dueItems);
          }
        });
      });
    });
    return list;
  }, [selectedYears, selectedMonths, duesByMonthCache, rangeStartStr, rangeEndStr]);

  // Planned items from budget strictly in the selected date range (retrieved instantly from cache)
  const rangePlannedItems = useMemo(() => {
    const list: PlannedItem[] = [];
    selectedYears.forEach(year => {
      selectedMonths.forEach(mIdx => {
        const pItems = plannedItemsCache.get(`${year}-${mIdx}`) || [];
        pItems.forEach(p => {
          if (p.dateStr >= rangeStartStr && p.dateStr <= rangeEndStr) {
            list.push(p);
          }
        });
      });
    });
    return list;
  }, [selectedYears, selectedMonths, plannedItemsCache, rangeStartStr, rangeEndStr]);

  // Actual income, expense, and dues in selected range
  // Filtered lists based on top 4 filter pills
  const filteredRangeTransactions = useMemo(() => {
    return rangeTransactions.filter(t => {
      const type = (t.type || 'expense').toLowerCase();
      const cat = String(t.category || '').toLowerCase();
      const isSav = type === 'savings' || cat.includes('invest') || cat.includes('saving');
      if (type === 'income') return filterIncome;
      if (isSav) return filterSavings;
      return filterExpense;
    });
  }, [rangeTransactions, filterIncome, filterExpense, filterSavings]);

  const filteredRangeDues = useMemo(() => {
    if (!filterDues) return [];
    return rangeDues.filter(due => !due.isPaid && due.amount > 0);
  }, [rangeDues, filterDues]);

  const filteredRangePlannedItems = useMemo(() => {
    if (!showExpectedAmounts) return [];
    return rangePlannedItems.filter(p => {
      if (p.type === 'income') return filterIncome;
      if (p.type === 'savings') return filterSavings;
      return filterExpense;
    });
  }, [showExpectedAmounts, rangePlannedItems, filterIncome, filterExpense, filterSavings]);

  const rangeActualIncome = useMemo(() => {
    if (!filterIncome) return 0;
    return filteredRangeTransactions
      .filter(t => (t.type || '').toLowerCase() === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredRangeTransactions, filterIncome]);

  const rangeActualExpense = useMemo(() => {
    return filteredRangeTransactions
      .filter(t => (t.type || '').toLowerCase() !== 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [filteredRangeTransactions]);

  const rangeDuesTotal = useMemo(() => {
    return filteredRangeDues.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }, [filteredRangeDues]);

  const rangePaidDuesTotal = useMemo(() => {
    return filteredRangeDues.filter(d => d.isPaid).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }, [filteredRangeDues]);

  // Expected Inflow strictly for selected date(s)
  const rangeExpectedInflow = useMemo(() => {
    if (!filterIncome) return 0;
    if (rangeActualIncome > 0) return rangeActualIncome;
    return filteredRangePlannedItems
      .filter(p => p.type === 'income')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [rangeActualIncome, filteredRangePlannedItems, filterIncome]);

  // Expected Outflow strictly for selected date(s) (Savings added to outflow)
  const rangeExpectedOutflow = useMemo(() => {
    const plannedOutflow = filteredRangePlannedItems
      .filter(p => p.type !== 'income')
      .reduce((sum, p) => sum + p.amount, 0);
    return rangeActualExpense + rangeDuesTotal + (rangeActualExpense === 0 ? plannedOutflow : 0);
  }, [rangeActualExpense, rangeDuesTotal, filteredRangePlannedItems]);

  const totalRangeActivities = filteredRangeTransactions.length + filteredRangeDues.length + (showExpectedAmounts ? filteredRangePlannedItems.length : 0);

  return (
    <div
      className="fintrack-calendar-outer"
      style={{
        padding: '4px 10px 6px',
        color: '#E2E8F0',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: isDraggingYears || isDraggingMonths || isDraggingDates ? 'none' : 'auto',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100vw',
        height: 'calc(100vh - 90px)',
        maxHeight: 'calc(100vh - 90px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <style>{`
        .fintrack-calendar-grid-container {
          display: grid;
          grid-template-columns: 50px clamp(280px, 20.5vw, 305px) minmax(0, 1fr) clamp(295px, 22.5vw, 335px);
          gap: 10px;
          align-items: stretch;
          flex: 1;
          min-height: 0;
          height: 100%;
          max-height: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }

        @media (max-width: 1440px) {
          .fintrack-calendar-grid-container {
            grid-template-columns: 48px clamp(265px, 20vw, 290px) minmax(0, 1fr) clamp(285px, 22vw, 315px);
            gap: 8px;
          }
        }

        @media (max-width: 1024px) {
          .fintrack-calendar-outer {
            height: auto !important;
            max-height: none !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            padding: 8px 10px 90px 10px !important;
          }

          .fintrack-calendar-top-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
            margin-bottom: 12px !important;
          }

          .fintrack-calendar-top-filters {
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding-bottom: 4px !important;
            flex-wrap: nowrap !important;
            scrollbar-width: none;
          }
          .fintrack-calendar-top-filters::-webkit-scrollbar {
            display: none;
          }

          .fintrack-calendar-filter-pills {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            flex-shrink: 0 !important;
          }

          .fintrack-calendar-grid-container {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            gap: 14px !important;
          }

          /* PANEL 1: Mobile Horizontal Year Selection Bar */
          .fintrack-calendar-year-panel {
            flex-direction: row !important;
            align-items: center !important;
            justify-content: space-between !important;
            height: auto !important;
            width: 100% !important;
            padding: 8px 12px !important;
            border-radius: 12px !important;
            box-sizing: border-box !important;
            gap: 10px !important;
          }

          .fintrack-calendar-year-inner {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 10px !important;
            flex: 1 !important;
            min-width: 0 !important;
            width: auto !important;
          }

          .fintrack-calendar-year-title {
            font-size: 11px !important;
            margin-bottom: 0 !important;
            text-align: left !important;
            color: #94A3B8 !important;
            flex-shrink: 0 !important;
            font-weight: 800 !important;
            letter-spacing: 0.5px !important;
          }

          .fintrack-calendar-year-list {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            gap: 6px !important;
            width: auto !important;
            flex: 1 !important;
            padding: 2px 0 !important;
            scrollbar-width: none !important;
          }
          .fintrack-calendar-year-list::-webkit-scrollbar {
            display: none !important;
          }

          .fintrack-calendar-year-btn {
            width: auto !important;
            min-width: 58px !important;
            padding: 6px 12px !important;
            font-size: 12px !important;
            border-radius: 8px !important;
            flex-shrink: 0 !important;
          }

          .fintrack-calendar-year-events {
            border-top: none !important;
            border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
            padding-top: 0 !important;
            padding-left: 10px !important;
            width: auto !important;
            flex-shrink: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
          }

          /* PANEL 2: Mobile 3x4 Month Selection Grid */
          .fintrack-calendar-month-panel {
            height: auto !important;
            overflow: visible !important;
            padding: 12px 10px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .fintrack-calendar-month-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-template-rows: auto !important;
            gap: 8px !important;
            height: auto !important;
            overflow: visible !important;
          }

          .fintrack-calendar-month-card {
            min-height: 80px !important;
            height: auto !important;
            padding: 6px !important;
            border-radius: 10px !important;
          }

          /* PANEL 3: Mobile Date Selection Grid */
          .fintrack-calendar-dates-panel {
            height: auto !important;
            overflow: visible !important;
            padding: 12px 10px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .fintrack-calendar-dates-grid {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 3px !important;
            height: auto !important;
          }

          .fintrack-calendar-date-cell {
            min-height: 50px !important;
            padding: 3px 2px !important;
            border-radius: 6px !important;
          }

          /* Reduced font size for amount under each date on mobile view */
          .fintrack-date-amount {
            font-size: 7.2px !important;
            letter-spacing: -0.3px !important;
            line-height: 1.05 !important;
            font-weight: 700 !important;
          }

          .fintrack-date-cell-num {
            font-size: 9px !important;
            width: 16px !important;
            height: 16px !important;
          }

          .fintrack-indicator-dash {
            width: 10px !important;
            height: 2px !important;
          }

          .fintrack-calendar-month-summary {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 6px !important;
            margin-top: 10px !important;
            padding-top: 8px !important;
          }

          /* PANEL 4: Mobile Budget Details & Activities */
          .fintrack-calendar-day-panel {
            height: auto !important;
            overflow: visible !important;
            padding: 14px 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .fintrack-calendar-activities-list {
            max-height: 400px !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
        }

        @media (max-width: 480px) {
          .fintrack-calendar-month-grid {
            gap: 6px !important;
          }
          .fintrack-calendar-month-card {
            min-height: 72px !important;
            padding: 4px !important;
          }
          .fintrack-calendar-dates-grid {
            gap: 2px !important;
          }
          .fintrack-calendar-date-cell {
            min-height: 46px !important;
            padding: 2px 1.5px !important;
          }

          /* Extra compact font size on phone screen widths */
          .fintrack-date-amount {
            font-size: 6.5px !important;
            letter-spacing: -0.35px !important;
            line-height: 1 !important;
          }

          .fintrack-date-cell-num {
            font-size: 8.5px !important;
            width: 14px !important;
            height: 14px !important;
          }

          .fintrack-indicator-dash {
            width: 8px !important;
            height: 2px !important;
          }
        }

        @media (max-width: 360px) {
          .fintrack-date-amount {
            font-size: 6px !important;
            letter-spacing: -0.4px !important;
          }
        }
      `}</style>

      {/* TOP HEADER: Financial Calendar Title & Legend & Expected Toggle */}
      <div
        className="fintrack-calendar-top-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
            }}
          >
            <CalendarDays size={16} />
          </div>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 900, color: '#F8FAFC', margin: 0, letterSpacing: -0.3 }}>
              Financial calendar
            </h1>
            <p style={{ fontSize: 10.5, color: '#94A3B8', margin: '1px 0 0' }}>
              Year, month, date, and daily money activity in one view
            </p>
          </div>
        </div>

        {/* Interactive Filter Pills & Expected Amounts Toggle */}
        <div className="fintrack-calendar-top-filters" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="fintrack-calendar-filter-pills" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
            {/* 1. Income Filter */}
            <button
              type="button"
              onClick={() => setFilterIncome(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: filterIncome ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: filterIncome ? '1.5px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterIncome ? '#10B981' : '#64748B',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Click to toggle Income"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterIncome ? '#10B981' : '#64748B' }} />
              <span>Income</span>
            </button>

            {/* 2. Expense Filter */}
            <button
              type="button"
              onClick={() => setFilterExpense(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: filterExpense ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: filterExpense ? '1.5px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterExpense ? '#EF4444' : '#64748B',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Click to toggle Expense"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterExpense ? '#EF4444' : '#64748B' }} />
              <span>Expense</span>
            </button>

            {/* 3. Savings Filter */}
            <button
              type="button"
              onClick={() => setFilterSavings(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: filterSavings ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: filterSavings ? '1.5px solid rgba(139, 92, 246, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterSavings ? '#8B5CF6' : '#64748B',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Click to toggle Savings"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterSavings ? '#8B5CF6' : '#64748B' }} />
              <span>Savings</span>
            </button>

            {/* 4. Credit Card & Loan EMI Filter */}
            <button
              type="button"
              onClick={() => setFilterDues(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: filterDues ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: filterDues ? '1.5px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterDues ? '#F59E0B' : '#64748B',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Click to toggle Credit Card & Loan EMI"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterDues ? '#F59E0B' : '#64748B' }} />
              <span>Credit Card & Loan EMI</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleShowExpectedAmounts}
            style={{
              background: showExpectedAmounts ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: showExpectedAmounts ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: showExpectedAmounts ? '#10B981' : '#94A3B8',
              borderRadius: 20,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Toggle showing expected/budgeted amounts"
          >
            <Target size={13} style={{ color: showExpectedAmounts ? '#10B981' : '#64748B' }} />
            <span>Expected Amounts</span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                padding: '1px 5px',
                borderRadius: 4,
                background: showExpectedAmounts ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
                color: showExpectedAmounts ? '#064E3B' : '#94A3B8'
              }}
            >
              {showExpectedAmounts ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* 4-PANEL LAYOUT CONTAINER */}
      <div className="fintrack-calendar-grid-container">
        {/* ============================================================== */}
        {/* PANEL 1: YEAR SELECTOR (Horizontal on mobile, Vertical on desktop) */}
        {/* ============================================================== */}
        <div
          className="fintrack-calendar-year-panel"
          style={{
            background: '#0D1322',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '8px 4px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div className="fintrack-calendar-year-inner" style={{ width: '100%' }}>
            <div
              className="fintrack-calendar-year-title"
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 1,
                color: '#64748B',
                textAlign: 'center',
                marginBottom: 6,
                textTransform: 'uppercase'
              }}
            >
              YEAR
            </div>

            <div className="fintrack-calendar-year-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              {availableYears.map(yr => {
                const isSelected = selectedYears.includes(yr);
                return (
                  <button
                    key={yr}
                    type="button"
                    className="fintrack-calendar-year-btn"
                    onClick={(e) => handleYearMouseDown(yr, e)}
                    onMouseDown={(e) => handleYearMouseDown(yr, e)}
                    onMouseEnter={() => handleYearMouseEnter(yr)}
                    style={{
                      width: '100%',
                      padding: '4px 0',
                      borderRadius: 6,
                      border: isSelected ? '1.5px solid #3B82F6' : '1px solid transparent',
                      background: isSelected
                        ? 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#FFFFFF' : '#94A3B8',
                      fontSize: 10,
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3
                    }}
                  >
                    <span>{yr}</span>
                    {isSelected && (
                      <span
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          background: '#60A5FA'
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="fintrack-calendar-year-events"
            style={{
              textAlign: 'center',
              paddingTop: 6,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              width: '100%'
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 900, color: '#38BDF8' }}>
              {totalYearEventsCount}
            </div>
            <div style={{ fontSize: 7, fontWeight: 800, color: '#64748B', letterSpacing: 1 }}>
              EVENTS
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* PANEL 2: 12-MONTH CARDS GRID (Fixed Height, No Scrollbar)      */}
        {/* ============================================================== */}
        <div
          className="fintrack-calendar-month-panel"
          style={{
            background: '#0D1322',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '10px 8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}
        >
          {selectedYears.map(year => {
            const yearTxs = transactions.filter(t => t.date && String(t.date).startsWith(String(year)));

            return (
              <div key={year} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {/* Year Header & Multi-select Hint */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    flexShrink: 0
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 14, fontWeight: 900, color: '#F8FAFC', margin: 0 }}>
                      {year}
                    </h2>
                    <span style={{ fontSize: 9, color: '#64748B' }}>
                      Drag or Ctrl+Click to select months
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: '#94A3B8',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 7px',
                      borderRadius: 8
                    }}
                  >
                    {yearTxs.length} items
                  </span>
                </div>

                {/* 3x4 Grid of Mini Month Cards: fixed 4 rows, NO vertical scroll */}
                <div
                  className="fintrack-calendar-month-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(4, 1fr)',
                    gap: 5,
                    flex: 1,
                    minHeight: 0
                  }}
                >
                  {MONTH_SHORT_NAMES.map((mName, mIdx) => {
                    const isMonthSelected = selectedMonths.includes(mIdx);
                    const mData = getMonthData(year, mIdx);
                    const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
                    const firstDay = new Date(year, mIdx, 1).getDay();

                    return (
                      <div
                        key={mName}
                        className="fintrack-calendar-month-card"
                        onClick={(e) => handleMonthMouseDown(mIdx, e)}
                        onMouseDown={(e) => handleMonthMouseDown(mIdx, e)}
                        onMouseEnter={() => handleMonthMouseEnter(mIdx)}
                        style={{
                          background: isMonthSelected
                            ? 'linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(15, 23, 42, 0.95) 100%)'
                            : 'rgba(15, 23, 42, 0.65)',
                          borderRadius: 9,
                          border: isMonthSelected
                            ? '1.5px solid #3B82F6'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isMonthSelected ? '0 0 12px rgba(59, 130, 246, 0.25)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 0,
                          height: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                          boxSizing: 'border-box'
                        }}
                      >
                        {/* Mini Month Header: Month name + items count */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 2
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 800, color: isMonthSelected ? '#60A5FA' : '#F1F5F9' }}>
                            {mName}
                          </span>
                          <span style={{ fontSize: 8, color: '#64748B' }}>
                            {mData.itemCount > 0 ? `${mData.itemCount} items` : '0 items'}
                          </span>
                        </div>

                        {/* Mini Calendar Dots Matrix showing ALL days of the month */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                            gap: 1,
                            fontSize: 7,
                            color: '#475569',
                            textAlign: 'center',
                            margin: '1px 0 2px'
                          }}
                        >
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <span key={i} style={{ color: '#475569', fontWeight: 600 }}>{d}</span>
                          ))}

                          {Array.from({ length: firstDay }).map((_, i) => (
                            <span key={`empty-${i}`} />
                          ))}

                          {Array.from({ length: daysInMonth }).map((_, i) => {
                            const dayNum = i + 1;
                            const dayTxs = mData.transactions.filter(t => {
                              const d = Number(String(t.date || '').slice(0, 10).split('-')[2]);
                              return d === dayNum;
                            });
                            const hasTx = dayTxs.length > 0;
                            const txInc = dayTxs.some(t => (t.type || '').toLowerCase() === 'income');
                            const txSav = dayTxs.some(t => {
                              const type = (t.type || '').toLowerCase();
                              const cat = String(t.category || '').toLowerCase();
                              return type === 'savings' || cat.includes('invest') || cat.includes('saving');
                            });
                            const txExp = dayTxs.some(t => (t.type || '').toLowerCase() === 'expense');

                            const dayDues = mData.duesMap[dayNum] || [];
                            const hasDue = dayDues.length > 0;
                            const dueOverdue = dayDues.some(d => d.isOverdue);
                            const dueAllPaid = hasDue && dayDues.every(d => d.isPaid);

                            const dayPlans = mData.plannedItems.filter(p => p.day === dayNum);
                            const planInc = dayPlans.some(p => p.type === 'income');
                            const planSav = dayPlans.some(p => p.type === 'savings');
                            const planExp = dayPlans.some(p => p.type === 'expense');

                            let dotColor = '#334155';
                            let isBold = false;

                            // 1. Dues color takes highest priority
                            if (hasDue) {
                              isBold = true;
                              if (dueOverdue) dotColor = '#EF4444';
                              else if (dueAllPaid) dotColor = '#10B981';
                              else dotColor = '#F59E0B';
                            } else if (hasTx) {
                              isBold = true;
                              if (txInc) dotColor = '#10B981';
                              else if (txSav) dotColor = '#8B5CF6';
                              else if (txExp) dotColor = '#EF4444';
                            } else if (showExpectedAmounts && dayPlans.length > 0) {
                              isBold = true;
                              if (planInc) dotColor = '#10B981';
                              else if (planSav) dotColor = '#8B5CF6';
                              else if (planExp) dotColor = '#EF4444';
                            }

                            return (
                              <span
                                key={dayNum}
                                style={{
                                  display: 'inline-block',
                                  width: '100%',
                                  color: dotColor,
                                  fontWeight: isBold ? 800 : 400
                                }}
                              >
                                {dayNum}
                              </span>
                            );
                          })}
                        </div>

                        {/* Mini Month Footer Metrics in clean single row with compact Lakh formatting */}
                        <div
                          style={{
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                            paddingTop: 3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 8.5,
                            fontWeight: 800,
                            gap: 4
                          }}
                        >
                          <span
                            style={{ color: '#10B981', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={`Actual Income: +${currencyService.format(mData.income)}`}
                          >
                            +{formatCompactIndian(mData.income)}
                          </span>
                          <span
                            style={{ color: '#EF4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={`Actual Outflow: -${currencyService.format(mData.expense)}`}
                          >
                            -{formatCompactIndian(mData.expense)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ============================================================== */}
        {/* PANEL 3: CALENDAR DATES GRID (Calendar View Only)              */}
        {/* ============================================================== */}
        <div
          className="fintrack-calendar-dates-panel"
          style={{
            background: '#0D1322',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            overflowY: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box'
          }}
        >
          {selectedYears.map(year => {
            return selectedMonths.map(mIdx => {
              const monthName = MONTH_NAMES[mIdx];
              const mData = getMonthData(year, mIdx);
              const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
              const firstDayOfWeek = new Date(year, mIdx, 1).getDay();

              return (
                <div key={`${year}-${mIdx}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    {/* Month Header Navigation with Prev & Next buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10
                      }}
                    >
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#94A3B8',
                          borderRadius: 8,
                          width: 30,
                          height: 30,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Previous Month"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#F8FAFC', margin: 0 }}>
                          {monthName} {year}
                        </h2>
                        <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0' }}>
                          {mData.itemCount} scheduled activities
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#94A3B8',
                          borderRadius: 8,
                          width: 30,
                          height: 30,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Next Month"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Day of Week Headers */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                        gap: 6,
                        textAlign: 'center',
                        marginBottom: 6
                      }}
                    >
                      {WEEKDAY_NAMES.map(dayName => (
                        <div
                          key={dayName}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#64748B',
                            padding: '3px 0'
                          }}
                        >
                          {dayName}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Dates Grid with Strict Equal Column Widths */}
                    <div
                      className="fintrack-calendar-dates-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                        gridAutoRows: '1fr',
                        gap: 6,
                        flex: 1,
                        minHeight: 0
                      }}
                    >
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          style={{
                            height: '100%',
                            minHeight: 0,
                            minWidth: 0,
                            background: 'rgba(15, 23, 42, 0.2)',
                            borderRadius: 8
                          }}
                        />
                      ))}

                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateObj = new Date(year, mIdx, day);
                        const dateStr = formatYmd(year, mIdx, day);

                        const isToday = year === todayYear && mIdx === todayMonth && day === todayDay;

                        // Range selection status
                        const inDateRange = dateStr >= rangeStartStr && dateStr <= rangeEndStr;
                        const isRangeStart = dateStr === rangeStartStr;
                        const isRangeEnd = dateStr === rangeEndStr;

                        // Transactions on this day
                        const dayTxs = mData.transactions.filter(t => String(t.date || '').slice(0, 10) === dateStr);
                        const dayDuesList = mData.duesMap[day] || [];
                        const dayPlannedList = mData.plannedItems.filter(p => p.day === day);

                        let dActualInc = 0;
                        let dActualExp = 0;
                        let dActualSav = 0;

                        dayTxs.forEach(t => {
                          const amt = Number(t.amount) || 0;
                          const type = (t.type || 'expense').toLowerCase();
                          const cat = String(t.category || '').toLowerCase();
                          const isInvest = cat.includes('invest') || cat.includes('saving') || cat.includes('sip') || cat.includes('mutual');

                          if (type === 'income') dActualInc += amt;
                          else if (type === 'savings' || isInvest) dActualSav += amt;
                          else dActualExp += amt;
                        });

                        const dayUnpaidDuesList = dayDuesList.filter(d => !d.isPaid && (Number(d.amount) || 0) > 0);
                        const dayUnpaidDuesTotal = dayUnpaidDuesList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
                        const hasOverdueDues = dayUnpaidDuesList.some(d => d.isOverdue);

                        // Expected values on this day (strictly from planned transactions)
                        let dayExpIncome = dayPlannedList
                          .filter(p => p.type === 'income')
                          .reduce((s, p) => s + p.amount, 0);

                        let dayExpExpenseOnly = dayPlannedList
                          .filter(p => p.type === 'expense')
                          .reduce((s, p) => s + p.amount, 0);

                        let dayExpSavings = dayPlannedList
                          .filter(p => p.type === 'savings')
                          .reduce((s, p) => s + p.amount, 0);

                        return (
                          <div
                            key={day}
                            className="fintrack-calendar-date-cell"
                            onClick={(e) => handleDateMouseDown(dateObj, e)}
                            onMouseDown={(e) => handleDateMouseDown(dateObj, e)}
                            onMouseEnter={() => handleDateMouseEnter(dateObj)}
                            style={{
                              height: '100%',
                              minHeight: 0,
                              minWidth: 0,
                              overflow: 'hidden',
                              borderRadius: 10,
                              background: inDateRange
                                ? (isSingleDateSelected
                                    ? 'linear-gradient(135deg, #1E293B 0%, #1E3A8A 100%)'
                                    : 'linear-gradient(135deg, rgba(30, 58, 138, 0.45) 0%, rgba(37, 99, 235, 0.28) 100%)')
                                : 'rgba(15, 23, 42, 0.7)',
                              border: (isRangeStart || isRangeEnd)
                                ? '1.5px solid #3B82F6'
                                : inDateRange
                                  ? '1px solid rgba(96, 165, 250, 0.4)'
                                  : isToday
                                    ? '1px solid rgba(96, 165, 250, 0.5)'
                                    : '1px solid rgba(255, 255, 255, 0.05)',
                              padding: '4px 6px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              transition: 'all 0.15s ease',
                              boxShadow: inDateRange ? '0 3px 12px rgba(59, 130, 246, 0.25)' : 'none',
                              position: 'relative'
                            }}
                          >
                            {/* Top Row: Date Number & Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span
                                className="fintrack-date-cell-num"
                                style={{
                                  fontSize: 11,
                                  fontWeight: inDateRange || isToday ? 900 : 600,
                                  color: (isRangeStart || isRangeEnd) ? '#FFFFFF' : isToday ? '#60A5FA' : '#CBD5E1',
                                  width: 18,
                                  height: 18,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '50%',
                                  background: (isRangeStart || isRangeEnd) ? '#2563EB' : 'transparent'
                                }}
                              >
                                {day}
                              </span>

                              {filterDues && dayUnpaidDuesList.length > 0 && (
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    background: hasOverdueDues ? '#EF4444' : '#F59E0B'
                                  }}
                                  title={`${dayUnpaidDuesList.length} Due(s)`}
                                />
                              )}
                            </div>

                            {/* Middle: Horizontal Color Indicator Dash Pills Matching Figma & Filters */}
                            <div className="fintrack-date-indicators" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center', margin: '3px 0' }}>
                              {filterIncome && (dActualInc > 0 || (showExpectedAmounts && dayExpIncome > 0)) && (
                                <div className="fintrack-indicator-dash" style={{ width: 14, height: 3, borderRadius: 2, background: '#10B981', flexShrink: 0 }} title="Income" />
                              )}
                              {filterExpense && (dActualExp > 0 || (showExpectedAmounts && dayExpExpenseOnly > 0)) && (
                                <div className="fintrack-indicator-dash" style={{ width: 14, height: 3, borderRadius: 2, background: '#EF4444', flexShrink: 0 }} title="Expense" />
                              )}
                              {filterSavings && (dActualSav > 0 || (showExpectedAmounts && dayExpSavings > 0)) && (
                                <div className="fintrack-indicator-dash" style={{ width: 14, height: 3, borderRadius: 2, background: '#8B5CF6', flexShrink: 0 }} title="Savings" />
                              )}
                              {filterDues && dayUnpaidDuesList.length > 0 && (
                                <div
                                  className="fintrack-indicator-dash"
                                  style={{
                                    width: 14,
                                    height: 3,
                                    borderRadius: 2,
                                    background: hasOverdueDues ? '#EF4444' : '#F59E0B',
                                    flexShrink: 0
                                  }}
                                  title="Upcoming Loan / Card Due"
                                />
                              )}
                            </div>

                            {/* Bottom: Left = Actual in Color, Right = Expected in Gray (+/-) */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'space-between',
                                gap: 4,
                                width: '100%',
                                marginTop: 'auto'
                              }}
                            >
                              {/* Bottom-Left: ACTUAL amounts and Dues (Color-coded with compact Lakh format) */}
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textAlign: 'left'
                                }}
                              >
                                {/* Actual Income */}
                                {filterIncome && dActualInc > 0 && (
                                  <div
                                    className="fintrack-date-amount fintrack-actual-income"
                                    style={{
                                      fontSize: 8.5,
                                      fontWeight: 800,
                                      color: '#10B981',
                                      lineHeight: 1.1,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                    title={`Actual Income: +${currencyService.format(dActualInc)}`}
                                  >
                                    +{formatCompactIndian(dActualInc)}
                                  </div>
                                )}

                                {/* Actual Outflow (Expense + Savings combined as requested) */}
                                {((filterExpense && dActualExp > 0) || (filterSavings && dActualSav > 0)) && (
                                  <div
                                    className="fintrack-date-amount fintrack-actual-outflow"
                                    style={{
                                      fontSize: 8.5,
                                      fontWeight: 800,
                                      color: '#EF4444',
                                      lineHeight: 1.1,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                    title={`Actual Outflow: -${currencyService.format((filterExpense ? dActualExp : 0) + (filterSavings ? dActualSav : 0))}`}
                                  >
                                    -{formatCompactIndian((filterExpense ? dActualExp : 0) + (filterSavings ? dActualSav : 0))}
                                  </div>
                                )}

                                {/* Unpaid / Upcoming Dues (Strictly show only pending due > 0) */}
                                {filterDues && dayUnpaidDuesTotal > 0 && (
                                  <div
                                    className="fintrack-date-amount fintrack-actual-due"
                                    style={{
                                      fontSize: 8.5,
                                      fontWeight: 800,
                                      color: hasOverdueDues ? '#EF4444' : '#F59E0B',
                                      lineHeight: 1.1,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                    title={`Pending Due: -${currencyService.format(dayUnpaidDuesTotal)}`}
                                  >
                                    -{formatCompactIndian(dayUnpaidDuesTotal)}
                                  </div>
                                )}
                              </div>

                              {/* Bottom-Right: EXPECTED amounts (Gray with compact Lakh format) */}
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textAlign: 'right'
                                }}
                              >
                                {showExpectedAmounts && (
                                  <>
                                    {filterIncome && dayExpIncome > 0 && (
                                      <div
                                        className="fintrack-date-amount fintrack-expected-income"
                                        style={{
                                          fontSize: 8,
                                          fontWeight: 700,
                                          color: '#94A3B8',
                                          lineHeight: 1.1,
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }}
                                        title={`Expected Income: +${currencyService.format(dayExpIncome)}`}
                                      >
                                        +{formatCompactIndian(dayExpIncome)}
                                      </div>
                                    )}
                                    {((filterExpense && dayExpExpenseOnly > 0) || (filterSavings && dayExpSavings > 0)) && (
                                      <div
                                        className="fintrack-date-amount fintrack-expected-outflow"
                                        style={{
                                          fontSize: 8,
                                          fontWeight: 700,
                                          color: '#94A3B8',
                                          lineHeight: 1.1,
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }}
                                        title={`Expected Outflow: -${currencyService.format((filterExpense ? dayExpExpenseOnly : 0) + (filterSavings ? dayExpSavings : 0))}`}
                                      >
                                        -{formatCompactIndian((filterExpense ? dayExpExpenseOnly : 0) + (filterSavings ? dayExpSavings : 0))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel 3 Footer Summary Cards: Monthly Income, Monthly Outflow, Monthly Savings */}
                  <div
                    className="fintrack-calendar-month-summary"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      flexShrink: 0
                    }}
                  >
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        borderRadius: 8,
                        padding: '4px 8px'
                      }}
                    >
                      <div style={{ fontSize: 8.5, color: '#94A3B8', fontWeight: 600, marginBottom: 1 }}>
                        Monthly income
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: '#10B981' }}>
                        +{currencyService.format(showExpectedAmounts ? mData.expectedIncome : mData.income)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 8,
                        padding: '4px 8px'
                      }}
                    >
                      <div style={{ fontSize: 8.5, color: '#94A3B8', fontWeight: 600, marginBottom: 1 }}>
                        Monthly outflow
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: '#EF4444' }}>
                        -{currencyService.format(showExpectedAmounts ? mData.expectedExpense : mData.expense)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        borderRadius: 8,
                        padding: '4px 8px'
                      }}
                    >
                      <div style={{ fontSize: 8.5, color: '#94A3B8', fontWeight: 600, marginBottom: 1 }}>
                        Monthly savings
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: '#8B5CF6' }}>
                        +{currencyService.format(showExpectedAmounts ? (mData.expectedSavings || mData.savings) : mData.savings)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          })}
        </div>

        {/* ============================================================== */}
        {/* PANEL 4: DAY & DATE RANGE LEDGER (Live Details View)           */}
        {/* ============================================================== */}
        <div
          className="fintrack-calendar-day-panel"
          style={{
            background: '#0D1322',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Header: Date Details + Day Navigation Buttons (< and >) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 1,
                    color: '#38BDF8',
                    textTransform: 'uppercase'
                  }}
                >
                  {isSingleDateSelected ? singleDateWeekday : 'DATE RANGE SELECTION'}
                </span>
                <h3
                  style={{
                    fontSize: isSingleDateSelected ? 18 : 16,
                    fontWeight: 900,
                    color: '#F8FAFC',
                    margin: '2px 0 1px'
                  }}
                >
                  {isSingleDateSelected ? singleDateFullMonthDay : `${rangeStartLabel} – ${rangeEndLabel}`}
                </h3>
                <span style={{ fontSize: 10.5, color: '#94A3B8' }}>
                  {isSingleDateSelected
                    ? `${selectedDateRange.start.getFullYear()} • ${totalRangeActivities} activities`
                    : `${selectedDaysCount} days selected • ${totalRangeActivities} activities`}
                </span>
              </div>

              {/* Day Navigation Controls: < [Day Badge] > */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <button
                  type="button"
                  onClick={handlePrevDay}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#94A3B8',
                    borderRadius: 7,
                    width: 26,
                    height: 26,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Previous Day"
                >
                  <ChevronLeft size={14} />
                </button>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
                    borderRadius: 8,
                    padding: '3px 8px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    minWidth: 32
                  }}
                >
                  <div style={{ fontSize: 7.5, fontWeight: 800, color: '#BFDBFE', textTransform: 'uppercase' }}>
                    {isSingleDateSelected ? MONTH_SHORT_NAMES[selectedDateRange.start.getMonth()] : 'DAYS'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#FFFFFF' }}>
                    {isSingleDateSelected ? selectedDateRange.start.getDate() : `${selectedDaysCount}`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNextDay}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#94A3B8',
                    borderRadius: 7,
                    width: 26,
                    height: 26,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Next Day"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Range Money In & Money Out Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 8
              }}
            >
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 10,
                  padding: '7px 10px'
                }}
              >
                <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 600 }}>Money in</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#10B981', marginTop: 1 }}>
                  +{currencyService.format(rangeActualIncome)}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: 10,
                  padding: '7px 10px'
                }}
              >
                <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 600 }}>Money out</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#EF4444', marginTop: 1 }}>
                  -{currencyService.format(rangeActualExpense + rangePaidDuesTotal)}
                </div>
              </div>
            </div>

            {/* Expected Summary Banner (when Expected Toggle is ON) */}
            {showExpectedAmounts && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 8,
                  padding: '5px 9px',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10.5
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#93C5FD', fontWeight: 700 }}>
                  <Target size={11} />
                  <span>Expected:</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
                  <span style={{ color: '#10B981' }}>+{currencyService.format(rangeExpectedInflow)}</span>
                  <span style={{ color: '#EF4444' }}>-{currencyService.format(rangeExpectedOutflow)}</span>
                </div>
              </div>
            )}

            {/* Scrollable Activities Ledger */}
            <div
              className="fintrack-calendar-activities-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                flex: 1,
                overflowY: 'auto',
                paddingRight: 3,
                minHeight: 0
              }}
            >
              {totalRangeActivities === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '28px 12px',
                    textAlign: 'center',
                    color: '#64748B'
                  }}
                >
                  <CalendarDays size={26} style={{ color: '#334155', marginBottom: 8 }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8' }}>No activities on this date</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>Tap below to record an entry</div>
                </div>
              ) : (
                <>
                  {/* 1. ACTUAL TRANSACTIONS (Figma Card Style) */}
                  {filteredRangeTransactions.map(t => {
                    const amt = Number(t.amount) || 0;
                    const type = (t.type || 'expense').toLowerCase();
                    const isIncome = type === 'income';
                    const isSavings = type === 'savings';
                    const iconColor = isIncome ? '#10B981' : isSavings ? '#8B5CF6' : '#EF4444';
                    const iconBg = isIncome ? 'rgba(16, 185, 129, 0.15)' : isSavings ? 'rgba(139, 92, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                    const tagLabel = isIncome ? 'Income' : isSavings ? 'Investment' : 'Expense';

                    return (
                      <div
                        key={t.id}
                        style={{
                          background: 'rgba(15, 23, 42, 0.7)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: iconBg,
                              color: iconColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {isIncome ? <ArrowUpRight size={18} /> : isSavings ? <TrendingUp size={18} /> : <ArrowDownRight size={18} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#F8FAFC',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {t.description || t.subcategory || t.category || 'Transaction'}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.category || 'General'} • {t.paymentMode || 'Bank Transfer'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                              <span
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: 800,
                                  padding: '1.5px 6px',
                                  borderRadius: 4,
                                  background: iconBg,
                                  color: iconColor,
                                  textTransform: 'capitalize'
                                }}
                              >
                                {tagLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: iconColor }}>
                              {isIncome ? '+' : '-'}{currencyService.format(amt)}
                            </div>
                            <div style={{ fontSize: 9.5, color: '#10B981', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                              ✓ completed
                            </div>
                          </div>
                          <ChevronRight size={14} style={{ color: '#475569', marginLeft: 2 }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* 2. DUES: LOANS & CREDIT CARDS (Figma Due Card Style with Paid Status Color) */}
                  {filteredRangeDues.map(due => {
                    const isPaid = due.isPaid;
                    const isOverdue = !isPaid && due.isOverdue;
                    const dueColor = isPaid ? '#10B981' : isOverdue ? '#EF4444' : '#F59E0B';
                    const dueBg = isPaid
                      ? 'rgba(16, 185, 129, 0.15)'
                      : isOverdue
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)';
                    const dueBorder = isPaid
                      ? '1px solid rgba(16, 185, 129, 0.25)'
                      : isOverdue
                        ? '1px solid rgba(239, 68, 68, 0.35)'
                        : '1px solid rgba(245, 158, 11, 0.25)';
                    const badgeText = isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Due';
                    const statusText = isPaid ? '✓ paid' : isOverdue ? '⚠ overdue' : '⏱ due';

                    return (
                      <div
                        key={due.id}
                        onClick={() => {
                          if (due.type === 'loan' && due.loanId) onNavigateToLoan?.(due.loanId);
                        }}
                        style={{
                          background: 'rgba(15, 23, 42, 0.7)',
                          border: dueBorder,
                          borderRadius: 12,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          cursor: due.type === 'loan' ? 'pointer' : 'default',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: dueBg,
                              color: dueColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <CreditCard size={18} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#F8FAFC',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {due.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {due.dueDate} • {due.subtext}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                              <span
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: 800,
                                  padding: '1.5px 6px',
                                  borderRadius: 4,
                                  background: dueBg,
                                  color: dueColor
                                }}
                              >
                                {badgeText}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: dueColor }}>
                              -{currencyService.format(due.amount)}
                            </div>
                            <div style={{ fontSize: 9.5, color: dueColor, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                              {statusText}
                            </div>
                          </div>
                          <ChevronRight size={14} style={{ color: '#475569', marginLeft: 2 }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* 3. PLANNED / EXPECTED TRANSACTIONS (ONLY when Expected Toggle is ON) */}
                  {showExpectedAmounts && filteredRangePlannedItems.map((plan: PlannedItem) => {
                    const isIncome = plan.type === 'income';
                    const isSavings = plan.type === 'savings';
                    const tagLabel = isIncome ? 'Income' : isSavings ? 'Investment' : 'Expense';

                    return (
                      <div
                        key={plan.id}
                        style={{
                          background: 'rgba(15, 23, 42, 0.45)',
                          border: '1px dashed rgba(148, 163, 184, 0.22)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: 'rgba(148, 163, 184, 0.1)',
                              color: '#94A3B8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {isIncome ? <ArrowUpRight size={18} /> : isSavings ? <TrendingUp size={18} /> : <ArrowDownRight size={18} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: '#CBD5E1',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {plan.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {plan.category} • {plan.paymentMode || 'Bank Transfer'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                              <span
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  padding: '1.5px 6px',
                                  borderRadius: 4,
                                  background: 'rgba(148, 163, 184, 0.12)',
                                  color: '#94A3B8',
                                  textTransform: 'capitalize'
                                }}
                              >
                                Expected {tagLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#94A3B8' }}>
                              {isIncome ? '+' : '-'}{currencyService.format(plan.amount)}
                            </div>
                            <div style={{ fontSize: 9.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                              ⏱ scheduled
                            </div>
                          </div>
                          <ChevronRight size={14} style={{ color: '#475569', marginLeft: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Bottom Action Button */}
          <div style={{ marginTop: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => onOpenNewTransaction?.()}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
                color: '#FFFFFF',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <Plus size={15} />
              <span>
                {isSingleDateSelected
                  ? `Record Transaction on ${singleDateFullMonthDay}`
                  : `Record Transaction in Range`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
