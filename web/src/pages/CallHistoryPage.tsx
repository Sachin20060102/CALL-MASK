import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import type { CallRecord } from '../types/api';
import { formatDuration, formatTimestamp } from '../utils/formatters';

export function CallHistoryPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [error, setError] = useState('');

  const loadCalls = useCallback(async () => {
    setError('');
    try {
      const res = await api.listCalls({
        page,
        limit: 15,
        status: status || undefined,
        search: search || undefined,
      });
      setCalls(res.items);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call history');
    }
  }, [page, status, search]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const openDetails = async (id: string) => {
    try {
      const res = await api.getCall(id);
      setSelectedCall(res.call);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call details');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Call History</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Complete operational call logs with timestamps, duration, and provider call identifiers.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label className="field-label" htmlFor="history-search">
            Search number or provider call ID
          </label>
          <input
            id="history-search"
            className="input"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="+12025550144 or mock_call_..."
          />
        </div>
        <div style={{ width: 200 }}>
          <label className="field-label" htmlFor="history-status">
            Status
          </label>
          <select
            id="history-status"
            className="select"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="FAILED">FAILED</option>
            <option value="CANCELED">CANCELED</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Caller ID</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Provider Call ID</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                    No matching call records found.
                  </td>
                </tr>
              ) : (
                calls.map((c) => (
                  <tr key={c.id}>
                    <td>{c.callerIdNumber}</td>
                    <td>{c.destinationNumber}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                      {c.providerCallId ?? '—'}
                    </td>
                    <td>{formatDuration(c.durationSeconds)}</td>
                    <td>{formatTimestamp(c.startedAt)}</td>
                    <td>{formatTimestamp(c.endedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={() => void openDetails(c.id)}
                      >
                        Events
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedCall && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
              Call Events — {selectedCall.destinationNumber}
            </h2>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedCall(null)}>
              Close
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(selectedCall.events ?? []).map((evt) => (
              <li key={evt.id} style={{ fontSize: '0.88rem' }}>
                <strong>{evt.eventType}</strong> (<StatusBadge status={evt.status} />) at{' '}
                {formatTimestamp(evt.occurredAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
