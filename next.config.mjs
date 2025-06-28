/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 15+ 使用新的配置名称
  serverExternalPackages: ['formidable', 'fast-xml-parser'],
  experimental: {
    // 移除已弃用的 serverComponentsExternalPackages
  },
};

export default nextConfig;
