import React, { useState, useEffect } from 'react';
import { Trash2, Plus, ArrowUpRight, ArrowDownRight, CreditCard, Search, Filter, X } from 'lucide-react';
import api from '../services/api';

interface TransactionsViewProps {
  onOpenNewTransaction: () => void;
  globalSearchQuery?: string;
}

const CATEGORIES = [
  'All Categories',
  'Housing & Rent',
  'Food & Groceries',
  'Utilities & Internet',
  'Dining & Entertainment',
  'Transportation & Auto',
  'Healthcare & Medical',
  'Shopping & Personal',
  'Salary',
  'Investments',
  'Freelance & Business'
];

export const TransactionsView: React.FC<TransactionsViewProps> = ({ onOpenNewTransaction, globalSearchQuery }) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [searchQuery, setSearchQuery] = useState<string>(globalSearchQuery || '');

  useEffect(() => {
    if (globalSearchQuery !== undefined) {
      setSearchQuery(globalSearchQuery);
    }
  }, [globalSearchQuery]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/transactions');
      if (res.data && res.data.success) {
        setTransactions(res.data.data);
      }
    } catch (err) {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${id}`);
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert('Failed to delete transaction');
    }
  };

  const formatCurr = (num: number) => '₹' + Math.round(num || 0).toLocaleString('en-IN');

  const filtered = transactions.filter(t => {
    // 1. Filter by Type
    if (filterType !== 'all' && t.type !== filterType) return false;

    // 2. Filter by Category
    if (selectedCategory !== 'All Categories' && t.category !== selectedCategory) return false;

    // 3. Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCat = t.category && String(t.category).toLowerCase().includes(q);
      const matchSub = t.subcategory && String(t.subcategory).toLowerCase().includes(q);
      const matchDesc = t.description && String(t.description).toLowerCase().includes(q);
      const matchMode = t.paymentMode && String(t.paymentMode).toLowerCase().includes(q);
      const matchDate = t.date && String(t.date).toLowerCase().includes(q);
      const matchAmt = t.amount && String(t.amount).includes(q);
      if (!matchCat && !matchSub && !matchDesc && !matchMode && !matchDate && !matchAmt) {
        return false;
      }
    }

    return true;
  });

  const hasActiveFilters = filterType !== 'all' || selectedCategory !== 'All Categories' || searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setFilterType('all');
    setSelectedCategory('All Categories');
    setSearchQuery('');
  };

  return (
    <main>
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">View, search, and manage all your income and expense records</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            <button
              className={`segmented-btn ${filterType === 'income' ? 'active' : ''}`}
              onClick={() => setFilterType('income')}
            >
              Income
            </button>
            <button
              className={`segmented-btn ${filterType === 'expense' ? 'active' : ''}`}
              onClick={() => setFilterType('expense')}
            >
              Expenses
            </button>
          </div>

          <button className="btn-primary" onClick={onOpenNewTransaction}>
            <Plus size={16} />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div
        style={{
          padding: '0 28px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 260,
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            padding: '10px 14px',
            gap: 10
          }}
        >
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search by category, subcategory, date, description, amount..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              color: 'var(--text-primary)',
              width: '100%',
              fontSize: 13
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={15} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Clear Filters
          </button>
        )}

        <div
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            padding: '8px 12px',
            borderRadius: 8
          }}
        >
          Showing {filtered.length} of {transactions.length} transactions
        </div>
      </div>

      <div style={{ padding: '0 28px 40px' }}>
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="spreadsheet-table" style={{ textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ background: '#111724', textAlign: 'left' }}>Date</th>
                <th style={{ background: '#111724', textAlign: 'left' }}>Type</th>
                <th style={{ background: '#111724', textAlign: 'left' }}>Category</th>
                <th style={{ background: '#111724', textAlign: 'left' }}>Description</th>
                <th style={{ background: '#111724', textAlign: 'left' }}>Payment Mode</th>
                <th style={{ background: '#111724', textAlign: 'right' }}>Amount</th>
                <th style={{ background: '#111724', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Loading transactions...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    No transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => (
                  <tr key={t.id || idx}>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.date}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: t.type === 'income' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: t.type === 'income' ? '#10B981' : '#EF4444'
                        }}
                      >
                        {t.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {t.type ? t.type.toUpperCase() : ''}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t.category}
                      {t.subcategory ? (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginTop: 2 }}>
                          {t.subcategory}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.description || '-'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <CreditCard size={14} />
                        {(t.paymentMode || 'UPI').toUpperCase()}
                        {t.card ? ` (${t.card})` : ''}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: t.type === 'income' ? '#10B981' : '#EF4444'
                      }}
                    >
                      {t.type === 'income' ? '+' : '-'}{formatCurr(t.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(t.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 4
                        }}
                        title="Delete transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};
