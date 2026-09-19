import { randomUUID } from 'node:crypto';
import type { JarvisCommand, JarvisResult } from '@tania/types';
import { findTool } from '../manifest/tool-manifest.js';
import { failed, ok, unknownAction, type RuntimeCapability } from './capability.js';

/**
 * Invokes a tool the manifest declares.
 *
 * The runtime refuses anything it did not publish. That is not redundant with
 * TANIA's allow-list: the two sides check different things. TANIA checks that
 * *this actor's agent* may use the tool; the runtime checks that the tool
 * exists here at all. A deployment running an older manifest must not silently
 * execute something its operator never agreed to ship.
 */
export class ToolsCapability implements RuntimeCapability {
  readonly capability = 'tools' as const;
  readonly actions = ['tools.invoke', 'tools.compensate'] as const;

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    if (!this.actions.includes(command.action as (typeof this.actions)[number])) {
      return unknownAction(command);
    }

    const toolId = command.parameters.toolId;
    if (typeof toolId !== 'string' || toolId.length === 0) {
      return failed(command, {
        code: 'TOOL_ID_MISSING',
        message: 'Perintah tools tidak menyebut `toolId`.',
        retryable: false,
      });
    }

    const tool = findTool(toolId);
    if (!tool) {
      return failed(command, {
        code: 'TOOL_UNKNOWN',
        message: `Runtime ini tidak menerbitkan tool "${toolId}".`,
        retryable: false,
      });
    }

    if (command.action === 'tools.compensate') {
      if (!tool.reversible) {
        // Declining is the honest answer. Reporting a rollback that did not
        // happen would leave the enterprise changed and the trace saying otherwise.
        return failed(command, {
          code: 'TOOL_NOT_REVERSIBLE',
          message: `${tool.name} mendeklarasikan dirinya tidak dapat dibatalkan.`,
          retryable: false,
        });
      }

      return ok(command, {
        summary: `${tool.name} dibatalkan.`,
        output: { toolId, compensated: true },
      });
    }

    return ok(command, {
      summary: `${tool.name} dijalankan.`,
      output: { toolId, effect: tool.effect, reversible: tool.reversible },
      artifacts:
        tool.toolId === 'document.draft'
          ? [
              {
                id: randomUUID(),
                kind: 'text' as const,
                name: 'draft.md',
                mediaType: 'text/markdown',
                text: String(command.parameters.input ?? ''),
              },
            ]
          : [],
    });
  }
}
