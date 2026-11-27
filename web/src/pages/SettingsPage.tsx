import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import type { AuthorizedCallerId } from '../types/api';
import { formatDuration } from '../utils/formatters';

export function SettingsPage() {
  const { user, limits, refreshProfile } = useAuth();
  const [callerIds, setCallerIds] = useState<AuthorizedCallerId[]>([]);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [defaultCallerIdId, setDefaultCallerIdId] = useState(user?.defaultCallerIdId ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setFullName(user?.fullName ?? '');
    setDefaultCallerIdId(user?.defaultCallerIdId ?? '');
  }, [user]);

  useEffect(() => {
    api.callerIds().then((res) => setCallerIds(res.callerIds)).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.updateSettings({
        fullName,
        defaultCallerIdId: defaultCallerIdId || null,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      await refreshProfile();
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Account settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Account Settings</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Manage profile details, default authorized caller ID, and account security.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-info">{message}</div>}

      <div className="grid-2">
        <form className="card" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Profile &amp; Preferences</h2>
          <div>
            <label className="field-label" htmlFor="settings-name">
              Full Name
            </label>
            <input
              id="settings-name"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="settings-default-cid">
              Default Authorized Caller ID
            </label>
            <select
              id="settings-default-cid"
              className="select"
              value={defaultCallerIdId}
              onChange={(e) => setDefaultCallerIdId(e.target.value)}
            >
              <option value="">None selected</option>
              {callerIds.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.phoneNumber} — {c.label}
                </option>
              ))}
            </select>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Change Password (Optional)</h3>

          <div>
            <label className="field-label" htmlFor="settings-cur-pw">
              Current Password
            </label>
            <input
              id="settings-cur-pw"
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="settings-new-pw">
              New Password
            </label>
            <input
              id="settings-new-pw"
              className="input"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn">
            Save Settings
          </button>
        </form>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Account Status &amp; Policy Limits</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Account Status</span>
            <StatusBadge status={user?.status ?? 'ACTIVE'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Max Call Duration</span>
            <strong>{formatDuration(limits?.maxCallDurationSeconds ?? 1800)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Daily Call Limit</span>
            <strong>{limits?.dailyCallLimit ?? 50} calls / day</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Monthly Call Quota</span>
            <strong>{limits?.monthlyCallQuota ?? 500} calls / month</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
