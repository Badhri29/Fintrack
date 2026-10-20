import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  FolderPlus,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  AlertCircle,
  Loader2,
  Tag
} from 'lucide-react';
import api from '../services/api';

export type CategorySection = 'expense' | 'income' | 'savings';

export interface CategoryOption {
  id?: number;
  name: string;
}

export interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: 'category' | 'subcategory';
  initialSection?: CategorySection;
  initialCategoryName?: string;
  categoriesBySection?: {
    income: CategoryOption[];
    savings: CategoryOption[];
    expense: CategoryOption[];
  };
}

const SECTION_CONFIG: Record<CategorySection, {
  label: string;
  color: string;
  bg: string;
  borderColor: string;
  cardBorder: string;
  cardShadow: string;
  icon: React.ReactNode;
}> = {
  expense: {
    label: 'Expenses',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.42)',
    cardBorder: 'rgba(239, 68, 68, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(239, 68, 68, 0.08)',
    icon: <ArrowDownRight size={16} />,
  },
  income: {
    label: 'Income',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.42)',
    cardBorder: 'rgba(16, 185, 129, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(16, 185, 129, 0.08)',
    icon: <ArrowUpRight size={16} />,
  },
  savings: {
    label: 'Savings & Investments',
    color: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.42)',
    cardBorder: 'rgba(59, 130, 246, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(59, 130, 246, 0.08)',
    icon: <PiggyBank size={16} />,
  },
};

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'category',
  initialSection = 'expense',
  initialCategoryName = '',
  categoriesBySection = { income: [], savings: [], expense: [] },
}) => {
  const [mode, setMode] = useState<'category' | 'subcategory'>(initialMode);
  const [section, setSection] = useState<CategorySection>(initialSection);
  const [categoryName, setCategoryName] = useState<string>('');
  const [initialSubcategoriesText, setInitialSubcategoriesText] = useState<string>('');
  const [selectedParentCategory, setSelectedParentCategory] = useState<string>(initialCategoryName);
  const [subcategoryName, setSubcategoryName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSection(initialSection);
      setCategoryName('');
      setInitialSubcategoriesText('');
      setSubcategoryName('');
      setError(null);

      const sectionCats = categoriesBySection[initialSection] || [];
      if (initialCategoryName && sectionCats.some((c) => c.name === initialCategoryName)) {
        setSelectedParentCategory(initialCategoryName);
      } else if (sectionCats.length > 0) {
        setSelectedParentCategory(sectionCats[0].name);
      } else {
        setSelectedParentCategory(initialCategoryName || '');
      }
    }
  }, [isOpen, initialMode, initialSection, initialCategoryName, categoriesBySection]);

  // When section changes, adjust parent category default
  const handleSectionChange = (s: CategorySection) => {
    setSection(s);
    setError(null);
    const list = categoriesBySection[s] || [];
    if (list.length > 0) {
      setSelectedParentCategory(list[0].name);
    } else {
      setSelectedParentCategory('');
    }
  };

  if (!isOpen) return null;

  const currentSectionConfig = SECTION_CONFIG[section];
  const availableCategories = categoriesBySection[section] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'category') {
      const name = categoryName.trim();
      if (!name) {
        setError('Please enter a category name');
        return;
      }

      setLoading(true);
      try {
        const catRes = await api.post('/categories', {
          name,
          type: section,
        });

        const createdCatId = catRes.data?.data?.id;

        // If user entered initial subcategories
        if (createdCatId && initialSubcategoriesText.trim()) {
          const subs = initialSubcategoriesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          for (const sub of subs) {
            try {
              await api.post('/subcategories', {
                categoryId: createdCatId,
                name: sub,
              });
            } catch {
              // ignore duplicate or single sub error
            }
          }
        }

        onSuccess();
        onClose();
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            'Category could not be saved. It might already exist or the backend is unreachable.',
        );
      } finally {
        setLoading(false);
      }
    } else {
      // Subcategory creation
      const subName = subcategoryName.trim();
      if (!subName) {
        setError('Please enter a subcategory name');
        return;
      }

      if (!selectedParentCategory) {
        setError('Please select or specify a parent category');
        return;
      }

      setLoading(true);
      try {
        // Find existing parent category ID
        let categoryId: number | undefined;
        const found = availableCategories.find((c) => c.name === selectedParentCategory);
        if (found && found.id) {
          categoryId = found.id;
        }

        // If not found in DB list, ensure it's created first
        if (!categoryId) {
          try {
            const createRes = await api.post('/categories', {
              name: selectedParentCategory,
              type: section,
            });
            categoryId = createRes.data?.data?.id;
          } catch (createErr: any) {
            if (createErr.response?.status !== 409) throw createErr;
            const existingRes = await api.get('/categories', {
              params: { type: section },
            });
            const existingCat = existingRes.data?.data?.find(
              (item: any) => item.name === selectedParentCategory,
            );
            categoryId = existingCat?.id;
            if (!categoryId) throw createErr;
          }
        }

        await api.post('/subcategories', {
          categoryId,
          name: subName,
        });

        onSuccess();
        onClose();
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            'Subcategory could not be saved. Make sure the backend is running.',
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-input, #161f30)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 9,
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-container"
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 24,
          border: `1px solid ${currentSectionConfig.cardBorder}`,
          boxShadow: currentSectionConfig.cardShadow,
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: currentSectionConfig.bg,
                border: `1px solid ${currentSectionConfig.borderColor}`,
                color: currentSectionConfig.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mode === 'category' ? <FolderPlus size={18} /> : <Layers size={18} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                {mode === 'category' ? 'Add Category' : 'Add Subcategory'}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Organize your budget and transaction planner
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Switch (Category vs Subcategory) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            background: 'rgba(15, 23, 42, 0.6)',
            padding: 4,
            borderRadius: 10,
            marginBottom: 18,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('category');
              setError(null);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'category' ? 'var(--accent-indigo, #6366f1)' : 'transparent',
              color: mode === 'category' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <FolderPlus size={14} />
            <span>New Category</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('subcategory');
              setError(null);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'subcategory' ? 'var(--accent-indigo, #6366f1)' : 'transparent',
              color: mode === 'subcategory' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={14} />
            <span>New Subcategory</span>
          </button>
        </div>

        {/* Section Selector */}
        <div style={{ marginBottom: 18 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Budget Section
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(['income', 'savings', 'expense'] as CategorySection[]).map((sec) => {
              const cfg = SECTION_CONFIG[sec];
              const isSelected = section === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleSectionChange(sec)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 9,
                    border: isSelected
                      ? `1px solid ${cfg.borderColor}`
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isSelected ? cfg.bg : 'rgba(15, 23, 42, 0.45)',
                    color: isSelected ? cfg.color : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: 11.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cfg.icon}
                  <span>{cfg.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'category' ? (
            <>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    marginBottom: 6,
                  }}
                >
                  <Tag size={13} style={{ color: currentSectionConfig.color }} />
                  <span>Category Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Subscriptions, Groceries, Freelance"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = currentSectionConfig.borderColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${currentSectionConfig.bg}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  autoFocus
                  required
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Layers size={13} style={{ color: currentSectionConfig.color }} />
                    <span>Initial Subcategories (Optional)</span>
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Comma separated</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Netflix, Spotify, Gym"
                  value={initialSubcategoriesText}
                  onChange={(e) => setInitialSubcategoriesText(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = currentSectionConfig.borderColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${currentSectionConfig.bg}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    marginBottom: 6,
                  }}
                >
                  <FolderPlus size={13} style={{ color: currentSectionConfig.color }} />
                  <span>Parent Category</span>
                </label>
                {availableCategories.length > 0 ? (
                  <select
                    value={selectedParentCategory}
                    onChange={(e) => setSelectedParentCategory(e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = currentSectionConfig.borderColor;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${currentSectionConfig.bg}`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {availableCategories.map((c) => (
                      <option key={c.name} value={c.name} style={{ background: '#0f172a', color: '#f8fafc' }}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter parent category name"
                    value={selectedParentCategory}
                    onChange={(e) => setSelectedParentCategory(e.target.value)}
                    style={inputStyle}
                    required
                  />
                )}
              </div>

              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    marginBottom: 6,
                  }}
                >
                  <Layers size={13} style={{ color: currentSectionConfig.color }} />
                  <span>Subcategory Name</span>
                </label>
                <input
                  type="text"
                  placeholder={`e.g. ${selectedParentCategory ? `${selectedParentCategory} item` : 'Item name'}`}
                  value={subcategoryName}
                  onChange={(e) => setSubcategoryName(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = currentSectionConfig.borderColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${currentSectionConfig.bg}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  autoFocus
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: 12,
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
              marginTop: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: `linear-gradient(135deg, ${currentSectionConfig.color} 0%, #4f46e5 100%)`,
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                boxShadow: `0 4px 14px ${currentSectionConfig.bg}`,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>{mode === 'category' ? 'Add Category' : 'Add Subcategory'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
