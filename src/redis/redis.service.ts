import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS) private readonly client: Redis,
    private readonly configService: ConfigService,
  ) {}

  getClient(): Redis {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }

      await this.client.ping();
    } catch (error) {
      this.client.disconnect();

      const redisUrl = this.configService.getOrThrow<string>('redis.cacheUrl');
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis connection error';

      this.logger.warn(
        { err: error, redisUrl },
        `Redis cache is unavailable at bootstrap. Cache will run degraded: ${message}`,
      );
    }
  }

  async ping(): Promise<string> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client.ping();
  }

  async getHealthSummary() {
    const startedAt = Date.now();
    const pong = await this.ping();
    const [info, keyCount] = await Promise.all([
      this.client.info('memory'),
      this.client.dbsize(),
    ]);

    return {
      status: pong === 'PONG' ? 'ok' : 'error',
      role: 'cache',
      latencyMs: Date.now() - startedAt,
      keyCount,
      usedMemoryBytes: this.readRedisInfoNumber(info, 'used_memory'),
      maxMemoryBytes: this.readRedisInfoNumber(info, 'maxmemory'),
      evictionPolicy: this.readRedisInfoString(info, 'maxmemory_policy'),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private readRedisInfoNumber(info: string, key: string) {
    const value = this.readRedisInfoString(info, key);
    return value ? Number(value) : null;
  }

  private readRedisInfoString(info: string, key: string) {
    const line = info
      .split('\n')
      .find((entry) => entry.startsWith(`${key}:`));

    return line?.split(':')[1]?.trim() ?? null;
  }
}
