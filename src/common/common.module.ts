import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';
import { ResponseTimeInterceptor } from './interceptors/response-time.interceptor';
import { CatalogCacheEventsService } from './catalog-cache-events.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.getOrThrow<number>('rateLimit.ttl'),
            limit: configService.getOrThrow<number>('rateLimit.limit'),
          },
          {
            name: 'sensitive',
            ttl: configService.getOrThrow<number>('rateLimit.sensitiveTtl'),
            limit: configService.getOrThrow<number>('rateLimit.sensitiveLimit'),
          },
          {
            name: 'storiesFeed',
            ttl: configService.getOrThrow<number>('rateLimit.storiesFeedTtl'),
            limit: configService.getOrThrow<number>(
              'rateLimit.storiesFeedLimit',
            ),
          },
          {
            name: 'mediaUpload',
            ttl: configService.getOrThrow<number>('rateLimit.mediaUploadTtl'),
            limit: configService.getOrThrow<number>(
              'rateLimit.mediaUploadLimit',
            ),
          },
        ],
      }),
    }),
  ],
  providers: [
    GlobalExceptionFilter,
    CatalogCacheEventsService,
    ResponseTimeInterceptor,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
  exports: [
    GlobalExceptionFilter,
    CatalogCacheEventsService,
    ResponseTimeInterceptor,
    ThrottlerModule,
  ],
})
export class CommonModule {}
