-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('SESSION', 'ACTOR', 'ORGANISATION');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approvalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "classification" "Clearance" NOT NULL DEFAULT 'INTERNAL',
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MemoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceRecord" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "actorId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "risk" "RiskLevel" NOT NULL,
    "verificationOk" BOOLEAN NOT NULL,
    "dataAccess" JSONB NOT NULL,
    "verification" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_actorId_createdAt_idx" ON "Task"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_actorId_status_idx" ON "Task"("actorId", "status");

-- CreateIndex
CREATE INDEX "MemoryRecord_actorId_scope_createdAt_idx" ON "MemoryRecord"("actorId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryRecord_expiresAt_idx" ON "MemoryRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceRecord_sequence_key" ON "GovernanceRecord"("sequence");

-- CreateIndex
CREATE INDEX "GovernanceRecord_actorId_occurredAt_idx" ON "GovernanceRecord"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "GovernanceRecord_correlationId_idx" ON "GovernanceRecord"("correlationId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
