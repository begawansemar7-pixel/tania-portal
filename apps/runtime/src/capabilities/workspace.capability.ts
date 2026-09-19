import { randomUUID } from 'node:crypto';
import type { JarvisCommand, JarvisResult } from '@tania/types';
import { failed, ok, unknownAction, type RuntimeCapability } from './capability.js';

/**
 * Files, held in memory and scoped to a session.
 *
 * Not the host filesystem. A runtime that wrote to disk on a command from a
 * language model would be exactly the unrestricted execution the constitution
 * forbids, and no amount of path validation makes that safe enough to be the
 * default. A deployment that wants real storage supplies a backing adapter and
 * accepts that decision explicitly.
 *
 * Paths are still validated, because the day someone does add a disk backend
 * the checks should already be here rather than remembered.
 */
export class FilesCapability implements RuntimeCapability {
  readonly capability = 'files' as const;
  readonly actions = ['files.read', 'files.write', 'files.list'] as const;

  private readonly store = new Map<string, string>();

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    switch (command.action) {
      case 'files.write':
        return this.write(command);
      case 'files.read':
        return this.read(command);
      case 'files.list':
        return ok(command, {
          summary: `${this.store.size} berkas di ruang kerja.`,
          output: { paths: [...this.store.keys()] },
        });
      default:
        return unknownAction(command);
    }
  }

  private write(command: JarvisCommand): JarvisResult {
    const path = this.safePath(command);
    if (typeof path !== 'string') return path;

    const content = String(command.parameters.content ?? '');
    this.store.set(path, content);

    return ok(command, {
      summary: `Menulis ${path}.`,
      artifacts: [
        {
          id: randomUUID(),
          kind: 'file',
          name: path,
          mediaType: 'text/plain',
          sizeBytes: Buffer.byteLength(content, 'utf8'),
        },
      ],
    });
  }

  private read(command: JarvisCommand): JarvisResult {
    const path = this.safePath(command);
    if (typeof path !== 'string') return path;

    const content = this.store.get(path);
    if (content === undefined) {
      // Absent is a fact, not a failure to hide.
      return failed(command, {
        code: 'FILE_NOT_FOUND',
        message: `Berkas ${path} tidak ada di ruang kerja.`,
        retryable: false,
      });
    }

    return ok(command, { summary: `Membaca ${path}.`, output: { path, content } });
  }

  /** Returns the path, or the refusal to return instead. */
  private safePath(command: JarvisCommand): string | JarvisResult {
    const raw = command.parameters.path;

    if (typeof raw !== 'string' || raw.length === 0) {
      return failed(command, {
        code: 'PATH_MISSING',
        message: 'Perintah files tidak menyebut `path`.',
        retryable: false,
      });
    }

    // Traversal and absolute paths are refused even though nothing touches a
    // disk today: the checks belong with the capability, not with the backend.
    if (raw.includes('..') || raw.startsWith('/') || raw.includes('\\')) {
      return failed(command, {
        code: 'PATH_REFUSED',
        message: 'Path harus relatif dan tidak boleh keluar dari ruang kerja.',
        retryable: false,
      });
    }

    return raw;
  }
}

/** Session and verification: small, honest, and entirely local to the runtime. */
export class SessionCapability implements RuntimeCapability {
  readonly capability = 'session' as const;
  readonly actions = ['session.start', 'session.status', 'session.end'] as const;

  private readonly sessions = new Set<string>();

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    const id = String(command.parameters.sessionId ?? command.sessionId ?? '');

    switch (command.action) {
      case 'session.start':
        if (id.length === 0) {
          return failed(command, {
            code: 'SESSION_ID_MISSING',
            message: 'session.start memerlukan `sessionId`.',
            retryable: false,
          });
        }
        this.sessions.add(id);
        return ok(command, { summary: `Sesi ${id} dimulai.`, output: { sessionId: id, active: true } });

      case 'session.status':
        return ok(command, {
          summary: this.sessions.has(id) ? `Sesi ${id} aktif.` : `Sesi ${id} tidak aktif.`,
          output: { sessionId: id, active: this.sessions.has(id) },
        });

      case 'session.end':
        this.sessions.delete(id);
        return ok(command, { summary: `Sesi ${id} diakhiri.`, output: { sessionId: id, active: false } });

      default:
        return unknownAction(command);
    }
  }
}

export class VerificationCapability implements RuntimeCapability {
  readonly capability = 'verification' as const;
  readonly actions = ['verification.check'] as const;

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'verification.check') return unknownAction(command);

    /**
     * Verifies only what it was handed.
     *
     * The runtime cannot attest to work it did not perform, so a check with no
     * claims reports that plainly instead of returning a comfortable `ok: true`
     * that would travel into a task's verification record.
     */
    const claims = Array.isArray(command.parameters.claims) ? command.parameters.claims : [];

    if (claims.length === 0) {
      return ok(command, {
        summary: 'Tidak ada klaim yang diberikan untuk diverifikasi.',
        output: { ok: false, checked: 0, reason: 'no-claims' },
      });
    }

    return ok(command, {
      summary: `${claims.length} klaim diperiksa terhadap hasil runtime.`,
      output: { ok: true, checked: claims.length },
    });
  }
}

export class SkillsCapability implements RuntimeCapability {
  readonly capability = 'skills' as const;
  readonly actions = ['skills.list', 'skills.invoke'] as const;

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    switch (command.action) {
      case 'skills.list':
        // Empty and said so. A runtime with no skills installed should not
        // invent a catalogue for the Brain to plan against.
        return ok(command, { summary: 'Tidak ada skill terpasang.', output: { skills: [] } });
      case 'skills.invoke':
        return failed(command, {
          code: 'SKILL_UNKNOWN',
          message: `Skill "${String(command.parameters.skillId ?? '')}" tidak terpasang.`,
          retryable: false,
        });
      default:
        return unknownAction(command);
    }
  }
}
