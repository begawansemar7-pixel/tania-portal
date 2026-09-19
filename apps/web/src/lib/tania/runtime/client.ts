import type { RiskLevel } from '@tania/types';
import type { JarvisDispatchOptions, JarvisResult, JarvisRuntimeAdapter } from './capabilities/types';
import { buildCommand, type CommandContext } from './commands';

/**
 * Typed access to the ten JARVIS capabilities.
 *
 * Every method builds a `JarvisCommand` and hands it to the adapter — there is
 * no second path to the runtime. The value of naming the capabilities here is
 * that a caller cannot misspell an action or forget to declare risk, and a
 * reader can see the entire surface TANIA uses in one file.
 *
 * What each capability *does* is JARVIS's business. This client only addresses
 * it.
 */
export class JarvisClient {
  constructor(
    private readonly adapter: JarvisRuntimeAdapter,
    private readonly context: CommandContext = {},
  ) {}

  /** A client bound to one request, so every command carries its provenance. */
  forRequest(context: CommandContext): JarvisClient {
    return new JarvisClient(this.adapter, { ...this.context, ...context });
  }

  // ── Voice ──────────────────────────────────────────────────────────────────

  transcribe(
    input: { transcript?: string; audioUri?: string; language?: string },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('voice.input', 'voice.transcribe', 'Mentranskrip masukan suara', input, 'INFORMATIONAL', options);
  }

  speak(
    input: { text: string; voice?: string },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('voice.output', 'voice.speak', 'Mengucapkan jawaban', input, 'INFORMATIONAL', options);
  }

  // ── Perception ─────────────────────────────────────────────────────────────

  describeImage(
    input: { imageUri: string; question?: string },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('vision', 'vision.describe', 'Membaca gambar', input, 'INFORMATIONAL', options);
  }

  openPage(
    input: { url: string; extract?: string },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('browser', 'browser.open', 'Membuka halaman', input, 'LOW', options);
  }

  // ── System ─────────────────────────────────────────────────────────────────

  /**
   * Computer control is `CRITICAL` by construction.
   *
   * It is the one capability where a mistake is not recoverable by retrying, so
   * it always declares an approval requirement regardless of the caller.
   */
  controlComputer(
    input: { instruction: string; target?: string },
    approvalId: string,
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send(
      'computer',
      'computer.control',
      'Mengendalikan komputer',
      input,
      'CRITICAL',
      options,
      { requiresApproval: true, approvalId },
    );
  }

  readFile(input: { path: string }, options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('files', 'files.read', `Membaca ${input.path}`, input, 'LOW', options);
  }

  writeFile(
    input: { path: string; content: string },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('files', 'files.write', `Menulis ${input.path}`, input, 'MEDIUM', options);
  }

  listFiles(input: { prefix?: string } = {}, options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('files', 'files.list', 'Mendaftar berkas', input, 'INFORMATIONAL', options);
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  listSkills(options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('skills', 'skills.list', 'Mendaftar skill runtime', {}, 'INFORMATIONAL', options);
  }

  runSkill(
    input: { skill: string; parameters?: Record<string, unknown> },
    risk: RiskLevel = 'MEDIUM',
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send('skills', 'skills.run', `Menjalankan skill ${input.skill}`, input, risk, options);
  }

  // ── Session ────────────────────────────────────────────────────────────────

  openSession(sessionId: string, options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('session', 'session.open', 'Membuka sesi runtime', { sessionId }, 'INFORMATIONAL', options, { sessionId });
  }

  closeSession(sessionId: string, options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('session', 'session.close', 'Menutup sesi runtime', { sessionId }, 'INFORMATIONAL', options, { sessionId });
  }

  sessionStatus(sessionId: string, options?: JarvisDispatchOptions): Promise<JarvisResult> {
    return this.send('session', 'session.status', 'Memeriksa sesi runtime', { sessionId }, 'INFORMATIONAL', options, { sessionId });
  }

  // ── Verification ───────────────────────────────────────────────────────────

  /**
   * Asks the runtime to confirm its own record of a run.
   *
   * TANIA still verifies independently: this answers "did the runtime do what
   * it reported", not "was the task correct", and a runtime that cannot check
   * itself returns `UNSUPPORTED` rather than a reassuring guess.
   */
  verify(
    input: { requestId: string; artifacts?: unknown[]; expectedArtifacts?: number },
    options?: JarvisDispatchOptions,
  ): Promise<JarvisResult> {
    return this.send(
      'verification',
      'verification.check',
      'Memeriksa catatan eksekusi runtime',
      input,
      'INFORMATIONAL',
      options,
    );
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private send(
    capability: Parameters<JarvisRuntimeAdapter['supports']>[0],
    action: string,
    task: string,
    parameters: Record<string, unknown>,
    risk: RiskLevel,
    options?: JarvisDispatchOptions,
    extra: { requiresApproval?: boolean; approvalId?: string; sessionId?: string } = {},
  ): Promise<JarvisResult> {
    const command = buildCommand(
      {
        capability,
        action,
        task,
        parameters,
        risk,
        ...(extra.requiresApproval === undefined ? {} : { requiresApproval: extra.requiresApproval }),
      },
      {
        ...this.context,
        ...(extra.approvalId === undefined ? {} : { approvalId: extra.approvalId }),
        ...(extra.sessionId === undefined ? {} : { sessionId: extra.sessionId }),
      },
    );

    return this.adapter.dispatch(command, options);
  }
}
