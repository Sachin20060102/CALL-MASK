import { useEffect, useState } from 'react';
import { formatDuration, isTerminalCallStatus } from '../utils/formatters';

export function CallDurationTimer({
  answeredAt,
  durationSeconds,
  status,
}: {
  answeredAt: string | null;
  durationSeconds: number;
  status: string;
}) {
  const [elapsed, setElapsed] = useState(durationSeconds);

  useEffect(() => {
    if (isTerminalCallStatus(status) || !answeredAt) {
      setElapsed(durationSeconds);
      return;
    }
    const startMs = new Date(answeredAt).getTime();
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [answeredAt, durationSeconds, status]);

  return <span>{formatDuration(elapsed)}</span>;
}
