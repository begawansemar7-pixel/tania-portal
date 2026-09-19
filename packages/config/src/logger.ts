/** Structured logging: one JSON object per line, ready for log shipping. */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Non-repudiable record of a meaningful action; always emitted at info. */
  audit(event: string, fields: LogFields): void;
  /** Returns a logger that adds these fields to every line (e.g. requestId). */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  environment?: string;
  version?: string;
  /** Defaults to console; injectable so tests can capture lines. */
  sink?: (level: LogLevel, line: string) => void;
  /** Injectable clock, for deterministic tests. */
  now?: () => Date;
}

function defaultSink(level: LogLevel, line: string): void {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LEVEL_WEIGHT[options.level ?? 'info'];
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  const base: LogFields = {
    service: options.service,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.version === undefined ? {} : { version: options.version }),
  };

  function build(bindings: LogFields): Logger {
    const emit = (level: LogLevel, message: string, fields: LogFields = {}): void => {
      if (LEVEL_WEIGHT[level] < threshold) return;
      sink(
        level,
        safeStringify({
          ts: now().toISOString(),
          level,
          message,
          ...base,
          ...bindings,
          ...fields,
        }),
      );
    };

    return {
      debug: (message, fields) => emit('debug', message, fields),
      info: (message, fields) => emit('info', message, fields),
      warn: (message, fields) => emit('warn', message, fields),
      error: (message, fields) => emit('error', message, fields),
      audit: (event, fields) => emit('info', event, { ...fields, audit: true }),
      child: (extra) => build({ ...bindings, ...extra }),
    };
  }

  return build({});
}

/** Never let a logging call throw: a circular field must not take a request down. */
function safeStringify(payload: LogFields): string {
  try {
    return JSON.stringify(payload, replacer);
  } catch {
    return JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'log_serialisation_failed' });
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  return value;
}

/** A logger that discards everything — handy in unit tests. */
export function silentLogger(): Logger {
  return createLogger({ service: 'test', level: 'error', sink: () => {} });
}
