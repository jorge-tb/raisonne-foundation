import type { NextConfig } from "next";
import { DEFAULT_IPFS_GATEWAY } from "./src/lib/gallery";

// Artwork images are full-size JPEGs on IPFS (up to ~8 MB); next/image resizes them. Only our gateway's
// /ipfs/ paths are allowed, so the optimizer can't be used as an open proxy.
const gateway = new URL(process.env.IPFS_GATEWAY || DEFAULT_IPFS_GATEWAY);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: gateway.hostname, pathname: `${gateway.pathname}**`, search: "" }],
    maximumRedirects: 0,
  },
};

export default nextConfig;
