/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Static export for GitHub Pages.
  output: "export",

  // Pages serves at /argonvault — apply prefix only in production builds.
  basePath: process.env.NODE_ENV === "production" ? "/argonvault" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/argonvault/" : undefined,

  // next/image doesn't work under `output: export` unless we disable optimisation.
  images: { unoptimized: true },

  // Avoid trailing-slash routing surprises on Pages.
  trailingSlash: true,

  // Hide the dev-mode indicator at bottom-left.
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
};

export default nextConfig;
