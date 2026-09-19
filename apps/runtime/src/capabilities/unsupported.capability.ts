import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';
import { unsupported, type RuntimeCapability } from './capability.js';

/**
 * A capability this deployment genuinely cannot serve.
 *
 * Voice, vision, browser and computer control need a workstation: a microphone,
 * a screen, an input device. A server-side runtime has none of them, and the
 * constitution forbids inventing an integration that is not there.
 *
 * So these answer `UNSUPPORTED` with the reason. TANIA can act on that — it
 * plans around a capability it knows is absent — where a simulated success
 * would put a fiction into an audit trail.
 */
export class UnsupportedCapability implements RuntimeCapability {
  readonly actions: readonly string[] = [];

  constructor(
    readonly capability: JarvisCapability,
    private readonly reason: string,
  ) {}

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    return unsupported(command, this.reason);
  }
}

/** Why each absent capability is absent, stated once. */
export const WORKSTATION_CAPABILITIES: ReadonlyArray<[JarvisCapability, string]> = [
  ['voice.input', 'Runtime ini tidak memiliki perangkat masukan audio.'],
  ['voice.output', 'Runtime ini tidak memiliki perangkat keluaran audio.'],
  ['vision', 'Runtime ini tidak memiliki akses kamera atau layar.'],
  ['browser', 'Runtime ini tidak menjalankan peramban.'],
  ['computer', 'Kendali perangkat memerlukan workstation, bukan layanan.'],
];
