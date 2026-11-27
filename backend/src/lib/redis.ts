import { Redis } from 'ioredis';

export interface RedisStore {
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  getNumber(key: string): Promise<number>;
  setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export class InMemoryRedisStore implements RedisStore {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  private getEntry(key: string): { value: string; expiresAt: number | null } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.getEntry(key);
    const next = existing ? Number.parseInt(existing.value, 10) + 1 : 1;
    const expiresAt = existing?.expiresAt ?? Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value: String(next), expiresAt });
    return next;
  }

  async getNumber(key: string): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return 0;
    const parsed = Number.parseInt(entry.value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value: JSON.stringify(value), expiresAt });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const entry = this.getEntry(key);
    if (!entry) return null;
    return JSON.parse(entry.value) as T;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export class IoRedisStore implements RedisStore {
  private readonly client: Redis;
  private readonly fallback = new InMemoryRedisStore();

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy: (times) => (times <= 2 ? 200 : null),
    });
    this.client.on('error', () => {
      // Handled gracefully by fallback and health endpoint
    });
  }

  private async run<T>(primary: () => Promise<T>, fallbackOp: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      return fallbackOp();
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    return this.run(
      async () => {
        const count = await this.client.incr(key);
        if (count === 1) {
          await this.client.expire(key, ttlSeconds);
        }
        return count;
      },
      () => this.fallback.incrWithTtl(key, ttlSeconds)
    );
  }

  async getNumber(key: string): Promise<number> {
    return this.run(
      async () => {
        const raw = await this.client.get(key);
        if (!raw) return 0;
        const parsed = Number.parseInt(raw, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
      },
      () => this.fallback.getNumber(key)
    );
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return this.run(
      async () => {
        const payload = JSON.stringify(value);
        if (ttlSeconds) {
          await this.client.set(key, payload, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, payload);
        }
      },
      () => this.fallback.setJson(key, value, ttlSeconds)
    );
  }

  async getJson<T>(key: string): Promise<T | null> {
    return this.run(
      async () => {
        const raw = await this.client.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      },
      () => this.fallback.getJson<T>(key)
    );
  }

  async del(key: string): Promise<void> {
    return this.run(
      async () => {
        await this.client.del(key);
      },
      () => this.fallback.del(key)
    );
  }

  async ping(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.fallback.disconnect();
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
