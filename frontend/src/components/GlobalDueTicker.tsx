import React, { useMemo, useState, useEffect } from 'react';
import { CreditCard, Landmark, ChevronRight, CheckCircle2 } from 'lucide-react';
import { loanService, calculateLoanEMIs, generateEmiSchedule, type LoanModel } from '../services/loanService';
import { cardService, type CardModel } from '../services/cardService';
import api from '../services/api';

interface GlobalDueTickerProps {
  userEmail?: string;
  onNavigateToTab?: (tab: string, detailId?: string) => void;
}

interface TickerDueItem {
  id: string;
  type: 'loan' | 'card';
  title: string;
  subtext: string;
  amount: number;
  dueDay: number;
  dueDateStr: string;
  isOverdue: boolean;
  isDueToday: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const GlobalDueTicker: React.FC<GlobalDueTickerProps> = ({ userEmail, onNavigateToTab }) => {
  const [loans, setLoans] = useState<LoanModel[]>([]);
  const [cards, setCards] = useState<CardModel[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const loadData = () => {
    setLoans(loanService.getLoans(userEmail));
    setCards(cardService.getCards(userEmail));
    api.get('/transactions').then(res => {
      if (res.data?.success && Array.isArray(res.data.data)) {
        setTransactions(res.data.data);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const handleLoans = () => setLoans(loanService.getLoans(userEmail));
    const handleCards = () => setCards(cardService.getCards(userEmail));
    const handleTx = () => {
      api.get('/transactions').then(res => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setTransactions(res.data.data);
        }
      }).catch(() => {});
    };

    window.addEventListener('fintrack-loans-changed', handleLoans);
    window.addEventListener('fintrack-cards-updated', handleCards);
    window.addEventListener('fintrack-transactions-changed', handleTx);

    return () => {
      window.removeEventListener('fintrack-loans-changed', handleLoans);
      window.removeEventListener('fintrack-cards-updated', handleCards);
      window.removeEventListener('fintrack-transactions-changed', handleTx);
    };
  }, [userEmail]);

  // Compute all unpaid, active dues for the current month with amount > 0
  const activeDues = useMemo<TickerDueItem[]>(() => {
    const list: TickerDueItem[] = [];

    // 1. Loans & EMI dues for current month
    loans.forEach(loan => {
      if (loan.status === 'closed') return;
      if (loan.repaymentSource === 'credit_card') return; // Handled under credit card bill

      const dueDay = Number(loan.dueDay) || 5;
      const metrics = calculateLoanEMIs(loan);
      const schedule = generateEmiSchedule(loan, metrics);
      const currentSchedule = schedule.find(s => s.year === currentYear && s.month === currentMonth);

      if (currentSchedule && currentSchedule.status !== 'paid' && currentSchedule.emiAmount > 0) {
        const isOverdue = dueDay < currentDay;
        const isDueToday = dueDay === currentDay;

        list.push({
          id: loan.id,
          type: 'loan',
          title: `${loan.name} (${loan.lender})`,
          subtext: `${loan.type || 'Loan EMI'} • Inst #${currentSchedule.index}`,
          amount: currentSchedule.emiAmount,
          dueDay,
          dueDateStr: `${MONTH_SHORT[currentMonth]} ${String(dueDay).padStart(2, '0')}`,
          isOverdue,
          isDueToday
        });
      }
    });

    // 2. Credit Cards bills for current month
    cards.forEach(card => {
      if (!card.isActive) return;
      const dueDay = Number(card.dueDay) || 5;

      // Check if bill payment was recorded in current month
      const billPayment = transactions.find(t => {
        if (!t.date) return false;
        const tDate = String(t.date).slice(0, 10);
        const [y, m] = tDate.split('-').map(Number);
        if (y !== currentYear || m !== (currentMonth + 1)) return false;
        const mode = String(t.paymentMode || '').toLowerCase();
        const cat = String(t.category || '').toLowerCase();
        const desc = String(t.description || '').toLowerCase();
        const isPayment = cat.includes('bill') || cat.includes('card payment') || desc.includes('bill payment') || desc.includes('credit card payment');
        if (!isPayment) return false;
        const cName = card.name.toLowerCase();
        const tCard = String(t.card || '').toLowerCase();
        return mode.includes(cName) || tCard.includes(cName) || desc.includes(cName);
      });

      if (billPayment) return; // Already paid, do not display

      // Sum regular card spends up to current month minus payments
      let purchases = 0;
      let payments = 0;
      transactions.forEach(t => {
        if (!t.date) return;
        const tDate = String(t.date).slice(0, 10);
        const [y, m] = tDate.split('-').map(Number);
        const txPeriod = y * 12 + (m - 1);
        const curPeriod = currentYear * 12 + currentMonth;
        if (txPeriod > curPeriod) return;

        const mode = String(t.paymentMode || '').toLowerCase();
        const tCard = String(t.card || '').toLowerCase();
        const tDesc = String(t.description || '').toLowerCase();
        const cName = card.name.toLowerCase();
        const cLast4 = card.last4 || '';
        const isMatch = mode.includes(cName) || tCard.includes(cName) || tDesc.includes(cName) || (cLast4 && (tCard.includes(cLast4) || tDesc.includes(cLast4)));
        if (!isMatch) return;

        const amt = Number(t.amount) || 0;
        const isPay = (String(t.category || '').toLowerCase().includes('bill') || tDesc.includes('bill payment') || tDesc.includes('credit card payment'));
        if (isPay) {
          payments += amt;
        } else if (t.type !== 'income') {
          purchases += amt;
        }
      });

      // Sum active linked loan EMIs on this card
      let linkedEmis = 0;
      loans.forEach(l => {
        if (l.status === 'closed' || l.repaymentSource !== 'credit_card') return;
        const cleanCard = (card.name || '').toLowerCase().trim();
        const matchesCard = l.linkedCardId === card.id ||
          (l.linkedCardName && l.linkedCardName.toLowerCase().trim() === cleanCard) ||
          (l.lender && cleanCard.includes(l.lender.toLowerCase().trim()));
        if (matchesCard) {
          const m = calculateLoanEMIs(l);
          const sch = generateEmiSchedule(l, m);
          const item = sch.find(s => s.year === currentYear && s.month === currentMonth);
          if (item && item.status !== 'paid') {
            linkedEmis += item.emiAmount;
          }
        }
      });

      const netDue = Math.max(0, purchases - payments + linkedEmis);

      // ONLY display if due amount > 0
      if (netDue > 0) {
        const isOverdue = dueDay < currentDay;
        const isDueToday = dueDay === currentDay;

        list.push({
          id: card.id,
          type: 'card',
          title: `${card.name} Bill`,
          subtext: `•••• ${card.last4}`,
          amount: netDue,
          dueDay,
          dueDateStr: `${MONTH_SHORT[currentMonth]} ${String(dueDay).padStart(2, '0')}`,
          isOverdue,
          isDueToday
        });
      }
    });

    // Sort chronologically by dueDay
    return list.sort((a, b) => a.dueDay - b.dueDay);
  }, [loans, cards, transactions, currentYear, currentMonth, currentDay]);

  const durationSeconds = useMemo(() => {
    return Math.max(22, activeDues.length * 10);
  }, [activeDues.length]);

  return (
    <div
      className="global-due-ticker-container"
      style={{
        position: 'sticky',
        top: 58,
        zIndex: 90,
        height: 32,
        minHeight: 32,
        maxHeight: 32,
        width: '100%',
        maxWidth: '100vw',
        background: 'linear-gradient(90deg, #0A0E1A 0%, #0F172A 50%, #0A0E1A 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <style>{`
        @keyframes globalTickerScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .global-ticker-track {
          display: flex;
          align-items: center;
          white-space: nowrap;
          width: max-content;
          animation: globalTickerScroll ${durationSeconds}s linear infinite;
        }

        .global-ticker-track.paused {
          animation-play-state: paused !important;
        }

        .global-ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          margin-right: 18px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }

        .global-ticker-item:hover {
          transform: translateY(-1px);
          filter: brightness(1.15);
        }

        @media (max-width: 768px) {
          .global-due-ticker-container {
            height: 28px !important;
            min-height: 28px !important;
            max-height: 28px !important;
          }

          /* Left badge reduction so it takes only ~15% of screen instead of 40% */
          .global-due-ticker-badge {
            padding: 0 8px !important;
            gap: 5px !important;
          }

          .global-due-ticker-dot {
            width: 5px !important;
            height: 5px !important;
          }

          .global-due-ticker-title-desktop {
            display: none !important;
          }

          .global-due-ticker-title-mobile {
            display: inline !important;
            font-size: 8px !important;
            font-weight: 800 !important;
            letter-spacing: 0.4px !important;
          }

          /* Ticker items font reduction */
          .global-ticker-item {
            gap: 5px !important;
            padding: 2px 7px !important;
            margin-right: 12px !important;
            border-radius: 14px !important;
          }

          .global-ticker-due-date {
            font-size: 8px !important;
            padding: 1px 4px !important;
            letter-spacing: 0.3px !important;
          }

          .global-ticker-due-title span {
            font-size: 9.5px !important;
          }

          .global-ticker-due-title .global-ticker-icon {
            width: 10px !important;
            height: 10px !important;
          }

          .global-ticker-due-amount {
            font-size: 9.5px !important;
          }

          .global-ticker-due-tag {
            font-size: 7.5px !important;
          }

          .global-ticker-chevron {
            display: none !important;
          }
        }

        @media (max-width: 480px) {
          .global-due-ticker-badge {
            padding: 0 6px !important;
            gap: 4px !important;
          }

          .global-due-ticker-title-mobile {
            font-size: 7.5px !important;
            letter-spacing: 0.2px !important;
          }

          .global-ticker-item {
            gap: 4px !important;
            padding: 1.5px 6px !important;
            margin-right: 10px !important;
          }

          .global-ticker-due-date {
            font-size: 7.5px !important;
            padding: 1px 3px !important;
          }

          .global-ticker-due-title span {
            font-size: 8.5px !important;
          }

          .global-ticker-due-amount {
            font-size: 9px !important;
          }

          .global-ticker-due-tag {
            font-size: 7px !important;
          }
        }
      `}</style>

      {/* Left Fixed Badge */}
      <div
        className="global-due-ticker-badge"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: 'rgba(15, 23, 42, 0.96)',
          padding: '0 14px',
          height: '100%',
          zIndex: 3,
          flexShrink: 0,
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '4px 0 12px rgba(0, 0, 0, 0.4)'
        }}
      >
        <span
          className="global-due-ticker-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: activeDues.length > 0 ? (activeDues.some(d => d.isOverdue) ? '#EF4444' : '#F59E0B') : '#10B981',
            boxShadow: activeDues.length > 0 ? '0 0 8px #F59E0B' : '0 0 8px #10B981',
            animation: activeDues.some(d => d.isOverdue || d.isDueToday) ? 'pulse 1.5s infinite' : 'none'
          }}
        />
        <span
          className="global-due-ticker-title-desktop"
          style={{
            fontSize: 10,
            fontWeight: 900,
            color: '#F8FAFC',
            letterSpacing: 1,
            textTransform: 'uppercase'
          }}
        >
          {activeDues.length > 0 ? `Upcoming Dues (${activeDues.length})` : 'Dues Cleared'}
        </span>
        <span
          className="global-due-ticker-title-mobile"
          style={{
            display: 'none',
            fontSize: 8.5,
            fontWeight: 900,
            color: '#F8FAFC',
            letterSpacing: 0.5,
            textTransform: 'uppercase'
          }}
        >
          {activeDues.length > 0 ? `Dues (${activeDues.length})` : 'Cleared'}
        </span>
      </div>

      {/* Marquee Scrolling Area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          flex: 1,
          height: '100%',
          position: 'relative'
        }}
      >
        {activeDues.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 18,
              fontSize: 11,
              fontWeight: 600,
              color: '#10B981'
            }}
          >
            <CheckCircle2 size={14} />
            <span>All credit card and loan payments for {MONTH_SHORT[currentMonth]} {currentYear} are completely cleared!</span>
          </div>
        ) : (
          <div className={`global-ticker-track ${isPaused ? 'paused' : ''}`}>
            {/* Render 2 sets with a clear gap separator between loops */}
            {[0, 1].map((setIndex) => (
              <React.Fragment key={`ticker-set-${setIndex}`}>
                {activeDues.map((item, idx) => {
              const overdue = item.isOverdue;
              const dueToday = item.isDueToday;
              const badgeBg = overdue ? '#EF4444' : dueToday ? '#3B82F6' : '#F59E0B';
              const cardBorder = overdue ? 'rgba(239, 68, 68, 0.35)' : dueToday ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.25)';
              const cardBg = overdue ? 'rgba(239, 68, 68, 0.08)' : dueToday ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.06)';

              return (
                <div
                  key={`${item.id}-${idx}`}
                  className="global-ticker-item"
                  onClick={() => onNavigateToTab?.(item.type === 'loan' ? 'Loans & EMI' : 'Credit Cards', item.id)}
                  style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`
                  }}
                  title={`Click to view ${item.title}`}
                >
                  <span
                    className="global-ticker-due-date"
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '1.5px 6px',
                      borderRadius: 4,
                      background: badgeBg,
                      color: overdue ? '#FFFFFF' : '#000000',
                      letterSpacing: 0.5
                    }}
                  >
                    {item.dueDateStr}
                  </span>

                  <span className="global-ticker-due-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {item.type === 'card' ? (
                      <CreditCard size={12} className="global-ticker-icon" style={{ color: '#38BDF8' }} />
                    ) : (
                      <Landmark size={12} className="global-ticker-icon" style={{ color: '#FCD34D' }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>
                      {item.title}
                    </span>
                  </span>

                  <span
                    className="global-ticker-due-amount"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 900,
                      color: overdue ? '#EF4444' : '#F59E0B'
                    }}
                  >
                    -₹{item.amount.toLocaleString('en-IN')}
                  </span>

                  <span
                    className="global-ticker-due-tag"
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: overdue ? '#EF4444' : dueToday ? '#60A5FA' : '#94A3B8',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}
                  >
                    {overdue ? '• Overdue' : dueToday ? '• Due Today' : '• Due'}
                  </span>

                  <ChevronRight size={11} className="global-ticker-chevron" style={{ color: '#64748B' }} />
                </div>
              );
            })}
                {/* Visible gap after all dues before repeating from 1st */}
                <div
                  className="global-ticker-loop-gap"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '0 36px',
                    marginRight: 18,
                    opacity: 0.45
                  }}
                  title="Cycle separator"
                >
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B' }} />
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#64748B' }} />
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#64748B' }} />
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B' }} />
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
