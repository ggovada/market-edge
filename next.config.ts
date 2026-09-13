import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["yahoo-finance2"],
  // next-pwa injects webpack config; build with --webpack (see package.json)
  turbopack: {},
};

export default withPWA(nextConfig);
