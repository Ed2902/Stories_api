import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CatalogCacheEvent = {
  eventType: 'story.created' | 'story.expired';
  ownerUserId?: string | null;
  viewerUserId?: string | null;
};

@Injectable()
export class CatalogCacheEventsService {
  private readonly logger = new Logger(CatalogCacheEventsService.name);

  constructor(private readonly configService: ConfigService) {}

  publish(event: CatalogCacheEvent) {
    void this.publishAsync(event);
  }

  private async publishAsync(event: CatalogCacheEvent) {
    const baseUrl = this.configService.get<string | undefined>(
      'catalogApi.baseUrl',
    );
    const internalToken = this.configService.get<string | undefined>(
      'catalogApi.internalToken',
    );

    if (!baseUrl || !internalToken) {
      return;
    }

    const timeoutMs =
      this.configService.get<number | undefined>('catalogApi.timeoutMs') ??
      1000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/api/catalog/internal/cache-events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': internalToken,
          },
          body: JSON.stringify(event),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Catalog returned HTTP ${response.status}`);
      }

      this.logger.debug({
        event: 'stories.catalog_cache_event_published',
        eventType: event.eventType,
        ownerUserId: event.ownerUserId ?? null,
      });
    } catch (error) {
      this.logger.warn({
        err: error,
        event: 'stories.catalog_cache_event_failed',
        eventType: event.eventType,
        ownerUserId: event.ownerUserId ?? null,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
