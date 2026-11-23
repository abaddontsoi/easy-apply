import type { NextConfig } from "next";

const e2eDist = process.env.NEXT_DIST_DIR;
const distDir = e2eDist === ".next-e2e-setup" || e2eDist === ".next-e2e-desk" ? e2eDist : undefined;

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
};

export default nextConfig;
