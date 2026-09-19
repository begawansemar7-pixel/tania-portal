import { describe, expect, it } from 'vitest';
import { createLogger, type LogLevel } from './logger.js';

function capture(level?: LogLevel) {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    service: 'tania.test',
    environment: 'test',
    version: '0.1.0',
    ...(level === undefined ? {} : { level }),
    sink: (_level, line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    now: () => new Date('2026-09-19T10:00:00.000Z'),
  });
  return { logger, lines };
}

describe('createLogger', () => {
  it('emits one JSON object per line with service context', () => {
    const { logger, lines } = capture();
    logger.info('brain.ask', { intent: 'SEARCH' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      ts: '2026-09-19T10:00:00.000Z',
      level: 'info',
      message: 'brain.ask',
      service: 'tania.test',
      environment: 'test',
      version: '0.1.0',
      intent: 'SEARCH',
    });
  });

  it('filters below the configured level', () => {
    const { logger, lines } = capture('warn');
    logger.debug('noise');
    logger.info('also noise');
    logger.warn('kept');

    expect(lines.map((line) => line.message)).toEqual(['kept']);
  });

  it('binds child fields to every line', () => {
    const { logger, lines } = capture();
    const request = logger.child({ requestId: 'req-1' });
    request.error('api.failed', { code: 'INTERNAL' });

    expect(lines[0]).toMatchObject({ requestId: 'req-1', code: 'INTERNAL', level: 'error' });
  });

  it('marks audit events', () => {
    const { logger, lines } = capture();
    logger.audit('approval.decided', { approvalId: 'a1' });

    expect(lines[0]).toMatchObject({ audit: true, message: 'approval.decided', level: 'info' });
  });

  it('never throws on unserialisable fields', () => {
    const { logger, lines } = capture();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.info('circular', { circular })).not.toThrow();
    expect(lines[0]?.message).toBe('log_serialisation_failed');
  });

  it('serialises bigint and Error fields', () => {
    const { logger, lines } = capture();
    logger.info('mixed', { sequence: 10n, cause: new Error('boom') });

    expect(lines[0]).toMatchObject({ sequence: '10', cause: 'Error: boom' });
  });
});
