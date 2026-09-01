import React, { useState, useEffect } from 'react';
import { Shield, Tag, Plus, CheckCircle, AlertCircle, LogOut, Sun, Moon, Laptop, Palette } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import api from '../services/api';

export const SettingsView: React.FC = () => {
  const { logout } = useAuth();
  const { theme, setTheme, effectiveTheme } = useTheme();

  // Categories states
  const [categories, setCategories] = useState<any[]>([]);
  const [newCatType, setNewCatType] = useState<string>('expense');
  const [newCatName, setNewCatName] = useState<string>('');
  const [catAdding, setCatAdding] = useState<boolean>(false);
  const [catMessage, setCatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subcategory states
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [newSubCatName, setNewSubCatName] = useState<string>('');
  const [subAdding, setSubAdding] = useState<boolean>(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setCategories(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedCatId(String(res.data.data[0].id));
        }
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCatAdding(true);
    setCatMessage(null);
    try {
      const res = await api.post('/categories', {
        type: newCatType,
        name: newCatName.trim()
      });
      if (res.data && res.data.success) {
        setCatMessage({ type: 'success', text: `Added category "${newCatName}"!` });
        setNewCatName('');
        fetchCategories();
      } else {
        setCatMessage({ type: 'error', text: res.data.message || 'Could not add category.' });
      }
    } catch (err: any) {
      setCatMessage({
        type: 'error',
        text: err.response?.data?.message || 'Category already exists or error occurred.'
      });
    } finally {
      setCatAdding(false);
    }
  };

  const handleAddSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId || !newSubCatName.trim()) return;
    setSubAdding(true);
    setCatMessage(null);
    try {
      const res = await api.post('/subcategories', {
        categoryId: Number(selectedCatId),
        name: newSubCatName.trim()
      });
      if (res.data && res.data.success) {
        setCatMessage({ type: 'success', text: `Added subcategory "${newSubCatName}"!` });
        setNewSubCatName('');
      } else {
        setCatMessage({ type: 'error', text: res.data.message || 'Could not add subcategory.' });
      }
    } catch (err: any) {
      setCatMessage({
        type: 'error',
        text: err.response?.data?.message || 'Error adding subcategory.'
      });
    } finally {
      setSubAdding(false);
    }
  };

  const themeOptions: { id: ThemeMode; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'dark',
      label: 'Dark Mode',
      desc: 'High contrast dark glassmorphism',
      icon: <Moon size={22} />
    },
    {
      id: 'light',
      label: 'Light Mode',
      desc: 'Crisp white glassmorphism palette',
      icon: <Sun size={22} />
    },
    {
      id: 'system',
      label: 'System Default',
      desc: 'Automatically follow OS preference',
      icon: <Laptop size={22} />
    }
  ];

  return (
    <main>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings & Preferences</h1>
          <p className="page-subtitle">Customize application appearance, budget categories & system options</p>
        </div>
        <div>
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24, marginTop: 8 }}>
        {/* Appearance & Themes Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(236, 72, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EC4899'
              }}
            >
              <Palette size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Appearance & Theme Mode
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Select your preferred visual theme
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {themeOptions.map(opt => {
              const active = theme === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  style={{
                    padding: '18px 14px',
                    borderRadius: 14,
                    border: active
                      ? '2px solid var(--accent-indigo)'
                      : '1px solid var(--border-color)',
                    background: active
                      ? 'rgba(99, 102, 241, 0.15)'
                      : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 10,
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ color: active ? 'var(--accent-indigo)' : 'var(--text-secondary)' }}>
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {opt.desc}
                    </div>
                  </div>

                  {active && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        color: '#10B981'
                      }}
                    >
                      <CheckCircle size={16} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 22,
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontSize: 13,
              color: 'var(--text-secondary)'
            }}
          >
            Current active theme: <strong style={{ color: 'var(--text-primary)' }}>{effectiveTheme.toUpperCase()}</strong>.
            Clicking the profile icon in the navbar opens your Profile edit modal anytime.
          </div>
        </div>

        {/* Category Management Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3B82F6'
              }}
            >
              <Tag size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Category Management
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Create custom income, expense & savings categories
              </span>
            </div>
          </div>

          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              1. Add New Category
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 12 }}>
              <select
                className="modal-select"
                value={newCatType}
                onChange={e => setNewCatType(e.target.value)}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="savings">Savings</option>
              </select>

              <input
                type="text"
                className="modal-input"
                placeholder="Category name (e.g. Subscriptions)"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
              />

              <button type="submit" className="btn-primary" disabled={catAdding}>
                <Plus size={16} />
                Add
              </button>
            </div>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

          {/* Add Subcategory Form */}
          <form onSubmit={handleAddSubCategory} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              2. Add Subcategory to Existing Category
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12 }}>
              <select
                className="modal-select"
                value={selectedCatId}
                onChange={e => setSelectedCatId(e.target.value)}
              >
                {categories.length === 0 ? (
                  <option value="">No categories</option>
                ) : (
                  categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))
                )}
              </select>

              <input
                type="text"
                className="modal-input"
                placeholder="Subcategory (e.g. Netflix)"
                value={newSubCatName}
                onChange={e => setNewSubCatName(e.target.value)}
              />

              <button type="submit" className="btn-primary" disabled={subAdding || !selectedCatId}>
                <Plus size={16} />
                Add
              </button>
            </div>
          </form>

          {catMessage && (
            <div
              style={{
                marginTop: 20,
                padding: '12px 16px',
                borderRadius: 8,
                background:
                  catMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: catMessage.type === 'success' ? '#10B981' : '#EF4444',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14
              }}
            >
              {catMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {catMessage.text}
            </div>
          )}
        </div>

        {/* Security & System Info Card */}
        <div className="summary-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8B5CF6'
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                System Configuration
              </h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Environment & data persistence info
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Default Currency</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>INR (₹ - Indian Rupee)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Authentication</span>
              <span style={{ color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={14} /> JWT Stateless Token
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Database Engine</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>MySQL 8.0 (Hibernate JPA)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Active Theme Mode</span>
              <span style={{ color: 'var(--accent-indigo)', fontWeight: 700 }}>
                {effectiveTheme.toUpperCase()} ({theme})
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
