/** @type {import("next").NextConfig} */
const nextConfig = {
  // Dibutuhkan image Docker: menghasilkan .next/standalone berisi server.js +
  // hanya node_modules yang benar-benar terpakai. Tidak berpengaruh pada
  // `next dev` maupun alur build yang sudah ada.
  output: "standalone",
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: ""
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: ""
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: ""
      },
      {
        protocol: "https",
        hostname: "pub-b7fd9c30cdbf439183b75041f5f71b92.r2.dev",
        port: ""
      }
    ]
  }
};

export default nextConfig;
