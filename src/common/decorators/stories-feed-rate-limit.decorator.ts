import { Throttle } from '@nestjs/throttler';

export const StoriesFeedRateLimit = () =>
  Throttle({
    storiesFeed: {},
  });
