import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * TANIA Runtime.
 *
 * The execution layer behind the `JarvisCommand` contract. Built from
 * `@tania/types` rather than derived from any third-party runtime, so the
 * contract cannot drift: both sides compile against the same declarations.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const port = Number(process.env.PORT ?? 4100);

  app.enableShutdownHooks();
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      service: 'tania.runtime',
      message: 'listening',
      port,
      authenticated: (process.env.TANIA_RUNTIME_TOKEN ?? '').length > 0,
    }),
  );
}

await bootstrap();
