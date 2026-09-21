import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source (no build step),
  // so Next compiles them itself. Keep in sync with pnpm-workspace.yaml.
  transpilePackages: ["@pm/domain", "@pm/db", "@pm/orchestrator"],
};

export default nextConfig;
