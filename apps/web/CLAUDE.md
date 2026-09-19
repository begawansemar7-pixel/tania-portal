# TANIA — DEVELOPMENT CONSTITUTION

## 1. PRODUCT

TANIA = Telkom AI Native Intelligent Assistant / AI Employee for Digital Product & Solution (DPS).

TANIA is not merely a chatbot.

TANIA must progressively support:

KNOW → UNDERSTAND → REASON → PLAN → CREATE → ACT → VERIFY → LEARN.

The target architecture is:

Portal TANIA
→ TANIA Experience Layer
→ TANIA Brain
→ TANIA Agent Orchestrator
→ JARVIS Runtime
→ Enterprise Systems / Tools.

## 2. ARCHITECTURE PRINCIPLES

* Keep frontend, backend, AI brain, runtime, agents, and governance modular.
* Do not create a monolithic AI service.
* Do not duplicate existing JARVIS capabilities.
* JARVIS is the execution/runtime layer.
* TANIA is the intelligence/orchestration layer.
* 3D TANIA is the human interface layer.
* Specialist agents provide domain capabilities.
* Enterprise data must be permission-aware.
* High-risk actions require human approval.
* Every meaningful action must produce an auditable execution trace.
* Every generated answer based on enterprise knowledge should expose evidence/citations.
* Never expose hidden chain-of-thought.
* Expose only safe execution status, evidence, tools used, and final result.

## 3. TECHNOLOGY

Preferred baseline:

Frontend:

* Next.js
* React
* TypeScript
* Tailwind CSS

Backend:

* NestJS
* Prisma
* PostgreSQL
* Redis

Identity:

* OIDC / Microsoft Entra ID compatible architecture.

AI:

* LLM abstraction layer
* RAG abstraction layer
* Agent abstraction layer
* Tool abstraction layer

Runtime:

* JARVIS adapter.

Avatar:

* Three.js
* React Three Fiber
* GLB / VRM
* Blendshapes
* Viseme-based lip sync.

## 4. DEVELOPMENT RULES

Before changing code:

1. Inspect the repository.
2. Understand the current architecture.
3. Reuse existing components where appropriate.
4. Do not rewrite working modules unnecessarily.
5. Identify dependencies and integration points.
6. Explain the implementation plan briefly.
7. Implement incrementally.
8. Run tests/type checks/lint/build where applicable.
9. Fix errors before declaring completion.
10. Update documentation when architecture changes.

Never silently remove existing functionality.

Never invent APIs, credentials, environment variables, database tables, or external services.

If a required integration is unavailable, create a clean adapter/interface and a mock implementation.

## 5. CODE QUALITY

Use:

* strict TypeScript
* explicit interfaces/types
* modular services
* dependency injection where appropriate
* environment-based configuration
* structured logging
* centralized error handling
* validation at API boundaries
* secure defaults
* least privilege.

Avoid:

* any unless unavoidable
* hardcoded secrets
* hardcoded production URLs
* giant components
* giant prompts embedded inside UI components
* duplicated business logic
* direct database access from frontend.

## 6. AI SAFETY

TANIA must distinguish:

INFORMATIONAL
LOW RISK
MEDIUM RISK
HIGH RISK
CRITICAL

High-risk and critical actions must support approval gates.

Never allow an LLM to directly execute arbitrary system commands or unrestricted enterprise actions.

All tool execution must pass through a controlled tool registry / policy layer.

## 7. UX

TANIA should feel:

* professional
* intelligent
* proactive
* concise
* enterprise-grade
* approachable.

Primary UX:

Dashboard
→ TANIA Workspace
→ Knowledge
→ Agents
→ My Work
→ Analytics
→ Settings.

## 8. DEFINITION OF DONE

A feature is not complete when code merely compiles.

It must:

* work end-to-end where possible
* have appropriate error handling
* have tests
* pass type checking
* pass linting
* have clear documentation
* preserve existing functionality.

Always report:

1. What changed
2. Files changed
3. Architecture impact
4. Tests executed
5. Remaining limitations
6. Recommended next step

