/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rohankumar4179/shared-types'],
  // Baseline hardening headers on every response. Deliberately no
  // Content-Security-Policy here: WalletConnect/Pera bridge over websockets
  // to origins that vary by relay, and getting script-src wrong would
  // silently break wallet connect/sign — the app's core payment flow — in a
  // way that's hard to catch without live wallet testing. These five are
  // safe regardless of what the wallet SDK needs to reach.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
