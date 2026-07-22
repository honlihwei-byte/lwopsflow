import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/shops/:shopId/clock",
        destination: "/shop/:shopId/clock",
        permanent: false,
      },
      {
        source: "/shops/:shopId",
        destination: "/shop/:shopId/clock",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
