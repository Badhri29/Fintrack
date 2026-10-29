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
  Send
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { currencyService } from '../services/currencyService';
import { cardService, type CardModel } from '../services/cardService';
import { loanService, type LoanModel, calculateLoanEMIs } from '../services/loanService';
import { showToast } from '../components/ToastNotification';

interface CalendarViewProps {
  onOpenNewTransaction?: (category?: string, subcategory?: string, type?: 'income' | 'expense' | 'savings') => void;
}

interface DueItem {
  id: string;
  type: 'card' | 'loan';
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

export const CalendarView: React.FC<CalendarViewProps> = ({ onOpenNewTransaction }) => {
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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

  // Listen for external updates
  useEffect(() => {
    const handleCards = () => setCards(cardService.getCards(user?.email));
    const handleLoans = () => setLoans(loanService.getLoans(user?.email));
    window.addEventListener('fintrack-cards-updated', handleCards);
    window.addEventListener('fintrack-loans-changed', handleLoans);
    return () => {
      window.removeEventListener('fintrack-cards-updated', handleCards);
      window.removeEventListener('fintrack-loans-changed', handleLoans);
    };
  }, [user?.email]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  // Helper: Format YYYY-MM-DD
  const formatYmd = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // Build card dues & loan dues for the viewed month
  const monthlyDuesMap = useMemo(() => {
    const duesByDay: Record<number, DueItem[]> = {};

    // 1. Credit Cards
    cards.forEach(card => {
      if (!card.isActive) return;
      const dueDay = card.dueDay || 5;

      // Calculate actual outstanding for this card
      const cardTx = transactions.filter(t => {
        const mode = (t.paymentMode || '').toLowerCase();
        const cardMatch = (t.card || '').toLowerCase();
        const descMatch = (t.description || '').toLowerCase();
        const cName = card.name.toLowerCase();
        const isThisCard = mode.includes(cName) || cardMatch.includes(cName) || descMatch.includes(cName);
        return isThisCard;
      });

      let spend = 0;
      let paid = 0;
      cardTx.forEach(t => {
        const amt = Number(t.amount) || 0;
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        if (cat.includes('credit card bill') || desc.includes('bill payment')) {
          paid += amt;
        } else if (t.type !== 'income') {
          spend += amt;
        }
      });

      const netDue = Math.max(0, spend - paid);

      // Status determination
      const isViewingCurrentMonth = currentYear === todayYear && currentMonth === todayMonth;
      const isPastMonth = currentYear < todayYear || (currentYear === todayYear && currentMonth < todayMonth);

      const isDueToday = isViewingCurrentMonth && dueDay === todayDay;
      const isOverdue = (isPastMonth && netDue > 0) || (isViewingCurrentMonth && dueDay < todayDay && netDue > 0);
      const isUpcoming = isViewingCurrentMonth && dueDay > todayDay;
      const isPaid = netDue === 0;

      const item: DueItem = {
        id: `card-${card.id}-${currentYear}-${currentMonth}`,
        type: 'card',
        name: card.name,
        subtext: `${card.bank} • Due on ${dueDay}th`,
        amount: netDue,
        dueDay,
        dueDate: formatYmd(currentYear, currentMonth, dueDay),
        isOverdue,
        isDueToday,
        isUpcoming,
        isPaid
      };

      if (!duesByDay[dueDay]) duesByDay[dueDay] = [];
      duesByDay[dueDay].push(item);
    });

    // 2. Loans & EMI
    loans.forEach(loan => {
      if (loan.status === 'closed') return;
      const emiDay = Number(loan.dueDay) || 5;
      const metrics = calculateLoanEMIs(loan);
      const emiAmt = metrics.emi || 0;

      const isViewingCurrentMonth = currentYear === todayYear && currentMonth === todayMonth;
      const isPastMonth = currentYear < todayYear || (currentYear === todayYear && currentMonth < todayMonth);

      const isDueToday = isViewingCurrentMonth && emiDay === todayDay;
      const isOverdue = (isPastMonth && !metrics.isClosed) || (isViewingCurrentMonth && emiDay < todayDay);
      const isUpcoming = isViewingCurrentMonth && emiDay > todayDay;
      const isPaid = metrics.isClosed;

      const item: DueItem = {
        id: `loan-${loan.id}-${currentYear}-${currentMonth}`,
        type: 'loan',
        name: loan.name,
        subtext: `${loan.lender || 'Bank'} EMI • Due on ${emiDay}th`,
        amount: emiAmt,
        dueDay: emiDay,
        dueDate: formatYmd(currentYear, currentMonth, emiDay),
        isOverdue,
        isDueToday,
        isUpcoming,
        isPaid
      };

      if (!duesByDay[emiDay]) duesByDay[emiDay] = [];
      duesByDay[emiDay].push(item);
    });

    return duesByDay;
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

  // Calendar Day Generation
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
      txList.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') dInc += amt;
        else if (t.type !== 'savings') dExp += amt;
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
        dayExpense: dExp
      });
    }

    return cells;
  }, [currentYear, currentMonth, todayYear, todayMonth, todayDay, selectedDate, dailyTxMap, monthlyDuesMap]);

  // Selected Day Details
  const selectedDayNum = selectedDate.getDate();
  const isSelectedDateInCurrentMonth =
    selectedDate.getFullYear() === currentYear && selectedDate.getMonth() === currentMonth;

  const selectedDayTxs = isSelectedDateInCurrentMonth ? (dailyTxMap[selectedDayNum] || []) : [];
  const selectedDayDues = isSelectedDateInCurrentMonth ? (monthlyDuesMap[selectedDayNum] || []) : [];

  const selectedDayIncome = selectedDayTxs
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const selectedDayExpense = selectedDayTxs
    .filter(t => t.type !== 'income' && t.type !== 'savings')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

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

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

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
              Comprehensive calendar with daily income/expense flows, credit card bill dues, and loan EMI trackers.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <span>Go to Today</span>
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
            title="Generate and email official daily digest for the selected date"
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

      {/* Monthly KPI Overview Bar */}
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

      {/* Month Navigation & Filter Bar */}
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
        {/* Month Selector Buttons */}
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
            title="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>

          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', minWidth: 170, textAlign: 'center' }}>
            {MONTH_NAMES[currentMonth]} {currentYear}
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
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'All Calendar Items' },
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
      </div>

      {/* Main Grid + Selected Day Inspector Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
        {/* Calendar Grid Container */}
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
              gridTemplateColumns: 'repeat(7, 1fr)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid var(--border-color)',
              textAlign: 'center',
              padding: '12px 0',
              fontWeight: 800,
              fontSize: 12,
              color: 'var(--text-secondary)',
              letterSpacing: 0.5
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

          {/* Calendar Cells Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gridAutoRows: 'minmax(105px, auto)',
              gap: 1,
              background: 'var(--border-color)'
            }}
          >
            {calendarCells.map((cell, idx) => {
              if (cell.type === 'empty') {
                return (
                  <div
                    key={`empty-${idx}`}
                    style={{ background: 'var(--bg-primary)', opacity: 0.4, minHeight: 105 }}
                  />
                );
              }

              const day = cell.day!;
              const isToday = cell.isToday;
              const isSelected = cell.isSelected;
              const duesList = cell.duesList || [];
              const dayIncome = cell.dayIncome || 0;
              const dayExpense = cell.dayExpense || 0;

              // Filter checks
              const showTxs = filterMode === 'all' || filterMode === 'transactions';
              const showDues = filterMode === 'all' || filterMode === 'dues' || filterMode === 'overdue';
              const hasOverdue = duesList.some(d => d.isOverdue && !d.isPaid);

              if (filterMode === 'overdue' && !hasOverdue) {
                // Dim or keep clean
              }

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
                    padding: '8px 8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    minHeight: 105
                  }}
                >
                  {/* Top Cell Bar (Day number & Overdue alert mark) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 13,
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
                          fontSize: 9.5,
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: '#EF4444',
                          color: '#FFF'
                        }}
                        title="Payment Overdue!"
                      >
                        OVERDUE
                      </span>
                    )}
                  </div>

                  {/* Middle Area: Inflow / Outflow & Dues Badges */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
                    {/* Income Inflow Badge */}
                    {showTxs && dayIncome > 0 && (
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '2px 5px',
                          borderRadius: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        +{currencyService.format(dayIncome)}
                      </div>
                    )}

                    {/* Expense Outflow Badge */}
                    {showTxs && dayExpense > 0 && (
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#EF4444',
                          background: 'rgba(239, 68, 68, 0.12)',
                          padding: '2px 5px',
                          borderRadius: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        -{currencyService.format(dayExpense)}
                      </div>
                    )}

                    {/* Dues / EMI Marks */}
                    {showDues && duesList.map(due => {
                      let badgeBg = 'rgba(245, 158, 11, 0.15)';
                      let badgeColor = '#F59E0B';
                      let label = `${due.name}: ${currencyService.format(due.amount)}`;

                      if (due.isPaid) {
                        badgeBg = 'rgba(16, 185, 129, 0.15)';
                        badgeColor = '#10B981';
                        label = `✓ ${due.name} (Paid)`;
                      } else if (due.isOverdue) {
                        badgeBg = 'rgba(239, 68, 68, 0.2)';
                        badgeColor = '#EF4444';
                        label = `⚠ Overdue: ${due.name} (${currencyService.format(due.amount)})`;
                      } else if (due.isDueToday) {
                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                        badgeColor = '#DC2626';
                        label = `🔴 DUE TODAY: ${due.name}`;
                      }

                      return (
                        <div
                          key={due.id}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: badgeColor,
                            background: badgeBg,
                            padding: '2px 5px',
                            borderRadius: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={due.subtext}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Inspector Side Drawer */}
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
                      <strong style={{ fontSize: 14, color: due.isPaid ? '#10B981' : '#EF4444' }}>
                        {currencyService.format(due.amount)}
                      </strong>
                    </div>
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
                  const isInc = t.type === 'income';

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
        </div>
      </div>
    </div>
  );
};
