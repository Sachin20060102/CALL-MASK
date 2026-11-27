import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { formatDuration, formatTimestamp } from '../utils/formatters';

type AdminTab =
  | 'overview'
  | 'users'
  | 'calls'
  | 'callerIds'
  | 'providers'
  | 'restrictions'
  | 'abuse'
  | 'audit';

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [providerCosts, setProviderCosts] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [callerIds, setCallerIds] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [abuseReports, setAbuseReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  // Quick creation forms
  const [newCidNumber, setNewCidNumber] = useState('');
  const [newCidLabel, setNewCidLabel] = useState('');
  const [newCidProviderId, setNewCidProviderId] = useState('');
  const [newRestrictionPattern, setNewRestrictionPattern] = useState('');
  const [newRestrictionReason, setNewRestrictionReason] = useState('');

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [ov, pc, us, cl, cids, prov, rest, ab, logs, sett] = await Promise.all([
        api.admin.overview(),
        api.admin.providerCosts(),
        api.admin.users(),
        api.admin.calls(),
        api.admin.callerIds(),
        api.admin.providers(),
        api.admin.restrictions(),
        api.admin.abuseReports(),
        api.admin.auditLogs(),
        api.admin.settings(),
      ]);
      setOverview(ov);
      setProviderCosts(pc);
      setUsers(us.users);
      setCalls(cl.calls);
      setCallerIds(cids.callerIds);
      setProviders(prov.providers);
      if (prov.providers[0] && !newCidProviderId) {
        setNewCidProviderId(prov.providers[0].id);
      }
      setRestrictions(rest.restrictions);
      setAbuseReports(ab.reports);
      setAuditLogs(logs.logs);
      setSettings(sett.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin console');
    }
  }, [newCidProviderId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleUserStatus = async (u: any) => {
    const nextStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.admin.updateUser(u.id, {
      status: nextStatus,
      suspensionReason: nextStatus === 'SUSPENDED' ? 'Suspended via Admin Console' : null,
    });
    await loadAll();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.admin.updateSettings(settings);
    await loadAll();
  };

  const handleCreateCallerId = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.admin.createCallerId({
      phoneNumber: newCidNumber,
      label: newCidLabel,
      providerId: newCidProviderId,
      isGlobal: true,
      verificationStatus: 'VERIFIED',
    });
    setNewCidNumber('');
    setNewCidLabel('');
    await loadAll();
  };

  const handleCreateRestriction = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.admin.createRestriction({
      pattern: newRestrictionPattern,
      matchType: 'PREFIX',
      action: 'BLOCK',
      reason: newRestrictionReason,
    });
    setNewRestrictionPattern('');
    setNewRestrictionReason('');
    await loadAll();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Admin Operations Console</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Manage users, call quotas, authorized caller IDs, providers, restrictions, abuse reports, and audit logs.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs">
        {(
          [
            ['overview', 'Overview & Health'],
            ['users', 'Users & Quotas'],
            ['calls', 'Call Records & Carrier Telemetry'],
            ['callerIds', 'Authorized Caller IDs'],
            ['providers', 'Telephony Providers'],
            ['restrictions', 'Destination Restrictions'],
            ['abuse', 'Abuse Reports'],
            ['audit', 'Audit Logs'],
          ] as Array<[AdminTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid-4">
            <div className="card">
              <div className="kpi-label">Total Users</div>
              <div className="kpi-value">{overview?.metrics?.totalUsers ?? 0}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Total Calls</div>
              <div className="kpi-value">{overview?.metrics?.totalCalls ?? 0}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Open Abuse Reports</div>
              <div className="kpi-value" style={{ color: 'var(--warning)' }}>
                {overview?.metrics?.openAbuseReports ?? 0}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Database / Redis</div>
              <div className="kpi-value" style={{ fontSize: '1.1rem' }}>
                DB: {overview?.systemHealth?.database ?? '—'} • Redis:{' '}
                {overview?.systemHealth?.redis ?? '—'}
              </div>
            </div>
          </div>

          <form className="card" onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Global Operational Limits &amp; Fraud Velocity</h2>
            <div className="grid-4">
              <div>
                <label className="field-label">Max Call Duration (s)</label>
                <input
                  className="input"
                  type="number"
                  value={settings.maxCallDurationSeconds ?? 1800}
                  onChange={(e) =>
                    setSettings({ ...settings, maxCallDurationSeconds: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="field-label">Daily Call Limit</label>
                <input
                  className="input"
                  type="number"
                  value={settings.defaultDailyCallLimit ?? 50}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultDailyCallLimit: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="field-label">Monthly Call Quota</label>
                <input
                  className="input"
                  type="number"
                  value={settings.defaultMonthlyCallQuota ?? 500}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultMonthlyCallQuota: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="field-label">Velocity Max Calls / Window</label>
                <input
                  className="input"
                  type="number"
                  value={settings.velocityMaxCalls ?? 5}
                  onChange={(e) =>
                    setSettings({ ...settings, velocityMaxCalls: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div>
              <button type="submit" className="btn">
                Save Policy Defaults
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'users' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Calls</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td>{u.totalCalls}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn ${u.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                      style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                      onClick={() => void toggleUserStatus(u)}
                    >
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'calls' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>
              Platform-Owner Telephony Provider Telemetry
            </h2>
            <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {providerCosts?.scopeNote}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Protocol</th>
                    <th>Total Calls</th>
                    <th>Completed</th>
                    <th>Total Duration</th>
                    <th>Carrier Cost Estimate (Admin Only)</th>
                  </tr>
                </thead>
                <tbody>
                  {(providerCosts?.providers ?? []).map((p: any) => (
                    <tr key={p.providerId}>
                      <td>{p.providerName}</td>
                      <td>{p.protocol}</td>
                      <td>{p.totalCalls}</td>
                      <td>{p.completedCalls}</td>
                      <td>{formatDuration(p.totalDurationSeconds)}</td>
                      <td>
                        ${p.reportedCostUsd.toFixed(4)} {p.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Caller ID</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>{c.user?.email ?? c.userId}</td>
                    <td>{c.callerIdNumber}</td>
                    <td>{c.destinationNumber}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{formatDuration(c.durationSeconds)}</td>
                    <td>{formatTimestamp(c.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'callerIds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form className="card" onSubmit={handleCreateCallerId} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <label className="field-label">Phone Number (E.164)</label>
              <input
                className="input"
                value={newCidNumber}
                onChange={(e) => setNewCidNumber(e.target.value)}
                placeholder="+14155550199"
                required
              />
            </div>
            <div>
              <label className="field-label">Label</label>
              <input
                className="input"
                value={newCidLabel}
                onChange={(e) => setNewCidLabel(e.target.value)}
                placeholder="Outbound Support"
                required
              />
            </div>
            <div>
              <label className="field-label">Provider</label>
              <select
                className="select"
                value={newCidProviderId}
                onChange={(e) => setNewCidProviderId(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn">
              Add Caller ID
            </button>
          </form>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Label</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {callerIds.map((c) => (
                  <tr key={c.id}>
                    <td>{c.phoneNumber}</td>
                    <td>{c.label}</td>
                    <td>{c.provider?.name ?? c.providerId}</td>
                    <td>
                      <StatusBadge status={c.verificationStatus} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={() => void api.admin.deleteCallerId(c.id).then(loadAll)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'providers' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Protocol</th>
                <th>Enabled</th>
                <th>Compliance Verified</th>
                <th>Health</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code}</td>
                  <td>{p.protocol}</td>
                  <td>{p.enabled ? 'Yes' : 'No'}</td>
                  <td>{p.complianceVerified ? 'Yes' : 'No'}</td>
                  <td>
                    <StatusBadge status={p.healthStatus} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                      onClick={() => void api.admin.healthCheckProvider(p.id).then(loadAll)}
                    >
                      Health Check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'restrictions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form className="card" onSubmit={handleCreateRestriction} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <label className="field-label">Prefix / Pattern</label>
              <input
                className="input"
                value={newRestrictionPattern}
                onChange={(e) => setNewRestrictionPattern(e.target.value)}
                placeholder="+1976"
                required
              />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <label className="field-label">Reason</label>
              <input
                className="input"
                value={newRestrictionReason}
                onChange={(e) => setNewRestrictionReason(e.target.value)}
                placeholder="High-risk destination prefix"
                required
              />
            </div>
            <button type="submit" className="btn">
              Add Block Rule
            </button>
          </form>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Match Type</th>
                  <th>Action</th>
                  <th>Reason</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {restrictions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.pattern}</td>
                    <td>{r.matchType}</td>
                    <td>
                      <StatusBadge status={r.action === 'BLOCK' ? 'BLOCKED' : 'ACTIVE'} />
                    </td>
                    <td>{r.reason}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={() => void api.admin.deleteRestriction(r.id).then(loadAll)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'abuse' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Severity</th>
                <th>Target User</th>
                <th>Description</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {abuseReports.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td>{r.severity}</td>
                  <td>{r.targetUser?.email ?? '—'}</td>
                  <td>{r.description}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    {r.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={() =>
                          void api.admin
                            .updateAbuseReport(r.id, {
                              status: 'RESOLVED',
                              resolutionNote: 'Reviewed by admin',
                            })
                            .then(loadAll)
                        }
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l) => (
                <tr key={l.id}>
                  <td>{l.action}</td>
                  <td>{l.actorUser?.email ?? 'System'}</td>
                  <td>
                    {l.targetType} {l.targetId ? `(${l.targetId})` : ''}
                  </td>
                  <td>{formatTimestamp(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
