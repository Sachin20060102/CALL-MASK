import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import type { CallRecord, UsageSummary } from '../types/api';
import { formatDuration, formatTimestamp } from '../utils/formatters';

export function DashboardPage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.usageSummary(), api.listCalls({ page: 1, limit: 5 })])
      .then(([summary, callsRes]) => {
        setUsage(summary);
        setRecentCalls(callsRes.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, []);

  const dailyPct = usage
    ? Math.min(100, Math.round((usage.todayCalls / Math.max(1, usage.dailyCallLimit)) * 100))
    : 0;
  const monthlyPct = usage
    ? Math.min(100, Math.round((usage.monthCalls / Math.max(1, usage.monthlyCallQuota)) * 100))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Operations Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Real-time calling readiness, operational quotas, and recent call telemetry.
          </p>
        </div>
        <Link to="/dialer" className="btn">
          <Phone size={16} /> Open Dialer
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="alert alert-info">
        <strong>Telephony Status:</strong>{' '}
        {usage?.telephonyEnabled
          ? `Live VoIP/SIP mode (${usage.telephonyMode})`
          : 'Telephony dispatch is disabled by default — running in Mock Calling & Usage Tracking mode.'}
      </div>

      <div className="grid-4">
        <div className="card">
          <div className="kpi-label">Total Calls</div>
          <div className="kpi-value">{usage?.totalCalls ?? 0}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Completed Calls</div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            {usage?.completedCalls ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Total Duration</div>
          <div className="kpi-value">{formatDuration(usage?.totalDurationSeconds ?? 0)}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Average Duration</div>
          <div className="kpi-value">{formatDuration(usage?.averageDurationSeconds ?? 0)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>Daily Call Limit</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem' }}>
            <span>{usage?.todayCalls ?? 0} calls today</span>
            <span>Limit: {usage?.dailyCallLimit ?? 50}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${dailyPct}%` }} />
          </div>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>Monthly Call Quota</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.88rem' }}>
            <span>{usage?.monthCalls ?? 0} calls this month</span>
            <span>Quota: {usage?.monthlyCallQuota ?? 500}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${monthlyPct}%` }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recent Calls</h2>
          <Link to="/calls" style={{ color: 'var(--primary)', fontSize: '0.88rem', fontWeight: 600 }}>
            View full history
          </Link>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Caller ID</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                    No calls placed yet. Open the Dialer to place a mock call.
                  </td>
                </tr>
              ) : (
                recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td>{call.callerIdNumber}</td>
                    <td>{call.destinationNumber}</td>
                    <td>
                      <StatusBadge status={call.status} />
                    </td>
                    <td>{call.mode}</td>
                    <td>{formatDuration(call.durationSeconds)}</td>
                    <td>{formatTimestamp(call.startedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
