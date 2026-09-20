import { config } from '@/lib/config/env';

/**
 * States plainly that this instance authenticates nobody.
 *
 * An evaluation deployment looks exactly like a real one in a screenshot, and
 * that is the danger: the portal is most convincing precisely where it is least
 * trustworthy. Mock identity resolves every visitor to one actor holding every
 * scope, `workflow:approve` included, so anyone who opens the link is a full
 * administrator of a system whose whole premise is permission-aware governance.
 *
 * Rendered from server config rather than a build flag so it cannot drift from
 * the setting that actually decides the behaviour: if the banner is absent,
 * identity is real.
 */
export function DemoBanner() {
  if (!config.auth.demo) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
    >
      <span className="font-semibold">Instans evaluasi.</span>
      <span>
        Autentikasi dimatikan — setiap pengunjung menjadi satu pengguna dengan seluruh kewenangan.
      </span>
      <span className="text-amber-800">Data contoh, LLM tiruan. Jangan masukkan data nyata.</span>
    </div>
  );
}
