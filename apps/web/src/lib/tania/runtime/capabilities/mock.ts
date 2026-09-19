import type {
  JarvisArtifact,
  JarvisCapability,
  JarvisCapabilityAdapter,
  JarvisCommand,
  JarvisResult,
} from './types';
import { artifactId, failed, succeeded, unsupported } from '../commands';

/**
 * Simulated JARVIS capabilities.
 *
 * These exist because the runtime is not reachable from this environment, and
 * inventing an implementation would be worse than simulating one: every adapter
 * here reports `live: false`, so the portal can say plainly which capabilities
 * are real and which are stand-ins. Each one is deterministic — the same
 * command produces the same result — so an integration test asserts behaviour
 * rather than luck.
 */
abstract class MockCapabilityAdapter implements JarvisCapabilityAdapter {
  readonly live = false;
  abstract readonly id: string;
  abstract readonly capability: JarvisCapability;

  async handle(command: JarvisCommand, signal?: AbortSignal): Promise<JarvisResult> {
    if (signal?.aborted) {
      return failed(
        command,
        { code: 'CANCELLED', message: 'Perintah dibatalkan sebelum dijalankan.', retryable: false },
        'CANCELLED',
      );
    }
    return this.run(command);
  }

  describe(): string {
    return 'Adapter simulasi; belum terhubung ke runtime JARVIS.';
  }

  protected abstract run(command: JarvisCommand): Promise<JarvisResult>;

  /** Every mock rejects an action it does not model, rather than guessing. */
  protected unknownAction(command: JarvisCommand): JarvisResult {
    return unsupported(
      command,
      `Aksi "${command.action}" tidak dikenali oleh adapter ${this.capability}.`,
    );
  }

  protected text(command: JarvisCommand, key: string, fallback = ''): string {
    const value = command.parameters[key];
    return typeof value === 'string' ? value : fallback;
  }
}

export class MockVoiceInputAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.voice-input';
  readonly capability: JarvisCapability = 'voice.input';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'voice.transcribe') return this.unknownAction(command);

    // No audio pipeline here: the caller supplies the transcript it already has,
    // and the mock is explicit that it did not listen to anything.
    const transcript = this.text(command, 'transcript');
    if (transcript.length === 0) {
      return failed(command, {
        code: 'NO_AUDIO',
        message: 'Tidak ada audio atau transkrip yang dapat diproses.',
        retryable: false,
      });
    }

    return succeeded(command, {
      summary: `Transkrip diterima (${transcript.length} karakter) dari adapter simulasi.`,
      output: { transcript, language: this.text(command, 'language', 'id-ID'), simulated: true },
    });
  }
}

export class MockVoiceOutputAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.voice-output';
  readonly capability: JarvisCapability = 'voice.output';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'voice.speak') return this.unknownAction(command);

    const text = this.text(command, 'text');
    if (text.length === 0) {
      return failed(command, {
        code: 'EMPTY_UTTERANCE',
        message: 'Tidak ada teks yang dapat diucapkan.',
        retryable: false,
      });
    }

    return succeeded(command, {
      summary: 'Ucapan disiapkan pada adapter simulasi; tidak ada audio yang diputar.',
      artifacts: [
        {
          id: artifactId(command, 'speech'),
          kind: 'audio',
          name: 'speech.txt',
          mediaType: 'text/plain',
          text,
          sizeBytes: text.length,
        },
      ],
      output: { voice: this.text(command, 'voice', 'tania-id'), simulated: true },
    });
  }
}

export class MockVisionAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.vision';
  readonly capability: JarvisCapability = 'vision';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'vision.describe') return this.unknownAction(command);

    const source = this.text(command, 'imageUri');
    if (source.length === 0) {
      return failed(command, {
        code: 'NO_IMAGE',
        message: 'Tidak ada gambar yang dirujuk perintah ini.',
        retryable: false,
      });
    }

    // Deliberately says nothing about the image's content: describing an image
    // it never saw is exactly the kind of invention this adapter must not do.
    return succeeded(command, {
      summary: 'Adapter simulasi tidak menganalisis gambar; rujukan dicatat tanpa deskripsi.',
      output: { imageUri: source, described: false, simulated: true },
    });
  }
}

export class MockBrowserAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.browser';
  readonly capability: JarvisCapability = 'browser';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'browser.open' && command.action !== 'browser.read') {
      return this.unknownAction(command);
    }

    const url = this.text(command, 'url');
    if (!/^https?:\/\//i.test(url)) {
      return failed(command, {
        code: 'INVALID_URL',
        message: 'URL harus diawali http:// atau https://.',
        retryable: false,
      });
    }

    return succeeded(command, {
      summary: `Navigasi ke ${url} disimulasikan; tidak ada halaman yang benar-benar dimuat.`,
      output: { url, loaded: false, simulated: true },
    });
  }
}

export class MockComputerAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.computer';
  readonly capability: JarvisCapability = 'computer';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'computer.control') return this.unknownAction(command);

    // Computer control is the sharpest edge in the whole contract, so the mock
    // refuses by default: a simulated success here would train callers to treat
    // it as harmless.
    return unsupported(
      command,
      'Kendali komputer tidak tersedia pada adapter simulasi dan tidak akan dipalsukan.',
    );
  }
}

export class MockFilesAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.files';
  readonly capability: JarvisCapability = 'files';

  private readonly store = new Map<string, string>();

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    const path = this.text(command, 'path');

    switch (command.action) {
      case 'files.write': {
        const content = this.text(command, 'content');
        this.store.set(path, content);
        return succeeded(command, {
          summary: `Berkas ${path} ditulis ke penyimpanan simulasi.`,
          artifacts: [
            {
              id: artifactId(command, 'file'),
              kind: 'file',
              name: path,
              mediaType: 'text/plain',
              sizeBytes: content.length,
            },
          ],
          output: { path, simulated: true },
        });
      }
      case 'files.read': {
        const content = this.store.get(path);
        if (content === undefined) {
          return failed(command, {
            code: 'NOT_FOUND',
            message: `Berkas ${path} tidak ada pada penyimpanan simulasi.`,
            retryable: false,
          });
        }
        return succeeded(command, {
          summary: `Berkas ${path} dibaca dari penyimpanan simulasi.`,
          artifacts: [
            {
              id: artifactId(command, 'file'),
              kind: 'file',
              name: path,
              mediaType: 'text/plain',
              text: content,
              sizeBytes: content.length,
            },
          ],
          output: { path, simulated: true },
        });
      }
      case 'files.list':
        return succeeded(command, {
          summary: `${this.store.size} berkas pada penyimpanan simulasi.`,
          output: { paths: [...this.store.keys()], simulated: true },
        });
      default:
        return this.unknownAction(command);
    }
  }
}

export class MockToolsAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.tools';
  readonly capability: JarvisCapability = 'tools';

  /**
   * A draft the simulated runtime "produced".
   *
   * Contains the request and nothing else: writing plausible-looking content
   * here would put words into a document a person might act on.
   */
  private draft(command: JarvisCommand, name: string): JarvisArtifact {
    const input = command.parameters.input as { question?: unknown } | undefined;
    const question = typeof input?.question === 'string' ? input.question : command.task;

    return {
      id: artifactId(command, 'draft'),
      kind: 'text',
      name: 'draft.md',
      mediaType: 'text/markdown',
      text: [
        `# Draf: ${question}`,
        '',
        `Disiapkan oleh ${name} pada runtime simulasi.`,
        'Isi belum dihasilkan — runtime sungguhan yang akan menuliskannya.',
      ].join('\n'),
    };
  }

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    const name = this.text(command, 'toolName', this.text(command, 'toolId', 'Tool'));

    switch (command.action) {
      case 'tools.invoke': {
        const toolId = this.text(command, 'toolId');
        const artifacts =
          toolId === 'document.draft' ? [this.draft(command, name)] : undefined;

        return succeeded(command, {
          summary: `${name} dijalankan pada runtime simulasi (${this.text(command, 'effect')})`,
          output: { simulated: true, toolId },
          ...(artifacts === undefined ? {} : { artifacts }),
        });
      }
      case 'tools.compensate': {
        const reversible = command.parameters.reversible === true;
        if (!reversible) {
          return failed(command, {
            code: 'IRREVERSIBLE',
            message: `${name} tidak dapat dibatalkan.`,
            retryable: false,
          });
        }
        return succeeded(command, {
          summary: `${name} dibatalkan pada runtime simulasi.`,
          output: { compensated: true, toolId: this.text(command, 'toolId') },
        });
      }
      default:
        return this.unknownAction(command);
    }
  }
}

export class MockSkillsAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.skills';
  readonly capability: JarvisCapability = 'skills';

  /** Named so it is obvious these are placeholders, not a JARVIS skill list. */
  private readonly skills = ['skill.echo', 'skill.summarize'];

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    switch (command.action) {
      case 'skills.list':
        return succeeded(command, {
          summary: `${this.skills.length} skill tersedia pada adapter simulasi.`,
          output: { skills: this.skills, simulated: true },
        });
      case 'skills.run': {
        const skill = this.text(command, 'skill');
        if (!this.skills.includes(skill)) {
          return failed(command, {
            code: 'SKILL_NOT_FOUND',
            message: `Skill "${skill}" tidak terdaftar pada adapter simulasi.`,
            retryable: false,
          });
        }
        return succeeded(command, {
          summary: `Skill ${skill} dijalankan pada adapter simulasi.`,
          output: { skill, simulated: true },
        });
      }
      default:
        return this.unknownAction(command);
    }
  }
}

export class MockSessionAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.session';
  readonly capability: JarvisCapability = 'session';

  private readonly open = new Set<string>();

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    const sessionId = command.sessionId ?? this.text(command, 'sessionId');
    if (sessionId.length === 0) {
      return failed(command, {
        code: 'NO_SESSION',
        message: 'Perintah sesi memerlukan sessionId.',
        retryable: false,
      });
    }

    switch (command.action) {
      case 'session.open':
        this.open.add(sessionId);
        return succeeded(command, {
          summary: `Sesi runtime ${sessionId} dibuka pada adapter simulasi.`,
          output: { sessionId, state: 'OPEN', simulated: true },
        });
      case 'session.close':
        this.open.delete(sessionId);
        return succeeded(command, {
          summary: `Sesi runtime ${sessionId} ditutup.`,
          output: { sessionId, state: 'CLOSED', simulated: true },
        });
      case 'session.status':
        return succeeded(command, {
          summary: `Sesi ${sessionId} berstatus ${this.open.has(sessionId) ? 'OPEN' : 'CLOSED'}.`,
          output: {
            sessionId,
            state: this.open.has(sessionId) ? 'OPEN' : 'CLOSED',
            simulated: true,
          },
        });
      default:
        return this.unknownAction(command);
    }
  }
}

export class MockVerificationAdapter extends MockCapabilityAdapter {
  readonly id = 'mock.verification';
  readonly capability: JarvisCapability = 'verification';

  protected async run(command: JarvisCommand): Promise<JarvisResult> {
    if (command.action !== 'verification.check') return this.unknownAction(command);

    // Checks only what is actually present in the command: it verifies the
    // record of the run, and says so, rather than claiming to re-inspect the
    // enterprise systems it never touched.
    const artifacts = Array.isArray(command.parameters.artifacts)
      ? command.parameters.artifacts.length
      : 0;
    const expected = typeof command.parameters.expectedArtifacts === 'number'
      ? command.parameters.expectedArtifacts
      : artifacts;

    const issues = artifacts < expected
      ? [`Runtime melaporkan ${artifacts} artefak, diharapkan ${expected}.`]
      : [];

    return succeeded(command, {
      summary:
        issues.length === 0
          ? 'Catatan eksekusi runtime konsisten dengan yang dilaporkan.'
          : 'Catatan eksekusi runtime tidak konsisten.',
      output: { ok: issues.length === 0, issues, scope: 'record-only', simulated: true },
    });
  }
}

/** Every capability, simulated. The default when no runtime is configured. */
export function createMockCapabilityAdapters(): JarvisCapabilityAdapter[] {
  return [
    new MockVoiceInputAdapter(),
    new MockVoiceOutputAdapter(),
    new MockVisionAdapter(),
    new MockBrowserAdapter(),
    new MockComputerAdapter(),
    new MockFilesAdapter(),
    new MockToolsAdapter(),
    new MockSkillsAdapter(),
    new MockSessionAdapter(),
    new MockVerificationAdapter(),
  ];
}
