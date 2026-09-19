import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  /**
   * Traces the files the server actually needs, so the runtime image carries a
   * pruned `node_modules` instead of the whole workspace.
   */
  output: 'standalone',
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
