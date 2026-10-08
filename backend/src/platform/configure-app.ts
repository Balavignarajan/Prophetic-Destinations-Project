import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { APP_CONFIG, type AppConfig } from '../config/index.js';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { RequestLoggingInterceptor } from './interceptors/request-logging.interceptor.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { createValidationPipe } from './pipes/validation.pipe.js';

export const API_PREFIX = 'api/v1';

/** Health endpoints stay unversioned so probes never change path. */
export const UNPREFIXED_ROUTES = ['health', 'health/(.*)'];

/**
 * Applies all HTTP-level setup. Shared by main.ts and the e2e tests so tests
 * run against the same pipeline as production.
 */
export function configureApp(app: INestApplication) {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_ROUTES });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableShutdownHooks();
}
