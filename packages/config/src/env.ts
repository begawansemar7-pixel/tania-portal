/**
 * Environment validation.
 *
 * Configuration is read once, validated as a whole, and reported in full: a
 * misconfigured deployment should fail at startup with every problem listed,
 * not one at a time across five restarts.
 */

export interface EnvIssue {
  key: string;
  message: string;
}

export class EnvValidationError extends Error {
  constructor(readonly issues: EnvIssue[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((issue) => `  - ${issue.key}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface EnvReader<T> {
  parse(raw: string | undefined): ParseResult<T>;
  /** Marks values that must never be logged or echoed back. */
  readonly secret: boolean;
}

interface BaseOptions {
  required?: boolean;
  /** Never include this value in logs, health output, or settings pages. */
  secret?: boolean;
}

function missing<T>(options: BaseOptions, fallback?: T): ParseResult<T> {
  if (fallback !== undefined) return { ok: true, value: fallback };
  if (options.required) return { ok: false, message: 'is required but was not set' };
  return { ok: true, value: undefined as T };
}

function reader<T>(
  options: BaseOptions,
  fallback: T | undefined,
  parse: (raw: string) => ParseResult<T>,
): EnvReader<T> {
  return {
    secret: options.secret === true,
    parse(raw) {
      const value = raw?.trim();
      if (value === undefined || value.length === 0) return missing<T>(options, fallback);
      return parse(value);
    },
  };
}

// ── Readers ──────────────────────────────────────────────────────────────────

export interface StringOptions extends BaseOptions {
  default?: string;
  minLength?: number;
  pattern?: RegExp;
}

export function str(options: StringOptions & { required: true }): EnvReader<string>;
export function str(options: StringOptions & { default: string }): EnvReader<string>;
export function str(options?: StringOptions): EnvReader<string | undefined>;
export function str(options: StringOptions = {}): EnvReader<string | undefined> {
  return reader(options, options.default, (raw) => {
    if (options.minLength !== undefined && raw.length < options.minLength) {
      return { ok: false, message: `must be at least ${options.minLength} characters` };
    }
    if (options.pattern && !options.pattern.test(raw)) {
      return { ok: false, message: `must match ${options.pattern}` };
    }
    return { ok: true, value: raw };
  });
}

export interface IntOptions extends BaseOptions {
  default?: number;
  min?: number;
  max?: number;
}

export function int(options: IntOptions & { required: true }): EnvReader<number>;
export function int(options: IntOptions & { default: number }): EnvReader<number>;
export function int(options?: IntOptions): EnvReader<number | undefined>;
export function int(options: IntOptions = {}): EnvReader<number | undefined> {
  return reader(options, options.default, (raw) => {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || String(value) !== raw) {
      return { ok: false, message: `must be an integer, received "${raw}"` };
    }
    if (options.min !== undefined && value < options.min) {
      return { ok: false, message: `must be >= ${options.min}` };
    }
    if (options.max !== undefined && value > options.max) {
      return { ok: false, message: `must be <= ${options.max}` };
    }
    return { ok: true, value };
  });
}

export interface BoolOptions extends BaseOptions {
  default?: boolean;
}

const TRUTHY = new Set(['true', '1', 'yes', 'on']);
const FALSY = new Set(['false', '0', 'no', 'off']);

export function bool(options: BoolOptions & { required: true }): EnvReader<boolean>;
export function bool(options: BoolOptions & { default: boolean }): EnvReader<boolean>;
export function bool(options?: BoolOptions): EnvReader<boolean | undefined>;
export function bool(options: BoolOptions = {}): EnvReader<boolean | undefined> {
  return reader(options, options.default, (raw) => {
    const value = raw.toLowerCase();
    if (TRUTHY.has(value)) return { ok: true, value: true };
    if (FALSY.has(value)) return { ok: true, value: false };
    return { ok: false, message: `must be a boolean (true/false), received "${raw}"` };
  });
}

export interface EnumOptions<T extends string> extends BaseOptions {
  default?: T;
}

export function oneOf<T extends string>(
  values: readonly T[],
  options: EnumOptions<T> & { required: true },
): EnvReader<T>;
export function oneOf<T extends string>(
  values: readonly T[],
  options: EnumOptions<T> & { default: T },
): EnvReader<T>;
export function oneOf<T extends string>(
  values: readonly T[],
  options?: EnumOptions<T>,
): EnvReader<T | undefined>;
export function oneOf<T extends string>(
  values: readonly T[],
  options: EnumOptions<T> = {},
): EnvReader<T | undefined> {
  return reader(options, options.default, (raw) => {
    if ((values as readonly string[]).includes(raw)) return { ok: true, value: raw as T };
    return { ok: false, message: `must be one of: ${values.join(', ')}` };
  });
}

export interface UrlOptions extends BaseOptions {
  default?: string;
  /** Restrict to these protocols, e.g. ['https:'] in production. */
  protocols?: string[];
}

export function url(options: UrlOptions & { required: true }): EnvReader<string>;
export function url(options: UrlOptions & { default: string }): EnvReader<string>;
export function url(options?: UrlOptions): EnvReader<string | undefined>;
export function url(options: UrlOptions = {}): EnvReader<string | undefined> {
  return reader(options, options.default, (raw) => {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, message: `must be a valid URL, received "${raw}"` };
    }
    if (options.protocols && !options.protocols.includes(parsed.protocol)) {
      return { ok: false, message: `must use one of: ${options.protocols.join(', ')}` };
    }
    return { ok: true, value: raw };
  });
}

export interface CsvOptions extends BaseOptions {
  default?: string[];
}

export function csv(options: CsvOptions & { required: true }): EnvReader<string[]>;
export function csv(options: CsvOptions & { default: string[] }): EnvReader<string[]>;
export function csv(options?: CsvOptions): EnvReader<string[] | undefined>;
export function csv(options: CsvOptions = {}): EnvReader<string[] | undefined> {
  return reader(options, options.default, (raw) => ({
    ok: true,
    value: raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  }));
}

// ── Loader ───────────────────────────────────────────────────────────────────

export type EnvSchema = Record<string, EnvReader<unknown>>;

/**
 * Any source of environment values. Deliberately structural: frameworks such as
 * Next.js narrow `NodeJS.ProcessEnv`, and configuration loaders must stay
 * callable with a plain object in tests.
 */
export type EnvSource = Record<string, string | undefined>;

export type LoadedEnv<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends EnvReader<infer T> ? T : never;
};

/**
 * Validates the whole schema and returns a typed, frozen configuration object.
 * Throws `EnvValidationError` listing every problem found.
 */
export function loadEnv<S extends EnvSchema>(
  schema: S,
  source: EnvSource = process.env,
): LoadedEnv<S> {
  const issues: EnvIssue[] = [];
  const result: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(schema)) {
    const parsed = definition.parse(source[key]);
    if (parsed.ok) {
      result[key] = parsed.value;
    } else {
      issues.push({ key, message: parsed.message });
    }
  }

  if (issues.length > 0) throw new EnvValidationError(issues);

  return Object.freeze(result) as LoadedEnv<S>;
}

/** Keys a schema marked as secret — useful to redact before logging config. */
export function secretKeys(schema: EnvSchema): string[] {
  return Object.entries(schema)
    .filter(([, definition]) => definition.secret)
    .map(([key]) => key);
}

/** Replaces secret values with a marker so configuration can be logged safely. */
export function redact<S extends EnvSchema>(
  schema: S,
  values: LoadedEnv<S>,
): Record<string, unknown> {
  const secrets = new Set(secretKeys(schema));
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([key, value]) => [
      key,
      secrets.has(key) && value !== undefined ? '«redacted»' : value,
    ]),
  );
}
