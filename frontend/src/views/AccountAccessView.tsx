import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Eye,
  UserPlus,
  Key,
  Trash2,
  Copy,
  Check,
  Lock,
  X,
  ChevronDown,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { showToast } from '../components/ToastNotification';

interface MemberItem {
  id: number;
  ownerId: number;
  memberUserId: number;
  memberId?: string;
  name: string;
  email?: string;
  permission: 'VIEW_ONLY' | 'CAN_EDIT';
  status: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CredentialsInfo {
  memberId: string;
  name: string;
  tempPassword: string;
  permission: string;
  expiresAt?: string;
  expiryLabel?: string;
}

const notify = (title: string, message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
  showToast({ title, message, type });
};

export const AccountAccessView: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [ownerInfo, setOwnerInfo] = useState<{ id: number; name: string; email: string; role: string; photo?: string } | null>(null);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>('');
  const [addExpiryDuration, setAddExpiryDuration] = useState<string>('30_DAYS');
  const [addPermission, setAddPermission] = useState<'VIEW_ONLY' | 'CAN_EDIT'>('VIEW_ONLY');
  const [addingMember, setAddingMember] = useState<boolean>(false);

  // Credentials Generated Modal State
  const [credentialsModal, setCredentialsModal] = useState<CredentialsInfo | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Delete Member Confirm Modal
  const [memberToDelete, setMemberToDelete] = useState<MemberItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/members');
      if (res.data?.success) {
        setMembers(res.data.members || []);
        if (res.data.owner) {
          setOwnerInfo(res.data.owner);
        }
      }
    } catch (err: any) {
      console.error('Failed to load workspace members:', err);
      notify('Error', err.response?.data?.message || 'Failed to load workspace members', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      notify('Missing Name', 'Please enter a name for the member.', 'error');
      return;
    }

    try {
      setAddingMember(true);
      const res = await api.post('/workspace/members', {
        name: addName.trim(),
        permission: addPermission,
        expiryDuration: addExpiryDuration
      });

      if (res.data?.success) {
        notify('Success', 'Workspace member created with new ID & password!', 'success');
        setIsAddModalOpen(false);
        setAddName('');
        setAddExpiryDuration('30_DAYS');
        setAddPermission('VIEW_ONLY');

        // Open credentials modal
        if (res.data.credentials) {
          setCredentialsModal(res.data.credentials);
        }
        fetchMembers();
      }
    } catch (err: any) {
      console.error('Failed to add member:', err);
      notify('Error', err.response?.data?.message || 'Failed to add workspace member.', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const handleUpdatePermission = async (memberId: number, newPermission: 'VIEW_ONLY' | 'CAN_EDIT') => {
    try {
      const res = await api.put(`/workspace/members/${memberId}/permission`, { permission: newPermission });
      if (res.data?.success) {
        notify('Permission Updated', `Permission updated to ${newPermission === 'CAN_EDIT' ? 'Can Edit' : 'View Only'}`, 'success');
        setMembers(prev =>
          prev.map(m => m.id === memberId ? { ...m, permission: newPermission } : m)
        );
      }
    } catch (err: any) {
      console.error('Failed to update permission:', err);
      notify('Error', err.response?.data?.message || 'Failed to update member permission', 'error');
    }
  };

  const handleResetPassword = async (member: MemberItem) => {
    try {
      const res = await api.post(`/workspace/members/${member.id}/reset-password`);
      if (res.data?.success) {
        notify('Success', 'Password regenerated successfully', 'success');
        setCredentialsModal({
          memberId: res.data.memberId || member.memberId || `MEM-${member.id}`,
          name: member.name,
          tempPassword: res.data.tempPassword,
          permission: member.permission,
          expiresAt: member.expiresAt
        });
      }
    } catch (err: any) {
      console.error('Failed to reset member password:', err);
      notify('Error', err.response?.data?.message || 'Failed to reset password', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    try {
      setDeleting(true);
      const res = await api.delete(`/workspace/members/${memberToDelete.id}`);
      if (res.data?.success) {
        notify('Member Removed', 'Member removed from workspace', 'success');
        setMemberToDelete(null);
        fetchMembers();
      }
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      notify('Error', err.response?.data?.message || 'Failed to remove member', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const copyCredentialsText = () => {
    if (!credentialsModal) return;
    const expiryStr = credentialsModal.expiresAt
      ? new Date(credentialsModal.expiresAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
      : (credentialsModal.expiryLabel || 'Never expires');

    const text = `FinTrack Member Login Credentials:
Member ID: ${credentialsModal.memberId}
Password: ${credentialsModal.tempPassword}
Permission: ${credentialsModal.permission === 'CAN_EDIT' ? 'Can Edit' : 'View Only'}
Access Expiry: ${expiryStr}
Login URL: ${window.location.origin}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    notify('Copied', 'Member ID & Password copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const copyText = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    notify('Copied', `${label} copied to clipboard!`, 'success');
  };

  const isMemberExpired = (m: MemberItem) => {
    if (!m.expiresAt) return false;
    return new Date(m.expiresAt).getTime() < Date.now();
  };

  const formatExpiryDisplay = (expiresAt?: string) => {
    if (!expiresAt) return 'Never expires';
    const date = new Date(expiresAt);
    const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Expired';
    if (diffDays === 1) return 'Expires tomorrow';
    if (diffDays <= 30) return `Expires in ${diffDays} days`;
    return `Expires: ${date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  const isLinkedMember = Boolean(user?.isMember || user?.parentUserId);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Account access
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
            You control who can access your financial workspace and what they can do
          </p>
        </div>

        {!isLinkedMember && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#FFF',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <UserPlus size={16} />
            + Add member
          </button>
        )}
      </div>

      {/* Linked Member Notice Banner (if logged in as a member) */}
      {isLinkedMember && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={20} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Linked Member Workspace Access
            </h4>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You are signed in as a workspace member with <strong>{user?.memberPermission === 'CAN_EDIT' ? 'Can Edit' : 'View Only'}</strong> permissions. Workspace configuration and member invitations are managed exclusively by the primary account owner.
            </p>
          </div>
        </div>
      )}

      {/* 3 Top Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        {/* Card 1: You / Workspace Owner */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '20px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ShieldCheck size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                You
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                Primary
              </span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ownerInfo?.name || user?.name || 'Workspace owner'}
            </div>
          </div>
        </div>

        {/* Card 2: Linked Members Count */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '20px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Users size={26} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              Workspace Seats
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              {members.length} {members.length === 1 ? 'linked member' : 'linked members'}
            </div>
          </div>
        </div>

        {/* Card 3: Default Permission */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '20px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(139, 92, 246, 0.12)',
              color: '#8B5CF6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Eye size={26} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              Default permission
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
              View only
            </div>
          </div>
        </div>
      </div>

      {/* Main Table: People with access */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
            People with access
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Users who can sign in with their Member ID and access this workspace.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(100, 116, 139, 0.04)' }}>
                <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Member / User
                </th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Login Member ID
                </th>
                <th style={{ padding: '12px 18px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status
                </th>
                <th style={{ padding: '12px 18px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Permission
                </th>
                <th style={{ padding: '12px 18px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Access Expiry
                </th>
                <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Workspace Owner */}
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(16, 185, 129, 0.02)' }}>
                <td style={{ padding: '16px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 15,
                        flexShrink: 0
                      }}
                    >
                      {(ownerInfo?.name || user?.name || 'O').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {ownerInfo?.name || user?.name || 'Owner'}
                        </span>
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10B981',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 12
                          }}
                        >
                          Owner
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {ownerInfo?.email || user?.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Primary Account
                  </span>
                </td>
                <td style={{ padding: '16px 18px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#10B981' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                    Active
                  </span>
                </td>
                <td style={{ padding: '16px 18px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(100, 116, 139, 0.12)',
                      color: 'var(--text-primary)',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    Full control
                  </span>
                </td>
                <td style={{ padding: '16px 18px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Never expires
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Workspace owner
                  </span>
                </td>
              </tr>

              {/* Rows 2..N: Linked Members */}
              {members.map(member => {
                const expired = isMemberExpired(member);
                return (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: expired ? 0.7 : 1 }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: expired ? '#64748B' : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                            color: '#FFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 15,
                            flexShrink: 0
                          }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {member.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            Workspace Member
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#3B82F6',
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            letterSpacing: '0.05em'
                          }}
                        >
                          {member.memberId || `MEM-${member.id}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyText(member.memberId || `MEM-${member.id}`, 'Member ID')}
                          title="Copy Member ID"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '16px 18px' }}>
                      {expired ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: 12 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
                          Expired
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#10B981' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                          Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 18px' }}>
                      {!isLinkedMember ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <select
                            value={member.permission}
                            onChange={(e) => handleUpdatePermission(member.id, e.target.value as 'VIEW_ONLY' | 'CAN_EDIT')}
                            style={{
                              appearance: 'none',
                              padding: '6px 28px 6px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-main)',
                              color: member.permission === 'CAN_EDIT' ? '#10B981' : '#3B82F6',
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            <option value="VIEW_ONLY">View only</option>
                            <option value="CAN_EDIT">Can edit</option>
                          </select>
                          <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                        </div>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#3B82F6',
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600
                          }}
                        >
                          {member.permission === 'CAN_EDIT' ? 'Can edit' : 'View only'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 18px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: expired ? '#EF4444' : 'var(--text-secondary)',
                          fontWeight: expired ? 700 : 500
                        }}
                      >
                        <Clock size={13} style={{ color: expired ? '#EF4444' : 'var(--text-muted)' }} />
                        {formatExpiryDisplay(member.expiresAt)}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      {!isLinkedMember ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {/* Reset Password Key Button */}
                          <button
                            type="button"
                            onClick={() => handleResetPassword(member)}
                            title="Regenerate member password"
                            style={{
                              background: 'rgba(100, 116, 139, 0.1)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            <Key size={14} style={{ color: '#F59E0B' }} />
                            Reset Key
                          </button>

                          {/* Remove Member Trash Button */}
                          <button
                            type="button"
                            onClick={() => setMemberToDelete(member)}
                            title="Remove member access"
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#EF4444',
                              borderRadius: 8,
                              padding: '6px 10px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Member</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {members.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No linked members yet</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      Click <strong>+ Add member</strong> above to create a login ID & password for your family or team.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner Protection Banner */}
      <div
        style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 14,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Lock size={18} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Owner protection
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            View-only members can see dashboards, reports, transactions, and profile information, but cannot add, edit, delete, import, or change permissions.
          </p>
        </div>
      </div>

      {/* Modal: Add Member (NO EMAIL REQUIRED - ONLY NAME, EXPIRY, PERMISSION) */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 480,
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add workspace member
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  A unique login Member ID & password will automatically be generated.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMember} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Member Full Name */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Member Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mom, Dad, Priya"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Member Access Expiry Time */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Member Expiry Time
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={addExpiryDuration}
                    onChange={(e) => setAddExpiryDuration(e.target.value)}
                    style={{
                      width: '100%',
                      appearance: 'none',
                      padding: '11px 36px 11px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-main)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      fontWeight: 600,
                      outline: 'none',
                      cursor: 'pointer',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="30_DAYS">30 Days (Recommended)</option>
                    <option value="7_DAYS">7 Days (1 Week)</option>
                    <option value="24_HOURS">24 Hours (1 Day)</option>
                    <option value="90_DAYS">90 Days (3 Months)</option>
                    <option value="1_YEAR">1 Year</option>
                    <option value="NEVER">Never expires (Permanent access)</option>
                  </select>
                  <ChevronDown size={16} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  After this period, access automatically expires unless extended by you.
                </div>
              </div>

              {/* Access Permission */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Access Permission
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 12,
                      borderRadius: 10,
                      border: `1.5px solid ${addPermission === 'VIEW_ONLY' ? '#10B981' : 'var(--border-color)'}`,
                      background: addPermission === 'VIEW_ONLY' ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="permission"
                      value="VIEW_ONLY"
                      checked={addPermission === 'VIEW_ONLY'}
                      onChange={() => setAddPermission('VIEW_ONLY')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        View only <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600, marginLeft: 4 }}>(Recommended)</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        Can browse dashboards, budgets, transactions, and reports without editing rights.
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 12,
                      borderRadius: 10,
                      border: `1.5px solid ${addPermission === 'CAN_EDIT' ? '#10B981' : 'var(--border-color)'}`,
                      background: addPermission === 'CAN_EDIT' ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="permission"
                      value="CAN_EDIT"
                      checked={addPermission === 'CAN_EDIT'}
                      onChange={() => setAddPermission('CAN_EDIT')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Can edit
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        Can add, edit, and categorize transactions inside your workspace.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMember}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFF',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  {addingMember ? 'Creating Member...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Credentials Generated / Reset Success */}
      {credentialsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 480,
              padding: '28px',
              boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px'
                }}
              >
                <Key size={28} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                Member Credentials Generated
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Share this Member ID & password with <strong>{credentialsModal.name}</strong> to log in.
              </p>
            </div>

            <div
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Login Member ID
                </span>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#3B82F6',
                    fontFamily: 'monospace',
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{credentialsModal.memberId}</span>
                  <button
                    type="button"
                    onClick={() => copyText(credentialsModal.memberId, 'Member ID')}
                    title="Copy Member ID"
                    style={{ background: 'transparent', border: 'none', color: '#3B82F6', cursor: 'pointer', padding: 2 }}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Generated Password
                </span>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#10B981',
                    fontFamily: 'monospace',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{credentialsModal.tempPassword}</span>
                  <button
                    type="button"
                    onClick={() => copyText(credentialsModal.tempPassword, 'Password')}
                    title="Copy Password"
                    style={{ background: 'transparent', border: 'none', color: '#10B981', cursor: 'pointer', padding: 2 }}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 4 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Permission
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: credentialsModal.permission === 'CAN_EDIT' ? '#10B981' : '#3B82F6', marginTop: 2 }}>
                    {credentialsModal.permission === 'CAN_EDIT' ? 'Can Edit' : 'View Only'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Access Expiry
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {credentialsModal.expiresAt
                      ? new Date(credentialsModal.expiresAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
                      : (credentialsModal.expiryLabel || 'Never')}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={copyCredentialsText}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: copied ? '#10B981' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  transition: 'background 0.2s'
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
              </button>

              <button
                type="button"
                onClick={() => setCredentialsModal(null)}
                style={{
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Remove Member */}
      {memberToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 440,
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
              }}
            >
              <Trash2 size={24} />
            </div>

            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              Remove Workspace Member?
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to remove <strong>{memberToDelete.name}</strong> ({memberToDelete.memberId || `MEM-${memberToDelete.id}`})? They will immediately lose all access to this financial workspace.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#EF4444',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
                }}
              >
                {deleting ? 'Removing...' : 'Yes, Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
