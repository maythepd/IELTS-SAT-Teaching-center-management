const config = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: `${process.env.API_UPSTREAM || 'http://localhost:4000'}/api/:path*`
    }];
  }
};
export default config;
