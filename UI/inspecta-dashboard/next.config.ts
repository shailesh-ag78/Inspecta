import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a fully static site into ./out on `next build`.
  // No Node server: the browser talks to the Python backend directly.
  output: "export",
  // next/image optimization needs a server; disable it for static export.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
