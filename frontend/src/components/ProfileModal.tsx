import React, { useState, useEffect, useRef } from 'react';
import { X, Save, CheckCircle, AlertCircle, LogOut, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
];

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, logout, updateUser } = useAuth();

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Prefer not to say');
  const [photo, setPhoto] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const p = u.photo || user?.photo || localStorage.getItem('fintrack_user_photo') || '';
        setPhoto(p);
      } else if (user) {
        setName(user.name || '');
        setPhoto(user.photo || localStorage.getItem('fintrack_user_photo') || '');
      }
    } catch {
      if (user) {
        setName(user.name || '');
        setPhoto(user.photo || localStorage.getItem('fintrack_user_photo') || '');
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select a valid image file (PNG, JPG, etc.).' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image size should be less than 2MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhoto(result);
      setMessage(null);
    };
    reader.readAsDataURL(file);
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
        updateUser({ name, photo });
        if (photo) {
          localStorage.setItem('fintrack_user_photo', photo);
        } else {
          localStorage.removeItem('fintrack_user_photo');
        }
        window.dispatchEvent(new CustomEvent('fintrack-profile-updated', { detail: { photo, name } }));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        if (onSuccess) onSuccess();
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile.' });
      }
    } catch {
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
      <div className="modal-container" style={{ width: 490, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              className="user-avatar"
              style={{
                width: 48,
                height: 48,
                fontSize: 16,
                overflow: 'hidden',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'var(--brand-primary, #6366F1)',
                color: '#fff',
                fontWeight: 700,
                flexShrink: 0
              }}
            >
              {photo ? (
                <img
                  src={photo}
                  alt={name || user?.name || 'Profile'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  onError={() => setPhoto('')}
                />
              ) : (
                getInitials(name || user?.name)
              )}
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: 18 }}>{name || user?.name || 'User Profile'}</h2>
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
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
          {/* Profile Photo Management */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              PROFILE PHOTO
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary, rgba(255, 255, 255, 0.08))',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Upload size={14} />
                Upload Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto('')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#EF4444',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="modal-input"
                value={photo}
                onChange={e => setPhoto(e.target.value)}
                placeholder="Or paste an image URL (https://...)"
                style={{ fontSize: 13 }}
              />
            </div>

            {/* Quick Presets */}
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Or select an avatar:
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {PRESET_AVATARS.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Preset ${idx + 1}`}
                    onClick={() => setPhoto(url)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      border: photo === url ? '2px solid #6366F1' : '1px solid var(--border-color)',
                      objectFit: 'cover',
                      transition: 'transform 0.15s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
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