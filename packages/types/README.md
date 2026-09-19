# @tania/types

Shared **wire contracts**: the shapes that cross a process boundary.

Data and pure predicates only — no I/O, no framework, no service behaviour.
Ports with methods belong in [`@tania/core`](../tania/README.md); process-level
concerns in [`@tania/config`](../config/README.md).

| Module | Contents |
|---|---|
| `api` | `ApiResponse` envelope, `ApiErrorCode`, canonical HTTP status map, pagination |
| `correlation` | `CorrelationId`, `x-request-id` / `x-tania-actor` header names |
| `health` | `HealthReport`, `DependencyHealth`, `aggregateHealth` |
| `risk` | `RiskLevel` ladder, `isAtLeastRisk`, `highestRisk` |
| `classification` | `Classification` / `Clearance`, `canAccessClassification` |
| `evidence` · `trace` | Citations and safe execution status (never chain-of-thought) |
| `tool` · `approval` | Tool manifest, execution result, approval gate |
| `intent` · `session` | `Intent`, `AskRequest`, `AskResponse` |

```ts
import { isAtLeastRisk, type ApiResponse, type AskResponse } from '@tania/types';
```
