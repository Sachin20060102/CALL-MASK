import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { UsageSummary } from '../types/api';
import { formatDuration } from '../utils/formatters';

export function UsageStatsPage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .usageSummary()
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load usage stats'));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Usage Statistics</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Operational call volume, completion outcomes, duration metrics, and administrative call limits.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
          <div className="kpi-label">Failed Calls</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>
            {usage?.failedCalls ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Blocked Attempts</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>
            {usage?.blockedCalls ?? 0}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>Duration Metrics</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.92rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Call Duration</span>
              <strong>{formatDuration(usage?.totalDurationSeconds ?? 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Average Call Duration</span>
              <strong>{formatDuration(usage?.averageDurationSeconds ?? 0)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Maximum Allowed Call Duration</span>
              <strong>{formatDuration(usage?.maxCallDurationSeconds ?? 1800)}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>Operational Call Quotas</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.92rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Today&apos;s Calls</span>
              <strong>
                {usage?.todayCalls ?? 0} / {usage?.dailyCallLimit ?? 50}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Current Month Calls</span>
              <strong>
                {usage?.monthCalls ?? 0} / {usage?.monthlyCallQuota ?? 500}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Telephony Engine</span>
              <strong>
                {usage?.telephonyEnabled ? `LIVE (${usage.telephonyMode})` : 'MOCK (Disabled by default)'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
