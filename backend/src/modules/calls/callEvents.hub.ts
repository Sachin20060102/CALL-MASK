import { EventEmitter } from 'node:events';

export interface CallStatusStreamEvent {
  type: 'call.status';
  userId: string;
  call: {
    id: string;
    callerIdNumber: string;
    destinationNumber: string;
    providerCallId: string | null;
    mode: 'MOCK' | 'LIVE';
    status: string;
    muted: boolean;
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    durationSeconds: number;
    terminationReason: string | null;
    failureCode: string | null;
  };
  occurredAt: string;
}

export class CallEventsHub {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  publish(event: CallStatusStreamEvent): void {
    this.emitter.emit(`user:${event.userId}`, event);
  }

  subscribe(userId: string, listener: (event: CallStatusStreamEvent) => void): () => void {
    const channel = `user:${userId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}
