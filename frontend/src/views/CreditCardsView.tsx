import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Search,
  DollarSign,
  Shield
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { currencyService } from '../services/currencyService';

export interface CardModel {
  id: string;
  name: string;
  bank: string;
  network: 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
  last4: string;
  limit: number;
  billingDay: number;
  dueDay: number;
  gradient: string;
  accent: string;
}

const DEFAULT_CARDS: CardModel[] = [
  {
    id: 'card-1',
    name: 'HDFC Regalia Gold',
    bank: 'HDFC Bank',
    network: 'Visa',
    last4: '4281',
    limit: 400000,
    billingDay: 15,
    dueDay: 5,
    gradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 60%, #334155 100%)',
    accent: '#F59E0B'
  },
  {
    id: 'card-2',
    name: 'ICICI Amazon Pay',
    bank: 'ICICI Bank',
    network: 'Visa',
    last4: '8819',
    limit: 250000,
    billingDay: 12,
    dueDay: 2,
    gradient: 'linear-gradient(135deg, #0369A1 0%, #075985 60%, #0C4A6E 100%)',
    accent: '#38BDF8'
  },
  {
    id: 'card-3',
    name: 'SBI Cashback',
    bank: 'SBI Card',
    network: 'Mastercard',
    last4: '3014',
    limit: 150000,
    billingDay: 20,
    dueDay: 10,
    gradient: 'linear-gradient(135deg, #047857 0%, #065F46 60%, #064E3B 100%)',
    accent: '#34D399'
  }
];

const CREDIT_CATEGORIES: Record<string, string[]> = {
  'Food & Dining': ['Restaurants', 'Swiggy/Zomato', 'Groceries', 'Cafes & Fast Food'],
  'Shopping': ['Amazon/Flipkart', 'Clothing & Fashion', 'Electronics', 'Home Decor'],
  'Travel & Fuel': ['Flights & Hotels', 'Fuel & Gas', 'Uber/Ola', 'Train/Metro'],
  'Entertainment': ['Movies & Shows', 'OTT Subscriptions', 'Gaming & Events'],
  'Utilities & Bills': ['Electricity/Water', 'Mobile & Wifi Recharge', 'Insurance Premium'],
  'Other Expenses': ['Medical & Pharmacy', 'Fitness & Gym', 'Personal Care', 'General']
};

export const CreditCardsView: React.FC = () => {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardModel[]>(() => {
    try {
      const saved = localStorage.getItem('fintrack_credit_cards');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_CARDS;
  });

  const [selectedCardId, setSelectedCardId] = useState<string>('all');
  const [actualTransactions, setActualTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Add Card Spend Modal State
  const [isAddSpendOpen, setIsAddSpendOpen] = useState<boolean>(false);
  const [spendDate, setSpendDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [spendDesc, setSpendDesc] = useState<string>('');
  const [spendAmount, setSpendAmount] = useState<string>('');
  const [spendCard, setSpendCard] = useState<string>(cards[0]?.name || 'HDFC Regalia Gold');
  const [spendCategory, setSpendCategory] = useState<string>('Shopping');
  const [spendSubcategory, setSpendSubcategory] = useState<string>('Amazon/Flipkart');
  const [spendSaving, setSpendSaving] = useState<boolean>(false);
  const [spendError, setSpendError] = useState<string | null>(null);

  // Add New Card Modal State
  const [isAddCardOpen, setIsAddCardOpen] = useState<boolean>(false);
  const [newCardName, setNewCardName] = useState<string>('');
  const [newCardBank, setNewCardBank] = useState<string>('HDFC Bank');
  const [newCardNetwork, setNewCardNetwork] = useState<'Visa' | 'Mastercard' | 'RuPay' | 'Amex'>('Visa');
  const [newCardLast4, setNewCardLast4] = useState<string>('');
  const [newCardLimit, setNewCardLimit] = useState<string>('100000');
  const [newCardBillingDay, setNewCardBillingDay] = useState<number>(15);
  const [newCardDueDay, setNewCardDueDay] = useState<number>(5);

  // Bill payment quick modal
  const [isPayBillOpen, setIsPayBillOpen] = useState<boolean>(false);
  const [payCardName, setPayCardName] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMode, setPayMode] = useState<string>('upi');
  const [paySaving, setPaySaving] = useState<boolean>(false);

  // Notification / message banner
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Persist cards
  const saveCards = (newCards: CardModel[]) => {
    setCards(newCards);
    localStorage.setItem('fintrack_credit_cards', JSON.stringify(newCards));
  };

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
    fetchActualTransactions();
  }, []);

  // Filter ONLY transactions where paymentMode is creditcard / credit / card
  const creditTransactions = useMemo(() => {
    return actualTransactions.filter(t => {
      const pm = String(t.paymentMode || '').toLowerCase().trim();
      const isCredit = pm === 'credit' || pm === 'credit card' || pm === 'credit_card' || pm === 'card' || Boolean(t.card);
      if (!isCredit) return false;

      // Card filter
      if (selectedCardId !== 'all') {
        const activeCard = cards.find(c => c.id === selectedCardId);
        if (activeCard && t.card && !t.card.toLowerCase().includes(activeCard.name.toLowerCase()) && !activeCard.name.toLowerCase().includes(t.card.toLowerCase())) {
          return false;
        }
      }

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
  }, [actualTransactions, selectedCardId, searchQuery, categoryFilter, cards]);

  // Calculate card-by-card spent
  const cardSpendsMap = useMemo(() => {
    const map: Record<string, number> = {};
    cards.forEach(c => { map[c.name] = 0; });

    actualTransactions.forEach(t => {
      const pm = String(t.paymentMode || '').toLowerCase().trim();
      const isCredit = pm === 'credit' || pm === 'credit card' || pm === 'credit_card' || pm === 'card' || Boolean(t.card);
      if (!isCredit) return;

      const amt = Number(t.amount) || 0;
      const tCard = String(t.card || '').trim();

      // Find matching card
      const matched = cards.find(c => c.name.toLowerCase() === tCard.toLowerCase() || (tCard && c.name.toLowerCase().includes(tCard.toLowerCase())));
      if (matched) {
        map[matched.name] = (map[matched.name] || 0) + amt;
      } else if (cards.length > 0) {
        // Fallback to first card if no card name is set
        map[cards[0].name] = (map[cards[0].name] || 0) + amt;
      }
    });

    return map;
  }, [actualTransactions, cards]);

  // Aggregate Metrics
  const totalCreditLimit = useMemo(() => {
    return cards.reduce((sum, c) => sum + c.limit, 0);
  }, [cards]);

  const totalOutstanding = useMemo(() => {
    return actualTransactions.reduce((sum, t) => {
      const pm = String(t.paymentMode || '').toLowerCase().trim();
      const isCredit = pm === 'credit' || pm === 'credit card' || pm === 'credit_card' || pm === 'card' || Boolean(t.card);
      if (isCredit && t.type !== 'income') {
        return sum + (Number(t.amount) || 0);
      }
      return sum;
    }, 0);
  }, [actualTransactions]);

  const availableCredit = Math.max(0, totalCreditLimit - totalOutstanding);
  const utilizationRatio = totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;

  // Add Credit Spend Submission -> Inserts directly into /api/transactions
  const handleAddSpendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpendError(null);
    const numAmt = parseFloat(spendAmount);
    if (!numAmt || numAmt <= 0) {
      setSpendError('Please enter a valid amount');
      return;
    }
    if (!spendDesc.trim()) {
      setSpendError('Please enter a description or merchant name');
      return;
    }

    setSpendSaving(true);
    try {
      // Amount in base INR (convert if in other currency)
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
        setBannerMsg({ type: 'success', text: `Credit transaction of ${currencyService.format(baseAmount)} recorded on ${spendCard} successfully!` });
        setTimeout(() => setBannerMsg(null), 4000);
        setIsAddSpendOpen(false);
        setSpendAmount('');
        setSpendDesc('');
        await fetchActualTransactions();
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
      const res = await api.delete(`/transactions/${id}`);
      if (res.data && res.data.success) {
        setActualTransactions(prev => prev.filter(t => t.id !== id));
        setBannerMsg({ type: 'success', text: 'Transaction removed from credit card ledger.' });
        setTimeout(() => setBannerMsg(null), 3000);
      }
    } catch {
      alert('Failed to delete transaction.');
    }
  };

  // Add New Card Submission
  const handleAddCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    const gradients = [
      'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
      'linear-gradient(135deg, #3730A3 0%, #4F46E5 50%, #6366F1 100%)',
      'linear-gradient(135deg, #701A75 0%, #86198F 50%, #A21CAF 100%)',
      'linear-gradient(135deg, #831843 0%, #9D174D 50%, #BE185D 100%)',
      'linear-gradient(135deg, #14532D 0%, #166534 50%, #15803D 100%)'
    ];

    const randomGradient = gradients[Math.floor(Math.random() * gradients.length)];

    const card: CardModel = {
      id: `card-${Date.now()}`,
      name: newCardName.trim(),
      bank: newCardBank,
      network: newCardNetwork,
      last4: newCardLast4.slice(-4) || '9999',
      limit: Number(newCardLimit) || 100000,
      billingDay: Number(newCardBillingDay) || 15,
      dueDay: Number(newCardDueDay) || 5,
      gradient: randomGradient,
      accent: '#818CF8'
    };

    const updated = [...cards, card];
    saveCards(updated);
    setIsAddCardOpen(false);
    setNewCardName('');
    setNewCardLast4('');
    setBannerMsg({ type: 'success', text: `Credit card ${card.name} added successfully!` });
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Delete card
  const handleDeleteCard = (cardId: string, cardName: string) => {
    if (cards.length <= 1) {
      alert('You must have at least one active credit card.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${cardName}? Existing transactions will remain in your database.`)) {
      return;
    }
    const updated = cards.filter(c => c.id !== cardId);
    saveCards(updated);
    if (selectedCardId === cardId) setSelectedCardId('all');
  };

  // Record Bill Payment
  const handlePayBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;

    setPaySaving(true);
    try {
      const baseAmount = currencyService.convertToBase(amt);
      const res = await api.post('/transactions', {
        date: new Date().toISOString().substring(0, 10),
        type: 'expense',
        category: 'Utilities & Bills',
        subcategory: 'Credit Card Bill Payment',
        description: `Payment towards ${payCardName} credit card bill`,
        amount: baseAmount,
        paymentMode: payMode
      });

      if (res.data && res.data.success) {
        setBannerMsg({ type: 'success', text: `Card bill payment of ${currencyService.format(baseAmount)} recorded successfully!` });
        setTimeout(() => setBannerMsg(null), 4000);
        setIsPayBillOpen(false);
        setPayAmount('');
        await fetchActualTransactions();
      }
    } catch {
      alert('Failed to record card bill payment.');
    } finally {
      setPaySaving(false);
    }
  };

  return (
    <main style={{ paddingBottom: 60 }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
              <CreditCard size={22} />
            </div>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>Credit Cards & Statements</h1>
              <p className="page-subtitle" style={{ margin: '2px 0 0' }}>
                Track actual credit card expenses, statement cycles, utilization & card limits
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            onClick={() => setIsAddCardOpen(true)}
          >
            <Plus size={16} />
            <span>Add New Card</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setSpendCard(cards[0]?.name || '');
              setIsAddSpendOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Add Credit Card Spend</span>
          </button>
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

      {/* KPI Overview Cards */}
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

        {/* Current Outstanding Spends */}
        <div className="kpi-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="kpi-title">CURRENT OUTSTANDING</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ marginTop: 8, color: '#EF4444' }}>
            {currencyService.format(totalOutstanding)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Directly from actual credit transactions
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
          {/* Progress bar */}
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Recommended: Keep utilization below 30%
          </div>
        </div>
      </div>

      {/* Visual Credit Cards Section */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Your Active Cards ({cards.length})
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedCardId('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: selectedCardId === 'all' ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                color: selectedCardId === 'all' ? '#FFF' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)'
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
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedCardId === c.id ? 'var(--accent-indigo)' : 'var(--bg-secondary)',
                  color: selectedCardId === c.id ? '#FFF' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cards Carousel / Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {cards.map(c => {
            const spentOnCard = cardSpendsMap[c.name] || 0;
            const availOnCard = Math.max(0, c.limit - spentOnCard);
            const cardUtil = c.limit > 0 ? (spentOnCard / c.limit) * 100 : 0;
            const isSelected = selectedCardId === c.id;

            return (
              <div
                key={c.id}
                onClick={() => setSelectedCardId(isSelected ? 'all' : c.id)}
                style={{
                  background: c.gradient,
                  borderRadius: 18,
                  padding: '22px 24px',
                  color: '#FFFFFF',
                  boxShadow: isSelected ? '0 12px 30px rgba(99, 102, 241, 0.45)' : '0 8px 24px rgba(0, 0, 0, 0.35)',
                  border: isSelected ? '2px solid #818CF8' : '1px solid rgba(255, 255, 255, 0.12)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 200
                }}
              >
                {/* Decorative watermarked circles */}
                <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -40, right: 30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.03)', pointerEvents: 'none' }} />

                {/* Card Top: Bank & Network */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.85)' }}>
                      {c.bank}
                    </span>
                    <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.65)' }}>
                      {c.name}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', letterSpacing: '0.05em', color: '#FFF' }}>
                      {c.network}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCard(c.id, c.name);
                      }}
                      title="Delete card"
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.4)', cursor: 'pointer', padding: 2 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Chip and Contactless Icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 10px' }}>
                  <div style={{ width: 34, height: 26, borderRadius: 5, background: 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)', border: '1px solid #B45309', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                    <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                    <div style={{ position: 'absolute', top: 18, left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.3)' }} />
                  </div>
                  <div style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)' }}>
                    <span style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>)))</span>
                  </div>
                </div>

                {/* Card Number */}
                <div style={{ fontSize: 16, letterSpacing: '0.22em', fontFamily: 'monospace', fontWeight: 700, color: '#FFF', textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                  •••• •••• •••• {c.last4}
                </div>

                {/* Cardholder & Expiry */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                  <div>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.55)', letterSpacing: '0.05em', display: 'block' }}>
                      CARDHOLDER
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {user?.name || 'CARDMEMBER'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.55)', letterSpacing: '0.05em', display: 'block' }}>
                      VALID THRU
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                      12/28
                    </span>
                  </div>
                </div>

                {/* Card Utilization & Balance Footer */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                      Spent: <strong>{currencyService.format(spentOnCard)}</strong>
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                      Avail: <strong>{currencyService.format(availOnCard)}</strong>
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                      Limit: <strong>{currencyService.format(c.limit)}</strong>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, cardUtil)}%`,
                        height: '100%',
                        background: cardUtil <= 30 ? '#10B981' : cardUtil <= 50 ? '#F59E0B' : '#EF4444'
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.65)' }}>
                      Due on <strong>{c.dueDay}th</strong> of month
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPayCardName(c.name);
                        setPayAmount(spentOnCard > 0 ? String(spentOnCard) : '');
                        setIsPayBillOpen(true);
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        color: '#FFF',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Pay Bill
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actual Credit Card Transactions Ledger */}
      <div className="summary-card" style={{ padding: 24 }}>
        {/* Table Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Actual Credit Card Transactions ({creditTransactions.length})
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Filtered from your real database ledger with payment mode: <strong>credit</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '7px 12px 7px 30px',
                  borderRadius: 8,
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  width: 180
                }}
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Categories</option>
              {Object.keys(CREDIT_CATEGORIES).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button
              type="button"
              className="btn-primary"
              style={{ padding: '7px 14px', fontSize: 12 }}
              onClick={() => {
                setSpendCard(cards[0]?.name || '');
                setIsAddSpendOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Add Spend</span>
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Loading credit card transactions from database...
          </div>
        ) : creditTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#6366F1' }}>
              <CreditCard size={24} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              No Credit Card Transactions Found
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
              {searchQuery || categoryFilter !== 'all' || selectedCardId !== 'all'
                ? 'No transactions match your current filters. Try resetting the search or card filter.'
                : 'Transactions recorded with Payment Mode "Credit Card" will automatically appear in this live table and sync with your card balance.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setSpendCard(cards[0]?.name || '');
                setIsAddSpendOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Record First Credit Card Expense</span>
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>
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
                {creditTransactions.map(tx => {
                  const amt = Number(tx.amount) || 0;
                  const cardLabel = tx.card || cards[0]?.name || 'Credit Card';

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
                        {tx.description || tx.details || 'Card Spend'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-indigo)', fontSize: 11, fontWeight: 700 }}>
                          <CreditCard size={12} />
                          {cardLabel}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {tx.category || 'General'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                        {tx.subcategory || '--'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(139, 92, 246, 0.12)', color: '#8B5CF6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                          {tx.paymentMode || 'CREDIT'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#EF4444', whiteSpace: 'nowrap' }}>
                        -{currencyService.format(amt)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Credit Card Spend */}
      {isAddSpendOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: 480 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Record Credit Card Spend</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saves directly to your actual transactions table</span>
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

              {/* Select Card */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CREDIT CARD
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

              {/* Amount & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    AMOUNT ({currencyService.getActiveCurrencyCode()})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1500"
                    value={spendAmount}
                    onChange={e => setSpendAmount(e.target.value)}
                    className="modal-input"
                    required
                  />
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

      {/* Modal: Add New Card */}
      {isAddCardOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ width: 480 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1' }}>
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Add New Credit Card</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configure credit limit, billing date & card details</span>
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

            <form onSubmit={handleAddCardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  CARD NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. Axis Magnus, HDFC Infinia, Amex Platinum"
                  value={newCardName}
                  onChange={e => setNewCardName(e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    ISSUING BANK
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC, ICICI, SBI, Axis"
                    value={newCardBank}
                    onChange={e => setNewCardBank(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
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
                    <option value="Amex">Amex</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    CREDIT LIMIT (INR ₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 250000"
                    value={newCardLimit}
                    onChange={e => setNewCardLimit(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    LAST 4 DIGITS
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 4242"
                    value={newCardLast4}
                    onChange={e => setNewCardLast4(e.target.value)}
                    className="modal-input"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    BILLING STATEMENT DAY
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
                    PAYMENT DUE DAY
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
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
          <div className="modal-container" style={{ width: 440 }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 17 }}>Record Bill Payment</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>For {payCardName}</span>
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  AMOUNT TO PAY ({currencyService.getActiveCurrencyCode()})
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter payment amount"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="modal-input"
                  required
                />
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
    </main>
  );
};
