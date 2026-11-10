import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Landmark,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  TrendingDown,
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
  RotateCcw,
  Users,
  Printer
} from 'lucide-react';
import { printLoanDetailsPdf } from '../services/loanPrintService';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { getUserStorageKey } from '../services/storageHelper';
import { playNotificationChime } from '../services/soundService';
import { useTheme } from '../context/ThemeContext';
import {
  type LoanModel,
  type MonthEmiScheduleItem,
  calculateEMI,
  calculateLoanTenureMonths,
  calculateLoanInterestAmount,
  calculateLoanEMIs,
  generateEmiSchedule,
  DEFAULT_LOANS,
  loanService
} from '../services/loanService';
import { cardService, type CardModel } from '../services/cardService';
import { bankAccountService } from '../services/bankAccountService';

export type { LoanModel, MonthEmiScheduleItem };
export { calculateEMI, calculateLoanTenureMonths, calculateLoanInterestAmount, calculateLoanEMIs, generateEmiSchedule, DEFAULT_LOANS };


// Helper to render formatted loan descriptions (bold tags and color spans)
const renderFormattedDescription = (desc: string) => {
  if (!desc) return null;

  // Split by supported tags <b>...</b>, <strong>...</strong>, and <span style="color: ...">...</span>
  // Also supports [b]...[/b] and [color=...][/color]
  const clean = desc
    .replace(/\[b\]/gi, '<b>')
    .replace(/\[\/b\]/gi, '</b>')
    .replace(/\[color=([^\]]+)\]/gi, '<span style="color: $1">')
    .replace(/\[\/color\]/gi, '</span>');

  const parts = clean.split(/(<[^>]+>[^<]*<\/[^>]+>)/g);

  return (
    <span style={{ display: 'inline-block', lineHeight: 1.5 }}>
      {parts.map((part, idx) => {
        const colorMatch = part.match(/<span\s+style="color:\s*([^"]+)">([\s\S]*?)<\/span>/i);
        if (colorMatch) {
          return <span key={idx} style={{ color: colorMatch[1] }}>{colorMatch[2]}</span>;
        }
        const boldMatch = part.match(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/i);
        if (boldMatch) {
          return <strong key={idx} style={{ fontWeight: 800, color: 'inherit' }}>{boldMatch[1]}</strong>;
        }
        return part;
      })}
    </span>
  );
};

export interface LoansEmiViewProps {
  initialLoanId?: string | null;
  onClearInitialLoanId?: () => void;
}

export const LoansEmiView: React.FC<LoansEmiViewProps> = ({ initialLoanId, onClearInitialLoanId }) => {
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
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(initialLoanId || null);

  useEffect(() => {
    if (initialLoanId) {
      setSelectedLoanId(initialLoanId);
      setTimeout(() => {
        const el = document.getElementById(`loan-card-${initialLoanId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      onClearInitialLoanId?.();
    }
  }, [initialLoanId, onClearInitialLoanId]);

  // Sorting state for active loan cards
  
  // Format Toolbar Helpers for Rich Description
  const insertFormatting = (
    currentText: string,
    setText: (s: string) => void,
    tagOpen: string,
    tagClose: string,
    sampleText: string = 'text'
  ) => {
    setText(currentText ? `${currentText} ${tagOpen}${sampleText}${tagClose}` : `${tagOpen}${sampleText}${tagClose}`);
  };

  const [loanSortOption, setLoanSortOption] = useState<string>('latest');

  // Sorted loans list based on user selection
  const sortedLoans = useMemo(() => {
    const list = [...loans];
    list.sort((a, b) => {
      const metricsA = calculateLoanEMIs(a);
      const metricsB = calculateLoanEMIs(b);

      switch (loanSortOption) {
        case 'outstanding_high':
          return metricsB.remaining - metricsA.remaining;
        case 'outstanding_low':
          return metricsA.remaining - metricsB.remaining;
        case 'repaid_high':
          return (metricsB.paidPct || 0) - (metricsA.paidPct || 0);
        case 'repaid_low':
          return (metricsA.paidPct || 0) - (metricsB.paidPct || 0);
        case 'rate_high':
          return (Number(b.interestRate) || 0) - (Number(a.interestRate) || 0);
        case 'rate_low':
          return (Number(a.interestRate) || 0) - (Number(b.interestRate) || 0);
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'amount_high':
          return (Number(b.principal) || 0) - (Number(a.principal) || 0);
        case 'amount_low':
          return (Number(a.principal) || 0) - (Number(b.principal) || 0);
        case 'monthly_high':
          return metricsB.emi - metricsA.emi;
        case 'monthly_low':
          return metricsA.emi - metricsB.emi;
        case 'emis_high':
          return metricsB.remainingEmis - metricsA.remainingEmis;
        case 'emis_low':
          return metricsA.remainingEmis - metricsB.remainingEmis;
        case 'due_day':
          return (a.dueDay || 5) - (b.dueDay || 5);
        case 'oldest':
          return new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime();
        case 'latest':
        default:
          return new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime();
      }
    });
    return list;
  }, [loans, loanSortOption]);

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
  const [loanPaidMonths, setLoanPaidMonths] = useState<number>(0);
  const [loanRepaymentSource, setLoanRepaymentSource] = useState<'bank' | 'credit_card'>('bank');
  const [loanLinkedCardId, setLoanLinkedCardId] = useState<string>('');
  const [loanIsForSomeoneElse, setLoanIsForSomeoneElse] = useState<boolean>(false);
  const [loanBorrowerName, setLoanBorrowerName] = useState<string>('');
  const [loanBorrowerPhone, setLoanBorrowerPhone] = useState<string>('');
  const [loanBorrowerNotes, setLoanBorrowerNotes] = useState<string>('');

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
  const [editPaidMonths, setEditPaidMonths] = useState<number>(0);
  const [editRepaymentSource, setEditRepaymentSource] = useState<'bank' | 'credit_card'>('bank');
  const [editLinkedCardId, setEditLinkedCardId] = useState<string>('');
  const [editIsForSomeoneElse, setEditIsForSomeoneElse] = useState<boolean>(false);
  const [editBorrowerName, setEditBorrowerName] = useState<string>('');
  const [editBorrowerPhone, setEditBorrowerPhone] = useState<string>('');
  const [editBorrowerNotes, setEditBorrowerNotes] = useState<string>('');

  // User Credit Cards for linking
  const [userCards, setUserCards] = useState<CardModel[]>(() => cardService.getCards(user?.email));

  useEffect(() => {
    const handleCards = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setUserCards(e.detail);
      } else {
        setUserCards(cardService.getCards(user?.email));
      }
    };
    window.addEventListener('fintrack-cards-updated', handleCards);
    return () => window.removeEventListener('fintrack-cards-updated', handleCards);
  }, [user]);

  useEffect(() => {
    const handleLoansChanged = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setLoans(e.detail);
      } else {
        setLoans(loanService.getLoans(user?.email));
      }
    };
    window.addEventListener('fintrack-loans-changed', handleLoansChanged);
    return () => window.removeEventListener('fintrack-loans-changed', handleLoansChanged);
  }, [user]);

  // Sending email reminder loader
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Pay EMI Modal
  const [isPayEmiOpen, setIsPayEmiOpen] = useState<boolean>(false);
  const [loanToDelete, setLoanToDelete] = useState<LoanModel | null>(null);
  const [payingLoan, setPayingLoan] = useState<LoanModel | null>(null);
  const [payEmiAmount, setPayEmiAmount] = useState<string>('');
  const [payEmiDate, setPayEmiDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [recordTransaction, setRecordTransaction] = useState<boolean>(true);
  const [payEmiMode, setPayEmiMode] = useState<string>('upi');
  const [paySaving, setPaySaving] = useState<boolean>(false);

  useEffect(() => {
    if (payingLoan) {
      setRecordTransaction(payingLoan.repaymentSource !== 'credit_card');
    }
  }, [payingLoan]);

  // Dynamic height tracking for Loan Cards Section
  const loanCardsContainerRef = useRef<HTMLDivElement>(null);
  const [cardsContainerHeight, setCardsContainerHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!loanCardsContainerRef.current) return;
    const updateHeight = () => {
      if (loanCardsContainerRef.current) {
        setCardsContainerHeight(loanCardsContainerRef.current.offsetHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(() => {
      updateHeight();
    });
    ro.observe(loanCardsContainerRef.current);
    window.addEventListener('resize', updateHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [loans, selectedLoanId]);



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
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);
  const emiDateRef = useRef<HTMLDivElement>(null);
  const emiAmountRef = useRef<HTMLDivElement>(null);

  const [emiCurrentPage, setEmiCurrentPage] = useState<number>(1);
  const [emiPageSize, setEmiPageSize] = useState<number>(10);

  const saveLoans = (newLoans: LoanModel[]) => {
    setLoans(newLoans);
    loanService.saveLoans(newLoans, user?.email);
  };

  const fetchTransactions = async () => {
    try {
      if (actualTransactions.length === 0) {
        setLoading(true);
      }
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
      const txToDelete = actualTransactions.find(t => t.id === id);
      const res = await api.delete(`/transactions/${id}`);
      if (res.data?.success) {
        if (txToDelete) {
          bankAccountService.applyTransactionImpact(txToDelete, true, user?.email);
        }
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

    const initialPaidCount = Math.max(0, Number(loanPaidMonths) || 0);
    const initialPaidIndices = Array.from({ length: initialPaidCount }, (_, i) => i + 1);
    const calculatedRem = !isNaN(remaining) && remaining >= 0
      ? remaining
      : Math.max(0, principal - (initialPaidCount * (!isNaN(emi) && emi >= 0 ? emi : 0)));

    const linkedCard = userCards.find(c => c.id === loanLinkedCardId);
    const newLoan: LoanModel = {
      id: `loan-${Date.now()}`,
      name: loanName.trim(),
      loanNumber: loanNumber.trim() || `LN-${Math.floor(100000 + Math.random() * 900000)}`,
      lender: loanRepaymentSource === 'credit_card' && linkedCard ? `${linkedCard.name} (EMI)` : (loanLender.trim() || 'Bank / Lender'),
      dueDay: Number(loanDueDay) || 5,
      principal: principal,
      emiAmount: !isNaN(emi) && emi >= 0 ? emi : 0,
      remainingAmount: calculatedRem,
      startDate: loanStartDate,
      endDate: loanEndDate,
      description: loanDescription.trim(),
      includeInNetWorth: loanIncludeNetWorth,
      type: loanRepaymentSource === 'credit_card' ? 'Credit Card EMI' : 'Other',
      interestRate: 0,
      tenureMonths: tenureMonths,
      paidMonths: initialPaidCount,
      paidScheduleIndices: initialPaidIndices,
      status: (calculatedRem <= 0 || (tenureMonths > 0 && initialPaidCount >= tenureMonths)) ? 'closed' : 'active',
      repaymentSource: loanRepaymentSource,
      linkedCardId: loanRepaymentSource === 'credit_card' ? loanLinkedCardId : undefined,
      linkedCardName: loanRepaymentSource === 'credit_card' && linkedCard ? linkedCard.name : undefined,
      isForSomeoneElse: loanIsForSomeoneElse,
      borrowerName: loanIsForSomeoneElse ? loanBorrowerName.trim() : undefined,
      borrowerPhone: loanIsForSomeoneElse ? loanBorrowerPhone.trim() : undefined,
      borrowerNotes: loanIsForSomeoneElse ? loanBorrowerNotes.trim() : undefined,
      receivedScheduleIndices: []
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
    setLoanPaidMonths(0);
    setLoanIsForSomeoneElse(false);
    setLoanBorrowerName('');
    setLoanBorrowerPhone('');
    setLoanBorrowerNotes('');
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
    setEditPaidMonths(loan.paidMonths || (Array.isArray(loan.paidScheduleIndices) ? loan.paidScheduleIndices.length : 0));
    setEditRepaymentSource(loan.repaymentSource || 'bank');
    setEditLinkedCardId(loan.linkedCardId || '');
    setEditIsForSomeoneElse(Boolean(loan.isForSomeoneElse));
    setEditBorrowerName(loan.borrowerName || '');
    setEditBorrowerPhone(loan.borrowerPhone || '');
    setEditBorrowerNotes(loan.borrowerNotes || '');
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
    const newPaidCount = Math.max(0, Number(editPaidMonths) || 0);

    const updatedLoans = loans.map(l => {
      if (l.id === editingLoan.id) {
        let indices = Array.isArray(l.paidScheduleIndices) ? [...l.paidScheduleIndices] : [];
        if (newPaidCount !== l.paidMonths || indices.length !== newPaidCount) {
          indices = Array.from({ length: newPaidCount }, (_, i) => i + 1);
        }
        const isNowClosed = editStatus === 'closed' || remaining <= 0 || (tenureMonths > 0 && newPaidCount >= tenureMonths);
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
          paidMonths: newPaidCount,
          paidScheduleIndices: indices,
          status: isNowClosed ? ('closed' as const) : ('active' as const),
          repaymentSource: editRepaymentSource,
          linkedCardId: editRepaymentSource === 'credit_card' ? editLinkedCardId : undefined,
          linkedCardName: editRepaymentSource === 'credit_card' ? (userCards.find(c => c.id === editLinkedCardId)?.name || l.linkedCardName) : undefined,
          isForSomeoneElse: editIsForSomeoneElse,
          borrowerName: editIsForSomeoneElse ? editBorrowerName.trim() : undefined,
          borrowerPhone: editIsForSomeoneElse ? editBorrowerPhone.trim() : undefined,
          borrowerNotes: editIsForSomeoneElse ? editBorrowerNotes.trim() : undefined,
          receivedScheduleIndices: l.receivedScheduleIndices || []
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

  // Mark / Unmark individual schedule item as Paid without creating any expense transaction in the ledger
  const handleToggleSchedulePaid = (loanId: string, monthIndex: number) => {
    const targetLoan = loans.find(l => l.id === loanId);
    if (!targetLoan) return;

    const metrics = calculateLoanEMIs(targetLoan);
    let currentIndices: number[] = [];
    if (Array.isArray(targetLoan.paidScheduleIndices)) {
      currentIndices = [...targetLoan.paidScheduleIndices];
    } else {
      currentIndices = Array.from({ length: metrics.completedEmis }, (_, i) => i + 1);
    }

    let newIndices: number[];
    const isAlreadyPaid = currentIndices.includes(monthIndex);
    if (isAlreadyPaid) {
      newIndices = currentIndices.filter(idx => idx !== monthIndex);
    } else {
      newIndices = [...currentIndices, monthIndex].sort((a, b) => a - b);
    }

    const newPaidCount = newIndices.length;
    const newRemaining = Math.max(0, targetLoan.principal - (newPaidCount * metrics.emi));
    const isNowClosed = newRemaining <= 0 || (metrics.totalEmis > 0 && newPaidCount >= metrics.totalEmis);

    const updated = loans.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          paidMonths: newPaidCount,
          paidScheduleIndices: newIndices,
          remainingAmount: newRemaining,
          status: isNowClosed ? ('closed' as const) : ('active' as const)
        };
      }
      return l;
    });

    saveLoans(updated);
    setBannerMsg({
      type: 'success',
      text: isAlreadyPaid
        ? `Month #${monthIndex} marked as pending.`
        : `Month #${monthIndex} marked as Paid (No transaction added to ledger).`
    });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3000);
  };

  // Mark all past pending EMIs as Paid in bulk without creating expense transactions in the ledger
  const handleMarkAllPastDueAsPaid = (loanId: string) => {
    const targetLoan = loans.find(l => l.id === loanId);
    if (!targetLoan) return;

    const metrics = calculateLoanEMIs(targetLoan);
    const schedule = generateEmiSchedule(targetLoan, metrics);
    const pastPendingIndices = schedule.filter(s => s.status === 'pending').map(s => s.index);

    if (pastPendingIndices.length === 0) return;

    let currentIndices: number[] = [];
    if (Array.isArray(targetLoan.paidScheduleIndices)) {
      currentIndices = [...targetLoan.paidScheduleIndices];
    } else {
      currentIndices = Array.from({ length: metrics.completedEmis }, (_, i) => i + 1);
    }

    const setUnion = new Set([...currentIndices, ...pastPendingIndices]);
    const newIndices = Array.from(setUnion).sort((a, b) => a - b);

    const newPaidCount = newIndices.length;
    const newRemaining = Math.max(0, targetLoan.principal - (newPaidCount * metrics.emi));
    const isNowClosed = newRemaining <= 0 || (metrics.totalEmis > 0 && newPaidCount >= metrics.totalEmis);

    const updated = loans.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          paidMonths: newPaidCount,
          paidScheduleIndices: newIndices,
          remainingAmount: newRemaining,
          status: isNowClosed ? ('closed' as const) : ('active' as const)
        };
      }
      return l;
    });

    saveLoans(updated);
    setBannerMsg({
      type: 'success',
      text: `Marked ${pastPendingIndices.length} pending EMI(s) as Paid without logging transactions!`
    });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Mark / Unmark individual schedule item as Received from the borrower
  const handleToggleScheduleReceived = (loanId: string, monthIndex: number) => {
    const targetLoan = loans.find(l => l.id === loanId);
    if (!targetLoan) return;

    let currentIndices: number[] = Array.isArray(targetLoan.receivedScheduleIndices)
      ? [...targetLoan.receivedScheduleIndices]
      : [];

    let newIndices: number[];
    const isAlreadyReceived = currentIndices.includes(monthIndex);
    if (isAlreadyReceived) {
      newIndices = currentIndices.filter(idx => idx !== monthIndex);
    } else {
      newIndices = [...currentIndices, monthIndex].sort((a, b) => a - b);
    }

    const borrower = targetLoan.borrowerName || 'Borrower';
    const updated = loans.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          receivedScheduleIndices: newIndices
        };
      }
      return l;
    });

    saveLoans(updated);
    setBannerMsg({
      type: 'success',
      text: isAlreadyReceived
        ? `Month #${monthIndex} marked as pending from ${borrower}.`
        : `Month #${monthIndex} marked as Received from ${borrower}!`
    });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3000);
  };

  // Mark all past due EMIs as received from the borrower in bulk
  const handleMarkAllPastDueAsReceived = (loanId: string) => {
    const targetLoan = loans.find(l => l.id === loanId);
    if (!targetLoan) return;

    const metrics = calculateLoanEMIs(targetLoan);
    const schedule = generateEmiSchedule(targetLoan, metrics);
    const pastPendingIndices = schedule.filter(s => s.receivedStatus === 'pending').map(s => s.index);

    if (pastPendingIndices.length === 0) return;

    let currentIndices: number[] = Array.isArray(targetLoan.receivedScheduleIndices)
      ? [...targetLoan.receivedScheduleIndices]
      : [];

    const setUnion = new Set([...currentIndices, ...pastPendingIndices]);
    const newIndices = Array.from(setUnion).sort((a, b) => a - b);
    const borrower = targetLoan.borrowerName || 'Borrower';

    const updated = loans.map(l => {
      if (l.id === loanId) {
        return {
          ...l,
          receivedScheduleIndices: newIndices
        };
      }
      return l;
    });

    saveLoans(updated);
    setBannerMsg({
      type: 'success',
      text: `Marked ${pastPendingIndices.length} month(s) as Received from ${borrower}!`
    });
    playNotificationChime();
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Open Delete Confirmation Modal on screen (No browser popup)
  const handleDeleteLoan = (loanId: string, name: string) => {
    const loan = loans.find(l => l.id === loanId);
    if (loan) {
      setLoanToDelete(loan);
    } else {
      setLoanToDelete({ id: loanId, name } as any);
    }
  };

  const confirmDeleteLoan = () => {
    if (!loanToDelete) return;
    const updated = loans.filter(l => l.id !== loanToDelete.id);
    saveLoans(updated);
    if (selectedLoanId === loanToDelete.id) {
      setSelectedLoanId(null);
    }
    setBannerMsg({
      type: 'success',
      text: `Loan "${loanToDelete.name}" removed successfully.`
    });
    playNotificationChime();
    setLoanToDelete(null);
    setTimeout(() => setBannerMsg(null), 3500);
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

  // Pay EMI Submission -> Records to actual database /api/transactions (or marks paid only)
  const handlePayEmiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;

    const amt = parseFloat(payEmiAmount);
    if (!amt || amt <= 0) return;

    setPaySaving(true);
    try {
      if (recordTransaction) {
        const baseAmount = currencyService.convertToBase(amt);

        const payload = {
          date: payEmiDate || new Date().toISOString().substring(0, 10),
          type: 'expense',
          category: 'Debt Repayment',
          subcategory: `${payingLoan.type || 'Loan'} EMI`,
          description: `EMI payment for ${payingLoan.name} (${payingLoan.lender})`,
          amount: baseAmount,
          paymentMode: payEmiMode
        };

        const res = await api.post('/transactions', payload);
        if (!res.data || !res.data.success) {
          throw new Error('Failed to record transaction');
        }
        bankAccountService.applyTransactionImpact(payload, false, user?.email);
      }

      const metrics = calculateLoanEMIs(payingLoan);
      let currentIndices: number[] = [];
      if (Array.isArray(payingLoan.paidScheduleIndices)) {
        currentIndices = [...payingLoan.paidScheduleIndices];
      } else {
        currentIndices = Array.from({ length: metrics.completedEmis }, (_, i) => i + 1);
      }

      const schedule = generateEmiSchedule(payingLoan, metrics);
      const nextPendingItem = schedule.find(s => s.status !== 'paid');
      const nextIndex = nextPendingItem ? nextPendingItem.index : (metrics.completedEmis + 1);

      if (!currentIndices.includes(nextIndex) && nextIndex <= metrics.totalEmis) {
        currentIndices.push(nextIndex);
        currentIndices.sort((a, b) => a - b);
      }

      const updated = loans.map(l => {
        if (l.id === payingLoan.id) {
          const currentRem = typeof l.remainingAmount === 'number' && !isNaN(l.remainingAmount)
            ? l.remainingAmount
            : l.principal;
          const newRemaining = Math.max(0, currentRem - amt);
          const isNowClosed = newRemaining <= 0 || currentIndices.length >= metrics.totalEmis;
          return {
            ...l,
            paidMonths: currentIndices.length,
            paidScheduleIndices: currentIndices,
            remainingAmount: newRemaining,
            status: isNowClosed ? ('closed' as const) : l.status
          };
        }
        return l;
      });
      saveLoans(updated);

      setBannerMsg({
        type: 'success',
        text: recordTransaction
          ? `EMI payment of ${currencyService.format(amt)} for "${payingLoan.name}" recorded on ${payEmiDate} and loan balance updated!`
          : `EMI marked as Paid for "${payingLoan.name}". Balance updated without creating a transaction!`
      });
      playNotificationChime();
      setTimeout(() => setBannerMsg(null), 4000);
      setIsPayEmiOpen(false);
      setPayingLoan(null);
      if (recordTransaction) {
        await fetchTransactions();
      }
    } catch {
      alert('Failed to record EMI payment.');
    } finally {
      setPaySaving(false);
    }
  };



  // Ref for loan details inspector panel to smoothly scroll into view on mobile
  const loanDetailsInspectorRef = useRef<HTMLDivElement>(null);

  const handleCloseLoanDetails = () => {
    const currentId = selectedLoanId;
    setSelectedLoanId(null);
    if (currentId) {
      setTimeout(() => {
        const el = document.getElementById(`loan-card-${currentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (loanCardsContainerRef.current) {
          loanCardsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  };

  const handleSelectLoan = (loanId: string) => {
    if (selectedLoanId === loanId) {
      handleCloseLoanDetails();
    } else {
      setSelectedLoanId(loanId);
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        setTimeout(() => {
          loanDetailsInspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    }
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
              <p className="page-subtitle hide-on-mobile" style={{ margin: '2px 0 0' }}>
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

      {/* KPI Stats Grid (Total Borrowed, Total Repaid, Outstanding, Monthly EMI - 4 Balanced Equal Cards) */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {/* 1. Total Borrowed Principal */}
        <div className="kpi-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TOTAL BORROWED</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', flexShrink: 0 }}>
              <Landmark size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currencyService.format(metrics.totalPrincipal)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Across {loans.length} accounts
          </div>
        </div>

        {/* 2. Paid / Repaid Amount + Progress Bar */}
        <div className="kpi-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TOTAL REPAID</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', flexShrink: 0 }}>
              {metrics.payoffProgress}%
            </span>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#10B981', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currencyService.format(metrics.totalPaid)}
          </div>
          <div style={{ width: '100%', height: 4, background: 'var(--border-color)', borderRadius: 999, marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: `${metrics.payoffProgress}%`, height: '100%', background: '#10B981', borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics.payoffProgress}% of debt cleared
          </div>
        </div>

        {/* 3. Total Outstanding Balance */}
        <div className="kpi-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>OUTSTANDING</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', flexShrink: 0 }}>
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#EF4444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currencyService.format(metrics.totalOutstanding)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics.netWorthLiabilities !== metrics.totalOutstanding
              ? `${currencyService.format(metrics.netWorthLiabilities)} in Net Worth`
              : 'Remaining debt balance'}
          </div>
        </div>

        {/* 4. Monthly EMI Outflow */}
        <div className="kpi-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>MONTHLY EMI</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B', flexShrink: 0 }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#F59E0B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currencyService.format(metrics.totalMonthlyEmi)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Total monthly debit
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
            <span className="hide-on-mobile" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Click any loan card to open the interactive EMI schedule split inspector
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mobile Sort Icon Button (Right side of title row) */}
            <div className="hide-on-desktop" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
                title="Sort Loans"
              >
                <SlidersHorizontal size={14} />
              </button>
              <select
                value={loanSortOption}
                onChange={e => setLoanSortOption(e.target.value)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%'
                }}
              >
                <option value="latest">⏱️ Latest Added</option>
                <option value="oldest">🕰️ Oldest Added</option>
                <option value="outstanding_high">🔴 Outstanding: High to Low</option>
                <option value="outstanding_low">🟢 Outstanding: Low to High</option>
                <option value="repaid_high">🏆 Most Repaid %</option>
                <option value="repaid_low">⏳ Least Repaid %</option>
                <option value="amount_high">💰 Principal: High to Low</option>
                <option value="amount_low">🪙 Principal: Low to High</option>
                <option value="monthly_high">📈 Monthly EMI: High to Low</option>
                <option value="monthly_low">📉 Monthly EMI: Low to High</option>
                <option value="due_day">🗓️ Due Date</option>
                <option value="name_asc">🔤 Loan Name: A-Z</option>
              </select>
            </div>

            {selectedLoanId && (
              <button
                type="button"
                onClick={handleCloseLoanDetails}
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
                <span className="hide-on-mobile">Close Split Screen</span>
              </button>
            )}
          </div>
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
          <div className={`loans-content-split-container ${selectedLoanId ? 'has-selected-loan' : ''}`} style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Left Box: Loans Cards Grid */}
            <div
              ref={loanCardsContainerRef}
              className="loans-cards-column"
              style={{
                flex: selectedLoanId ? '1 1 56%' : '1 1 100%',
                minWidth: 0,
                transition: 'all 0.3s ease'
              }}
            >
              {/* Sorting Toolbar (Responsive, No Overflow, More Options) - Desktop only */}
              <div
                className="loans-sort-toolbar hide-on-mobile"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 10
                }}
              >
                <div className="loans-sort-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SlidersHorizontal size={14} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    SORT LOANS:
                  </span>
                  <select
                    value={loanSortOption}
                    onChange={e => setLoanSortOption(e.target.value)}
                    className="modal-select loans-sort-select"
                    style={{
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      width: 'auto',
                      minWidth: 200,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="latest">⏱️ Latest Added (Newest)</option>
                    <option value="oldest">🕰️ Oldest Added</option>
                    <option value="outstanding_high">🔴 Outstanding: Highest First</option>
                    <option value="outstanding_low">🟢 Outstanding: Lowest First</option>
                    <option value="repaid_high">🏆 Most Repaid % (Highest Progress)</option>
                    <option value="repaid_low">⏳ Least Repaid % (Lowest Progress)</option>
                    <option value="amount_high">💰 Principal: Highest First</option>
                    <option value="amount_low">🪙 Principal: Lowest First</option>
                    <option value="monthly_high">📈 Monthly EMI: Highest First</option>
                    <option value="monthly_low">📉 Monthly EMI: Lowest First</option>
                    <option value="rate_high">📊 Interest Rate: Highest First</option>
                    <option value="rate_low">📉 Interest Rate: Lowest First</option>
                    <option value="emis_high">📅 Remaining EMIs: Most First</option>
                    <option value="emis_low">⚡ Remaining EMIs: Fewest First</option>
                    <option value="due_day">🗓️ Due Date: Earliest in Month</option>
                    <option value="name_asc">🔤 Loan Name: A to Z</option>
                    <option value="name_desc">🔤 Loan Name: Z to A</option>
                  </select>
                </div>
                <div className="loans-count-label" style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  Showing <strong style={{ color: 'var(--text-primary)' }}>{sortedLoans.length}</strong> active loans
                </div>
              </div>

              <div
                className="loans-grid-container"
                style={{
                  display: 'grid',
                  gridTemplateColumns: selectedLoanId ? 'repeat(auto-fit, minmax(310px, 1fr))' : 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: 16
                }}
              >
                {sortedLoans.map(loan => {
                  const emiInfo = calculateLoanEMIs(loan);
                  const isSelected = selectedLoanId === loan.id;
                  const isIncludedInNetWorth = loan.includeInNetWorth !== false;
                  const todayDay = new Date().getDate();
                  const dueDay = loan.dueDay || 5;
                  const diffDays = dueDay - todayDay;

                  return (
                    <div
                      key={loan.id}
                      id={`loan-card-${loan.id}`}
                      className="summary-card loan-card-item"
                      onClick={() => handleSelectLoan(loan.id)}
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
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="loan-badges-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {isSelected && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#3B82F6', color: '#FFF', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                                    👁️ ACTIVE / OPENED
                                  </span>
                                )}
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

                              {loan.isForSomeoneElse && (
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.15)', color: '#818CF8', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  👤 For: {loan.borrowerName || 'Other Person'}
                                </span>
                              )}
                            </div>

                            <h3 className="loan-card-title" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 2px' }}>
                              {loan.name}
                            </h3>

                            <div className="loan-lender-info" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Lender: <strong style={{ color: 'var(--text-primary)' }}>{loan.lender}</strong>
                              {loan.repaymentSource === 'credit_card' && (
                                <div style={{ marginTop: 4 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: '#38BDF8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: 6 }}>
                                    💳 Billed to: {loan.linkedCardName || 'Credit Card'}
                                  </span>
                                </div>
                              )}
                              {loan.description && (
                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                                  {renderFormattedDescription(loan.description)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Print, Edit, Delete */}
                          <div className="loan-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                printLoanDetailsPdf(loan, user?.name, user?.email);
                              }}
                              title="Print / Save Loan Details as PDF"
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
                              <Printer size={14} />
                            </button>
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
                          className="loan-due-row"
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
                        <div className="loan-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
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
                        <div className="loan-emis-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8, padding: '8px 10px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.15)', textAlign: 'center' }}>
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
                        <div className="loan-interest-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Calculated Total Interest:</span>
                          <strong style={{ color: '#EF4444', fontWeight: 800 }}>
                            {currencyService.format(emiInfo.totalInterest)}
                          </strong>
                        </div>

                        {/* Progress Bar */}
                        <div className="loan-progress-box" style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            <span>Paid: <strong>{currencyService.format(emiInfo.paidPrincipal)}</strong> ({emiInfo.paidPct}%)</span>
                            <span>{emiInfo.remainingEmis} EMIs left</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${emiInfo.paidPct}%`, height: '100%', background: 'linear-gradient(90deg, #6366F1, #10B981)', borderRadius: 999 }} />
                          </div>
                        </div>

                        {/* Third-Party Borrower Repayment Metrics */}
                        {loan.isForSomeoneElse && (
                          <div className="loan-reimburse-box" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: emiInfo.pendingFromBorrower > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)', border: emiInfo.pendingFromBorrower > 0 ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)', fontSize: 11 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                👤 Recv'd from <strong>{loan.borrowerName || 'Borrower'}</strong>:
                              </span>
                              <strong style={{ color: '#10B981', fontWeight: 800 }}>
                                {currencyService.format(emiInfo.totalReceivedAmount)} ({emiInfo.receivedEmisCount}/{emiInfo.totalEmis})
                              </strong>
                            </div>
                            {emiInfo.pendingFromBorrower > 0 ? (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: '1px dashed rgba(245, 158, 11, 0.25)' }}>
                                <span style={{ color: '#F59E0B', fontWeight: 700 }}>⚠️ Owed by {loan.borrowerName || 'Person'}:</span>
                                <strong style={{ color: '#F59E0B', fontWeight: 800 }}>{currencyService.format(emiInfo.pendingFromBorrower)}</strong>
                              </div>
                            ) : (
                              <div style={{ marginTop: 3, fontSize: 10, color: '#10B981', fontWeight: 600 }}>
                                ✓ All bank payments reimbursed
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div
                        className="loan-card-footer"
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

            {/* Right Box: Split Screen EMI Details Panel (Stacked at bottom on mobile with smooth scroll) */}
            {selectedLoan && selectedLoanMetrics && (
              <div
                ref={loanDetailsInspectorRef}
                className="loan-details-inspector-panel"
                style={{
                  flex: '0 0 380px',
                  minWidth: 0,
                  maxWidth: '100%',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 20,
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: cardsContainerHeight ? `${Math.max(cardsContainerHeight, 520)}px` : 'calc(100vh - 120px)',
                  height: 'auto',
                  alignSelf: 'flex-start',
                  boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.06)' : '0 16px 40px rgba(0,0,0,0.5)',
                  position: 'sticky',
                  top: 20
                }}
              >
                {/* Split Screen Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: '1px solid var(--border-color)', marginBottom: 16, flexShrink: 0 }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => printLoanDetailsPdf(selectedLoan, user?.name, user?.email)}
                      style={{
                        background: 'rgba(99, 102, 241, 0.12)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: '#6366F1',
                        cursor: 'pointer',
                        borderRadius: 8,
                        padding: '5px 10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700
                      }}
                      title="Print / Save Loan Details as PDF"
                    >
                      <Printer size={13} />
                      <span>Print PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCloseLoanDetails}
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
                </div>

                {/* Key Loan Figures Overview */}
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, marginBottom: 16, flexShrink: 0 }}>
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

                {/* Total EMI Completed, Remaining EMI Amount, Outstanding Section (User requirement) */}
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 12, marginBottom: 16, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    EMI Progress &amp; Outstanding
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>TOTAL EMIs COMPLETED</span>
                      <strong style={{ fontSize: 12.5, color: '#10B981', fontWeight: 800 }}>
                        {selectedLoanMetrics.completedEmis} of {selectedLoanMetrics.totalEmis} ({selectedLoanMetrics.paidPct}%)
                      </strong>
                    </div>
                    <div style={{ background: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>REMAINING EMIs</span>
                      <strong style={{ fontSize: 12.5, color: '#F59E0B', fontWeight: 800 }}>
                        {selectedLoanMetrics.remainingEmis} Months Left
                      </strong>
                    </div>
                    <div style={{ background: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>REMAINING EMI AMOUNT</span>
                      <strong style={{ fontSize: 12.5, color: '#EC4899', fontWeight: 800 }}>
                        {currencyService.format(selectedLoanMetrics.remainingEmis * selectedLoanMetrics.emi)}
                      </strong>
                    </div>
                    <div style={{ background: isLight ? '#FFFFFF' : 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>OUTSTANDING BALANCE</span>
                      <strong style={{ fontSize: 12.5, color: selectedLoanMetrics.remaining > 0 ? '#EF4444' : '#10B981', fontWeight: 800 }}>
                        {currencyService.format(selectedLoanMetrics.remaining)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Current & Next Month EMI Payment Status Box (Requirement 9) */}
                <div style={{ marginBottom: 16, flexShrink: 0 }}>
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

                {/* Proxy Loan / Beneficiary Status Summary Box */}
                {selectedLoan.isForSomeoneElse && (
                  <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))', border: '1px solid rgba(99, 102, 241, 0.25)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                          👤 Taken for: <strong style={{ color: '#6366F1' }}>{selectedLoan.borrowerName || 'Borrower'}</strong>
                        </span>
                        {selectedLoan.borrowerPhone && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({selectedLoan.borrowerPhone})</span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(99, 102, 241, 0.15)', color: '#818CF8' }}>
                        PROXY LOAN
                      </span>
                    </div>

                    {selectedLoan.borrowerNotes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                        "{selectedLoan.borrowerNotes}"
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                      <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>RECEIVED FROM BORROWER</span>
                        <strong style={{ fontSize: 12.5, color: '#10B981', fontWeight: 800 }}>
                          {currencyService.format(selectedLoanMetrics.totalReceivedAmount)} ({selectedLoanMetrics.receivedEmisCount}/{selectedLoanMetrics.totalEmis})
                        </strong>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: 6, background: selectedLoanMetrics.pendingFromBorrower > 0 ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-secondary)', border: selectedLoanMetrics.pendingFromBorrower > 0 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: 9.5, color: selectedLoanMetrics.pendingFromBorrower > 0 ? '#F59E0B' : 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                          {selectedLoanMetrics.pendingFromBorrower > 0 ? `⚠️ OWED BY ${selectedLoan.borrowerName?.toUpperCase() || 'PERSON'}` : 'REIMBURSEMENT STATUS'}
                        </span>
                        <strong style={{ fontSize: 12.5, color: selectedLoanMetrics.pendingFromBorrower > 0 ? '#F59E0B' : '#10B981', fontWeight: 800 }}>
                          {selectedLoanMetrics.pendingFromBorrower > 0 ? currencyService.format(selectedLoanMetrics.pendingFromBorrower) : '✓ Up to Date'}
                        </strong>
                      </div>
                    </div>

                    {/* Bulk action to mark past due received from borrower */}
                    {(() => {
                      const unreceivedPastCount = selectedLoanSchedule.filter(s => s.receivedStatus === 'pending').length;
                      if (unreceivedPastCount > 0 && !isViewOnly) {
                        return (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(99, 102, 241, 0.25)' }}>
                            <span style={{ fontSize: 10.5, color: '#F59E0B', fontWeight: 600 }}>
                              {unreceivedPastCount} month(s) pending receipt from {selectedLoan.borrowerName || 'person'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMarkAllPastDueAsReceived(selectedLoan.id)}
                              style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                border: '1px solid rgba(99, 102, 241, 0.35)',
                                color: '#6366F1',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title={`Mark all past pending EMIs as received from ${selectedLoan.borrowerName || 'borrower'}`}
                            >
                              <Check size={11} />
                              <span>Mark All Received</span>
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Month-by-Month Amortization Schedule (Start Date to End Date) */}
                <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Schedule ({selectedLoan.startDate || 'Start'} to {selectedLoan.endDate || 'End'})
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {selectedLoanMetrics.completedEmis} of {selectedLoanMetrics.totalEmis} paid
                    </span>
                  </div>

                  {/* Bulk action if past pending EMIs exist */}
                  {(() => {
                    const pendingPastCount = selectedLoanSchedule.filter(s => s.status === 'pending').length;
                    if (pendingPastCount > 0 && !isViewOnly) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>
                            {pendingPastCount} Pending Due EMI{pendingPastCount > 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMarkAllPastDueAsPaid(selectedLoan.id)}
                            style={{
                              background: '#10B981',
                              border: 'none',
                              color: '#FFFFFF',
                              borderRadius: 6,
                              padding: '3px 8px',
                              fontSize: 10.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="Mark all pending dues as paid without creating transactions in your ledger"
                          >
                            <Check size={11} />
                            <span>Mark All Paid (No Txn)</span>
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                    {selectedLoanSchedule.map(s => {
                      if (selectedLoan.isForSomeoneElse) {
                        return (
                          <div
                            key={s.index}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              padding: '10px 12px',
                              borderRadius: 10,
                              background: s.isCurrentMonth
                                ? 'rgba(99, 102, 241, 0.1)'
                                : 'var(--bg-secondary)',
                              border: s.isCurrentMonth
                                ? '1px solid rgba(99, 102, 241, 0.35)'
                                : '1px solid var(--border-color)',
                              fontSize: 12
                            }}
                          >
                            {/* Row Header: Month, Amount & Overall Net Status Pill */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              <div>
                                <span style={{ fontWeight: 700, color: s.isCurrentMonth ? '#6366F1' : 'var(--text-primary)' }}>
                                  #{s.index} {s.monthStr} {s.isCurrentMonth ? '• (Current)' : ''}
                                </span>
                                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 8 }}>
                                  EMI: <strong>{currencyService.format(s.emiAmount)}</strong>
                                </span>
                              </div>

                              <div>
                                {s.status === 'paid' && s.isReceived ? (
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    ✓ SETTLED
                                  </span>
                                ) : s.status === 'paid' && !s.isReceived ? (
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="You paid bank EMI, but borrower hasn't paid you!">
                                    ⚠️ OWED BY {selectedLoan.borrowerName?.toUpperCase() || 'PERSON'}
                                  </span>
                                ) : s.status !== 'paid' && s.isReceived ? (
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Received money from person, but Bank EMI not yet paid!">
                                    📥 RECEIVED • PAY BANK
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                    ⏳ PENDING
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Dual Tracking Controls */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4, paddingTop: 6, borderTop: '1px dashed var(--border-color)' }}>
                              {/* 1. Bank EMI Payment */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Bank:</span>
                                  {s.status === 'paid' ? (
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981' }}>✓ PAID</span>
                                  ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444' }}>UNPAID</span>
                                  )}
                                </div>
                                {!isViewOnly && (
                                  s.status === 'paid' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSchedulePaid(selectedLoan.id, s.index)}
                                      title="Revert bank paid"
                                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <RotateCcw size={11} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSchedulePaid(selectedLoan.id, s.index)}
                                      style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#10B981', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Pay Bank
                                    </button>
                                  )
                                )}
                              </div>

                              {/* 2. From Person Receipt */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)' }}>From {selectedLoan.borrowerName || 'Person'}:</span>
                                  {s.isReceived ? (
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981' }}>✓ RCVD</span>
                                  ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B' }}>DUE</span>
                                  )}
                                </div>
                                {!isViewOnly && (
                                  s.isReceived ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleScheduleReceived(selectedLoan.id, s.index)}
                                      title={`Revert received from ${selectedLoan.borrowerName || 'borrower'}`}
                                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center' }}
                                    >
                                      <RotateCcw size={11} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleScheduleReceived(selectedLoan.id, s.index)}
                                      style={{ background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)', color: '#6366F1', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Mark Rcvd
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

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

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {s.status === 'paid' ? (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                                  ✓ PAID
                                </span>
                                {!isViewOnly && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSchedulePaid(selectedLoan.id, s.index)}
                                    title="Revert to pending"
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                      padding: '2px 4px',
                                      fontSize: 10,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      opacity: 0.7
                                    }}
                                  >
                                    <RotateCcw size={11} />
                                  </button>
                                )}
                              </>
                            ) : s.status === 'pending' ? (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
                                  PENDING DUE
                                </span>
                                {!isViewOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSchedulePaid(selectedLoan.id, s.index)}
                                      title="Mark as Paid without creating an expense transaction in the ledger"
                                      style={{
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        border: '1px solid rgba(16, 185, 129, 0.35)',
                                        color: '#10B981',
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3
                                      }}
                                    >
                                      <Check size={11} />
                                      <span>Mark Paid</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayingLoan(selectedLoan);
                                        setPayEmiAmount(String(s.emiAmount));
                                        const todayStr = new Date().toISOString().substring(0, 10);
                                        setPayEmiDate(s.dateStr <= todayStr ? todayStr : s.dateStr);
                                        setRecordTransaction(true);
                                        setIsPayEmiOpen(true);
                                      }}
                                      title="Pay now & record as expense transaction in your ledger"
                                      style={{
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        border: '1px solid rgba(99, 102, 241, 0.35)',
                                        color: '#6366F1',
                                        padding: '3px 7px',
                                        borderRadius: 6,
                                        fontSize: 10.5,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 2
                                      }}
                                    >
                                      <DollarSign size={11} />
                                      <span>Pay</span>
                                    </button>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                  UPCOMING
                                </span>
                                {!isViewOnly && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSchedulePaid(selectedLoan.id, s.index)}
                                    title="Prepay & mark as paid without transaction"
                                    style={{
                                      background: 'transparent',
                                      border: '1px solid var(--border-color)',
                                      color: 'var(--text-muted)',
                                      padding: '2px 6px',
                                      borderRadius: 5,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 2
                                    }}
                                  >
                                    <Check size={10} />
                                    <span>Mark Paid</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions in Split View */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
                  {!isViewOnly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                          setPayingLoan(selectedLoan);
                          setPayEmiAmount(String(selectedLoanMetrics.emi));
                          setPayEmiDate(new Date().toISOString().substring(0, 10));
                          setRecordTransaction(true);
                          setIsPayEmiOpen(true);
                        }}
                      >
                        <DollarSign size={15} />
                        <span>Pay EMI & Record Transaction</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPayingLoan(selectedLoan);
                          setPayEmiAmount(String(selectedLoanMetrics.emi));
                          setPayEmiDate(new Date().toISOString().substring(0, 10));
                          setRecordTransaction(false);
                          setIsPayEmiOpen(true);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10B981',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Next EMI Paid (No Transaction)</span>
                      </button>
                    </div>
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

                  <button
                    type="button"
                    onClick={() => printLoanDetailsPdf(selectedLoan, user?.name, user?.email)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#6366F1',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      marginTop: 8,
                      boxShadow: '0 2px 10px rgba(99, 102, 241, 0.35)'
                    }}
                  >
                    <Printer size={15} />
                    <span>Print Loan Statement (PDF)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actual EMI Payment History Ledger with Full Filtering, Limits & Pagination (Budget & Transactions style) */}
      <div className="summary-card" style={{ padding: 24, borderRadius: 16, marginBottom: 30 }}>
        {/* Table Header Controls */}
        <div className="loans-ledger-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Actual Loan EMI Repayments Ledger ({filteredEmiTransactions.length})
            </h3>
            <span className="hide-on-mobile" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Search, filter, and track loan repayments, EMI auto-debits & principal payoffs
            </span>
          </div>

          <div className="loans-ledger-top-actions hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Desktop Segmented Control */}
            <div className="segmented-control loans-ledger-segmented" style={{ display: 'inline-flex', background: 'var(--bg-secondary)', padding: 3, borderRadius: 10, border: '1px solid var(--border-color)' }}>
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

            {/* Record EMI Payment Button (full text on desktop) */}
            {!isViewOnly && (
              <button
                type="button"
                className="btn-primary loans-ledger-record-btn"
                style={{
                  minWidth: 32,
                  height: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
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
                title="Record EMI payment"
                aria-label="Record EMI payment"
              >
                <Plus size={16} />
                <span>Record EMI</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Ledger Controls Row: Left = Segmented [All | Paid | Last 30 Days], Right = Filter & + Buttons */}
        <div className="hide-on-desktop" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, gap: 8 }}>
          {/* Left: Segmented control */}
          <div className="segmented-control loans-ledger-segmented" style={{ display: 'inline-flex', background: 'var(--bg-secondary)', padding: 3, borderRadius: 10, border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setEmiFilterType('all')}
              style={{
                padding: '5px 10px',
                borderRadius: 7,
                border: 'none',
                fontSize: 11,
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
                padding: '5px 10px',
                borderRadius: 7,
                border: 'none',
                fontSize: 11,
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
                padding: '5px 10px',
                borderRadius: 7,
                border: 'none',
                fontSize: 11,
                fontWeight: emiFilterType === 'recent' ? 700 : 500,
                background: emiFilterType === 'recent' ? 'var(--accent-indigo)' : 'transparent',
                color: emiFilterType === 'recent' ? '#FFF' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Last 30 Days
            </button>
          </div>

          {/* Right: Filter & + Icon Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsMobileFilterOpen(true)}
              title="Filter EMI Repayments"
              aria-label="Filter EMI Repayments"
              style={{
                width: 32,
                height: 32,
                minWidth: 32,
                padding: 0,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <Filter size={15} />
              {hasActiveEmiFilters && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#6366F1'
                  }}
                />
              )}
            </button>

            {!isViewOnly && (
              <button
                type="button"
                className="btn-primary"
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
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
                title="Record EMI payment"
                aria-label="Record EMI payment"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Search Box & Record EMI Payment Button for Desktop */}
        <div className="loans-search-record-row hide-on-mobile" style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', marginBottom: 12 }}>
          {/* Left: Search Box (75% width) */}
          <div
            className="loans-ledger-search"
            style={{
              flex: '3 1 75%',
              width: '75%',
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              padding: '8px 12px',
              gap: 8,
              minWidth: 0,
              boxSizing: 'border-box'
            }}
          >
            <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
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

          {/* Right: Record EMI Payment Button (25% width) */}
          {!isViewOnly && (
            <button
              type="button"
              className="btn-primary loans-ledger-record-btn"
              style={{
                flex: '1 1 25%',
                width: '25%',
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxSizing: 'border-box'
              }}
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
              <Plus size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Record EMI</span>
            </button>
          )}
        </div>

        {/* Filter Toolbar (Dropdowns & Popovers) - Desktop */}
        <div className="loans-ledger-toolbar hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>

          <div className="loans-ledger-filter-row">
            {/* Loan Filter Dropdown */}
            <div className="loans-ledger-select-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Filter size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
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
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                <option value="all">All Loans & Accounts</option>
                {loans.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.lender})</option>
                ))}
              </select>
            </div>

            {/* Payment Mode Filter Dropdown */}
            <div className="loans-ledger-select-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                <option value="all">All Payment Modes</option>
                <option value="bank_transfer">Bank Auto-Debit</option>
                <option value="upi">UPI / GPay</option>
                <option value="netbanking">Net Banking</option>
                <option value="debit">Debit Card</option>
              </select>
            </div>
          </div>

          {/* Date & Amount Filter Popovers in 2-Column Row on Mobile */}
          <div className="loans-ledger-popover-row">
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
        {loading && filteredEmiTransactions.length === 0 ? (
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
              <table className="loans-ledger-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead className="sticky-table-header">
                  <tr>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Date</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Description</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Category</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Payment Mode</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Amount Paid</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Action</th>
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
          <div className="modal-container" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
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

              {/* Row 4.5: Already Paid EMIs (for loans started in the past) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ALREADY PAID EMIs (PREVIOUS MONTHS)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 12 (if loan started previously)"
                  value={loanPaidMonths || ''}
                  onChange={e => setLoanPaidMonths(Math.max(0, parseInt(e.target.value) || 0))}
                  className="modal-input"
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  If you already paid past EMIs before entering this loan, enter the months count here so they are marked Paid without creating duplicate transactions.
                </span>
              </div>

              {/* Repayment Source: Direct Bank Account vs Credit Card EMI */}
              <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  REPAYMENT METHOD (HOW THIS LOAN IS BILLED / PAID)
                </label>
                <div style={{ display: 'flex', gap: 14, marginBottom: loanRepaymentSource === 'credit_card' ? 10 : 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="loanRepaymentSource"
                      value="bank"
                      checked={loanRepaymentSource === 'bank'}
                      onChange={() => setLoanRepaymentSource('bank')}
                    />
                    <span>🏦 Direct Bank Account</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="loanRepaymentSource"
                      value="credit_card"
                      checked={loanRepaymentSource === 'credit_card'}
                      onChange={() => setLoanRepaymentSource('credit_card')}
                    />
                    <span>💳 Credit Card EMI</span>
                  </label>
                </div>

                {loanRepaymentSource === 'credit_card' && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      SELECT LINKED CREDIT CARD *
                    </label>
                    <select
                      value={loanLinkedCardId}
                      onChange={e => setLoanLinkedCardId(e.target.value)}
                      className="modal-select"
                      required
                    >
                      <option value="">-- Choose Credit Card --</option>
                      {userCards.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.bank} •••• {c.last4})
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: '#10B981', marginTop: 4, display: 'block' }}>
                      ✓ Monthly EMI will be included in this card's bill. Paying your card bill settles this EMI automatically with ZERO duplicate expense debits!
                    </span>
                  </div>
                )}
              </div>

              {/* Third-Party Loan Toggle & Beneficiary Details (Placed prominently right after Repayment Method) */}
              <div
                style={{
                  padding: '14px 16px',
                  background: loanIsForSomeoneElse
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)'
                    : 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 12,
                  border: loanIsForSomeoneElse
                    ? '1.5px solid rgba(99, 102, 241, 0.5)'
                    : '1px solid var(--border-color)',
                  boxShadow: loanIsForSomeoneElse ? '0 4px 16px rgba(99, 102, 241, 0.15)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ paddingTop: 2 }}>
                      <input
                        type="checkbox"
                        id="addLoanForSomeoneElse"
                        checked={loanIsForSomeoneElse}
                        onChange={e => setLoanIsForSomeoneElse(e.target.checked)}
                        style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#6366F1' }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="addLoanForSomeoneElse"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: loanIsForSomeoneElse ? '#818CF8' : 'var(--text-primary)',
                          cursor: 'pointer',
                          margin: 0,
                          userSelect: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Users size={16} style={{ color: '#818CF8' }} />
                        <span>Is this loan taken for someone else? (Proxy Loan)</span>
                      </label>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'block', marginTop: 3 }}>
                        Check this if you took this loan in your name for a friend or relative. Tracks both bank payments and reimbursement collections.
                      </span>
                    </div>
                  </div>
                  {loanIsForSomeoneElse && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#6366F1',
                        color: '#FFF',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        flexShrink: 0
                      }}
                    >
                      Proxy Active
                    </span>
                  )}
                </div>

                {loanIsForSomeoneElse && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(99, 102, 241, 0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#818CF8', marginBottom: 4 }}>
                          BORROWER / PERSON NAME *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Ramesh, Karthik / Relative"
                          value={loanBorrowerName}
                          onChange={e => setLoanBorrowerName(e.target.value)}
                          className="modal-input"
                          required={loanIsForSomeoneElse}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          PHONE / CONTACT NUMBER (OPTIONAL)
                        </label>
                        <input
                          type="tel"
                          placeholder="e.g. +91 98765 43210"
                          value={loanBorrowerPhone}
                          onChange={e => setLoanBorrowerPhone(e.target.value)}
                          className="modal-input"
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        REPAYMENT TERMS / AGREEMENT NOTES (OPTIONAL)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Will transfer EMI amount to my account on or before 3rd of every month"
                        value={loanBorrowerNotes}
                        onChange={e => setLoanBorrowerNotes(e.target.value)}
                        className="modal-input"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Row 5: Description with Bold & Colors Toolbar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    DESCRIPTION / PURPOSE (SUPPORTS BOLD & COLORS)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<b>', '</b>', 'Important')}
                      title="Insert Bold Text"
                      style={{ padding: '2px 8px', borderRadius: 4, background: '#1E293B', border: '1px solid var(--border-color)', color: '#FFF', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<span style="color: #38BDF8">', '</span>', 'Blue')}
                      title="Insert Sky Blue Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#38BDF8', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<span style="color: #34D399">', '</span>', 'Green')}
                      title="Insert Emerald Green Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#34D399', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<span style="color: #FBBF24">', '</span>', 'Amber')}
                      title="Insert Amber Gold Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#FBBF24', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<span style="color: #F87171">', '</span>', 'Red')}
                      title="Insert Rose Red Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#F87171', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(loanDescription, setLoanDescription, '<span style="color: #A78BFA">', '</span>', 'Purple')}
                      title="Insert Purple Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#A78BFA', border: 'none', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. <b>Car Loan</b> with <span style='color: #38BDF8'>8.5% interest</span>..."
                  value={loanDescription}
                  onChange={e => setLoanDescription(e.target.value)}
                  className="modal-input"
                  style={{ resize: 'vertical' }}
                />
                {loanDescription && (
                  <div style={{ marginTop: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    Preview: {renderFormattedDescription(loanDescription)}
                  </div>
                )}
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
          <div className="modal-container" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
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

              {/* Row 4.5: Already Paid EMIs */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ALREADY PAID EMIs (MONTHS)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editPaidMonths}
                  onChange={e => setEditPaidMonths(Math.max(0, parseInt(e.target.value) || 0))}
                  className="modal-input"
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Total EMIs marked as paid. Adjusting this updates the schedule and remaining balance without creating extra transactions.
                </span>
              </div>

              {/* Row 5: Description with Bold & Colors Toolbar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    DESCRIPTION / PURPOSE (SUPPORTS BOLD & COLORS)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<b>', '</b>', 'Important')}
                      title="Insert Bold Text"
                      style={{ padding: '2px 8px', borderRadius: 4, background: '#1E293B', border: '1px solid var(--border-color)', color: '#FFF', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<span style="color: #38BDF8">', '</span>', 'Blue')}
                      title="Insert Sky Blue Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#38BDF8', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<span style="color: #34D399">', '</span>', 'Green')}
                      title="Insert Emerald Green Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#34D399', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<span style="color: #FBBF24">', '</span>', 'Amber')}
                      title="Insert Amber Gold Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#FBBF24', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<span style="color: #F87171">', '</span>', 'Red')}
                      title="Insert Rose Red Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#F87171', border: 'none', cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => insertFormatting(editDescription, setEditDescription, '<span style="color: #A78BFA">', '</span>', 'Purple')}
                      title="Insert Purple Text"
                      style={{ width: 18, height: 18, borderRadius: '50%', background: '#A78BFA', border: 'none', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="modal-input"
                  style={{ resize: 'vertical' }}
                />
                {editDescription && (
                  <div style={{ marginTop: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    Preview: {renderFormattedDescription(editDescription)}
                  </div>
                )}
              </div>

              {/* Repayment Source in Edit Modal */}
              <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  REPAYMENT METHOD
                </label>
                <div style={{ display: 'flex', gap: 14, marginBottom: editRepaymentSource === 'credit_card' ? 10 : 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="editRepaymentSource"
                      value="bank"
                      checked={editRepaymentSource === 'bank'}
                      onChange={() => setEditRepaymentSource('bank')}
                    />
                    <span>🏦 Direct Bank Account</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="editRepaymentSource"
                      value="credit_card"
                      checked={editRepaymentSource === 'credit_card'}
                      onChange={() => setEditRepaymentSource('credit_card')}
                    />
                    <span>💳 Credit Card EMI</span>
                  </label>
                </div>

                {editRepaymentSource === 'credit_card' && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      LINKED CREDIT CARD
                    </label>
                    <select
                      value={editLinkedCardId}
                      onChange={e => setEditLinkedCardId(e.target.value)}
                      className="modal-select"
                    >
                      <option value="">-- Choose Credit Card --</option>
                      {userCards.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.bank} •••• {c.last4})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Third-Party Loan Toggle & Beneficiary Details */}
              <div
                style={{
                  padding: '14px 16px',
                  background: editIsForSomeoneElse
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)'
                    : 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 12,
                  border: editIsForSomeoneElse
                    ? '1.5px solid rgba(99, 102, 241, 0.5)'
                    : '1px solid var(--border-color)',
                  boxShadow: editIsForSomeoneElse ? '0 4px 16px rgba(99, 102, 241, 0.15)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ paddingTop: 2 }}>
                      <input
                        type="checkbox"
                        id="editLoanForSomeoneElse"
                        checked={editIsForSomeoneElse}
                        onChange={e => setEditIsForSomeoneElse(e.target.checked)}
                        style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#6366F1' }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="editLoanForSomeoneElse"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: editIsForSomeoneElse ? '#818CF8' : 'var(--text-primary)',
                          cursor: 'pointer',
                          margin: 0,
                          userSelect: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Users size={16} style={{ color: '#818CF8' }} />
                        <span>Is this loan taken for someone else? (Proxy Loan)</span>
                      </label>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'block', marginTop: 3 }}>
                        Check this if you took this loan in your name for a friend or relative. Tracks both bank payments and reimbursement collections.
                      </span>
                    </div>
                  </div>
                  {editIsForSomeoneElse && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#6366F1',
                        color: '#FFF',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        flexShrink: 0
                      }}
                    >
                      Proxy Active
                    </span>
                  )}
                </div>

                {editIsForSomeoneElse && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(99, 102, 241, 0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#818CF8', marginBottom: 4 }}>
                          BORROWER / PERSON NAME *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Ramesh, Karthik / Relative"
                          value={editBorrowerName}
                          onChange={e => setEditBorrowerName(e.target.value)}
                          className="modal-input"
                          required={editIsForSomeoneElse}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          PHONE / CONTACT NUMBER (OPTIONAL)
                        </label>
                        <input
                          type="tel"
                          placeholder="e.g. +91 98765 43210"
                          value={editBorrowerPhone}
                          onChange={e => setEditBorrowerPhone(e.target.value)}
                          className="modal-input"
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        REPAYMENT TERMS / AGREEMENT NOTES (OPTIONAL)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Will transfer EMI amount to my account on or before 3rd of every month"
                        value={editBorrowerNotes}
                        onChange={e => setEditBorrowerNotes(e.target.value)}
                        className="modal-input"
                      />
                    </div>
                  </div>
                )}
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

      {/* Modal: Center Display Custom Confirmation for Loan Deletion (On-Screen, No Browser Popup) */}
      {loanToDelete && (
        <div className="modal-overlay" onClick={() => setLoanToDelete(null)}>
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
              Remove Active Loan?
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Are you sure you want to delete this loan from your dashboard? This will remove its EMI schedule and net worth liability tracking.
            </p>

            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: '14px 16px',
                margin: '14px 0 20px',
                textAlign: 'left'
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {loanToDelete.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Lender: <strong>{loanToDelete.lender}</strong>
              </div>
              {loanToDelete.principal && (
                <div style={{ fontSize: 12, color: '#10B981', fontWeight: 600, marginTop: 4 }}>
                  Principal Amount: {currencyService.format(loanToDelete.principal)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontWeight: 600
                }}
                onClick={() => setLoanToDelete(null)}
              >
                Keep Loan
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: '#EF4444',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '10px 22px',
                  borderRadius: 10,
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
                }}
                onClick={confirmDeleteLoan}
              >
                Yes, Delete Loan
              </button>
            </div>
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
              {payingLoan?.repaymentSource === 'credit_card' && (
                <div style={{ padding: '10px 12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#818CF8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    💳 Billed to Credit Card: {payingLoan?.linkedCardName || payingLoan?.lender || 'Credit Card'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    This EMI is billed through your credit card statement. When you pay your credit card bill, this EMI is automatically settled. 
                    <br />
                    <span style={{ color: '#10B981', fontWeight: 600 }}>Tip:</span> Use <strong>"Mark Paid Only"</strong> if you are recording an already-paid statement to prevent duplicate bank debits.
                  </div>
                </div>
              )}
              {/* Payment Action: Record Transaction vs Mark Paid Only */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  PAYMENT ACTION
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setRecordTransaction(true)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: recordTransaction ? '2px solid #6366F1' : '1px solid var(--border-color)',
                      background: recordTransaction ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-secondary)',
                      color: recordTransaction ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: recordTransaction ? '#6366F1' : 'var(--text-primary)' }}>
                      💳 Record Transaction
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      Adds expense to ledger & updates loan balance
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecordTransaction(false)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: !recordTransaction ? '2px solid #10B981' : '1px solid var(--border-color)',
                      background: !recordTransaction ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
                      color: !recordTransaction ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: !recordTransaction ? '#10B981' : 'var(--text-primary)' }}>
                      ✓ Mark Paid Only
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      No transaction added (for past / offline EMIs)
                    </div>
                  </button>
                </div>
              </div>

              {/* Row: EMI Amount & Payment Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    EMI AMOUNT ({currencyService.getActiveCurrencyCode()}) *
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
                    PAYMENT DATE *
                  </label>
                  <input
                    type="date"
                    value={payEmiDate}
                    onChange={e => setPayEmiDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              {/* Payment Mode (only when recording transaction) */}
              {recordTransaction && (
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
              )}

              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: recordTransaction ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: recordTransaction ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(16, 185, 129, 0.25)',
                  fontSize: 12,
                  color: 'var(--text-secondary)'
                }}
              >
                {recordTransaction ? (
                  <span>
                    ℹ️ This logs an expense transaction dated <strong>{payEmiDate}</strong> to your database ledger and marks the EMI as paid.
                  </span>
                ) : (
                  <span>
                    ✓ <strong>Mark Paid Only:</strong> Updates loan balance and marks the schedule month as paid. No transaction will be added to your expense records.
                  </span>
                )}
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
                  {paySaving ? 'Processing...' : (recordTransaction ? 'Confirm Payment & Log Txn' : 'Mark as Paid')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Filter Modal Popup for Loan Repayments Ledger */}
      {isMobileFilterOpen && (
        <div
          className="modal-backdrop mobile-filter-backdrop"
          onClick={() => setIsMobileFilterOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 16
          }}
        >
          <div
            className="modal-content mobile-filter-modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary, #0F172A)',
              border: '1px solid var(--border-color)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 420,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Filter size={16} color="var(--accent-indigo)" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Filter Loan Repayments
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto' }}>
              {/* Search Field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Search Description or Lender
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 10px', gap: 6 }}>
                  <Search size={14} style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search repayments..."
                    value={emiSearchQuery}
                    onChange={e => setEmiSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', width: '100%', fontSize: 12 }}
                  />
                  {emiSearchQuery && (
                    <button type="button" onClick={() => setEmiSearchQuery('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Loan Account Dropdown */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Loan Account
                </label>
                <select
                  value={emiSelectedLoanFilter}
                  onChange={e => setEmiSelectedLoanFilter(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 10px', borderRadius: 8, fontSize: 12 }}
                >
                  <option value="all">All Loans & Accounts</option>
                  {loans.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.lender})</option>
                  ))}
                </select>
              </div>

              {/* Payment Mode */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Payment Mode
                </label>
                <select
                  value={emiPaymentModeFilter}
                  onChange={e => setEmiPaymentModeFilter(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 10px', borderRadius: 8, fontSize: 12 }}
                >
                  <option value="all">All Payment Modes</option>
                  <option value="bank_transfer">Bank Auto-Debit</option>
                  <option value="upi">UPI / GPay</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="debit">Debit Card</option>
                </select>
              </div>

              {/* Date Presets & Range */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Date Range
                </label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  <button type="button" onClick={() => applyEmiDatePreset('all')} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-color)', background: !emiFromDate && !emiToDate ? 'var(--accent-indigo)' : 'var(--bg-secondary)', color: !emiFromDate && !emiToDate ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>All Time</button>
                  <button type="button" onClick={() => applyEmiDatePreset('this_month')} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>This Month</button>
                  <button type="button" onClick={() => applyEmiDatePreset('last_month')} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Last Month</button>
                  <button type="button" onClick={() => applyEmiDatePreset('last_30')} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Last 30 Days</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="date"
                    value={emiFromDate}
                    onChange={e => setEmiFromDate(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 8px', borderRadius: 6, fontSize: 11 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>to</span>
                  <input
                    type="date"
                    value={emiToDate}
                    onChange={e => setEmiToDate(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 8px', borderRadius: 6, fontSize: 11 }}
                  />
                </div>
              </div>

              {/* Amount Range */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Amount Range
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder="Min ₹"
                    value={emiMinAmount}
                    onChange={e => setEmiMinAmount(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 8px', borderRadius: 6, fontSize: 11 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>to</span>
                  <input
                    type="number"
                    placeholder="Max ₹"
                    value={emiMaxAmount}
                    onChange={e => setEmiMaxAmount(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 8px', borderRadius: 6, fontSize: 11 }}
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-color)', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  handleResetEmiFilters();
                }}
                disabled={!hasActiveEmiFilters}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: hasActiveEmiFilters ? '#EF4444' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: hasActiveEmiFilters ? 'pointer' : 'default'
                }}
              >
                Reset All
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsMobileFilterOpen(false)}
                style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8 }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
