import { getUserStorageKey } from './storageHelper';

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
  type?: 'Home Loan' | 'Auto Loan' | 'Personal Loan' | 'Education Loan' | 'Consumer Durable' | 'Credit Card EMI' | 'Other';
  interestRate?: number; // Optional Annual %
  tenureMonths?: number;
  paidMonths?: number;
  paidScheduleIndices?: number[]; // Specific month indices (1, 2, ...) marked paid
  dueDay?: number; // Monthly EMI Due Day (1-31, default: 5)
  description?: string; // Description / Purpose
  status?: 'active' | 'closed'; // Active or Closed status
  repaymentSource?: 'bank' | 'credit_card'; // Payment method: direct bank debit or through credit card
  linkedCardId?: string; // ID of the Credit Card that bills this EMI
  linkedCardName?: string; // Display name of the Credit Card
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

export const calculateEMI = (principal: number, annualRate: number, tenureMonths: number): number => {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRate <= 0) return Math.round(principal / tenureMonths);
  const r = annualRate / 12 / 100;
  const emi = (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1);
  return Math.round(emi);
};

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

export const calculateLoanInterestAmount = (principal: number, emi: number, tenureMonths: number): number => {
  if (principal <= 0 || emi <= 0 || tenureMonths <= 0) return 0;
  const totalPayable = emi * tenureMonths;
  return Math.max(0, Math.round(totalPayable - principal));
};

export const calculateLoanEMIs = (loan: LoanModel) => {
  const tenureMonths = calculateLoanTenureMonths(loan.startDate, loan.endDate, loan.tenureMonths);
  const emi = typeof loan.emiAmount === 'number' && !isNaN(loan.emiAmount) && loan.emiAmount > 0
    ? loan.emiAmount
    : calculateEMI(loan.principal, loan.interestRate || 0, tenureMonths);

  const totalEmis = tenureMonths;
  let completedEmis = 0;
  if (Array.isArray(loan.paidScheduleIndices)) {
    completedEmis = loan.paidScheduleIndices.length;
  } else if (loan.paidMonths !== undefined && loan.paidMonths !== null) {
    completedEmis = loan.paidMonths;
  } else if (emi > 0 && typeof loan.remainingAmount === 'number') {
    completedEmis = Math.min(totalEmis, Math.max(0, Math.round((loan.principal - loan.remainingAmount) / emi)));
  }

  const isClosed = loan.status === 'closed' || (typeof loan.remainingAmount === 'number' && loan.remainingAmount <= 0) || (totalEmis > 0 && completedEmis >= totalEmis);

  if (isClosed) {
    completedEmis = totalEmis;
  }

  const remaining = typeof loan.remainingAmount === 'number' && !isNaN(loan.remainingAmount)
    ? loan.remainingAmount
    : Math.max(0, loan.principal - (completedEmis * emi));

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
    const index = i + 1;

    const isCurrent = itemYear === currentYear && itemMonth === currentMonth;
    const isPast = (itemYear < currentYear) || (itemYear === currentYear && itemMonth < currentMonth);
    const isNext = (itemYear === currentYear && itemMonth === currentMonth + 1) ||
                   (itemMonth === 0 && itemYear === currentYear + 1 && currentMonth === 11);

    let isMonthPaid = false;
    if (emiMetrics.isClosed) {
      isMonthPaid = true;
    } else if (Array.isArray(loan.paidScheduleIndices)) {
      isMonthPaid = loan.paidScheduleIndices.includes(index);
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
      index,
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

export const DEFAULT_LOANS: LoanModel[] = [
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
    status: 'active',
    repaymentSource: 'bank'
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
    status: 'active',
    repaymentSource: 'bank'
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
    status: 'active',
    repaymentSource: 'credit_card',
    linkedCardId: 'card-1',
    linkedCardName: 'HDFC Regalia Gold'
  }
];

export const loanService = {
  getLoans(email?: string): LoanModel[] {
    const key = getUserStorageKey('fintrack_loans_list', email);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error('Failed to get loans from storage:', err);
    }
    if (email === 'demo@fintrack.io') {
      return DEFAULT_LOANS;
    }
    return [];
  },

  saveLoans(loans: LoanModel[], email?: string): void {
    const key = getUserStorageKey('fintrack_loans_list', email);
    try {
      localStorage.setItem(key, JSON.stringify(loans));
      window.dispatchEvent(new CustomEvent('fintrack-loans-changed', { detail: loans }));
    } catch (err) {
      console.error('Failed to save loans to storage:', err);
    }
  },

  /**
   * Get all active loans linked to a specific credit card
   */
  getLinkedLoansForCard(cardId: string, cardName?: string, email?: string): LoanModel[] {
    const loans = this.getLoans(email);
    const cleanCardName = (cardName || '').trim().toLowerCase();

    return loans.filter(l => {
      if (l.status === 'closed') return false;
      const isCardRepayment = l.repaymentSource === 'credit_card';
      const matchesId = l.linkedCardId === cardId;
      const matchesName = cleanCardName && l.linkedCardName && l.linkedCardName.trim().toLowerCase() === cleanCardName;
      const matchesLender = cleanCardName && l.lender && cleanCardName.includes(l.lender.trim().toLowerCase());

      return (isCardRepayment && (matchesId || matchesName)) || matchesId || (isCardRepayment && matchesLender);
    });
  },

  /**
   * Calculate total active unpaid monthly EMI amount for a card's current billing cycle
   */
  getCardActiveEmiAmount(cardId: string, cardName?: string, email?: string): number {
    const linkedLoans = this.getLinkedLoansForCard(cardId, cardName, email);
    let totalEmi = 0;

    linkedLoans.forEach(l => {
      const metrics = calculateLoanEMIs(l);
      if (metrics.isClosed) return;
      const schedule = generateEmiSchedule(l, metrics);
      // Check if there is an unpaid EMI pending
      const hasPendingEmi = schedule.some(s => s.status !== 'paid');
      if (hasPendingEmi) {
        totalEmi += metrics.emi;
      }
    });

    return totalEmi;
  },

  /**
   * Settle linked loan EMIs when a credit card bill is paid.
   * This updates the loan schedule without creating any duplicate debit transactions.
   */
  settleCardLoansOnBillPayment(cardId: string, cardName?: string, email?: string): { settledCount: number; settledLoans: string[]; totalSettledAmount: number } {
    const allLoans = this.getLoans(email);
    const cleanCardName = (cardName || '').trim().toLowerCase();

    let settledCount = 0;
    const settledLoans: string[] = [];
    let totalSettledAmount = 0;

    const updatedLoans = allLoans.map(l => {
      if (l.status === 'closed') return l;

      const isCardRepayment = l.repaymentSource === 'credit_card';
      const matchesId = l.linkedCardId === cardId;
      const matchesName = cleanCardName && l.linkedCardName && l.linkedCardName.trim().toLowerCase() === cleanCardName;
      const matchesLender = cleanCardName && l.lender && cleanCardName.includes(l.lender.trim().toLowerCase());

      const isTarget = (isCardRepayment && (matchesId || matchesName)) || matchesId || (isCardRepayment && matchesLender);
      if (!isTarget) return l;

      const metrics = calculateLoanEMIs(l);
      if (metrics.isClosed) return l;

      const schedule = generateEmiSchedule(l, metrics);
      const nextPending = schedule.find(s => s.status !== 'paid');
      if (!nextPending) return l;

      // Mark this index as paid
      let currentIndices: number[] = Array.isArray(l.paidScheduleIndices) ? [...l.paidScheduleIndices] : [];
      if (!currentIndices.includes(nextPending.index)) {
        currentIndices.push(nextPending.index);
        currentIndices.sort((a, b) => a - b);
      }

      const currentRemaining = typeof l.remainingAmount === 'number' && !isNaN(l.remainingAmount)
        ? l.remainingAmount
        : l.principal;
      const newRemaining = Math.max(0, currentRemaining - metrics.emi);
      const isNowClosed = newRemaining <= 0 || currentIndices.length >= metrics.totalEmis;

      settledCount++;
      settledLoans.push(l.name);
      totalSettledAmount += metrics.emi;

      return {
        ...l,
        paidMonths: currentIndices.length,
        paidScheduleIndices: currentIndices,
        remainingAmount: newRemaining,
        status: isNowClosed ? ('closed' as const) : l.status
      };
    });

    if (settledCount > 0) {
      this.saveLoans(updatedLoans, email);
    }

    return {
      settledCount,
      settledLoans,
      totalSettledAmount
    };
  }
};
