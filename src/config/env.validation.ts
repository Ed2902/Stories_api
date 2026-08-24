import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().trim().required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .required(),
  PORT: Joi.number().port().required(),
  API_PREFIX: Joi.string().trim().required(),
  TRUST_PROXY: Joi.boolean().required(),
  TRUST_PROXY_HOPS: Joi.number().integer().min(1).max(10).optional(),
  TRUST_PROXY_CIDRS: Joi.string().trim().allow('').optional(),
  APP_TIME_ZONE: Joi.string().trim().required(),
  CORS_ORIGINS: Joi.string()
    .allow('')
    .required(),
  CORS_CREDENTIALS: Joi.boolean().required(),
  CORS_METHODS: Joi.string().trim().required(),
  CORS_ALLOWED_HEADERS: Joi.string().trim().required(),
  CORS_EXPOSED_HEADERS: Joi.string().trim().required(),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .required(),
  LOG_PRETTY_PRINT: Joi.boolean().required(),
  DATABASE_URL: Joi.string().trim().required(),
  REDIS_URL: Joi.string().trim().allow('').optional(),
  REDIS_CACHE_URL: Joi.string().trim().required(),
  REDIS_QUEUE_URL: Joi.string().trim().required(),
  REDIS_REALTIME_URL: Joi.string().trim().allow('').optional(),
  REDIS_CACHE_MAX_MEMORY: Joi.string().trim().allow('').optional(),
  REDIS_CACHE_EVICTION_POLICY: Joi.string().trim().allow('').optional(),
  REDIS_QUEUE_PERSISTENCE_MODE: Joi.string().trim().allow('').optional(),
  REDIS_REALTIME_ENABLED: Joi.boolean().optional(),
  QUEUE_PREFIX: Joi.string().trim().required(),
  REDIS_QUEUE_MAX_RETRIES: Joi.number().integer().min(1).max(20).optional(),
  REDIS_QUEUE_BACKOFF_MS: Joi.number().positive().optional(),
  REDIS_QUEUE_REMOVE_ON_COMPLETE: Joi.number().integer().min(0).optional(),
  REDIS_QUEUE_REMOVE_ON_FAIL: Joi.number().integer().min(0).optional(),
  AUTH_ACCESS_TOKEN_SECRET: Joi.string().min(16).required(),
  IDENTITY_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  IDENTITY_INTERNAL_TOKEN: Joi.string()
    .allow('')
    .optional(),
  CATALOG_API_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  CATALOG_INTERNAL_TOKEN: Joi.string()
    .allow('')
    .optional(),
  CATALOG_API_TIMEOUT_MS: Joi.number().positive().optional(),
  STORAGE_S3_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  STORAGE_S3_ACCESS_KEY: Joi.string().trim().required(),
  STORAGE_S3_SECRET_KEY: Joi.string().trim().required(),
  STORAGE_S3_BUCKET: Joi.string().trim().required(),
  STORAGE_S3_FORCE_PATH_STYLE: Joi.boolean().required(),
  STORAGE_S3_PUBLIC_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  STORAGE_MEDIA_CDN_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  STORAGE_MAX_UPLOAD_SIZE: Joi.number().positive().required(),
  IMAGE_ANALYZER_WORKER_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  IMAGE_ANALYZER_TIMEOUT_MS: Joi.number().positive().optional(),
  MODERATION_INTERNAL_TOKEN: Joi.string()
    .allow('')
    .optional(),
  RATE_LIMIT_TTL: Joi.number().positive().required(),
  RATE_LIMIT_LIMIT: Joi.number().positive().required(),
  SENSITIVE_RATE_LIMIT_TTL: Joi.number().positive().required(),
  SENSITIVE_RATE_LIMIT_LIMIT: Joi.number().positive().required(),
  STORIES_FEED_RATE_LIMIT_TTL: Joi.number().positive().optional(),
  STORIES_FEED_RATE_LIMIT_LIMIT: Joi.number().positive().optional(),
  MEDIA_UPLOAD_RATE_LIMIT_TTL: Joi.number().positive().optional(),
  MEDIA_UPLOAD_RATE_LIMIT_LIMIT: Joi.number().positive().optional(),
});
