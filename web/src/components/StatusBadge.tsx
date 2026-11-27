export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  let cls = 'badge-muted';
  if (normalized === 'COMPLETED' || normalized === 'ACTIVE' || normalized === 'HEALTHY' || normalized === 'VERIFIED' || normalized === 'RESOLVED') {
    cls = 'badge-success';
  } else if (normalized === 'IN_PROGRESS' || normalized === 'RINGING' || normalized === 'INITIATED' || normalized === 'MOCK') {
    cls = 'badge-info';
  } else if (normalized === 'CANCELED' || normalized === 'PENDING' || normalized === 'INVESTIGATING' || normalized === 'DEGRADED') {
    cls = 'badge-warning';
  } else if (normalized === 'FAILED' || normalized === 'BLOCKED' || normalized === 'SUSPENDED' || normalized === 'REVOKED' || normalized === 'OPEN') {
    cls = 'badge-danger';
  }

  return <span className={`badge ${cls}`}>{status}</span>;
}
