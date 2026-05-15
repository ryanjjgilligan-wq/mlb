/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'midfield.mlbstatic.com' },
      { protocol: 'https', hostname: 'img.mlbstatic.com' },
      { protocol: 'https', hostname: 'content.mlb.com' },
      { protocol: 'https', hostname: 'www.mlbstatic.com' },
      { protocol: 'https', hostname: 'securea.mlb.com' },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
