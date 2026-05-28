import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatDateForTimeZone, isValidIanaTimeZone } from '../common/utils/time-zone.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const now = new Date();
    const timeZone = this.configService.getOrThrow<string>('app.timeZone');
    await this.prismaService.$queryRaw`SELECT 1`;
    const storage = await this.storageService.getHealthSummary();

    return {
      status: 'ok',
      timestamp: now.toISOString(),
      app: this.configService.getOrThrow<string>('app.name'),
      env: this.configService.getOrThrow<string>('app.env'),
      uptimeSeconds: Math.round(process.uptime()),
      timeZone,
      localTime: isValidIanaTimeZone(timeZone)
        ? formatDateForTimeZone(now, timeZone)
        : now.toISOString(),
      storage,
    };
  }
}
