import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Pencil,
  AlertCircle,
  Loader2,
  FolderEdit,
  Tag,
  Check
} from 'lucide-react';

export type CategorySection = 'expense' | 'income' | 'savings';

export interface EditCategoryTarget {
  type: 'category' | 'subcategory';
  section: CategorySection;
  categoryId: string;
  subcategoryId?: string;
  currentName: string;
  parentCategoryName?: string;
}

export interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (target: EditCategoryTarget, newName: string) => Promise<void>;
  target: EditCategoryTarget | null;
  existingNames?: string[];
}

const SECTION_CONFIG: Record<CategorySection, {
  label: string;
  color: string;
  bg: string;
  borderColor: string;
  cardBorder: string;
  cardShadow: string;
}> = {
  expense: {
    label: 'Expenses',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.42)',
    cardBorder: 'rgba(239, 68, 68, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(239, 68, 68, 0.08)',
  },
  income: {
    label: 'Income',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.42)',
    cardBorder: 'rgba(16, 185, 129, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(16, 185, 129, 0.08)',
  },
  savings: {
    label: 'Savings & Investments',
    color: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.42)',
    cardBorder: 'rgba(59, 130, 246, 0.32)',
    cardShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 28px rgba(59, 130, 246, 0.08)',
  },
};

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  target,
  existingNames = [],
}) => {
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && target) {
      setName(target.currentName);
      setError(null);
      setLoading(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, target]);

  if (!isOpen || !target) return null;

  const currentSectionConfig = SECTION_CONFIG[target.section] || SECTION_CONFIG.expense;
  const isCategory = target.type === 'category';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();

    if (!cleanName) {
      setError(`Please enter a valid ${isCategory ? 'category' : 'subcategory'} name`);
      return;
    }

    if (cleanName.toLowerCase() === target.currentName.trim().toLowerCase()) {
      onClose();
      return;
    }

    const isDuplicate = existingNames.some(
      (n) => n.trim().toLowerCase() === cleanName.toLowerCase() && n.trim().toLowerCase() !== target.currentName.trim().toLowerCase()
    );

    if (isDuplicate) {
      setError(`A ${isCategory ? 'category' : 'subcategory'} named "${cleanName}" already exists.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSave(target, cleanName);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: 'var(--bg-input, #161f30)',
    border: error ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 9,
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: 16,
      }}
    >
      <div
        className="modal-container"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--bg-card, #0f172a)',
          borderRadius: 16,
          padding: 24,
          border: `1px solid ${currentSectionConfig.cardBorder}`,
          boxShadow: currentSectionConfig.cardShadow,
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
          boxSizing: 'border-box',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: currentSectionConfig.bg,
                border: `1px solid ${currentSectionConfig.borderColor}`,
                color: currentSectionConfig.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isCategory ? <FolderEdit size={20} /> : <Tag size={20} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                {isCategory ? 'Edit Category' : 'Edit Subcategory'}
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                <span>{currentSectionConfig.label}</span>
                {!isCategory && target.parentCategoryName && (
                  <span style={{ opacity: 0.85 }}> • {target.parentCategoryName}</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--text-secondary, #94a3b8)',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: 12.5,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text-secondary, #94a3b8)',
                marginBottom: 6,
              }}
            >
              {isCategory ? 'Category Name' : 'Subcategory Name'}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              style={inputStyle}
              placeholder={`e.g. ${isCategory ? 'Groceries & Dining' : 'Health Insurance'}`}
              disabled={loading}
              maxLength={80}
            />
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              marginBottom: 20,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Pencil size={13} style={{ color: '#38bdf8', marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.45 }}>
              Renaming this {isCategory ? 'category' : 'subcategory'} will immediately update it in your annual planner, budget calculations, and existing transactions.
            </span>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 18px',
                borderRadius: 8,
                background: loading || !name.trim() ? '#334155' : 'var(--accent-indigo, #6366f1)',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                boxShadow: loading || !name.trim() ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
