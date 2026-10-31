import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev overlay badge out of demo recordings.
  devIndicators: false,
};

export default nextConfig;
