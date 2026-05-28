/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: false },
  transpilePackages: ['@smanga/db', '@smanga/shared', '@smanga/crawler'],
};
export default nextConfig;
