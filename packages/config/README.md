# @tania/config

**Platform runtime primitives** every TANIA service shares: validated
configuration, structured logging, structured errors, request correlation, and
health reporting.

| Module | Purpose |
|---|---|
| `env` | Typed environment schema (`str`, `int`, `bool`, `oneOf`, `url`, `csv`), `loadEnv`, `redact` |
| `logger` | `createLogger` — one JSON object per line, child bindings, `audit()` |
| `errors` | `TaniaError` with canonical status per code, `toApiFailure`, `describeError` |
| `correlation` | `newCorrelationId`, `correlationFrom(headers)` |
| `health` | `buildHealthReport` with isolated, timed dependency probes |

```ts
const config = loadEnv({ PORT: int({ default: 4000 }), DATABASE_URL: str({ required: true, secret: true }) });
```

Two rules this package enforces:

1. **Fail loudly at startup.** `loadEnv` reports *every* invalid variable at
   once, so a misconfigured deployment is fixed in one pass.
2. **Never leak.** Unknown errors become a bare `INTERNAL`; values marked
   `secret` are redacted before configuration is logged or displayed.
