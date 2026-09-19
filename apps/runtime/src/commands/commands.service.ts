import { Injectable } from '@nestjs/common';
import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';
import { isJarvisCapability } from '@tania/types';
import type { RuntimeCapability } from '../capabilities/capability.js';
import { ToolsCapability } from '../capabilities/tools.capability.js';
import {
  FilesCapability,
  SessionCapability,
  SkillsCapability,
  VerificationCapability,
} from '../capabilities/workspace.capability.js';
import {
  UnsupportedCapability,
  WORKSTATION_CAPABILITIES,
} from '../capabilities/unsupported.capability.js';

/** Wall-clock budget when the command does not carry one. */
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class CommandsService {
  private readonly byCapability = new Map<JarvisCapability, RuntimeCapability>();

  constructor() {
    for (const capability of [
      new ToolsCapability(),
      new FilesCapability(),
      new SessionCapability(),
      new VerificationCapability(),
      new SkillsCapability(),
    ]) {
      this.byCapability.set(capability.capability, capability);
    }

    // Registered rather than omitted: an absent capability answers UNSUPPORTED
    // with a reason, where a missing one would answer nothing at all.
    for (const [capability, reason] of WORKSTATION_CAPABILITIES) {
      this.byCapability.set(capability, new UnsupportedCapability(capability, reason));
    }
  }

  describe(): { capability: JarvisCapability; actions: readonly string[]; supported: boolean }[] {
    return [...this.byCapability.values()].map((capability) => ({
      capability: capability.capability,
      actions: capability.actions,
      supported: capability.actions.length > 0,
    }));
  }

  /**
   * Runs one command.
   *
   * Two refusals happen before any capability is reached, in this order:
   *
   * 1. **An unknown capability** is reported as such rather than routed
   *    anywhere, so a newer TANIA talking to an older runtime gets a clear
   *    answer instead of a silent no-op.
   * 2. **A command that says it needs approval but carries no `approvalId`**
   *    is rejected. TANIA checks this too; the runtime checks it again because
   *    it is the last place that can, and a gate enforced on only one side is
   *    a gate that a bug or a direct caller walks straight through.
   */
  async execute(command: JarvisCommand): Promise<JarvisResult> {
    const startedAt = Date.now();
    const finish = (result: JarvisResult): JarvisResult => ({
      ...result,
      executionTime: Math.max(1, Date.now() - startedAt),
      requestId: command.requestId,
    });

    if (!isJarvisCapability(command.capability)) {
      return finish({
        status: 'UNSUPPORTED',
        evidence: [],
        artifacts: [],
        executionTime: 0,
        error: {
          code: 'CAPABILITY_UNKNOWN',
          message: `Kapabilitas "${String(command.capability)}" tidak dikenal runtime ini.`,
          retryable: false,
        },
      });
    }

    if (command.requiresApproval && !command.approvalId) {
      return finish({
        status: 'REJECTED',
        evidence: [],
        artifacts: [],
        executionTime: 0,
        error: {
          code: 'APPROVAL_REQUIRED',
          message: 'Perintah menyatakan perlu persetujuan manusia tetapi tidak membawa keputusannya.',
          retryable: false,
        },
      });
    }

    const capability = this.byCapability.get(command.capability);
    if (!capability) {
      return finish({
        status: 'UNSUPPORTED',
        evidence: [],
        artifacts: [],
        executionTime: 0,
        error: {
          code: 'CAPABILITY_UNSUPPORTED',
          message: `Runtime ini tidak melayani ${command.capability}.`,
          retryable: false,
        },
      });
    }

    const timeoutMs = command.timeoutMs && command.timeoutMs > 0 ? command.timeoutMs : DEFAULT_TIMEOUT_MS;

    try {
      const result = await this.withTimeout(capability.handle(command), timeoutMs);
      return finish(result);
    } catch (error) {
      // A capability that throws still owes the caller a status; TIMEOUT is
      // retryable because the same command may well succeed next time.
      const timedOut = error instanceof Error && error.message === 'TIMEOUT';

      return finish({
        status: timedOut ? 'TIMEOUT' : 'FAILED',
        evidence: [],
        artifacts: [],
        executionTime: 0,
        error: {
          code: timedOut ? 'RUNTIME_TIMEOUT' : 'CAPABILITY_THREW',
          message: timedOut
            ? `Perintah melewati anggaran ${timeoutMs} ms.`
            : 'Kapabilitas gagal menyelesaikan perintah.',
          retryable: timedOut,
        },
      });
    }
  }

  private async withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
