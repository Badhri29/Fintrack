import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, logout, updateUser } = useAuth();

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Prefer not to say');
  const [photo, setPhoto] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
      setMessage(null);
    }
  }, [isOpen]);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/profile');
      if (res.data && res.data.success && res.data.data) {
        const u = res.data.data;
        setName(u.name || user?.name || '');
        setPhone(u.phone || '');
        setAge(u.age ? String(u.age) : '');
        setGender(u.gender || 'Prefer not to say');
        setPhoto(u.photo || '');
      } else if (user) {
        setName(user.name || '');
      }
    } catch (err) {
      if (user) {
        setName(user.name || '');
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put('/profile', {
        name,
        phone,
        age: age ? Number(age) : null,
        gender,
        photo
      });
      if (res.data && res.data.success) {
        updateUser({ name });
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        if (onSuccess) onSuccess();
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error saving profile changes.' });
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (n?: string) => {
    if (!n) return 'U';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.substring(0, 2).toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ width: 480 }}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="user-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
              {getInitials(name || user?.name)}
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: 18 }}>{user?.name}</h2>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {user?.email || ''}
              </span>
            </div>
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
              borderRadius: 8,
              transition: 'all 0.2s'
            }}
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              FULL NAME
            </label>
            <input
              type="text"
              className="modal-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                PHONE NUMBER
              </label>
              <input
                type="text"
                className="modal-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                AGE
              </label>
              <input
                type="number"
                className="modal-input"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="28"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              GENDER
            </label>
            <select
              className="modal-select"
              value={gender}
              onChange={e => setGender(e.target.value)}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              PROFILE PHOTO URL (OPTIONAL)
            </label>
            <input
              type="url"
              className="modal-input"
              value={photo}
              onChange={e => setPhoto(e.target.value)}
              placeholder="https://example.com/photo.jpg"
            />
          </div>

          {message && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background:
                  message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: message.type === 'success' ? '#10B981' : '#EF4444',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13
              }}
            >
              {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {message.text}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                onClose();
                logout();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#EF4444',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              <LogOut size={16} />
              Log Out
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                onClick={onClose}
              >
                Close
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
