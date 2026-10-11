import type { NextConfig } from "next";

// A static export served by the Rust binary: pages at / and /wiki, every asset under /static.
const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: "/static",
  images: { unoptimized: true },
};

export default nextConfig;
