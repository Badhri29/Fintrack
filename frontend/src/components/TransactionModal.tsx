import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import api from '../services/api';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCategory?: string;
  initialSubcategory?: string;
  initialType?: 'income' | 'expense';
}

const SUBCATEGORY_OPTIONS: Record<string, string[]> = {
  'Housing & Rent': ['Rent/Mortgage', 'Property Tax', 'Home Insurance', 'Maintenance & Repairs', 'HOA Fees', 'Other'],
  'Food & Groceries': ['Supermarket Groceries', 'Organic & Farmers Market', 'Household Supplies', 'Snacks & Beverages', 'Other'],
  'Utilities & Internet': ['Electricity', 'Water & Sewer', 'High-Speed Internet', 'Mobile Phone Bill', 'Gas / Heating', 'Other'],
  'Dining & Entertainment': ['Restaurants & Cafes', 'Food Delivery (Swiggy/Zomato)', 'Streaming (Netflix/Prime)', 'Movies & Concerts', 'Gaming & Hobbies', 'Other'],
  'Transportation & Auto': ['Fuel / Petrol', 'Car Insurance & EMI', 'Public Transit & Metro', 'Uber / Taxi / Auto', 'Vehicle Servicing', 'Other'],
  'Healthcare & Medical': ['Doctor Consultation', 'Pharmacy & Medicines', 'Health Insurance Premium', 'Gym & Fitness', 'Dental / Vision', 'Other'],
  'Shopping & Personal': ['Clothing & Footwear', 'Electronics & Gadgets', 'Personal Care & Grooming', 'Gifts & Donations', 'Other'],
  'Salary': ['Monthly Base Salary', 'Performance Bonus', 'Overtime Pay', 'Annual Incentive', 'Other'],
  'Investments': ['Mutual Fund SIP', 'Stock Dividend', 'Fixed Deposit Interest', 'Crypto / NFT Returns', 'Real Estate Income', 'Other'],
  'Freelance & Business': ['Consulting Fees', 'Client Project Payment', 'Royalties & Licensing', 'Side Hustle Income', 'Other']
};

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, onSuccess, initialCategory, initialSubcategory, initialType }) => {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('Housing & Rent');
  const [subcategory, setSubcategory] = useState<string>('Rent/Mortgage');
  const [isCustomSubcategory, setIsCustomSubcategory] = useState<boolean>(false);
  const [customSubcategoryText, setCustomSubcategoryText] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('upi');
  const [card, setCard] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialCategory) setCategory(initialCategory);
    if (initialSubcategory) setSubcategory(initialSubcategory);
    if (initialType) setType(initialType);
  }, [isOpen, initialCategory, initialSubcategory, initialType]);

  if (!isOpen) return null;

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    const options = SUBCATEGORY_OPTIONS[newCat] || ['Other'];
    const defaultSub = options[0];
    setSubcategory(defaultSub);
    setIsCustomSubcategory(defaultSub === 'Other');
    if (defaultSub !== 'Other') {
      setCustomSubcategoryText('');
    }
  };

  const handleSubcategoryChange = (newSub: string) => {
    setSubcategory(newSub);
    if (newSub === 'Other') {
      setIsCustomSubcategory(true);
    } else {
      setIsCustomSubcategory(false);
      setCustomSubcategoryText('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    const finalSubcategory = isCustomSubcategory ? (customSubcategoryText.trim() || 'General') : subcategory;

    setSubmitting(true);
    setError(null);

    try {
      await api.post('/transactions', {
        date,
        type,
        category,
        subcategory: finalSubcategory,
        amount: Number(amount),
        paymentMode,
        card: paymentMode === 'credit' ? card : null,
        description
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const subcategoryList = Array.from(new Set([...(SUBCATEGORY_OPTIONS[category] || []), subcategory, 'Other']));
  const categoryList = Array.from(new Set([...Object.keys(SUBCATEGORY_OPTIONS), category]));

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ width: 500 }}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 16, marginBottom: 16 }}>
          <div>
            <h2 className="modal-title" style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
              Add New Transaction
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Log income or expense into your personal financial record
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              borderRadius: 8
            }}
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16
            }}
          >
            {error}
          </div>
        )}

        {/* Type selector */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setType('expense')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: type === 'expense' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-input)',
              color: type === 'expense' ? '#EF4444' : 'var(--text-secondary)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: type === 'income' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-input)',
              color: type === 'income' ? '#10B981' : 'var(--text-secondary)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Income
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)'
                }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Amount (₹)</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontWeight: 600
                }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Category</label>
              <select
                value={category}
                onChange={e => handleCategoryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)'
                }}
              >
                {categoryList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Subcategory</label>
              <select
                value={subcategory}
                onChange={e => handleSubcategoryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)'
                }}
              >
                {subcategoryList.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          {isCustomSubcategory && (
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Custom Subcategory Name
              </label>
              <input
                type="text"
                value={customSubcategoryText}
                onChange={e => setCustomSubcategoryText(e.target.value)}
                placeholder="e.g. Special Holiday Gift"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Payment Mode</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: 'var(--text-primary)'
                }}
              >
                <option value="upi">UPI</option>
                <option value="credit">Credit Card</option>
                <option value="debit">Debit Card</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {paymentMode === 'credit' && (
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Select Card</label>
                <select
                  value={card}
                  onChange={e => setCard(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="">Select Card</option>
                  <option value="HDFC Millennia">HDFC Millennia</option>
                  <option value="ICICI Sapphiro">ICICI Sapphiro</option>
                  <option value="SBI Cashback">SBI Cashback</option>
                  <option value="Axis Flipkart">Axis Flipkart</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Description / Notes</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Monthly apartment rent"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
              }}
            >
              <Check size={16} />
              <span>{submitting ? 'Saving...' : 'Add Transaction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
