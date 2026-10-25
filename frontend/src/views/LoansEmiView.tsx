import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Landmark,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  TrendingDown,
  Calculator,
  Clock,
  DollarSign,
  Edit3,
  Calendar,
  Mail,
  X,
  Check,
  Search,
  Filter,
  SlidersHorizontal,
  RotateCcw
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { getUserStorageKey } from '../services/storageHelper';
import { playNotificationChime } from '../services/soundService';
import { useTheme } from '../context/ThemeContext';

export interface LoanModel {
  id: string;
  name: string; // Loan/Account Name
  loanNumber?: string; // Loan / Account Number
  lender: string; // Lender / Bank Name
  principal: number; // Loan Amount
  emiAmount: number; // EMI Amount
  remainingAmount: number; // Remaining Amount
  startDate: string; // Start date
  endDate: string; // End date
  includeInNetWorth?: boolean; // Calculate to net worth or not (default: true)
  type?: 'Home Loan' | 'Auto Loan' | 'Personal Loan' | 'Education Loan' | 'Consumer Durable' | 'Other';
  interestRate?: number; // Optional Annual %
  tenureMonths?: number;
  paidMonths?: number;
  dueDay?: number; // Monthly EMI Due Day (1-31, default: 5)
  description?: string; // Description / Purpose
  status?: 'active' | 'closed'; // Active or Closed status
}

export interface MonthEmiScheduleItem {
  index: number;
  monthStr: string;
  monthName: string;
  year: number;
  dateStr: string;
  emiAmount: number;
  status: 'paid' | 'pending' | 'upcoming';
  isCurrentMonth: boolean;
  isNextMonth: boolean;
}

const DEFAULT_LOANS: LoanModel[] = [
  {
    id: 'loan-1',
    name: 'HDFC Home Loan',
    loanNumber: 'HL-74928103',
    lender: 'HDFC Bank',
    principal: 3500000,
    emiAmount: 30375,
    remainingAmount: 2650000,
    startDate: '2021-08-01',
    endDate: '2041-08-01',
    includeInNetWorth: true,
    type: 'Home Loan',
    interestRate: 8.5,
    tenureMonths: 240,
    paidMonths: 58,
    dueDay: 5,
    description: 'Residential property mortgage for Palm Heights Apartment',
    status: 'active'
  },
  {
    id: 'loan-2',
    name: 'SBI Car Loan',
    loanNumber: 'AL-55829140',
    lender: 'State Bank of India',
    principal: 800000,
    emiAmount: 16568,
    remainingAmount: 373333,
    startDate: '2023-11-01',
    endDate: '2028-11-01',
    includeInNetWorth: true,
    type: 'Auto Loan',
    interestRate: 8.9,
    tenureMonths: 60,
    paidMonths: 32,
    dueDay: 10,
    description: 'Electric SUV auto financing with 5-year fixed repayment tenure',
    status: 'active'
  },
  {
    id: 'loan-3',
    name: 'Apple iPhone 16 Pro EMI',
    loanNumber: 'CD-99238411',
    lender: 'HDFC SmartEMI',
    principal: 119900,
    emiAmount: 19983,
    remainingAmount: 39967,
    startDate: '2024-06-15',
    endDate: '2024-12-15',
    includeInNetWorth: true,
    type: 'Consumer Durable',
    interestRate: 0,
    tenureMonths: 6,
    paidMonths: 4,
    dueDay: 15,
    description: 'No-cost EMI 6-month consumer electronics installment plan',
    status: 'active'
  }
];

// Calculate EMI using standard amortization formula
export const calculateEMI = (principal: number, annualRate: number, tenureMonths: number): number => {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRate <= 0) return Math.round(principal / tenureMonths);
  const r = annualRate / 12 / 100;
  const emi = (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1);
  return Math.round(emi);
};

// Calculate total tenure months from start and end dates
export const calculateLoanTenureMonths = (startDateStr: string, endDateStr: string, fallbackTenure?: number): number => {
  if (startDateStr && endDateStr) {
    const s = new Date(startDateStr);
    const e = new Date(endDateStr);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      if (diff > 0) return diff;
    }
  }
  return fallbackTenure && fallbackTenure > 0 ? fallbackTenure : 12;
};

// Calculate interest amount from principal, EMI, and tenure months
export const calculateLoanInterestAmount = (principal: number, emi: number, tenureMonths: number): number => {
  if (principal <= 0 || emi <= 0 || tenureMonths <= 0) return 0;
  const totalPayable = emi * tenureMonths;
  return Math.max(0, Math.round(totalPayable - principal));
};

// Full metrics calculator for any loan card & split view
export const calculateLoanEMIs = (loan: LoanModel) => {
  const tenureMonths = calculateLoanTenureMonths(loan.startDate, loan.endDate, loan.tenureMonths);
  const emi = typeof loan.emiAmount === 'number' && !isNaN(loan.emiAmount) && loan.emiAmount > 0
    ? loan.emiAmount
    : calculateEMI(loan.principal, loan.interestRate || 0, tenureMonths);

  const remaining = typeof loan.remainingAmount === 'number' && !isNaN(loan.remainingAmount)
    ? loan.remainingAmount
    : Math.max(0, loan.principal - ((loan.paidMonths || 0) * emi));

  const isClosed = loan.status === 'closed' || remaining <= 0;
  const totalEmis = tenureMonths;
  let completedEmis = loan.paidMonths !== undefined && loan.paidMonths !== null
    ? loan.paidMonths
    : (emi > 0 ? Math.min(totalEmis, Math.max(0, Math.round((loan.principal - remaining) / emi))) : 0);

  if (isClosed) {
    completedEmis = totalEmis;
  }
  const remainingEmis = Math.max(0, totalEmis - completedEmis);
  const totalInterest = calculateLoanInterestAmount(loan.principal, emi, totalEmis);
  const totalPayable = loan.principal + totalInterest;
  const paidPrincipal = Math.max(0, loan.principal - remaining);
  const paidPct = loan.principal > 0 ? Math.min(100, Math.max(0, Math.round((paidPrincipal / loan.principal) * 100))) : 100;

  return {
    tenureMonths,
    emi,
    remaining,
    totalEmis,
    completedEmis,
    remainingEmis,
    totalInterest,
    totalPayable,
    paidPrincipal,
    paidPct,
    isClosed
  };
};

// Generate month-by-month amortization and payment schedule from start date to end date
export const generateEmiSchedule = (loan: LoanModel, emiMetrics: ReturnType<typeof calculateLoanEMIs>): MonthEmiScheduleItem[] => {
  const schedule: MonthEmiScheduleItem[] = [];
  const sDate = loan.startDate ? new Date(loan.startDate) : new Date();
  const totalMonths = Math.max(1, emiMetrics.totalEmis);
  const dueDay = loan.dueDay || 5;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (let i = 0; i < totalMonths; i++) {
    const itemDate = new Date(sDate.getFullYear(), sDate.getMonth() + i, dueDay);
    const itemYear = itemDate.getFullYear();
    const itemMonth = itemDate.getMonth();

    const isCurrent = itemYear === currentYear && itemMonth === currentMonth;
    const isPast = (itemYear < currentYear) || (itemYear === currentYear && itemMonth < currentMonth);
    const isNext = (itemYear === currentYear && itemMonth === currentMonth + 1) ||
                   (itemMonth === 0 && itemYear === currentYear + 1 && currentMonth === 11);

    let isMonthPaid = false;
    if (emiMetrics.isClosed) {
      isMonthPaid = true;
    } else if (i < emiMetrics.completedEmis) {
      isMonthPaid = true;
    }

    const monthStr = itemDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const monthName = itemDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const dateStr = itemDate.toISOString().substring(0, 10);

    let status: 'paid' | 'pending' | 'upcoming' = 'upcoming';
    if (isMonthPaid) {
      status = 'paid';
    } else if (isCurrent) {
      status = 'pending';
    } else if (isPast) {
      status = 'pending';
    } else {
      status = 'upcoming';
    }

    schedule.push({
      index: i + 1,
      monthStr,
      monthName,
      year: itemYear,
      dateStr,
      emiAmount: emiMetrics.emi,
      status,
      isCurrentMonth: isCurrent,
      isNextMonth: isNext
    });
  }

  return schedule;
};

export const LoansEmiView: React.FC = () => {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const isLight = effectiveTheme === 'light';
  const isViewOnly = Boolean(user?.isReadOnly || (user?.isMember && user?.memberPermission === 'VIEW_ONLY'));

  const [loans, setLoans] = useState<LoanModel[]>(() => {
    try {
      const storageKey = getUserStorageKey('fintrack_loans_list', user?.email);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    if (user?.email === 'demo@fintrack.io') {
      return DEFAULT_LOANS;
    }
    return [];
  });

  const [actualTransactions, setActualTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Split screen state: selected loan for isolated EMI details inspector (like Admin tool)
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  // Add Loan Modal Form State
  const [isAddLoanOpen, setIsAddLoanOpen] = useState<boolean>(false);
  const [loanName, setLoanName] = useState<string>('');
  const [loanNumber, setLoanNumber] = useState<string>('');
  const [loanLender, setLoanLender] = useState<string>('');
  const [loanDueDay, setLoanDueDay] = useState<number>(5);
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loanEmi, setLoanEmi] = useState<string>('');
  const [loanRemaining, setLoanRemaining] = useState<string>('');
  const [loanStartDate, setLoanStartDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [loanEndDate, setLoanEndDate] = useState<string>('');
  const [loanDescription, setLoanDescription] = useState<string>('');
  const [loanIncludeNetWorth, setLoanIncludeNetWorth] = useState<boolean>(true);

  // Edit Loan Modal State
  const [isEditLoanOpen, setIsEditLoanOpen] = useState<boolean>(false);
  const [editingLoan, setEditingLoan] = useState<LoanModel | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editLoanNumber, setEditLoanNumber] = useState<string>('');
  const [editLender, setEditLender] = useState<string>('');
  const [editDueDay, setEditDueDay] = useState<number>(5);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editEmi, setEditEmi] = useState<string>('');
  const [editRemaining, setEditRemaining] = useState<string>('');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'active' | 'closed'>('active');
  const [editIncludeNetWorth, setEditIncludeNetWorth] = useState<boolean>(true);

  // Sending email reminder loader
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Pay EMI Modal
  const [isPayEmiOpen, setIsPayEmiOpen] = useState<boolean>(false);
  const [payingLoan, setPayingLoan] = useState<LoanModel | null>(null);
  const [payEmiAmount, setPayEmiAmount] = useState<string>('');
  const [payEmiMode, setPayEmiMode] = useState<string>('upi');
  const [paySaving, setPaySaving] = useState<boolean>(false);

  // Interactive EMI Calculator State
  const [calcPrincipal, setCalcPrincipal] = useState<number>(1000000);
  const [calcRate, setCalcRate] = useState<number>(8.5);
  const [calcTenureYears, setCalcTenureYears] = useState<number>(5);

  // Pagination & Filtering for Loans/EMI Transactions Table (Budget & Transactions style)
  const [emiSearchQuery, setEmiSearchQuery] = useState<string>('');
  const [emiFilterType, setEmiFilterType] = useState<'all' | 'paid' | 'recent'>('all');
  const [emiSelectedLoanFilter, setEmiSelectedLoanFilter] = useState<string>('all');
  const [emiPaymentModeFilter, setEmiPaymentModeFilter] = useState<string>('all');
  const [emiFromDate, setEmiFromDate] = useState<string>('');
  const [emiToDate, setEmiToDate] = useState<string>('');
  const [emiMinAmount, setEmiMinAmount] = useState<string>('');
  const [emiMaxAmount, setEmiMaxAmount] = useState<string>('');
  const [showEmiDatePopover, setShowEmiDatePopover] = useState<boolean>(false);
  const [showEmiAmountPopover, setShowEmiAmountPopover] = useState<boolean>(false);
  const emiDateRef = useRef<HTMLDivElement>(null);
  const emiAmountRef = useRef<HTMLDivElement>(null);

  const [emiCurrentPage, setEmiCurrentPage] = useState<number>(1);
  const [emiPageSize, setEmiPageSize] = useState<number>(10);

  const saveLoans = (newLoans: LoanModel[]) => {
    setLoans(newLoans);
    const storageKey = getUserStorageKey('fintrack_loans_list', user?.email);
    localStorage.setItem(storageKey, JSON.stringify(newLoans));
  };

  const fetchTransactions = async () => {
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
    try {
      const storageKey = getUserStorageKey('fintrack_loans_list', user?.email);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setLoans(parsed);
          fetchTransactions();
          return;
        }
      }
    } catch {}
    if (user?.email === 'demo@fintrack.io') {
      seedDemoBudgetData();
      setLoans(DEFAULT_LOANS);
    } else {
      setLoans([]);
    }
    fetchTransactions();
  }, [user]);

  // Filter actual transactions related to Loans/EMI
  const emiTransactions = useMemo(() => {
    return actualTransactions.filter(t => {
      const cat = String(t.category || '').toLowerCase();
      const sub = String(t.subcategory || '').toLowerCase();
      const desc = String(t.description || '').toLowerCase();

      return (
        cat.includes('loan') ||
        cat.includes('debt') ||
        cat.includes('emi') ||
        cat.includes('mortgage') ||
        sub.includes('loan') ||
        sub.includes('emi') ||
        desc.includes('emi') ||
        desc.includes('loan payment')
      );
    });
  }, [actualTransactions]);

  // Close popovers on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (emiDateRef.current && !emiDateRef.current.contains(e.target as Node)) {
        setShowEmiDatePopover(false);
      }
      if (emiAmountRef.current && !emiAmountRef.current.contains(e.target as Node)) {
        setShowEmiAmountPopover(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setEmiCurrentPage(1);
  }, [emiSearchQuery, emiFilterType, emiSelectedLoanFilter, emiPaymentModeFilter, emiFromDate, emiToDate, emiMinAmount, emiMaxAmount]);

  const applyEmiDatePreset = (preset: 'all' | 'this_month' | 'last_month' | 'last_30' | 'this_year') => {
    const now = new Date();
    if (preset === 'all') {
      setEmiFromDate('');
      setEmiToDate('');
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().substring(0, 10);
      setEmiFromDate(start);
      setEmiToDate(end);
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().substring(0, 10);
      setEmiFromDate(start);
      setEmiToDate(end);
    } else if (preset === 'last_30') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const end = now.toISOString().substring(0, 10);
      setEmiFromDate(start);
      setEmiToDate(end);
    } else if (preset === 'this_year') {
      const start = `${now.getFullYear()}-01-01`;
      const end = `${now.getFullYear()}-12-31`;
      setEmiFromDate(start);
      setEmiToDate(end);
    }
    setShowEmiDatePopover(false);
    setEmiCurrentPage(1);
  };

  const applyEmiAmountPreset = (preset: 'all' | 'under_10k' | '10k_30k' | 'above_30k') => {
    if (preset === 'all') {
      setEmiMinAmount('');
      setEmiMaxAmount('');
    } else if (preset === 'under_10k') {
      setEmiMinAmount('');
      setEmiMaxAmount('10000');
    } else if (preset === '10k_30k') {
      setEmiMinAmount('10000');
      setEmiMaxAmount('30000');
    } else if (preset === 'above_30k') {
      setEmiMinAmount('30000');
      setEmiMaxAmount('');
    }
    setShowEmiAmountPopover(false);
    setEmiCurrentPage(1);
  };

  const getEmiDateLabel = () => {
    if (emiFromDate && emiToDate) return `${emiFromDate.substring(5)} to ${emiToDate.substring(5)}`;
    if (emiFromDate) return `From ${emiFromDate.substring(5)}`;
    if (emiToDate) return `Until ${emiToDate.substring(5)}`;
    return 'Date Range';
  };

  const getEmiAmountLabel = () => {
    const cur = currencyService.getActiveCurrencyConfig().symbol;
    if (emiMinAmount && emiMaxAmount) return `${cur}${emiMinAmount} - ${cur}${emiMaxAmount}`;
    if (emiMinAmount) return `≥ ${cur}${emiMinAmount}`;
    if (emiMaxAmount) return `≤ ${cur}${emiMaxAmount}`;
    return 'Amount Range';
  };

  // Filtered EMI Transactions
  const filteredEmiTransactions = useMemo(() => {
    return emiTransactions.filter(t => {
      if (emiSearchQuery.trim()) {
        const q = emiSearchQuery.toLowerCase().trim();
        const desc = String(t.description || t.details || '').toLowerCase();
        const cat = String(t.category || '').toLowerCase();
        const sub = String(t.subcategory || '').toLowerCase();
        const mode = String(t.paymentMode || '').toLowerCase();
        const date = String(t.date || '').toLowerCase();
        const amt = String(t.amount || '');
        if (!desc.includes(q) && !cat.includes(q) && !sub.includes(q) && !mode.includes(q) && !date.includes(q) && !amt.includes(q)) {
          return false;
        }
      }

      if (emiFilterType === 'recent') {
        const txDate = new Date(t.date);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      }

      if (emiSelectedLoanFilter !== 'all') {
        const desc = String(t.description || t.details || '').toLowerCase();
        const sub = String(t.subcategory || '').toLowerCase();
        const targetLoan = loans.find(l => l.id === emiSelectedLoanFilter);
        if (targetLoan) {
          const lName = targetLoan.name.toLowerCase();
          const lLender = targetLoan.lender.toLowerCase();
          if (!desc.includes(lName) && !desc.includes(lLender) && !sub.includes(lName) && !sub.includes(lLender)) {
            return false;
          }
        }
      }

      if (emiPaymentModeFilter !== 'all') {
        const mode = String(t.paymentMode || '').toLowerCase();
        if (mode !== emiPaymentModeFilter.toLowerCase()) return false;
      }

      if (emiFromDate && t.date < emiFromDate) return false;
      if (emiToDate && t.date > emiToDate) return false;

      const amt = Number(t.amount) || 0;
      if (emiMinAmount && amt < Number(emiMinAmount)) return false;
      if (emiMaxAmount && amt > Number(emiMaxAmount)) return false;

      return true;
    });
  }, [emiTransactions, emiSearchQuery, emiFilterType, emiSelectedLoanFilter, emiPaymentModeFilter, emiFromDate, emiToDate, emiMinAmount, emiMaxAmount, loans]);

  const emiTotalPages = Math.max(1, Math.ceil(filteredEmiTransactions.length / emiPageSize));
  const safeEmiCurrentPage = Math.min(emiCurrentPage, emiTotalPages);

  const paginatedEmiTransactions = useMemo(() => {
    const startIndex = (safeEmiCurrentPage - 1) * emiPageSize;
    return filteredEmiTransactions.slice(startIndex, startIndex + emiPageSize);
  }, [filteredEmiTransactions, safeEmiCurrentPage, emiPageSize]);

  const hasActiveEmiFilters = Boolean(
    emiSearchQuery ||
    emiFilterType !== 'all' ||
    emiSelectedLoanFilter !== 'all' ||
    emiPaymentModeFilter !== 'all' ||
    emiFromDate ||
    emiToDate ||
    emiMinAmount ||
    emiMaxAmount
  );

  const handleResetEmiFilters = () => {
    setEmiSearchQuery('');
    setEmiFilterType('all');
    setEmiSelectedLoanFilter('all');
    setEmiPaymentModeFilter('all');
    setEmiFromDate('');
    setEmiToDate('');
    setEmiMinAmount('');
    setEmiMaxAmount('');
    setEmiCurrentPage(1);
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this EMI repayment record?')) return;
    try {
      const res = await api.delete(`/transactions/${id}`);
      if (res.data?.success) {
        setActualTransactions(prev => prev.filter(t => t.id !== id));
        window.dispatchEvent(new CustomEvent('fintrack-transactions-changed'));
        setBannerMsg({ type: 'success', text: 'Transaction removed from EMI repayments ledger.' });
        playNotificationChime();
        setTimeout(() => setBannerMsg(null), 3000);
      }
    } catch {
      alert('Failed to delete transaction.');
    }
  };

  // Loan Metrics Calculations (Borrowed, Paid, Outstanding, Monthly EMI, Progress)
  const metrics = useMemo(() => {
    let totalPrincipal = 0;
    let totalOutstanding = 0;
    let totalMonthlyEmi = 0;
    let netWorthLiabilities = 0;

    loans.forEach(loan => {
      const p = Number(loan.principal) || 0;
      totalPrincipal += p;

      const emiMetrics = calculateLoanEMIs(loan);
      totalMonthlyEmi += emiMetrics.emi;
      totalOutstanding += emiMetrics.remaining;

      if (loan.includeInNetWorth !== false) {
        netWorthLiabilities += emiMetrics.remaining;
      }
    });

    const totalPaid = Math.max(0, totalPrincipal - totalOutstanding);
    const payoffProgress = totalPrincipal > 0 ? Math.min(100, Math.round((totalPaid / totalPrincipal) * 100)) : 100;

    return {
      totalPrincipal,
      totalPaid,
      totalOutstanding,
      totalMonthlyEmi,
      payoffProgress,
      netWorthLiabilities
    };
  }, [loans]);

  // EMI Calculator Calculation
  const calcResults = useMemo(() => {
    const tenureMonths = calcTenureYears * 12;
    const monthlyEmi = calculateEMI(calcPrincipal, calcRate, tenureMonths);
    const totalPayment = monthlyEmi * tenureMonths;
    const totalInterest = Math.max(0, totalPayment - calcPrincipal);
    const principalPct = totalPayment > 0 ? (calcPrincipal / totalPayment) * 100 : 100;
    const interestPct = totalPayment > 0 ? (totalInterest / totalPayment) * 100 : 0;

    return {
      monthlyEmi,
      totalInterest,
      totalPayment,
      principalPct,
      interestPct
    };
  }, [calcPrincipal, calcRate, calcTenureYears]);

  // Toggle net worth calculation on any loan card
  const handleToggleNetWorth = (loanId: string, checked: boolean) => {
    const updated = loans.map(l => (l.id === loanId ? { ...l, includeInNetWorth: checked } : l));
    saveLoans(updated);
  };

  // Add Loan Submission
  const handleAddLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = parseFloat(loanAmount);
    const emi = parseFloat(loanEmi);
    const remaining = parseFloat(loanRemaining);

    if (!loanName.trim()) return;
    if (isNaN(principal) || principal <= 0) return;

    let tenureMonths = 12;
    if (loanStartDate && loanEndDate) {
      tenureMonths = calculateLoanTenureMonths(loanStartDate, loanEndDate);
    }

    const newLoan: LoanModel = {
      id: `loan-${Date.now()}`,
      name: loanName.trim(),
      loanNumber: loanNumber.trim() || `LN-${Math.floor(100000 + Math.random() * 900000)}`,
      lender: loanLender.trim() || 'Bank / Lender',
      dueDay: Number(loanDueDay) || 5,
      principal: principal,
      emiAmount: !isNaN(emi) && emi >= 0 ? emi : 0,
      remainingAmount: !isNaN(remaining) && remaining >= 0 ? remaining : principal,
      startDate: loanStartDate,
      endDate: loanEndDate,
      description: loanDescription.trim(),
      includeInNetWorth: loanIncludeNetWorth,
      type: 'Other',
      interestRate: 0,
      tenureMonths: tenureMonths,
      paidMonths: 0,
      status: (remaining <= 0) ? 'closed' : 'active'
    };

    const updated = [...loans, newLoan];
    saveLoans(updated);
    setIsAddLoanOpen(false);
    setLoanName('');
    setLoanNumber('');
    setLoanLender('');
    setLoanDueDay(5);
    setLoanAmount('');
    setLoanEmi('');
    setLoanRemaining('');
    setLoanStartDate(new Date().toISOString().substring(0, 10));
    setLoanEndDate('');
    setLoanDescription('');
    setLoanIncludeNetWorth(true);
    setBannerMsg({ type: 'success', text: `Loan "${newLoan.name}" added to tracker successfully!` });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Open Edit Loan Modal
  const openEditLoanModal = (loan: LoanModel) => {
    setEditingLoan(loan);
    setEditName(loan.name);
    setEditLoanNumber(loan.loanNumber || '');
    setEditLender(loan.lender);
    setEditDueDay(loan.dueDay || 5);
    setEditAmount(String(loan.principal));
    setEditEmi(String(loan.emiAmount || ''));
    setEditRemaining(String(loan.remainingAmount !== undefined ? loan.remainingAmount : loan.principal));
    setEditStartDate(loan.startDate || '');
    setEditEndDate(loan.endDate || '');
    setEditDescription(loan.description || '');
    setEditStatus(loan.status || (loan.remainingAmount <= 0 ? 'closed' : 'active'));
    setEditIncludeNetWorth(loan.includeInNetWorth !== false);
    setIsEditLoanOpen(true);
  };

  // Save Edited Loan
  const handleEditLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoan) return;

    const principal = parseFloat(editAmount);
    const emi = parseFloat(editEmi);
    const remaining = parseFloat(editRemaining);

    if (!editName.trim()) return;
    if (isNaN(principal) || principal <= 0) return;

    const tenureMonths = calculateLoanTenureMonths(editStartDate, editEndDate, editingLoan.tenureMonths);

    const updatedLoans = loans.map(l => {
      if (l.id === editingLoan.id) {
        return {
          ...l,
          name: editName.trim(),
          loanNumber: editLoanNumber.trim() || l.loanNumber,
          lender: editLender.trim() || l.lender,
          dueDay: Number(editDueDay) || 5,
          principal: principal,
          emiAmount: !isNaN(emi) && emi >= 0 ? emi : l.emiAmount,
          remainingAmount: !isNaN(remaining) && remaining >= 0 ? remaining : l.remainingAmount,
          startDate: editStartDate,
          endDate: editEndDate,
          description: editDescription.trim(),
          includeInNetWorth: editIncludeNetWorth,
          tenureMonths: tenureMonths,
          status: editStatus
        };
      }
      return l;
    });

    saveLoans(updatedLoans);
    setIsEditLoanOpen(false);
    setEditingLoan(null);
    setBannerMsg({ type: 'success', text: `Loan "${editName}" updated successfully!` });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Delete Loan
  const handleDeleteLoan = (loanId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from your active loans list?`)) {
      return;
    }
    const updated = loans.filter(l => l.id !== loanId);
    saveLoans(updated);
    if (selectedLoanId === loanId) {
      setSelectedLoanId(null);
    }
  };

  // Dispatch Official Email Reminder for Loan EMI
  const handleSendEmailReminder = async (loan: LoanModel) => {
    try {
      setSendingReminderId(loan.id);
      const emiInfo = calculateLoanEMIs(loan);
      const res = await api.post('/user/send-loan-reminder', {
        loanName: loan.name,
        loanNumber: loan.loanNumber || '',
        lender: loan.lender,
        emiAmount: emiInfo.emi,
        dueDay: loan.dueDay || 5,
        remainingAmount: emiInfo.remaining
      });
      if (res.data?.success) {
        setBannerMsg({ type: 'success', text: `EMI reminder email dispatched to ${user?.email} for "${loan.name}"!` });
        playNotificationChime();
        setTimeout(() => setBannerMsg(null), 4000);
      } else {
        setBannerMsg({ type: 'error', text: res.data?.error || 'Failed to dispatch email reminder.' });
      }
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: err?.response?.data?.error || 'Email reminder could not be sent. Please verify SMTP settings.' });
    } finally {
      setSendingReminderId(null);
    }
  };

  // Pay EMI Submission -> Records to actual database /api/transactions
  const handlePayEmiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;

    const amt = parseFloat(payEmiAmount);
    if (!amt || amt <= 0) return;

    setPaySaving(true);
    try {
      const baseAmount = currencyService.convertToBase(amt);

      const payload = {
        date: new Date().toISOString().substring(0, 10),
        type: 'expense',
        category: 'Debt Repayment',
        subcategory: `${payingLoan.type || 'Loan'} EMI`,
        description: `EMI payment for ${payingLoan.name} (${payingLoan.lender})`,
        amount: baseAmount,
        paymentMode: payEmiMode
      };

      const res = await api.post('/transactions', payload);
      if (res.data && res.data.success) {
        const updated = loans.map(l => {
          if (l.id === payingLoan.id) {
            const currentRem = typeof l.remainingAmount === 'number' && !isNaN(l.remainingAmount)
              ? l.remainingAmount
              : l.principal;
            const newRemaining = Math.max(0, currentRem - amt);
            const isNowClosed = newRemaining <= 0;
            return {
              ...l,
              paidMonths: (l.paidMonths || 0) + 1,
              remainingAmount: newRemaining,
              status: isNowClosed ? ('closed' as const) : l.status
            };
          }
          return l;
        });
        saveLoans(updated);

        setBannerMsg({
          type: 'success',
          text: `EMI payment of ${currencyService.format(baseAmount)} for "${payingLoan.name}" recorded in database and loan balance updated!`
        });
        playNotificationChime();
        setTimeout(() => setBannerMsg(null), 4000);
        setIsPayEmiOpen(false);
        setPayingLoan(null);
        await fetchTransactions();
      }
    } catch {
      alert('Failed to record EMI payment.');
    } finally {
      setPaySaving(false);
    }
  };

  // Add from Calculator to Active Loans
  const handleAddFromCalculator = () => {
    const tenureMonths = calcTenureYears * 12;
    const emi = calculateEMI(calcPrincipal, calcRate, tenureMonths);
    const sDate = new Date();
    const eDate = new Date();
    eDate.setMonth(eDate.getMonth() + tenureMonths);

    const newLoan: LoanModel = {
      id: `loan-${Date.now()}`,
      name: `Loan (${currencyService.format(calcPrincipal)})`,
      loanNumber: `LN-${Math.floor(100000 + Math.random() * 900000)}`,
      lender: 'Bank / NBFC',
      dueDay: 5,
      principal: calcPrincipal,
      emiAmount: emi,
      remainingAmount: calcPrincipal,
      startDate: sDate.toISOString().substring(0, 10),
      endDate: eDate.toISOString().substring(0, 10),
      description: `Calculated ${calcTenureYears}-year amortization loan at ${calcRate}% p.a.`,
      includeInNetWorth: true,
      type: 'Personal Loan',
      interestRate: calcRate,
      tenureMonths: tenureMonths,
      paidMonths: 0,
      status: 'active'
    };
    const updated = [...loans, newLoan];
    saveLoans(updated);
    setBannerMsg({ type: 'success', text: `Calculated loan of ${currencyService.format(calcPrincipal)} saved directly to your active loans tracker!` });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Get currently selected loan for split view
  const selectedLoan = useMemo(() => {
    if (!selectedLoanId) return null;
    return loans.find(l => l.id === selectedLoanId) || null;
  }, [loans, selectedLoanId]);

  const selectedLoanMetrics = useMemo(() => {
    if (!selectedLoan) return null;
    return calculateLoanEMIs(selectedLoan);
  }, [selectedLoan]);

  const selectedLoanSchedule = useMemo(() => {
    if (!selectedLoan || !selectedLoanMetrics) return [];
    return generateEmiSchedule(selectedLoan, selectedLoanMetrics);
  }, [selectedLoan, selectedLoanMetrics]);

  return (
    <main className="fintrack-page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
              <Landmark size={22} />
            </div>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>Loans & EMI Tracker</h1>
              <p className="page-subtitle" style={{ margin: '2px 0 0' }}>
                Track active loans, calculate interest, manage monthly due dates & inspect amortization schedules
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {!isViewOnly ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsAddLoanOpen(true)}
            >
              <Plus size={16} />
              <span>Add New Loan</span>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
              View-only Access
            </div>
          )}
        </div>
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

      {/* KPI Stats Grid (Total Borrowed, Paid Loan Amount, Outstanding, Monthly EMI, Progress) */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {/* 1. Total Borrowed Principal */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">TOTAL BORROWED</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
              <Landmark size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8 }}>
            {currencyService.format(metrics.totalPrincipal)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Across {loans.length} active & closed accounts
          </div>
        </div>

        {/* 2. Paid Loan Amount (Requirement 4) */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">TOTAL PAID AMOUNT</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#10B981' }}>
            {currencyService.format(metrics.totalPaid)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {metrics.payoffProgress}% of overall debt repaid
          </div>
        </div>

        {/* 3. Total Outstanding Balance */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">OUTSTANDING BALANCE</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#EF4444' }}>
            {currencyService.format(metrics.totalOutstanding)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {metrics.netWorthLiabilities !== metrics.totalOutstanding
              ? `${currencyService.format(metrics.netWorthLiabilities)} included in Net Worth`
              : 'Remaining debt principal balance'}
          </div>
        </div>

        {/* 4. Monthly EMI Outflow */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">MONTHLY EMI COMMITMENT</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#F59E0B' }}>
            {currencyService.format(metrics.totalMonthlyEmi)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Total monthly debit for all EMIs
          </div>
        </div>

        {/* 5. Payoff Progress */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">DEBT REPAID PROGRESS</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
              {metrics.payoffProgress}% PAID
            </span>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#10B981' }}>
            {metrics.payoffProgress}%
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--border-color)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${metrics.payoffProgress}%`, height: '100%', background: '#10B981', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {currencyService.format(metrics.totalPaid)} principal paid off
          </div>
        </div>
      </div>

      {/* Main Loan Content Area: Split 2-Box Screen like Admin Tool when card is clicked */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Active Loans & Schedules ({loans.length})
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Click any loan card to open the interactive EMI schedule split inspector
            </span>
          </div>
          {selectedLoanId && (
            <button
              type="button"
              onClick={() => setSelectedLoanId(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <X size={14} />
              <span>Close Split Screen</span>
            </button>
          )}
        </div>

        {loans.length === 0 ? (
          <div
            className="summary-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: 16,
              border: '1px dashed var(--border-color)',
              background: 'var(--card-bg)'
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Landmark size={28} style={{ color: 'var(--accent-indigo)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              No Active Loans or EMIs
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Track home loans, car loans, personal loans, and consumer EMIs with live amortization schedules, outstanding balances, and monthly dues.
            </p>
            {!isViewOnly && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsAddLoanOpen(true)}
              >
                <Plus size={16} />
                <span>Add Your First Loan</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Left Box: Loans Cards Grid */}
            <div
              style={{
                flex: selectedLoanId ? '1 1 56%' : '1 1 100%',
                minWidth: 320,
                transition: 'all 0.3s ease'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: selectedLoanId ? 'repeat(auto-fit, minmax(310px, 1fr))' : 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: 16
                }}
              >
                {loans.map(loan => {
                  const emiInfo = calculateLoanEMIs(loan);
                  const isSelected = selectedLoanId === loan.id;
                  const isIncludedInNetWorth = loan.includeInNetWorth !== false;
                  const todayDay = new Date().getDate();
                  const dueDay = loan.dueDay || 5;
                  const diffDays = dueDay - todayDay;

                  return (
                    <div
                      key={loan.id}
                      className="summary-card"
                      onClick={() => setSelectedLoanId(prev => (prev === loan.id ? null : loan.id))}
                      style={{
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 260,
                        cursor: 'pointer',
                        borderRadius: 16,
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        border: isSelected
                          ? '2px solid #6366F1'
                          : isIncludedInNetWorth
                          ? '1px solid var(--border-color)'
                          : '1px dashed rgba(239, 68, 68, 0.45)',
                        boxShadow: isSelected
                          ? '0 0 0 3px rgba(99, 102, 241, 0.25), 0 8px 24px rgba(99, 102, 241, 0.15)'
                          : undefined
                      }}
                    >
                      <div>
                        {/* Top Bar: Status Dot (Green / Red) + Loan Title + Loan Number + Edit/Delete */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {/* Green / Red Indicator Dot (Requirement 7) */}
                              {!emiInfo.isClosed ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                  <span style={{ position: 'relative', display: 'flex', height: 7, width: 7 }}>
                                    <span style={{ position: 'absolute', height: '100%', width: '100%', borderRadius: '50%', background: '#10B981', opacity: 0.75, animation: 'ping 1.5s infinite' }} />
                                    <span style={{ borderRadius: '50%', height: 7, width: 7, background: '#10B981' }} />
                                  </span>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981', letterSpacing: '0.04em' }}>ACTIVE</span>
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444' }} />
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#EF4444', letterSpacing: '0.04em' }}>CLOSED</span>
                                </span>
                              )}

                              {loan.loanNumber && (
                                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#6366F1', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 6px', borderRadius: 6, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                  {loan.loanNumber}
                                </span>
                              )}

                              {isIncludedInNetWorth ? (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.08)', color: '#10B981' }}>
                                  ✓ Net Worth
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.08)', color: '#EF4444' }}>
                                  ✕ Excluded
                                </span>
                              )}
                            </div>

                            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 2px' }}>
                              {loan.name}
                            </h3>

                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Lender: <strong style={{ color: 'var(--text-primary)' }}>{loan.lender}</strong>
                              {loan.description && (
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {loan.description}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Edit (Requirement 3), Delete, and Active Tag */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                            {!isViewOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditLoanModal(loan)}
                                  title="Edit loan details"
                                  style={{
                                    background: 'rgba(99, 102, 241, 0.1)',
                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                    color: '#6366F1',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    padding: '5px 7px',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLoan(loan.id, loan.name)}
                                  title="Remove loan"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: 5
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Due Date & Urgency Indicator (Requirement 8) */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginTop: 10,
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            fontSize: 11
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Calendar size={13} style={{ color: '#F59E0B' }} />
                            <span>
                              Monthly Due: <strong style={{ color: 'var(--text-primary)' }}>{dueDay}th</strong> of every month
                            </span>
                          </div>
                          <div>
                            {!emiInfo.isClosed ? (
                              diffDays === 0 ? (
                                <span style={{ color: '#EF4444', fontWeight: 800 }}>⚠️ DUE TODAY</span>
                              ) : diffDays > 0 && diffDays <= 3 ? (
                                <span style={{ color: '#F59E0B', fontWeight: 700 }}>Due in {diffDays} day{diffDays > 1 ? 's' : ''}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Next cycle on {dueDay}th</span>
                              )
                            ) : (
                              <span style={{ color: '#10B981', fontWeight: 600 }}>Fully Repaid</span>
                            )}
                          </div>
                        </div>

                        {/* Loan Amount, EMI & Remaining Stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                          <div>
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', letterSpacing: '0.04em' }}>
                              LOAN AMOUNT
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                              {currencyService.format(loan.principal)}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', letterSpacing: '0.04em' }}>
                              MONTHLY EMI
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#6366F1' }}>
                              {currencyService.format(emiInfo.emi)}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', letterSpacing: '0.04em' }}>
                              OUTSTANDING
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: emiInfo.remaining > 0 ? '#EF4444' : '#10B981' }}>
                              {currencyService.format(emiInfo.remaining)}
                            </span>
                          </div>
                        </div>

                        {/* EMIs: Total, Completed, Remaining (Requirement 5) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8, padding: '8px 10px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.15)', textAlign: 'center' }}>
                          <div>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL EMIs</span>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{emiInfo.totalEmis}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: 9, color: '#10B981', fontWeight: 700, textTransform: 'uppercase' }}>COMPLETED</span>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#10B981' }}>{emiInfo.completedEmis}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: 9, color: emiInfo.remainingEmis > 0 ? '#EF4444' : '#10B981', fontWeight: 700, textTransform: 'uppercase' }}>REMAINING</span>
                            <div style={{ fontSize: 13, fontWeight: 800, color: emiInfo.remainingEmis > 0 ? '#EF4444' : '#10B981' }}>{emiInfo.remainingEmis}</div>
                          </div>
                        </div>

                        {/* Calculated Interest Amount Display (Requirement 6) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Calculated Total Interest:</span>
                          <strong style={{ color: '#EF4444', fontWeight: 800 }}>
                            {currencyService.format(emiInfo.totalInterest)}
                          </strong>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            <span>Paid: <strong>{currencyService.format(emiInfo.paidPrincipal)}</strong> ({emiInfo.paidPct}%)</span>
                            <span>{emiInfo.remainingEmis} EMIs left</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${emiInfo.paidPct}%`, height: '100%', background: 'linear-gradient(90deg, #6366F1, #10B981)', borderRadius: 999 }} />
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 14,
                          paddingTop: 10,
                          borderTop: '1px solid var(--border-color)',
                          flexWrap: 'wrap',
                          gap: 8
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Net Worth Toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isViewOnly ? 'default' : 'pointer', userSelect: 'none', margin: 0 }}>
                          <input
                            type="checkbox"
                            disabled={isViewOnly}
                            checked={isIncludedInNetWorth}
                            onChange={e => handleToggleNetWorth(loan.id, e.target.checked)}
                            style={{ width: 15, height: 15, cursor: isViewOnly ? 'default' : 'pointer', accentColor: '#6366F1' }}
                          />
                          <span style={{ fontSize: 11, fontWeight: 600, color: isIncludedInNetWorth ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            Net Worth
                          </span>
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Send Due Email Reminder Button */}
                          <button
                            type="button"
                            onClick={() => handleSendEmailReminder(loan)}
                            disabled={sendingReminderId === loan.id}
                            title="Dispatch EMI reminder notification to your email"
                            style={{
                              padding: '5px 9px',
                              fontSize: 11,
                              borderRadius: 6,
                              background: 'rgba(99, 102, 241, 0.1)',
                              border: '1px solid rgba(99, 102, 241, 0.25)',
                              color: '#6366F1',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Mail size={12} />
                            <span>{sendingReminderId === loan.id ? 'Sending...' : 'Mail Alert'}</span>
                          </button>

                          {/* Record Payment Button */}
                          {!isViewOnly && (
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '5px 10px', fontSize: 11 }}
                              onClick={() => {
                                setPayingLoan(loan);
                                setPayEmiAmount(String(emiInfo.emi));
                                setIsPayEmiOpen(true);
                              }}
                            >
                              <span>Pay EMI</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Box: Split Screen EMI Details Panel (Requirement 9) */}
            {selectedLoan && selectedLoanMetrics && (
              <div
                style={{
                  flex: '0 0 380px',
                  minWidth: 320,
                  maxWidth: '100%',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 20,
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 120px)',
                  overflowY: 'auto',
                  boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.06)' : '0 16px 40px rgba(0,0,0,0.5)',
                  position: 'sticky',
                  top: 20
                }}
              >
                {/* Split Screen Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!selectedLoanMetrics.isClosed ? (
                        <span style={{ position: 'relative', display: 'flex', height: 8, width: 8 }}>
                          <span style={{ position: 'absolute', height: '100%', width: '100%', borderRadius: '50%', background: '#10B981', opacity: 0.75, animation: 'ping 1.5s infinite' }} />
                          <span style={{ borderRadius: '50%', height: 8, width: 8, background: '#10B981' }} />
                        </span>
                      ) : (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                      )}
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {selectedLoan.name}
                      </h4>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {selectedLoan.lender} {selectedLoan.loanNumber ? `• ${selectedLoan.loanNumber}` : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedLoanId(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      borderRadius: 8,
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14
                    }}
                    title="Close EMI Details Panel"
                  >
                    ✕
                  </button>
                </div>

                {/* Key Loan Figures Overview */}
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>PRINCIPAL AMOUNT</span>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {currencyService.format(selectedLoan.principal)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>MONTHLY EMI</span>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#6366F1' }}>
                        {currencyService.format(selectedLoanMetrics.emi)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>OUTSTANDING</span>
                      <div style={{ fontSize: 15, fontWeight: 800, color: selectedLoanMetrics.remaining > 0 ? '#EF4444' : '#10B981' }}>
                        {currencyService.format(selectedLoanMetrics.remaining)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL INTEREST</span>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#EF4444' }}>
                        {currencyService.format(selectedLoanMetrics.totalInterest)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Repayment:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{currencyService.format(selectedLoanMetrics.totalPayable)}</strong>
                  </div>
                </div>

                {/* Current & Next Month EMI Payment Status Box (Requirement 9) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Current & Next Month Status
                  </div>

                  {(() => {
                    const now = new Date();
                    const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    const nextMonthName = nextDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const dueDay = selectedLoan.dueDay || 5;
                    const diffDays = dueDay - now.getDate();

                    const currentItem = selectedLoanSchedule.find(s => s.isCurrentMonth);
                    const isCurrentPaid = currentItem ? currentItem.status === 'paid' : selectedLoanMetrics.isClosed;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Current Month Box */}
                        <div style={{ padding: '12px 14px', borderRadius: 10, background: isCurrentPaid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)', border: isCurrentPaid ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {currentMonthName} EMI
                            </span>
                            {isCurrentPaid ? (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Check size={13} /> PAID
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 800, color: diffDays === 0 ? '#EF4444' : '#F59E0B' }}>
                                {diffDays === 0 ? 'DUE TODAY' : `PENDING (Due in ${diffDays}d)`}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <span>Due Date: {dueDay}th of this month</span>
                            <strong style={{ color: '#6366F1' }}>{currencyService.format(selectedLoanMetrics.emi)}</strong>
                          </div>
                        </div>

                        {/* Next Month Box */}
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Next Month: {nextMonthName}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6366F1' }}>
                              Upcoming
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                            <span>Scheduled Due: {dueDay}th {nextDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{currencyService.format(selectedLoanMetrics.emi)}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Month-by-Month Amortization Schedule (Start Date to End Date) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Schedule ({selectedLoan.startDate || 'Start'} to {selectedLoan.endDate || 'End'})
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {selectedLoanMetrics.completedEmis} of {selectedLoanMetrics.totalEmis} paid
                    </span>
                  </div>

                  <div style={{ flex: 1, maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                    {selectedLoanSchedule.map(s => {
                      return (
                        <div
                          key={s.index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: s.isCurrentMonth
                              ? 'rgba(99, 102, 241, 0.12)'
                              : 'var(--bg-secondary)',
                            border: s.isCurrentMonth
                              ? '1px solid rgba(99, 102, 241, 0.3)'
                              : '1px solid var(--border-color)',
                            fontSize: 12
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: s.isCurrentMonth ? '#6366F1' : 'var(--text-primary)' }}>
                              #{s.index} {s.monthStr} {s.isCurrentMonth ? '• (Current)' : ''}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              EMI: {currencyService.format(s.emiAmount)}
                            </div>
                          </div>

                          <div>
                            {s.status === 'paid' ? (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                                ✓ PAID
                              </span>
                            ) : s.status === 'pending' ? (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
                                PENDING DUE
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                UPCOMING
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions in Split View */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                  {!isViewOnly && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setPayingLoan(selectedLoan);
                        setPayEmiAmount(String(selectedLoanMetrics.emi));
                        setIsPayEmiOpen(true);
                      }}
                    >
                      <DollarSign size={15} />
                      <span>Record Monthly EMI Payment</span>
                    </button>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleSendEmailReminder(selectedLoan)}
                      disabled={sendingReminderId === selectedLoan.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        color: '#6366F1',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Mail size={13} />
                      <span>{sendingReminderId === selectedLoan.id ? 'Sending...' : 'Mail Reminder'}</span>
                    </button>

                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={() => openEditLoanModal(selectedLoan)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Edit3 size={13} />
                        <span>Edit Details</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive EMI Calculator Tool */}
      <div className="summary-card" style={{ padding: 26, marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
            <Calculator size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Interactive EMI & Loan Calculator
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Estimate monthly payments, interest vs principal breakdown & plan repayments
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Principal */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>LOAN PRINCIPAL</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{currencyService.format(calcPrincipal)}</span>
              </div>
              <input
                type="range"
                min={50000}
                max={10000000}
                step={25000}
                value={calcPrincipal}
                onChange={e => setCalcPrincipal(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
              />
            </div>

            {/* Interest Rate */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>INTEREST RATE (% P.A.)</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{calcRate}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={0.1}
                value={calcRate}
                onChange={e => setCalcRate(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
              />
            </div>

            {/* Tenure */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>TENURE (YEARS)</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{calcTenureYears} Years ({calcTenureYears * 12} Months)</span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={calcTenureYears}
                onChange={e => setCalcTenureYears(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Calculator Output Display */}
          <div
            style={{
              padding: 22,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                ESTIMATED MONTHLY EMI
              </span>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#6366F1', marginTop: 4 }}>
                {currencyService.format(calcResults.monthlyEmi)}
                <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}> / month</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 10, borderTop: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL INTEREST</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#EF4444', marginTop: 2 }}>
                  {currencyService.format(calcResults.totalInterest)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL PAYMENT</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {currencyService.format(calcResults.totalPayment)}
                </div>
              </div>
            </div>

            {/* Ratio Breakdown Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Principal: {calcResults.principalPct.toFixed(0)}%</span>
                <span>Interest: {calcResults.interestPct.toFixed(0)}%</span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#EF4444', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${calcResults.principalPct}%`, height: '100%', background: '#6366F1' }} />
              </div>
            </div>

            {!isViewOnly && (
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
                onClick={handleAddFromCalculator}
              >
                <Plus size={16} />
                <span>Add as Tracked Loan</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Actual EMI Payment History Ledger with Full Filtering, Limits & Pagination (Budget & Transactions style) */}
      <div className="summary-card" style={{ padding: 24, borderRadius: 16 }}>
        {/* Table Header Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Actual Loan EMI Repayments Ledger ({filteredEmiTransactions.length})
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Search, filter, and track loan repayments, EMI auto-debits & principal payoffs
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="segmented-control" style={{ display: 'inline-flex', background: 'var(--bg-secondary)', padding: 3, borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setEmiFilterType('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: emiFilterType === 'all' ? 700 : 500,
                  background: emiFilterType === 'all' ? 'var(--accent-indigo)' : 'transparent',
                  color: emiFilterType === 'all' ? '#FFF' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setEmiFilterType('paid')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: emiFilterType === 'paid' ? 700 : 500,
                  background: emiFilterType === 'paid' ? 'var(--accent-indigo)' : 'transparent',
                  color: emiFilterType === 'paid' ? '#FFF' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => setEmiFilterType('recent')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: emiFilterType === 'recent' ? 700 : 500,
                  background: emiFilterType === 'recent' ? 'var(--accent-indigo)' : 'transparent',
                  color: emiFilterType === 'recent' ? '#FFF' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Last 30 Days
              </button>
            </div>

            {!isViewOnly && (
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 12 }}
                onClick={() => {
                  if (loans.length === 0) {
                    setBannerMsg({ type: 'error', text: 'Please add a loan first before recording EMI repayments.' });
                    setTimeout(() => setBannerMsg(null), 3500);
                    setIsAddLoanOpen(true);
                    return;
                  }
                  setPayingLoan(loans[0]);
                  setPayEmiAmount(String(calculateLoanEMIs(loans[0]).emi));
                  setIsPayEmiOpen(true);
                }}
              >
                <Plus size={14} />
                <span>Record EMI Payment</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar (Budget & Transactions style) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {/* Search Box */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              padding: '8px 12px',
              gap: 8
            }}
          >
            <Search size={15} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search loan repayments..."
              value={emiSearchQuery}
              onChange={e => setEmiSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--text-primary)',
                width: '100%',
                fontSize: 12
              }}
            />
            {emiSearchQuery && (
              <button
                type="button"
                onClick={() => setEmiSearchQuery('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Loan Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
            <select
              value={emiSelectedLoanFilter}
              onChange={e => setEmiSelectedLoanFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Loans & Accounts</option>
              {loans.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.lender})</option>
              ))}
            </select>
          </div>

          {/* Payment Mode Filter Dropdown */}
          <select
            value={emiPaymentModeFilter}
            onChange={e => setEmiPaymentModeFilter(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Payment Modes</option>
            <option value="bank_transfer">Bank Auto-Debit / ECS</option>
            <option value="upi">UPI / GPay</option>
            <option value="netbanking">Net Banking</option>
            <option value="debit">Debit Card</option>
          </select>

          {/* Date Filter Popover */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={emiDateRef}>
            <button
              type="button"
              onClick={() => {
                setShowEmiDatePopover(open => !open);
                setShowEmiAmountPopover(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: emiFromDate || emiToDate ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input)',
                border: emiFromDate || emiToDate ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                color: emiFromDate || emiToDate ? 'var(--accent-indigo)' : 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: emiFromDate || emiToDate ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Calendar size={14} />
              <span>{getEmiDateLabel()}</span>
              {(emiFromDate || emiToDate) && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setEmiFromDate('');
                    setEmiToDate('');
                  }}
                  style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}
                >
                  <X size={12} />
                </span>
              )}
            </button>

            {showEmiDatePopover && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: 300,
                  background: 'var(--bg-card, #0d1527)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  QUICK DATE PRESETS
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
                      onClick={() => applyEmiDatePreset(p.key as any)}
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
                      value={emiFromDate}
                      onChange={e => setEmiFromDate(e.target.value)}
                      className="modal-input"
                      style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 34 }}>To:</span>
                    <input
                      type="date"
                      value={emiToDate}
                      onChange={e => setEmiToDate(e.target.value)}
                      className="modal-input"
                      style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => { setEmiFromDate(''); setEmiToDate(''); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmiDatePopover(false)}
                    style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount Filter Popover */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={emiAmountRef}>
            <button
              type="button"
              onClick={() => {
                setShowEmiAmountPopover(open => !open);
                setShowEmiDatePopover(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: emiMinAmount || emiMaxAmount ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-input)',
                border: emiMinAmount || emiMaxAmount ? '1px solid var(--accent-indigo)' : '1px solid var(--border-color)',
                color: emiMinAmount || emiMaxAmount ? 'var(--accent-indigo)' : 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: emiMinAmount || emiMaxAmount ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <SlidersHorizontal size={14} />
              <span>{getEmiAmountLabel()}</span>
              {(emiMinAmount || emiMaxAmount) && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setEmiMinAmount('');
                    setEmiMaxAmount('');
                  }}
                  style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}
                >
                  <X size={12} />
                </span>
              )}
            </button>

            {showEmiAmountPopover && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: 300,
                  background: 'var(--bg-card, #0d1527)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  AMOUNT PRESETS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'under_10k', label: `< 10k` },
                    { key: '10k_30k', label: `10k - 30k` },
                    { key: 'above_30k', label: `> 30k` }
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyEmiAmountPreset(p.key as any)}
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
                    value={emiMinAmount}
                    onChange={e => setEmiMinAmount(e.target.value)}
                    className="modal-input"
                    style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={emiMaxAmount}
                    onChange={e => setEmiMaxAmount(e.target.value)}
                    className="modal-input"
                    style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => { setEmiMinAmount(''); setEmiMaxAmount(''); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmiAmountPopover(false)}
                    style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reset Filters Button */}
          {hasActiveEmiFilters && (
            <button
              type="button"
              onClick={handleResetEmiFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#EF4444',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Reset all search & filter controls"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Repayments Table with Min/Max Height (Bounded limit, no overflow) */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading EMI repayment history from database...
          </div>
        ) : filteredEmiTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#6366F1' }}>
              <Landmark size={24} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              No Loan Repayments Found
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: 450 }}>
              {hasActiveEmiFilters
                ? 'No transactions match your active search and filter criteria. Try resetting filters.'
                : 'Transactions recorded under Debt Repayment or Loan EMI will automatically display here.'}
            </p>
            {hasActiveEmiFilters ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleResetEmiFilters}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                <span>Clear All Filters</span>
              </button>
            ) : !isViewOnly && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (loans.length > 0) {
                    setPayingLoan(loans[0]);
                    setPayEmiAmount(String(calculateLoanEMIs(loans[0]).emi));
                    setIsPayEmiOpen(true);
                  }
                }}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                <Plus size={14} />
                <span>Record First EMI Payment</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Scrollable table container with strict minHeight & maxHeight (Prevents infinite expansion) */}
            <div style={{ overflowX: 'auto', minHeight: 280, maxHeight: 460, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Description</th>
                    <th style={{ padding: '12px 14px' }}>Category</th>
                    <th style={{ padding: '12px 14px' }}>Payment Mode</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount Paid</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmiTransactions.map(tx => (
                    <tr
                      key={tx.id}
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {tx.date}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{tx.description || tx.details || 'Loan EMI Repayment'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {tx.subcategory || tx.category || 'Debt Repayment'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-indigo)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                          {tx.paymentMode || 'BANK AUTO-DEBIT'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#10B981', whiteSpace: 'nowrap' }}>
                        {currencyService.format(Number(tx.amount) || 0)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 12, fontWeight: 600 }}>
                          <CheckCircle size={14} /> Paid
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {!isViewOnly ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(tx.id)}
                            title="Delete repayment record"
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (Exact Budget & Transactions style) */}
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
                  {(safeEmiCurrentPage - 1) * emiPageSize + 1}
                </strong>{' '}
                to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.min(safeEmiCurrentPage * emiPageSize, filteredEmiTransactions.length)}
                </strong>{' '}
                of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {filteredEmiTransactions.length}
                </strong>{' '}
                repayments
              </div>

              {/* Rows Per Page & Page Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Rows:</span>
                  <select
                    value={emiPageSize}
                    onChange={e => {
                      setEmiPageSize(Number(e.target.value));
                      setEmiCurrentPage(1);
                    }}
                    style={{
                      background: 'var(--bg-input)',
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
                    onClick={() => setEmiCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeEmiCurrentPage === 1}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: safeEmiCurrentPage === 1 ? 'transparent' : 'var(--bg-secondary)',
                      color: safeEmiCurrentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                      cursor: safeEmiCurrentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    Prev
                  </button>

                  {Array.from({ length: emiTotalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === emiTotalPages || Math.abs(page - safeEmiCurrentPage) <= 1)
                    .map((page, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && page - prev > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span style={{ padding: '0 4px', color: 'var(--text-muted)' }}>...</span>}
                          <button
                            type="button"
                            onClick={() => setEmiCurrentPage(page)}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 6,
                              border: '1px solid',
                              borderColor: page === safeEmiCurrentPage ? 'var(--accent-indigo)' : 'var(--border-color)',
                              background: page === safeEmiCurrentPage ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                              color: page === safeEmiCurrentPage ? '#FFF' : 'var(--text-primary)',
                              fontWeight: page === safeEmiCurrentPage ? 700 : 500,
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
                    onClick={() => setEmiCurrentPage(p => Math.min(emiTotalPages, p + 1))}
                    disabled={safeEmiCurrentPage === emiTotalPages}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: safeEmiCurrentPage === emiTotalPages ? 'transparent' : 'var(--bg-secondary)',
                      color: safeEmiCurrentPage === emiTotalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                      cursor: safeEmiCurrentPage === emiTotalPages ? 'not-allowed' : 'pointer',
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

      {/* Modal: Add New Loan (Requirements 2 & 8: Name, Loan Number, Lender, Due Day, Principal, EMI, Remaining, Start Date, End Date, Description, Net Worth) */}
      {isAddLoanOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 540 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Add New Loan / Account</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configure loan details, monthly due date & commitments</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddLoanOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddLoanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Row 1: Loan Name & Loan Number */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN / ACCOUNT NAME *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Home Loan, Car Loan"
                    value={loanName}
                    onChange={e => setLoanName(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN NUMBER / ACC NO
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HL-849201"
                    value={loanNumber}
                    onChange={e => setLoanNumber(e.target.value)}
                    className="modal-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              {/* Row 2: Lender / Bank & Monthly Due Day */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LENDER / BANK NAME *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBI, HDFC, ICICI"
                    value={loanLender}
                    onChange={e => setLoanLender(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    MONTHLY DUE DATE (1-31) *
                  </label>
                  <select
                    value={loanDueDay}
                    onChange={e => setLoanDueDay(Number(e.target.value))}
                    className="modal-select"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>
                        {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Loan Amount, EMI Amount, Remaining Amount */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN AMOUNT ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 500000"
                    value={loanAmount}
                    onChange={e => setLoanAmount(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    EMI AMOUNT ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 15000"
                    value={loanEmi}
                    onChange={e => setLoanEmi(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    REMAINING ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 350000"
                    value={loanRemaining}
                    onChange={e => setLoanRemaining(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Row 4: Start Date & End Date */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    START DATE *
                  </label>
                  <input
                    type="date"
                    value={loanStartDate}
                    onChange={e => setLoanStartDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    END DATE *
                  </label>
                  <input
                    type="date"
                    value={loanEndDate}
                    onChange={e => setLoanEndDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Row 5: Description */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  DESCRIPTION / PURPOSE
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Purpose of loan, collateral details, or repayment account notes"
                  value={loanDescription}
                  onChange={e => setLoanDescription(e.target.value)}
                  className="modal-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Checkbox: Calculate this loan towards Net Worth */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                  marginTop: 2
                }}
              >
                <input
                  type="checkbox"
                  id="addLoanNetWorth"
                  checked={loanIncludeNetWorth}
                  onChange={e => setLoanIncludeNetWorth(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366F1' }}
                />
                <label
                  htmlFor="addLoanNetWorth"
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', margin: 0, userSelect: 'none' }}
                >
                  Calculate this loan towards Net Worth
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsAddLoanOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Existing Loan (Requirement 3) */}
      {isEditLoanOpen && editingLoan && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 540 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Edit Loan Details</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Update loan info, monthly due date & repayment status</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditLoanOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditLoanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Row 1: Loan Name & Loan Number */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN / ACCOUNT NAME *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN NUMBER / ACC NO
                  </label>
                  <input
                    type="text"
                    value={editLoanNumber}
                    onChange={e => setEditLoanNumber(e.target.value)}
                    className="modal-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              {/* Row 2: Lender & Monthly Due Date */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LENDER / BANK NAME *
                  </label>
                  <input
                    type="text"
                    value={editLender}
                    onChange={e => setEditLender(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    MONTHLY DUE DATE (1-31) *
                  </label>
                  <select
                    value={editDueDay}
                    onChange={e => setEditDueDay(Number(e.target.value))}
                    className="modal-select"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>
                        {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Principal, EMI, Remaining */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN AMOUNT ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    EMI AMOUNT ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editEmi}
                    onChange={e => setEditEmi(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    REMAINING ({currencyService.getActiveCurrencyCode()}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editRemaining}
                    onChange={e => setEditRemaining(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Row 4: Start Date, End Date, Status */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    START DATE *
                  </label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    END DATE *
                  </label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN STATUS *
                  </label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="active">Active (Repaying)</option>
                    <option value="closed">Closed / Paid Off</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Description */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  DESCRIPTION / PURPOSE
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="modal-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Checkbox: Calculate this loan towards Net Worth */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                  marginTop: 2
                }}
              >
                <input
                  type="checkbox"
                  id="editLoanNetWorth"
                  checked={editIncludeNetWorth}
                  onChange={e => setEditIncludeNetWorth(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366F1' }}
                />
                <label
                  htmlFor="editLoanNetWorth"
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', margin: 0, userSelect: 'none' }}
                >
                  Calculate this loan towards Net Worth
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsEditLoanOpen(false)}
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

      {/* Modal: Pay Monthly EMI */}
      {isPayEmiOpen && payingLoan && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 440 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Record EMI Payment</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>For {payingLoan.name}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayEmiOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePayEmiSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  EMI AMOUNT ({currencyService.getActiveCurrencyCode()})
                </label>
                <input
                  type="number"
                  step="any"
                  value={payEmiAmount}
                  onChange={e => setPayEmiAmount(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  PAYMENT MODE
                </label>
                <select
                  value={payEmiMode}
                  onChange={e => setPayEmiMode(e.target.value)}
                  className="modal-select"
                >
                  <option value="bank_transfer">Bank Auto-Debit / ECS</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="upi">UPI / GPay</option>
                  <option value="debit">Debit Card</option>
                </select>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: 12, color: 'var(--text-secondary)' }}>
                This logs an expense to your actual database transactions and marks 1 additional month paid on this loan.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => setIsPayEmiOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={paySaving}
                >
                  {paySaving ? 'Recording...' : 'Confirm EMI Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
