/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // room for camera-captured images
    // These three ship native/binary files (sharp's prebuilt .node addon,
    // onnxruntime-node's binaries for every platform, and the ONNX model
    // files @imgly/background-removal-node fetches at runtime) that
    // webpack's bundler chokes on if it tries to parse them as JS — keeping
    // them external means they're require()'d from node_modules at runtime
    // on the server instead of bundled, which is what they need anyway.
    serverComponentsExternalPackages: ['sharp', 'onnxruntime-node', '@imgly/background-removal-node']
  }
};

export default nextConfig;
