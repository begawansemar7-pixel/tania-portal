# @tania/core (`packages/tania`)

**Domain ports** for the TANIA platform: interfaces and service boundaries, no
implementations. No model calls, no I/O, no framework — so an adapter can be
replaced by configuration instead of by editing the domain.

Import one domain at a time:

```ts
import { hasScope, type Actor } from '@tania/core/identity';
import { requiresApproval, type PolicyEngine } from '@tania/core/governance';
```

| Domain | Owns | Key ports |
|---|---|---|
| `identity` | Who is acting, and what they may do | `IdentityProvider`, `hasScope` |
| `intent` | What is being asked | `IntentClassifier` |
| `context` | Correlation, session, conversation | `ContextProvider`, `RequestContext` |
| `reasoning` | Evidence → answer | `LlmProvider`, `Reasoner` |
| `planning` | Which registered capabilities to use | `Planner`, `ExecutionPlan` |
| `memory` | What TANIA may remember, and for how long | `MemoryStore` |
| `knowledge` | Permission-aware grounding | `KnowledgeRetriever`, `KnowledgeIngestor` |
| `orchestration` | Routing work to specialist agents | `AgentRegistry`, `Orchestrator` |
| `governance` | Tools, policy, approval, audit, runtime access | `ToolRegistry`, `PolicyEngine`, `ApprovalService`, `AuditSink`, `RuntimeGateway` |
| `verification` | Checking output against evidence | `Verifier`, `TraceRecorder` |

The package deliberately contains only trivial pure helpers alongside the
interfaces (`hasScope`, `requiresApproval`, `agentCanUseTool`, `summariseTrace`)
— anything with judgement in it belongs to an implementation.
