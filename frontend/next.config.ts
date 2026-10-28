import type { NextConfig } from 'next';

// The browser talks to /api on the same origin; Next proxies to NestJS.
// This keeps auth cookies first-party and lets middleware read them.
const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/:path*` }];
  },
};

export default config;
