import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  /**
   * Traces the files the server actually needs, so the runtime image carries a
   * pruned `node_modules` instead of the whole workspace.
   *
   * Skipped on Vercel, which builds its own output format and does not want a
   * self-contained server directory. Keeping it on there produces a build that
   * succeeds and then serves nothing, which is a slow way to find out.
   */
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  /**
   * `fileURLToPath`, not `URL.pathname`: the latter stays percent-encoded, so a
   * checkout under a directory with a space resolves to a path that does not
   * exist and the build fails to canonicalize it.
   */
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  /**
   * Type errors fail the build. Lint runs separately in `npm run verify`,
   * which is the gate CI enforces.
   */
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
