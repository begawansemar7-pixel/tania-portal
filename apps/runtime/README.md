# TANIA Runtime

The execution layer behind the `JarvisCommand` contract.

```
TANIA Brain → Orchestrator → JarvisRuntimeAdapter → [ this ] → tools
```

## Why it exists

TANIA's runtime boundary was complete on the intelligence side — ten
capabilities, timeout, retry, cancellation, a last-mile approval refusal — but
had nothing to talk to. The available JARVIS implementations are licensed
**CC BY-NC 4.0** ("commercial use is not permitted"), so vendoring one into a
corporate monorepo would import that restriction.

This is the replacement: built from `@tania/types`, the contract TANIA already
owns and the adapter already targets.

> **On "clean room".** This was written from TANIA's own contract, not derived
> from the third-party source. It is not a clean-room reimplementation in the
> strict sense — the author had read the CC BY-NC repository earlier in the same
> session — but nothing here reproduces its structure, naming or implementation,
> and every shape comes from `packages/types/src/runtime.ts`. Stated plainly so
> the distinction can be judged rather than assumed.

## Contract

Both sides compile against `@tania/types`, so the wire format cannot drift from
the declarations.

```
POST /v1/commands    JarvisCommand  ->  JarvisResult
GET  /v1/manifest    tools + capabilities
GET  /health         liveness, unauthenticated
```

## What it serves, and what it refuses

| Capability | Status |
|---|---|
| `tools` | Invokes tools the manifest publishes; compensates the reversible ones |
| `files` | In-memory workspace, session-scoped |
| `session` | Start, status, end |
| `verification` | Checks the claims it is handed |
| `skills` | Lists an empty catalogue honestly |
| `voice.input` · `voice.output` · `vision` · `browser` · `computer` | **`UNSUPPORTED`**, with a reason |

The last row is the point. Those five need a workstation — a microphone, a
screen, an input device — and a service has none. `UNSUPPORTED` is in the
contract precisely so a deployment can say "not here" rather than simulate a
success that would put a fiction into an audit trail.

## Two refusals before any capability runs

1. **Unknown capability** — reported as such, so a newer TANIA talking to an
   older runtime gets a clear answer instead of a silent no-op.
2. **`requiresApproval` with no `approvalId`** — rejected. TANIA checks this
   too; the runtime checks it again because it is the last place that can, and a
   gate enforced on one side is a gate a direct caller walks through.

## Deliberate limits

- **Files live in memory.** A runtime writing to the host filesystem on a
  model's instruction is the unrestricted execution the constitution forbids.
  Path traversal is refused anyway, so the checks are already in place if a
  storage backend is ever added.
- **Tools are declared, not integrated.** The manifest states each tool's
  `effect`, `reversible` and `defaultRisk` — only the side performing the work
  can state those honestly — but no enterprise system is connected yet. A tool
  reports what it would do; it does not reach HRIS, ERP or ITSM.
- **Authentication is a shared service token**, compared in constant time. With
  none configured the runtime refuses every request rather than running open.

## Running

```bash
npm run build --workspace @tania/runtime
TANIA_RUNTIME_TOKEN=$(openssl rand -hex 32) PORT=4100 \
  node apps/runtime/dist/src/main.js
```

Point the portal at it:

```bash
TANIA_RUNTIME_ADAPTER=jarvis
JARVIS_BASE_URL=http://localhost:4100
```

## Tests

| Gate | What it covers |
|---|---|
| `npm run test --workspace @tania/runtime` | 27 contract tests: auth, result shape, approval gate, tools, unsupported capabilities, files, verification, manifest |
| `npm run test:interop` | TANIA's **real** adapter against this runtime as a **process**, over a socket |

The second is the one that matters: every other JARVIS test in the repo uses a
simulated adapter or an injected `fetch`. Only this one can tell you whether the
two halves of the contract actually agree.
