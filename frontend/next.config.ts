import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    };
    return config;
  },
  experimental: {
    turbo: {
      resolveAlias: {
        canvas: false,
      }
    }
  }
};

export default nextConfig;
