import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  TrendingDown,
  Calculator,
  Clock,
  DollarSign
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';
import { seedDemoBudgetData } from '../services/demoBudgetSeed';
import { getUserStorageKey } from '../services/storageHelper';

export interface LoanModel {
  id: string;
  name: string;
  lender: string;
  type: 'Home Loan' | 'Auto Loan' | 'Personal Loan' | 'Education Loan' | 'Consumer Durable' | 'Other';
  principal: number;
  interestRate: number; // Annual %
  tenureMonths: number;
  paidMonths: number;
  startDate: string;
  dueDay: number;
}

const DEFAULT_LOANS: LoanModel[] = [
  {
    id: 'loan-1',
    name: 'HDFC Home Loan',
    lender: 'HDFC Bank',
    type: 'Home Loan',
    principal: 3500000,
    interestRate: 8.5,
    tenureMonths: 240,
    paidMonths: 58,
    startDate: '2021-08-01',
    dueDay: 5
  },
  {
    id: 'loan-2',
    name: 'SBI Car Loan',
    lender: 'State Bank of India',
    type: 'Auto Loan',
    principal: 800000,
    interestRate: 8.9,
    tenureMonths: 60,
    paidMonths: 32,
    startDate: '2023-11-01',
    dueDay: 10
  },
  {
    id: 'loan-3',
    name: 'Apple iPhone 16 Pro EMI',
    lender: 'HDFC SmartEMI',
    type: 'Consumer Durable',
    principal: 119900,
    interestRate: 0,
    tenureMonths: 6,
    paidMonths: 4,
    startDate: '2024-06-15',
    dueDay: 15
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

export const LoansEmiView: React.FC = () => {
  const { user } = useAuth();
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

  // Add Loan Modal
  const [isAddLoanOpen, setIsAddLoanOpen] = useState<boolean>(false);
  const [loanName, setLoanName] = useState<string>('');
  const [loanLender, setLoanLender] = useState<string>('HDFC Bank');
  const [loanType, setLoanType] = useState<LoanModel['type']>('Personal Loan');
  const [loanPrincipal, setLoanPrincipal] = useState<string>('500000');
  const [loanInterest, setLoanInterest] = useState<string>('9.5');
  const [loanTenure, setLoanTenure] = useState<string>('36');
  const [loanDueDay, setLoanDueDay] = useState<number>(5);
  const [loanStartDate, setLoanStartDate] = useState<string>(new Date().toISOString().substring(0, 10));

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

  // Loan Metrics Calculations
  const metrics = useMemo(() => {
    let totalPrincipal = 0;
    let totalOutstanding = 0;
    let totalMonthlyEmi = 0;

    loans.forEach(loan => {
      totalPrincipal += loan.principal;
      const emi = calculateEMI(loan.principal, loan.interestRate, loan.tenureMonths);
      totalMonthlyEmi += emi;

      // Approximate remaining principal
      const remainingMonths = Math.max(0, loan.tenureMonths - loan.paidMonths);
      const principalFractionRemaining = loan.tenureMonths > 0 ? remainingMonths / loan.tenureMonths : 0;
      totalOutstanding += Math.round(loan.principal * principalFractionRemaining);
    });

    const payoffProgress = totalPrincipal > 0 ? Math.min(100, Math.round(((totalPrincipal - totalOutstanding) / totalPrincipal) * 100)) : 100;

    return {
      totalPrincipal,
      totalOutstanding,
      totalMonthlyEmi,
      payoffProgress
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

  // Add Loan Submission
  const handleAddLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(loanPrincipal);
    const r = parseFloat(loanInterest);
    const t = parseInt(loanTenure, 10);

    if (!p || p <= 0 || !t || t <= 0) return;

    const newLoan: LoanModel = {
      id: `loan-${Date.now()}`,
      name: loanName.trim() || `${loanLender} ${loanType}`,
      lender: loanLender.trim(),
      type: loanType,
      principal: p,
      interestRate: r >= 0 ? r : 0,
      tenureMonths: t,
      paidMonths: 0,
      startDate: loanStartDate,
      dueDay: loanDueDay
    };

    const updated = [...loans, newLoan];
    saveLoans(updated);
    setIsAddLoanOpen(false);
    setLoanName('');
    setBannerMsg({ type: 'success', text: `Loan "${newLoan.name}" added to tracker successfully!` });
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Delete Loan
  const handleDeleteLoan = (loanId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from your active loans list?`)) {
      return;
    }
    const updated = loans.filter(l => l.id !== loanId);
    saveLoans(updated);
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
        subcategory: `${payingLoan.type} EMI`,
        description: `EMI payment for ${payingLoan.name} (${payingLoan.lender})`,
        amount: baseAmount,
        paymentMode: payEmiMode
      };

      const res = await api.post('/transactions', payload);
      if (res.data && res.data.success) {
        // Increment paidMonths for this loan
        const updated = loans.map(l => {
          if (l.id === payingLoan.id) {
            return { ...l, paidMonths: Math.min(l.tenureMonths, l.paidMonths + 1) };
          }
          return l;
        });
        saveLoans(updated);

        setBannerMsg({
          type: 'success',
          text: `EMI payment of ${currencyService.format(baseAmount)} for "${payingLoan.name}" recorded in database and loan balance updated!`
        });
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
    const newLoan: LoanModel = {
      id: `loan-${Date.now()}`,
      name: `New Loan (${currencyService.format(calcPrincipal)} @ ${calcRate}%)`,
      lender: 'Bank / NBFC',
      type: 'Personal Loan',
      principal: calcPrincipal,
      interestRate: calcRate,
      tenureMonths: calcTenureYears * 12,
      paidMonths: 0,
      startDate: new Date().toISOString().substring(0, 10),
      dueDay: 5
    };
    const updated = [...loans, newLoan];
    saveLoans(updated);
    setBannerMsg({ type: 'success', text: `Calculated loan of ${currencyService.format(calcPrincipal)} saved directly to your active loans tracker!` });
    setTimeout(() => setBannerMsg(null), 3500);
  };

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
                Track active loans, calculate monthly EMIs, and log actual debt repayment transactions
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

      {/* KPI Stats Grid */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {/* Total Borrowed Principal */}
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
            Across {loans.length} active loan accounts
          </div>
        </div>

        {/* Total Outstanding Balance */}
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
            Remaining principal to be repaid
          </div>
        </div>

        {/* Monthly EMI Outflow */}
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

        {/* Payoff Progress */}
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
            {currencyService.format(metrics.totalPrincipal - metrics.totalOutstanding)} principal paid off
          </div>
        </div>
      </div>

      {/* Active Loans Section */}
      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          Active Loans & Schedules ({loans.length})
        </h2>

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
              onClick={() => setIsAddLoanOpen(true)}
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
              Add Your First Loan
            </button>
          )}
          </div>
        ) : (
          <div className="loans-grid">
          {loans.map(loan => {
            const emi = calculateEMI(loan.principal, loan.interestRate, loan.tenureMonths);
            const remainingMonths = Math.max(0, loan.tenureMonths - loan.paidMonths);
            const paidPct = loan.tenureMonths > 0 ? Math.round((loan.paidMonths / loan.tenureMonths) * 100) : 100;
            const remainingPrincipal = Math.round(loan.principal * (remainingMonths / loan.tenureMonths));

            return (
              <div
                key={loan.id}
                className="summary-card"
                style={{
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 240
                }}
              >
                <div>
                  {/* Top Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          {loan.name}
                        </h3>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-indigo)' }}>
                          {loan.type}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 2 }}>
                        {loan.lender} • {loan.interestRate}% p.a.
                      </span>
                    </div>

                    {!isViewOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteLoan(loan.id, loan.name)}
                        title="Remove loan"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* Loan Amount & EMI Numbers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>
                        MONTHLY EMI
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 800, color: '#6366F1' }}>
                        {currencyService.format(emi)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>
                        OUTSTANDING
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 800, color: '#EF4444' }}>
                        {currencyService.format(remainingPrincipal)}
                      </span>
                    </div>
                  </div>

                  {/* Progress & Tenure */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span>Progress: <strong>{loan.paidMonths} of {loan.tenureMonths} EMIs</strong> ({paidPct}%)</span>
                      <span><strong>{remainingMonths}</strong> left</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${paidPct}%`, height: '100%', background: 'linear-gradient(90deg, #6366F1, #10B981)', borderRadius: 999 }} />
                    </div>
                  </div>
                </div>

                {/* Footer Due Date & Pay Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Due Day: <strong style={{ color: 'var(--text-primary)' }}>{loan.dueDay}th</strong> of month
                  </div>

                  {!isViewOnly ? (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => {
                        setPayingLoan(loan);
                        setPayEmiAmount(String(emi));
                        setIsPayEmiOpen(true);
                      }}
                    >
                      <span>Record EMI Payment</span>
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>View only</span>
                  )}
                </div>
              </div>
            );
          })}
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

      {/* Actual EMI Payment History */}
      <div className="summary-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Actual EMI & Debt Repayments Ledger ({emiTransactions.length})
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Transactions recorded from your database ledger under Debt Repayment / Loan EMI
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
            Loading EMI repayment history from database...
          </div>
        ) : emiTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', border: '1px dashed var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              No recorded EMI payment transactions yet in the database.
            </p>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Click "Record EMI Payment" on any active loan above to automatically record payments into your database!
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 14px' }}>Date</th>
                  <th style={{ padding: '12px 14px' }}>Description</th>
                  <th style={{ padding: '12px 14px' }}>Category</th>
                  <th style={{ padding: '12px 14px' }}>Payment Mode</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {emiTransactions.map(tx => (
                  <tr
                    key={tx.id}
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{tx.date}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{tx.description}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{tx.category || 'Debt Repayment'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-indigo)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                        {tx.paymentMode || 'UPI'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>
                      {currencyService.format(Number(tx.amount) || 0)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 12, fontWeight: 600 }}>
                        <CheckCircle size={14} /> Paid
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add New Loan */}
      {isAddLoanOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: '100%', maxWidth: 480 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Add New Loan / EMI</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Track principal, interest rate & monthly EMI schedule</span>
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
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  LOAN / ACCOUNT NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Home Loan, Car Loan, MacBook EMI"
                  value={loanName}
                  onChange={e => setLoanName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LENDER / BANK
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SBI, HDFC, ICICI, Bajaj"
                    value={loanLender}
                    onChange={e => setLoanLender(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LOAN TYPE
                  </label>
                  <select
                    value={loanType}
                    onChange={e => setLoanType(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="Home Loan">Home Loan</option>
                    <option value="Auto Loan">Auto Loan</option>
                    <option value="Personal Loan">Personal Loan</option>
                    <option value="Education Loan">Education Loan</option>
                    <option value="Consumer Durable">Consumer Durable / No Cost</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    PRINCIPAL AMOUNT ({currencyService.getActiveCurrencyCode()} {currencyService.getActiveCurrencyConfig().symbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 500000"
                    value={loanPrincipal}
                    onChange={e => setLoanPrincipal(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    INTEREST RATE (% P.A.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 8.5"
                    value={loanInterest}
                    onChange={e => setLoanInterest(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    TENURE (MONTHS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    placeholder="e.g. 60"
                    value={loanTenure}
                    onChange={e => setLoanTenure(e.target.value)}
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
                    value={loanDueDay}
                    onChange={e => setLoanDueDay(Number(e.target.value))}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    START DATE
                  </label>
                  <input
                    type="date"
                    value={loanStartDate}
                    onChange={e => setLoanStartDate(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
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
