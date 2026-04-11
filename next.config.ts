import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    'preview-chat-37cccfa1-7a56-4437-9252-87fe44833212.space.z.ai',
    '*.space.z.ai',
  ],
};

export default nextConfig;
