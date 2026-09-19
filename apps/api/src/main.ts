import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { CONFIG, type AppConfig } from './config/configuration.js';
import { StructuredLogger } from './common/logger.service.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { correlationMiddleware } from './common/correlation.middleware.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(StructuredLogger);
  const config = app.get<AppConfig>(CONFIG);

  app.useLogger(logger);
  app.use(correlationMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.port);

  logger.log(
    `tania.api listening on port ${config.port} (auth mode: ${config.auth.mode}, env: ${config.environment})`,
    'bootstrap',
  );
}

await bootstrap();
