/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' } // room for camera-captured images
  }
};

export default nextConfig;
