import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Plus,
  CreditCard,
  Wallet,
  Coins,
  Send,
  CheckCircle2,
  CalendarDays
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { currencyService } from '../services/currencyService';
import { cardService, type CardModel } from '../services/cardService';
import { loanService, type LoanModel, calculateLoanEMIs, generateEmiSchedule } from '../services/loanService';
import { isBillPaymentTx } from './CreditCardsView';
import { yearService } from '../services/yearService';
import { showToast } from '../components/ToastNotification';

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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper: Format YYYY-MM-DD
const formatYmd = (y: number, m: number, d: number) => {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
};

// Reusable function to compute dues for any given month & year
const computeDuesForMonth = (
  year: number,
  month: number,
  cardsList: CardModel[],
  loansList: LoanModel[],
  transactionsList: any[],
  todayY: number,
  todayM: number,
  todayD: number
): Record<number, DueItem[]> => {
  const duesByDay: Record<number, DueItem[]> = {};

  const isViewingCurrentMonth = year === todayY && month === todayM;
  const isPastMonth = year < todayY || (year === todayY && month < todayM);
  const isFutureMonth = year > todayY || (year === todayY && month > todayM);

  // 1. Credit Cards: Determine monthly dues based on credit spends & bill payment transactions
  cardsList.forEach(card => {
    if (!card.isActive) return;
    const dueDay = Number(card.dueDay) || 5;

    // Check if bill payment transaction was made for this card in this viewed month
    const billPaymentInViewedMonth = transactionsList.find(t => {
      if (!t.date) return false;
      const [y, m] = t.date.split('-').map(Number);
      if (y !== year || m !== (month + 1)) return false;
      if (!isBillPaymentTx(t)) return false;
      const cName = card.name.toLowerCase();
      const cLast4 = card.last4 || '';
      const tCard = String(t.card || '').toLowerCase();
      const tDesc = String(t.description || '').toLowerCase();
      return tCard.includes(cName) || tDesc.includes(cName) || (cLast4 && (tCard.includes(cLast4) || tDesc.includes(cLast4)));
    });

    let monthSpend = 0;
    let spendUpToMonth = 0;
    let paidUpToMonth = 0;
    let totalAllTimeSpends = 0;
    let totalAllTimePayments = 0;

    transactionsList.forEach(t => {
      if (!t.date) return;
      const [y, m] = t.date.split('-').map(Number);

      const mode = String(t.paymentMode || '').toLowerCase();
      const tCard = String(t.card || '').toLowerCase();
      const tDesc = String(t.description || '').toLowerCase();
      const cName = card.name.toLowerCase();
      const cLast4 = card.last4 || '';
      const isThisCard = mode.includes(cName) || tCard.includes(cName) || tDesc.includes(cName) || (cLast4 && (tCard.includes(cLast4) || tDesc.includes(cLast4)));
      if (!isThisCard) return;

      const amt = Number(t.amount) || 0;
      const isPayment = isBillPaymentTx(t);

      if (isPayment) {
        totalAllTimePayments += amt;
      } else if (t.type !== 'income') {
        totalAllTimeSpends += amt;
      }

      if (y < year || (y === year && m <= (month + 1))) {
        if (isPayment) {
          paidUpToMonth += amt;
        } else if (t.type !== 'income') {
          spendUpToMonth += amt;
          if (y === year && m === (month + 1)) {
            monthSpend += amt;
          }
        }
      }
    });

    // If card was never used up to this month and has no payment, skip displaying empty clutter
    if (spendUpToMonth === 0 && !billPaymentInViewedMonth) return;

    // For past months, if this specific month had NO spend and NO payment, skip displaying empty clutter
    if (isPastMonth && monthSpend === 0 && !billPaymentInViewedMonth) return;

    const outstandingUpToMonth = Math.max(0, spendUpToMonth - paidUpToMonth);
    const currentAllTimeOutstanding = Math.max(0, totalAllTimeSpends - totalAllTimePayments);

    // Paid status:
    // - Bill payment made in this viewed month
    // - Spends up to this month covered by all-time payments
    // - Card current net outstanding is 0
    // - Outstanding up to that month was already 0
    const isPaid =
      Boolean(billPaymentInViewedMonth) ||
      (totalAllTimePayments >= spendUpToMonth && spendUpToMonth > 0) ||
      (currentAllTimeOutstanding === 0 && spendUpToMonth > 0) ||
      (outstandingUpToMonth === 0 && spendUpToMonth > 0);

    const displayAmount = billPaymentInViewedMonth
      ? Number(billPaymentInViewedMonth.amount)
      : (monthSpend > 0 ? monthSpend : (outstandingUpToMonth > 0 ? outstandingUpToMonth : card.limit * 0.1));

    const isDueToday = !isPaid && isViewingCurrentMonth && dueDay === todayD;
    const isOverdue = !isPaid && ((isPastMonth && displayAmount > 0) || (isViewingCurrentMonth && dueDay < todayD && displayAmount > 0));
    const isUpcoming = !isPaid && (isFutureMonth || (isViewingCurrentMonth && dueDay > todayD));

    const item: DueItem = {
      id: `card-${card.id}-${year}-${month}`,
      cardId: card.id,
      type: 'card',
      name: card.name,
      subtext: `${card.bank} Credit Card • Due on ${dueDay}th`,
      amount: displayAmount,
      dueDay,
      dueDate: formatYmd(year, month, dueDay),
      isOverdue,
      isDueToday,
      isUpcoming,
      isPaid
    };

    if (!duesByDay[dueDay]) duesByDay[dueDay] = [];
    duesByDay[dueDay].push(item);
  });

  // 2. Loans & EMI: Include ALL loans from loan and EMI page
  loansList.forEach(loan => {
    const emiDay = Number(loan.dueDay) || 5;
    const metrics = calculateLoanEMIs(loan);
    const schedule = generateEmiSchedule(loan, metrics);

    // Find schedule item matching the viewed month and year
    const scheduleItem = schedule.find(s => {
      if (s.year === year && s.month === month) return true;
      if (!s.dateStr) return false;
      const [y, m] = s.dateStr.split('-').map(Number);
      return y === year && m === (month + 1);
    });

    // Also check actual transactions in this viewed month for EMI payment of this loan
    const matchingLoanTx = transactionsList.find(t => {
      if (!t.date) return false;
      const [y, m] = t.date.split('-').map(Number);
      if (y !== year || m !== (month + 1)) return false;
      const desc = String(t.description || '').toLowerCase();
      const sub = String(t.subcategory || '').toLowerCase();
      const cat = String(t.category || '').toLowerCase();
      const lName = loan.name.toLowerCase();
      const lender = (loan.lender || '').toLowerCase();
      const lNum = (loan.loanNumber || '').toLowerCase();

      const isEmi = cat.includes('debt') || cat.includes('loan') || cat.includes('emi') || sub.includes('emi') || desc.includes('emi');
      const matches = desc.includes(lName) || (lender && desc.includes(lender)) || (lNum && desc.includes(lNum));
      return isEmi && matches;
    });

    // If there is NO scheduled EMI for this month and NO matching payment transaction, skip!
    if (!scheduleItem && !matchingLoanTx) {
      return;
    }

    // Paid status:
    // 1. Closed loan
    // 2. Matching loan transaction in this month
    // 3. scheduleItem.status === 'paid'
    // 4. scheduleItem.index in paidScheduleIndices
    // 5. scheduleItem.index <= loan.paidMonths
    // 6. scheduleItem.index <= metrics.completedEmis
    const isPaid =
      metrics.isClosed ||
      Boolean(matchingLoanTx) ||
      (scheduleItem && scheduleItem.status === 'paid') ||
      Boolean(scheduleItem && loan.paidScheduleIndices?.includes(scheduleItem.index)) ||
      Boolean(scheduleItem && typeof loan.paidMonths === 'number' && scheduleItem.index <= loan.paidMonths) ||
      Boolean(scheduleItem && scheduleItem.index <= metrics.completedEmis);

    const emiAmt = scheduleItem && scheduleItem.emiAmount > 0
      ? scheduleItem.emiAmount
      : (metrics.emi || loan.emiAmount || 0);

    // Skip closed loans in future months when they have 0 EMI scheduled
    if (metrics.isClosed && isFutureMonth && !matchingLoanTx) return;

    const isDueToday = !isPaid && isViewingCurrentMonth && emiDay === todayD;
    const isOverdue = !isPaid && (isPastMonth || (isViewingCurrentMonth && emiDay < todayD));
    const isUpcoming = !isPaid && (isFutureMonth || (isViewingCurrentMonth && emiDay > todayD));

    const item: DueItem = {
      id: `loan-${loan.id}-${year}-${month}`,
      loanId: loan.id,
      type: 'loan',
      name: loan.name,
      subtext: `${loan.lender || 'Bank'} EMI • Due on ${emiDay}th`,
      amount: emiAmt,
      dueDay: emiDay,
      dueDate: formatYmd(year, month, emiDay),
      isOverdue,
      isDueToday,
      isUpcoming,
      isPaid
    };

    if (!duesByDay[emiDay]) duesByDay[emiDay] = [];
    duesByDay[emiDay].push(item);
  });

  return duesByDay;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ onOpenNewTransaction, onNavigateToLoan }) => {
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const yr = yearService.getSelectedYear();
    const now = new Date();
    return new Date(yr, now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedYearMonth, setSelectedYearMonth] = useState<number>(() => new Date().getMonth());
  const [transactions, setTransactions] = useState<any[]>([]);

  const [filterMode, setFilterMode] = useState<'all' | 'transactions' | 'dues' | 'overdue'>('all');
  const [sendingEod, setSendingEod] = useState<boolean>(false);

  // Cards and Loans
  const [cards, setCards] = useState<CardModel[]>(() => cardService.getCards(user?.email));
  const [loans, setLoans] = useState<LoanModel[]>(() => loanService.getLoans(user?.email));

  // Current viewed month and year
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Today reference
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  // Load transactions
  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setTransactions(res.data.data);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchTransactions();
    setCards(cardService.getCards(user?.email));
    setLoans(loanService.getLoans(user?.email));
  }, [user]);

  // Synchronize year with global yearService
  useEffect(() => {
    const handleYearSync = (e: any) => {
      const yr = Number(e.detail);
      if (!isNaN(yr) && yr !== currentDate.getFullYear()) {
        setCurrentDate(new Date(yr, currentDate.getMonth(), 1));
      }
    };
    window.addEventListener('fintrack-year-changed', handleYearSync);
    return () => window.removeEventListener('fintrack-year-changed', handleYearSync);
  }, [currentDate]);

  // Listen for external updates
  useEffect(() => {
    const handleCards = () => setCards(cardService.getCards(user?.email));
    const handleLoans = () => setLoans(loanService.getLoans(user?.email));
    const handleTx = () => fetchTransactions();
    window.addEventListener('fintrack-cards-updated', handleCards);
    window.addEventListener('fintrack-loans-changed', handleLoans);
    window.addEventListener('fintrack-transactions-changed', handleTx);
    return () => {
      window.removeEventListener('fintrack-cards-updated', handleCards);
      window.removeEventListener('fintrack-loans-changed', handleLoans);
      window.removeEventListener('fintrack-transactions-changed', handleTx);
    };
  }, [user?.email]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    } else {
      const prevYr = currentYear - 1;
      setCurrentDate(new Date(prevYr, currentMonth, 1));
      yearService.setSelectedYear(prevYr);
    }
  };

  const handleNextMonth = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    } else {
      const nextYr = currentYear + 1;
      setCurrentDate(new Date(nextYr, currentMonth, 1));
      yearService.setSelectedYear(nextYr);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    setSelectedYearMonth(now.getMonth());
    yearService.setSelectedYear(now.getFullYear());
  };

  // Direct year selection handler
  const handleSelectYear = (yr: number) => {
    setCurrentDate(new Date(yr, currentMonth, 1));
    setSelectedDate(new Date(yr, selectedDate.getMonth(), Math.min(selectedDate.getDate(), 28)));
    yearService.setSelectedYear(yr);
  };

  // Build card dues & loan dues for the viewed month
  const monthlyDuesMap = useMemo(() => {
    return computeDuesForMonth(
      currentYear,
      currentMonth,
      cards,
      loans,
      transactions,
      todayYear,
      todayMonth,
      todayDay
    );
  }, [cards, loans, transactions, currentYear, currentMonth, todayYear, todayMonth, todayDay]);

  // Aggregate monthly totals and transactions map
  const { dailyTxMap, monthIncome, monthExpense, monthSavings } = useMemo(() => {
    const map: Record<number, any[]> = {};
    let inc = 0;
    let exp = 0;
    let sav = 0;

    transactions.forEach(t => {
      if (!t.date) return;
      const [y, m, d] = t.date.split('-').map(Number);
      if (y === currentYear && m === (currentMonth + 1)) {
        if (!map[d]) map[d] = [];
        map[d].push(t);

        const amt = Number(t.amount) || 0;
        const type = (t.type || 'expense').toLowerCase();
        if (type === 'income') inc += amt;
        else if (type === 'savings') sav += amt;
        else exp += amt;
      }
    });

    return { dailyTxMap: map, monthIncome: inc, monthExpense: exp, monthSavings: inc - exp };
  }, [transactions, currentYear, currentMonth]);

  // Monthly Dues Counts
  const allMonthlyDues = useMemo(() => {
    const list: DueItem[] = [];
    Object.values(monthlyDuesMap).forEach(arr => list.push(...arr));
    return list;
  }, [monthlyDuesMap]);

  const totalUpcomingDuesAmount = allMonthlyDues
    .filter(d => !d.isPaid)
    .reduce((sum, d) => sum + d.amount, 0);

  const totalOverdueDues = allMonthlyDues.filter(d => d.isOverdue && !d.isPaid);
  const totalOverdueAmount = totalOverdueDues.reduce((sum, d) => sum + d.amount, 0);

  // Full Yearly Aggregates & Dues Audit for all 12 months
  const yearlyData = useMemo(() => {
    const monthsData = Array.from({ length: 12 }, (_, mIdx) => {
      let inc = 0;
      let exp = 0;
      let sav = 0;

      transactions.forEach(t => {
        if (!t.date) return;
        const [y, m] = t.date.split('-').map(Number);
        if (y === currentYear && m === (mIdx + 1)) {
          const amt = Number(t.amount) || 0;
          const type = (t.type || 'expense').toLowerCase();
          if (type === 'income') inc += amt;
          else if (type === 'savings') sav += amt;
          else exp += amt;
        }
      });

      const duesMap = computeDuesForMonth(
        currentYear,
        mIdx,
        cards,
        loans,
        transactions,
        todayYear,
        todayMonth,
        todayDay
      );
      const allDues: DueItem[] = [];
      Object.values(duesMap).forEach(arr => allDues.push(...arr));

      const paidDues = allDues.filter(d => d.isPaid);
      const overdueDues = allDues.filter(d => !d.isPaid && d.isOverdue);
      const upcomingDues = allDues.filter(d => !d.isPaid && !d.isOverdue);

      const emiDues = allDues.filter(d => d.type === 'loan');
      const paidEmis = paidDues.filter(d => d.type === 'loan');
      const upcomingEmis = upcomingDues.filter(d => d.type === 'loan');
      const overdueEmis = overdueDues.filter(d => d.type === 'loan');

      return {
        monthIndex: mIdx,
        monthName: MONTH_NAMES[mIdx],
        income: inc,
        expense: exp,
        savings: sav,
        net: inc - exp,
        allDues,
        paidDues,
        overdueDues,
        upcomingDues,
        emiDues,
        paidEmis,
        upcomingEmis,
        overdueEmis,
        emiCount: emiDues.length,
        paidEmiCount: paidEmis.length,
        upcomingEmiCount: upcomingEmis.length,
        overdueEmiCount: overdueEmis.length,
        paidCount: paidDues.length,
        paidAmount: paidDues.reduce((s, d) => s + d.amount, 0),
        overdueCount: overdueDues.length,
        overdueAmount: overdueDues.reduce((s, d) => s + d.amount, 0),
        upcomingCount: upcomingDues.length,
        upcomingAmount: upcomingDues.reduce((s, d) => s + d.amount, 0),
      };
    });

    const totalYearIncome = monthsData.reduce((s, m) => s + m.income, 0);
    const totalYearExpense = monthsData.reduce((s, m) => s + m.expense, 0);
    const totalYearSavings = monthsData.reduce((s, m) => s + m.savings, 0);
    const totalYearNet = totalYearIncome - totalYearExpense;

    const totalYearEmiCount = monthsData.reduce((s, m) => s + m.emiCount, 0);
    const totalYearEmiPaidCount = monthsData.reduce((s, m) => s + m.paidEmiCount, 0);
    const totalYearEmiUpcomingCount = monthsData.reduce((s, m) => s + m.upcomingEmiCount, 0);
    const totalYearEmiOverdueCount = monthsData.reduce((s, m) => s + m.overdueEmiCount, 0);

    const totalYearPaidCount = monthsData.reduce((s, m) => s + m.paidCount, 0);
    const totalYearPaidAmount = monthsData.reduce((s, m) => s + m.paidAmount, 0);

    const totalYearPendingCount = monthsData.reduce((s, m) => s + m.upcomingCount, 0);
    const totalYearPendingAmount = monthsData.reduce((s, m) => s + m.upcomingAmount, 0);

    const totalYearOverdueCount = monthsData.reduce((s, m) => s + m.overdueCount, 0);
    const totalYearOverdueAmount = monthsData.reduce((s, m) => s + m.overdueAmount, 0);

    return {
      monthsData,
      totalYearIncome,
      totalYearExpense,
      totalYearSavings,
      totalYearNet,
      totalYearEmiCount,
      totalYearEmiPaidCount,
      totalYearEmiUpcomingCount,
      totalYearEmiOverdueCount,
      totalYearPaidCount,
      totalYearPaidAmount,
      totalYearPendingCount,
      totalYearPendingAmount,
      totalYearOverdueCount,
      totalYearOverdueAmount,
    };
  }, [transactions, cards, loans, currentYear, todayYear, todayMonth, todayDay]);

  // List of available selectable years
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    const nowY = new Date().getFullYear();
    for (let y = nowY - 2; y <= nowY + 4; y++) {
      set.add(y);
    }
    transactions.forEach(t => {
      if (t.date) {
        const y = Number(t.date.split('-')[0]);
        if (!isNaN(y) && y >= 2000 && y <= 2100) set.add(y);
      }
    });
    loans.forEach(l => {
      if (l.startDate) {
        const y = Number(l.startDate.split('-')[0]);
        if (!isNaN(y)) set.add(y);
      }
      if (l.endDate) {
        const y = Number(l.endDate.split('-')[0]);
        if (!isNaN(y)) set.add(y);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [transactions, loans]);

  // Multi-Year Summary comparison dataset
  const allYearsSummary = useMemo(() => {
    return availableYears.map(yr => {
      let inc = 0;
      let exp = 0;

      transactions.forEach(t => {
        if (!t.date) return;
        const [y] = t.date.split('-').map(Number);
        if (y === yr) {
          const amt = Number(t.amount) || 0;
          const type = (t.type || 'expense').toLowerCase();
          if (type === 'income') inc += amt;
          else exp += amt;
        }
      });

      let yrEmiCount = 0;
      let yrPaidEmiCount = 0;
      let yrUpcomingEmiCount = 0;
      let yrOverdueEmiCount = 0;

      for (let m = 0; m < 12; m++) {
        const dMap = computeDuesForMonth(yr, m, cards, loans, transactions, todayYear, todayMonth, todayDay);
        Object.values(dMap).forEach(arr => {
          arr.forEach(d => {
            if (d.type === 'loan') {
              yrEmiCount++;
              if (d.isPaid) yrPaidEmiCount++;
              else if (d.isOverdue) yrOverdueEmiCount++;
              else yrUpcomingEmiCount++;
            }
          });
        });
      }

      return {
        year: yr,
        income: inc,
        expense: exp,
        savings: inc - exp,
        totalEmiCount: yrEmiCount,
        paidEmiCount: yrPaidEmiCount,
        upcomingEmiCount: yrUpcomingEmiCount,
        overdueEmiCount: yrOverdueEmiCount,
      };
    });
  }, [availableYears, transactions, cards, loans, todayYear, todayMonth, todayDay]);

  // Calendar Day Generation (Month View)
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const cells: {
      type: 'empty' | 'day';
      day?: number;
      dateStr?: string;
      isToday?: boolean;
      isSelected?: boolean;
      txList?: any[];
      duesList?: DueItem[];
      dayIncome?: number;
      dayExpense?: number;
      daySavings?: number;
    }[] = [];

    // Leading empty padding cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ type: 'empty' });
    }

    // Actual day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = currentYear === todayYear && currentMonth === todayMonth && day === todayDay;
      const isSelected =
        currentYear === selectedDate.getFullYear() &&
        currentMonth === selectedDate.getMonth() &&
        day === selectedDate.getDate();

      const txList = dailyTxMap[day] || [];
      const duesList = monthlyDuesMap[day] || [];

      let dInc = 0;
      let dExp = 0;
      let dSav = 0;
      txList.forEach(t => {
        const amt = Number(t.amount) || 0;
        const type = (t.type || 'expense').toLowerCase();
        if (type === 'income') dInc += amt;
        else if (type === 'savings') dSav += amt;
        else dExp += amt;
      });

      cells.push({
        type: 'day',
        day,
        dateStr: formatYmd(currentYear, currentMonth, day),
        isToday,
        isSelected,
        txList,
        duesList,
        dayIncome: dInc,
        dayExpense: dExp,
        daySavings: dSav
      });
    }

    return cells;
  }, [currentYear, currentMonth, todayYear, todayMonth, todayDay, selectedDate, dailyTxMap, monthlyDuesMap]);

  // Selected Day Details in Month View
  const selectedDayNum = selectedDate.getDate();
  const isSelectedDateInCurrentMonth =
    selectedDate.getFullYear() === currentYear && selectedDate.getMonth() === currentMonth;

  const selectedDayTxs = isSelectedDateInCurrentMonth ? (dailyTxMap[selectedDayNum] || []) : [];
  const selectedDayDues = isSelectedDateInCurrentMonth ? (monthlyDuesMap[selectedDayNum] || []) : [];

  const selectedDayIncome = selectedDayTxs
    .filter(t => (t.type || '').toLowerCase() === 'income')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const selectedDayExpense = selectedDayTxs
    .filter(t => (t.type || '').toLowerCase() !== 'income' && (t.type || '').toLowerCase() !== 'savings')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Selected Month in Year View Details
  const selectedYearMonthData = yearlyData.monthsData[selectedYearMonth] || yearlyData.monthsData[0];

  // Trigger End of Day Summary manually
  const handleTriggerEod = async () => {
    try {
      setSendingEod(true);
      const targetDate = formatYmd(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      const res = await api.post('/reports/send-daily-eod-summary', { date: targetDate });
      if (res.data?.success) {
        showToast({
          title: 'Daily Report Sent',
          message: `Official End-of-Day Financial Digest dispatched to ${res.data.email || user?.email}.`,
          type: 'success'
        });
      } else {
        showToast({
          title: 'Dispatch Failed',
          message: res.data?.message || 'Could not send EOD report.',
          type: 'error'
        });
      }
    } catch {
      showToast({
        title: 'Error',
        message: 'Failed to send End of Day digest email.',
        type: 'error'
      });
    } finally {
      setSendingEod(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarIcon size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
              Financial Calendar &amp; Payment Dues
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              {viewMode === 'month'
                ? 'Monthly schedule with daily cash flows, credit card bill dues, and loan EMI status tracking.'
                : 'Annual 12-month calendar overview comparing inflow, outflow, net savings, and EMI status counts.'}
            </p>
          </div>
        </div>

        {/* Action Controls & View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Month / Year Switcher */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-card)',
              padding: 3,
              borderRadius: 10,
              border: '1px solid var(--border-color)'
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                background: viewMode === 'month' ? '#3B82F6' : 'transparent',
                color: viewMode === 'month' ? '#FFF' : 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <CalendarDays size={14} />
              <span>Month</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('year')}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                background: viewMode === 'year' ? '#3B82F6' : 'transparent',
                color: viewMode === 'year' ? '#FFF' : 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <CalendarIcon size={14} />
              <span>Year</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleToday}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Clock size={14} />
            <span>{viewMode === 'month' ? 'Go to Today' : 'Current Year'}</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerEod}
            disabled={sendingEod}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(99, 102, 241, 0.3)',
              background: 'rgba(99, 102, 241, 0.12)',
              color: '#818CF8',
              fontWeight: 700,
              fontSize: 13,
              cursor: sendingEod ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            title="Generate and email official daily digest"
          >
            <Send size={14} />
            <span>{sendingEod ? 'Sending Digest...' : 'Email Daily Digest'}</span>
          </button>

          {onOpenNewTransaction && (
            <button
              type="button"
              onClick={() => onOpenNewTransaction()}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Plus size={15} />
              <span>Add Transaction</span>
            </button>
          )}
        </div>
      </div>

      {/* Year Selector Pills Bar (2024, 2025, 2026, 2027, ...) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          padding: '10px 16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          overflowX: 'auto',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
          <CalendarIcon size={15} color="#3B82F6" />
          <span>Financial Year:</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          {availableYears.map(yr => {
            const isSelected = yr === currentYear;
            const isCurrentRealYear = yr === todayYear;
            return (
              <button
                key={`year-pill-${yr}`}
                type="button"
                onClick={() => handleSelectYear(yr)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: isSelected ? '1px solid #3B82F6' : '1px solid var(--border-color)',
                  background: isSelected
                    ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                    : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected ? '#FFF' : 'var(--text-primary)',
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: isSelected ? '0 2px 10px rgba(37, 99, 235, 0.4)' : 'none',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>{yr}</span>
                {isCurrentRealYear && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(59, 130, 246, 0.15)',
                      color: isSelected ? '#FFF' : '#60A5FA'
                    }}
                  >
                    CURRENT
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Overview Bar */}
      {viewMode === 'month' ? (
        /* Monthly KPI Bar */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {/* Total Inflow */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Month Inflow</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 6 }}>
              +{currencyService.format(monthIncome)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Income this month</span>
          </div>

          {/* Total Outflow */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Month Outflow</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444', marginTop: 6 }}>
              -{currencyService.format(monthExpense)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expenses this month</span>
          </div>

          {/* Net Cash Flow */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Net Cash Flow</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: monthSavings >= 0 ? '#10B981' : '#EF4444', marginTop: 6 }}>
              {currencyService.format(monthSavings)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net balance saved</span>
          </div>

          {/* Upcoming Dues (Cards + Loans) */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pending Dues</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B', marginTop: 6 }}>
              {currencyService.format(totalUpcomingDuesAmount)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cards &amp; Loans pending</span>
          </div>

          {/* Overdue Alerts */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Overdue Dues</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: totalOverdueAmount > 0 ? '#EF4444' : '#10B981', marginTop: 6 }}>
              {totalOverdueDues.length > 0 ? `${totalOverdueDues.length} Overdue (${currencyService.format(totalOverdueAmount)})` : 'None (All Clear)'}
            </div>
            <span style={{ fontSize: 11, color: totalOverdueAmount > 0 ? '#EF4444' : '#10B981' }}>
              {totalOverdueAmount > 0 ? 'Action required immediately' : 'No past-due payments'}
            </span>
          </div>
        </div>
      ) : (
        /* Yearly KPI Bar with Income, Expense, Savings, EMI Count, Paid Count, Upcoming Count */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {/* Year Inflow (Income) */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentYear} Total Inflow</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 6 }}>
              +{currencyService.format(yearlyData.totalYearIncome)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>12 Months Income</span>
          </div>

          {/* Year Outflow (Expense) */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentYear} Total Outflow</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444', marginTop: 6 }}>
              -{currencyService.format(yearlyData.totalYearExpense)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>12 Months Expenses</span>
          </div>

          {/* Year Net Savings */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentYear} Net Savings</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: yearlyData.totalYearNet >= 0 ? '#10B981' : '#EF4444', marginTop: 6 }}>
              {currencyService.format(yearlyData.totalYearNet)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Annual Retained Surplus</span>
          </div>

          {/* Total Year EMI Count */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentYear} Total EMIs</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(129, 140, 248, 0.15)', color: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Coins size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#818CF8', marginTop: 6 }}>
              {yearlyData.totalYearEmiCount} EMIs
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {yearlyData.totalYearPaidCount + yearlyData.totalYearPendingCount + yearlyData.totalYearOverdueCount} total dues scheduled
            </span>
          </div>

          {/* Year Paid EMI Count */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Year Paid Count</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 6 }}>
              {yearlyData.totalYearEmiPaidCount} Paid
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {currencyService.format(yearlyData.totalYearPaidAmount)} cleared
            </span>
          </div>

          {/* Year Upcoming EMI Count */}
          <div className="kpi-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Year Upcoming Count</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: yearlyData.totalYearEmiOverdueCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: yearlyData.totalYearEmiOverdueCount > 0 ? '#EF4444' : '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={15} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B', marginTop: 6 }}>
              {yearlyData.totalYearEmiUpcomingCount} Due {yearlyData.totalYearEmiOverdueCount > 0 ? `• ${yearlyData.totalYearEmiOverdueCount} Overdue` : ''}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {currencyService.format(yearlyData.totalYearPendingAmount + yearlyData.totalYearOverdueAmount)} outstanding
            </span>
          </div>
        </div>
      )}

      {/* Navigation & Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          padding: '14px 20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          marginBottom: 20
        }}
      >
        {/* Selector Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={viewMode === 'month' ? 'Previous Month' : 'Previous Year'}
          >
            <ChevronLeft size={18} />
          </button>

          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', minWidth: 200, textAlign: 'center' }}>
            {viewMode === 'month' ? `${MONTH_NAMES[currentMonth]} ${currentYear}` : `${currentYear} Annual Overview`}
          </h2>

          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={viewMode === 'month' ? 'Next Month' : 'Next Year'}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Filter Pills (for Month View) */}
        {viewMode === 'month' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'transactions', label: 'Transactions' },
              { id: 'dues', label: 'Payment Dues' },
              { id: 'overdue', label: 'Overdue Only' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id as any)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: filterMode === f.id ? '1px solid #3B82F6' : '1px solid var(--border-color)',
                  background: filterMode === f.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  color: filterMode === f.id ? '#60A5FA' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid + Inspector Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: 20, alignItems: 'start' }}>
        {/* Main Calendar View Area */}
        {viewMode === 'month' ? (
          /* ========================================================================= */
          /* 1. MONTH VIEW (Day-by-Day Fixed Grid)                                     */
          /* ========================================================================= */
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
            }}
          >
            {/* Day of Week Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid var(--border-color)',
                textAlign: 'center',
                padding: '12px 0',
                fontWeight: 800,
                fontSize: 12,
                color: 'var(--text-secondary)',
                letterSpacing: 0.5,
                width: '100%',
                tableLayout: 'fixed'
              }}
            >
              <div style={{ color: '#EF4444' }}>SUN</div>
              <div>MON</div>
              <div>TUE</div>
              <div>WED</div>
              <div>THU</div>
              <div>FRI</div>
              <div style={{ color: '#3B82F6' }}>SAT</div>
            </div>

            {/* Calendar Cells Grid: Strict minmax(0, 1fr) ensures columns never stretch */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridAutoRows: 'minmax(115px, auto)',
                gap: 1,
                background: 'var(--border-color)',
                width: '100%',
                tableLayout: 'fixed'
              }}
            >
              {calendarCells.map((cell, idx) => {
                if (cell.type === 'empty') {
                  return (
                    <div
                      key={`empty-${idx}`}
                      style={{ background: 'var(--bg-primary)', opacity: 0.4, minHeight: 115, minWidth: 0 }}
                    />
                  );
                }

                const day = cell.day!;
                const isToday = cell.isToday;
                const isSelected = cell.isSelected;
                const duesList = cell.duesList || [];
                const dayIncome = cell.dayIncome || 0;
                const dayExpense = cell.dayExpense || 0;
                const daySavings = cell.daySavings || 0;

                const showTxs = filterMode === 'all' || filterMode === 'transactions';
                const showDues = filterMode === 'all' || filterMode === 'dues' || filterMode === 'overdue';
                const hasOverdue = duesList.some(d => d.isOverdue && !d.isPaid);

                // Group dues by status as requested by user
                const overdueList = duesList.filter(d => !d.isPaid && d.isOverdue);
                const dueTodayList = duesList.filter(d => !d.isPaid && d.isDueToday);
                const upcomingList = duesList.filter(d => !d.isPaid && d.isUpcoming && !d.isDueToday);
                const paidList = duesList.filter(d => d.isPaid);

                return (
                  <div
                    key={`day-${day}`}
                    onClick={() => setSelectedDate(new Date(currentYear, currentMonth, day))}
                    style={{
                      background: isSelected
                        ? 'rgba(59, 130, 246, 0.12)'
                        : isToday
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'var(--bg-card)',
                      border: isSelected
                        ? '2px solid #3B82F6'
                        : isToday
                        ? '1px solid rgba(59, 130, 246, 0.5)'
                        : 'none',
                      padding: '7px 7px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      minHeight: 115,
                      minWidth: 0, // CRITICAL: locks column width so it never expands
                      overflow: 'hidden',
                      boxSizing: 'border-box'
                    }}
                  >
                    {/* Top Cell Bar (Day number & Overdue indicator) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: isToday || isSelected ? 800 : 700,
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: isToday ? '#3B82F6' : 'transparent',
                          color: isToday ? '#FFF' : (isSelected ? '#3B82F6' : 'var(--text-primary)'),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {day}
                      </span>

                      {hasOverdue && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: '#EF4444',
                            color: '#FFF',
                            letterSpacing: 0.3
                          }}
                          title="Payment Overdue!"
                        >
                          OVERDUE
                        </span>
                      )}
                    </div>

                    {/* Middle Area: Inflow / Outflow & Dues Status Badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                      {/* Daily Income Trend */}
                      {showTxs && dayIncome > 0 && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#10B981',
                            background: 'rgba(16, 185, 129, 0.12)',
                            padding: '1.5px 5px',
                            borderRadius: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={`Income: +${currencyService.format(dayIncome)}`}
                        >
                          +{currencyService.format(dayIncome)}
                        </div>
                      )}

                      {/* Daily Expense Trend */}
                      {showTxs && dayExpense > 0 && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#EF4444',
                            background: 'rgba(239, 68, 68, 0.12)',
                            padding: '1.5px 5px',
                            borderRadius: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={`Expense: -${currencyService.format(dayExpense)}`}
                        >
                          -{currencyService.format(dayExpense)}
                        </div>
                      )}

                      {/* Daily Savings Trend */}
                      {showTxs && daySavings > 0 && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#818CF8',
                            background: 'rgba(99, 102, 241, 0.12)',
                            padding: '1.5px 5px',
                            borderRadius: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={`Savings: ${currencyService.format(daySavings)}`}
                        >
                          🏦 {currencyService.format(daySavings)}
                        </div>
                      )}

                      {/* EMI & Credit Card Status ONLY (User requirement: no long text, status only) */}
                      {showDues && duesList.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5, marginTop: 2, minWidth: 0 }}>
                          {/* Overdue Badge */}
                          {overdueList.length > 0 && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#EF4444',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title={`${overdueList.length} Overdue: ${overdueList.map(d => `${d.name} (${currencyService.format(d.amount)})`).join(', ')}`}
                            >
                              <span>⚠</span>
                              <span>Overdue ({overdueList.length})</span>
                            </div>
                          )}

                          {/* Due Today Badge */}
                          {dueTodayList.length > 0 && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: 'rgba(239, 68, 68, 0.25)',
                                color: '#DC2626',
                                border: '1px solid #DC2626',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title={`${dueTodayList.length} Due Today: ${dueTodayList.map(d => `${d.name} (${currencyService.format(d.amount)})`).join(', ')}`}
                            >
                              <span>🔴</span>
                              <span>Due Today ({dueTodayList.length})</span>
                            </div>
                          )}

                          {/* Upcoming Badge */}
                          {upcomingList.length > 0 && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#F59E0B',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title={`${upcomingList.length} Upcoming: ${upcomingList.map(d => `${d.name} (${currencyService.format(d.amount)})`).join(', ')}`}
                            >
                              <span>⏰</span>
                              <span>Upcoming ({upcomingList.length})</span>
                            </div>
                          )}

                          {/* Paid Badge */}
                          {paidList.length > 0 && (
                            <div
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10B981',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                              title={`${paidList.length} Paid: ${paidList.map(d => d.name).join(', ')}`}
                            >
                              <span>✓</span>
                              <span>Paid ({paidList.length})</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* 2. YEAR VIEW (12 Months Calendar Grid with Financial & Dues Summary)       */
          /* ========================================================================= */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Multi-Year Overview Comparison Grid */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                padding: '16px 18px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Coins size={16} color="#818CF8" />
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Annual Financial &amp; EMI Performance by Year
                  </span>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Click any year to view that year's 12-month calendar &amp; EMI breakdown
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                {allYearsSummary.map(ySum => {
                  const isSelected = ySum.year === currentYear;
                  return (
                    <div
                      key={`multi-yr-card-${ySum.year}`}
                      onClick={() => handleSelectYear(ySum.year)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? '2px solid #3B82F6' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 10px rgba(59, 130, 246, 0.2)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: isSelected ? '#3B82F6' : 'var(--text-primary)' }}>
                          {ySum.year}
                        </span>
                        {isSelected && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#3B82F6', color: '#FFF' }}>
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Income:</span>
                          <strong style={{ color: '#10B981' }}>+{currencyService.format(ySum.income)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Expense:</span>
                          <strong style={{ color: '#EF4444' }}>-{currencyService.format(ySum.expense)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Savings:</span>
                          <strong style={{ color: ySum.savings >= 0 ? '#10B981' : '#EF4444' }}>{currencyService.format(ySum.savings)}</strong>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
                          <span style={{ color: 'var(--text-muted)' }}>EMIs:</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {ySum.totalEmiCount} Total • <span style={{ color: '#10B981' }}>{ySum.paidEmiCount} Paid</span> • <span style={{ color: '#F59E0B' }}>{ySum.upcomingEmiCount} Due</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 12 Months Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16
              }}
            >
              {yearlyData.monthsData.map(mData => {
                const mIdx = mData.monthIndex;
                const isSelected = selectedYearMonth === mIdx;
                const isCurrent = mIdx === todayMonth && currentYear === todayYear;

                return (
                  <div
                    key={`year-m-${mIdx}`}
                    onClick={() => setSelectedYearMonth(mIdx)}
                    style={{
                      background: isSelected
                        ? 'rgba(59, 130, 246, 0.08)'
                        : 'var(--bg-card)',
                      border: isSelected
                        ? '2px solid #3B82F6'
                        : isCurrent
                        ? '1px solid rgba(59, 130, 246, 0.5)'
                        : '1px solid var(--border-color)',
                      borderRadius: 14,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 16px rgba(59, 130, 246, 0.15)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    {/* Card Header: Month Name + Current Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: isSelected ? '#3B82F6' : 'var(--text-primary)' }}>
                          {mData.monthName}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#3B82F6', color: '#FFF' }}>
                            CURRENT
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentDate(new Date(currentYear, mIdx, 1));
                          setSelectedDate(new Date(currentYear, mIdx, 1));
                          setViewMode('month');
                        }}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 6,
                          color: '#60A5FA',
                          cursor: 'pointer'
                        }}
                        title="Open full day calendar for this month"
                      >
                        Open Month ↗
                      </button>
                    </div>

                    {/* Financial Flow Overview */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Inflow:</span>
                        <strong style={{ color: '#10B981' }}>+{currencyService.format(mData.income)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Outflow:</span>
                        <strong style={{ color: '#EF4444' }}>-{currencyService.format(mData.expense)}</strong>
                      </div>
                      {mData.savings > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Savings:</span>
                          <strong style={{ color: '#818CF8' }}>{currencyService.format(mData.savings)}</strong>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Net Flow:</span>
                        <strong style={{ color: mData.net >= 0 ? '#10B981' : '#EF4444' }}>
                          {currencyService.format(mData.net)}
                        </strong>
                      </div>
                    </div>

                    {/* EMI / Bill Due Status Pill Badges */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {mData.paidCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10B981',
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          ✓ {mData.paidCount} Paid
                        </span>
                      )}

                      {mData.upcomingCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#F59E0B',
                            border: '1px solid rgba(245, 158, 11, 0.3)'
                          }}
                        >
                          ⏰ {mData.upcomingCount} Due
                        </span>
                      )}

                      {mData.overdueCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.4)'
                          }}
                        >
                          ⚠ {mData.overdueCount} Overdue
                        </span>
                      )}

                      {mData.allDues.length === 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No EMIs or card bills
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Right-Side Inspector Drawer (Daily in Month View / Monthly in Year View)  */}
        {/* ========================================================================= */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 18,
            padding: 22,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18
          }}
        >
          {viewMode === 'month' ? (
            /* Month View: Selected Date Inspector */
            <>
              {/* Day Header */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Daily Ledger &amp; Due Audit
                  </span>
                  {selectedDate.toDateString() === today.toDateString() && (
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#3B82F6', color: '#FFF' }}>
                      TODAY
                    </span>
                  )}
                </div>
                <h3 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
              </div>

              {/* Daily Totals Pills */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#10B981', display: 'block' }}>DAILY INFLOW</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#10B981' }}>+{currencyService.format(selectedDayIncome)}</span>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#EF4444', display: 'block' }}>DAILY OUTFLOW</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#EF4444' }}>-{currencyService.format(selectedDayExpense)}</span>
                </div>
              </div>

              {/* Dues on This Date */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Scheduled Payment Dues ({selectedDayDues.length})
                  </span>
                </div>

                {selectedDayDues.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                    No credit card bills or loan EMIs mapped to this day.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedDayDues.map(due => (
                      <div
                        key={due.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: due.isOverdue ? '1px solid #EF4444' : '1px solid var(--border-color)',
                          borderRadius: 10,
                          padding: 12
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {due.type === 'card' ? <CreditCard size={15} color="#F59E0B" /> : <Coins size={15} color="#818CF8" />}
                              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{due.name}</strong>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {due.subtext}
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 999,
                              background: due.isPaid
                                ? 'rgba(16, 185, 129, 0.15)'
                                : due.isOverdue
                                ? '#EF4444'
                                : '#F59E0B',
                              color: due.isPaid || !due.isOverdue ? (due.isPaid ? '#10B981' : '#000') : '#FFF'
                            }}
                          >
                            {due.isPaid ? 'PAID' : due.isOverdue ? 'OVERDUE' : due.isDueToday ? 'DUE TODAY' : 'UPCOMING'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Amount Payable:</span>
                          <div
                            onClick={() => {
                              if (due.type === 'loan' && due.loanId && onNavigateToLoan) {
                                onNavigateToLoan(due.loanId);
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              cursor: due.type === 'loan' && due.loanId ? 'pointer' : 'default',
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: due.type === 'loan' && due.loanId ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                              transition: 'all 0.15s ease'
                            }}
                            title={due.type === 'loan' && due.loanId ? 'Click to open and inspect loan details in Loans & EMI' : undefined}
                          >
                            <strong style={{ fontSize: 14, color: due.isPaid ? '#10B981' : '#EF4444', textDecoration: due.type === 'loan' && due.loanId ? 'underline' : 'none' }}>
                              {currencyService.format(due.amount)}
                            </strong>
                            {due.type === 'loan' && due.loanId && (
                              <span style={{ fontSize: 11, color: '#818CF8', fontWeight: 800 }}>↗</span>
                            )}
                          </div>
                        </div>

                        {due.type === 'loan' && due.loanId && onNavigateToLoan && (
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              onClick={() => onNavigateToLoan(due.loanId!)}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid rgba(129, 140, 248, 0.35)',
                                background: 'rgba(99, 102, 241, 0.1)',
                                color: '#818CF8',
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span>View Loan &amp; EMI Details ↗</span>
                            </button>
                          </div>
                        )}

                        {!due.isPaid && onOpenNewTransaction && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (due.type === 'loan') {
                                  onOpenNewTransaction('Debt Repayment', `${due.name} EMI`, 'expense');
                                } else {
                                  onOpenNewTransaction('Utilities & Bills', 'Credit Card Bill Payment', 'expense');
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '7px 12px',
                                borderRadius: 6,
                                border: 'none',
                                background: due.isDueToday || due.isOverdue
                                  ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                  : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                                color: '#FFF',
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                              }}
                            >
                              <span>{due.type === 'loan' ? '⚡ Record Loan EMI Payment' : '⚡ Record Card Bill Payment'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transactions on This Date */}
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Transactions ({selectedDayTxs.length})
                  </span>

                  {onOpenNewTransaction && (
                    <button
                      type="button"
                      onClick={() => onOpenNewTransaction()}
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
                      <span>Add for Today</span>
                    </button>
                  )}
                </div>

                {selectedDayTxs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0', textAlign: 'center' }}>
                    No transactions recorded on this date.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 250, overflowY: 'auto' }}>
                    {selectedDayTxs.map((t, idx) => {
                      const amt = Number(t.amount) || 0;
                      const isInc = (t.type || '').toLowerCase() === 'income';

                      return (
                        <div
                          key={t.id || idx}
                          style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            padding: '9px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {t.category || t.description || 'Transaction'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {t.paymentMode ? `via ${t.paymentMode}` : 'Direct'}
                              {t.subcategory && ` • ${t.subcategory}`}
                            </div>
                          </div>

                          <div style={{ fontWeight: 800, color: isInc ? '#10B981' : '#EF4444' }}>
                            {isInc ? '+' : '-'}{currencyService.format(amt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Year View: Selected Month Due & Audit Inspector */
            <>
              {/* Month Header */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Monthly Due &amp; Audit
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate(new Date(currentYear, selectedYearMonth, 1));
                      setSelectedDate(new Date(currentYear, selectedYearMonth, 1));
                      setViewMode('month');
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 6,
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3B82F6',
                      color: '#60A5FA',
                      cursor: 'pointer'
                    }}
                  >
                    View Day Calendar
                  </button>
                </div>
                <h3 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedYearMonthData.monthName} {currentYear}
                </h3>
              </div>

              {/* Monthly Flow Pills */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#10B981', display: 'block' }}>INFLOW</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#10B981' }}>+{currencyService.format(selectedYearMonthData.income)}</span>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#EF4444', display: 'block' }}>OUTFLOW</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#EF4444' }}>-{currencyService.format(selectedYearMonthData.expense)}</span>
                </div>
              </div>

              {/* EMI & Dues Counts Status Box (As user requested: emi paid, pending, upcoming that count) */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginBottom: 10 }}>
                  Payment Dues Breakdown ({selectedYearMonthData.allDues.length} Total)
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Paid Count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontWeight: 700 }}>
                      <CheckCircle2 size={14} />
                      <span>Paid EMIs &amp; Bills</span>
                    </div>
                    <strong style={{ color: '#10B981' }}>
                      {selectedYearMonthData.paidCount} Paid ({currencyService.format(selectedYearMonthData.paidAmount)})
                    </strong>
                  </div>

                  {/* Upcoming / Pending Count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontWeight: 700 }}>
                      <Clock size={14} />
                      <span>Pending / Upcoming</span>
                    </div>
                    <strong style={{ color: '#F59E0B' }}>
                      {selectedYearMonthData.upcomingCount} Due ({currencyService.format(selectedYearMonthData.upcomingAmount)})
                    </strong>
                  </div>

                  {/* Overdue Count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontWeight: 700 }}>
                      <AlertTriangle size={14} />
                      <span>Overdue Dues</span>
                    </div>
                    <strong style={{ color: '#EF4444' }}>
                      {selectedYearMonthData.overdueCount} Overdue ({currencyService.format(selectedYearMonthData.overdueAmount)})
                    </strong>
                  </div>
                </div>
              </div>

              {/* Scheduled Dues for this Month */}
              <div style={{ flexGrow: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginBottom: 10 }}>
                  Scheduled Dues List ({selectedYearMonthData.allDues.length})
                </span>

                {selectedYearMonthData.allDues.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>
                    No loans or credit card dues scheduled for {selectedYearMonthData.monthName} {currentYear}.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {selectedYearMonthData.allDues.map(due => (
                      <div
                        key={due.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: due.isOverdue ? '1px solid #EF4444' : '1px solid var(--border-color)',
                          borderRadius: 10,
                          padding: 10
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {due.type === 'card' ? <CreditCard size={14} color="#F59E0B" /> : <Coins size={14} color="#818CF8" />}
                              <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{due.name}</strong>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>Due on {due.dueDay}th •</span>
                              <span
                                onClick={() => {
                                  if (due.type === 'loan' && due.loanId && onNavigateToLoan) {
                                    onNavigateToLoan(due.loanId);
                                  }
                                }}
                                style={{
                                  cursor: due.type === 'loan' && due.loanId ? 'pointer' : 'default',
                                  textDecoration: due.type === 'loan' && due.loanId ? 'underline' : 'none',
                                  fontWeight: 700,
                                  color: due.isPaid ? '#10B981' : '#EF4444'
                                }}
                                title={due.type === 'loan' && due.loanId ? 'Click to open loan in Loans & EMI' : undefined}
                              >
                                {currencyService.format(due.amount)} {due.type === 'loan' && due.loanId ? '↗' : ''}
                              </span>
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 999,
                              background: due.isPaid
                                ? 'rgba(16, 185, 129, 0.15)'
                                : due.isOverdue
                                ? '#EF4444'
                                : '#F59E0B',
                              color: due.isPaid || !due.isOverdue ? (due.isPaid ? '#10B981' : '#000') : '#FFF'
                            }}
                          >
                            {due.isPaid ? 'PAID' : due.isOverdue ? 'OVERDUE' : 'UPCOMING'}
                          </span>
                        </div>

                        {due.type === 'loan' && due.loanId && onNavigateToLoan && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => onNavigateToLoan(due.loanId!)}
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: '1px solid rgba(129, 140, 248, 0.35)',
                                background: 'rgba(99, 102, 241, 0.1)',
                                color: '#818CF8',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span>View Loan &amp; EMI Details ↗</span>
                            </button>
                          </div>
                        )}

                        {!due.isPaid && onOpenNewTransaction && (
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (due.type === 'loan') {
                                  onOpenNewTransaction('Debt Repayment', `${due.name} EMI`, 'expense');
                                } else {
                                  onOpenNewTransaction('Utilities & Bills', 'Credit Card Bill Payment', 'expense');
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: 'none',
                                background: due.isOverdue
                                  ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                  : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                                color: '#FFF',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4
                              }}
                            >
                              <span>{due.type === 'loan' ? '⚡ Record EMI' : '⚡ Record Bill'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
