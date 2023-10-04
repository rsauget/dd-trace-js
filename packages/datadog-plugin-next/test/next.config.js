module.exports = {
  eslint: {
    ignoreDuringBuilds: true
  },
  output: 'standalone',
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, resource => {
        resource.request = resource.request.replace(/^node:/, '')
      })
    )
    config.resolve.preferRelative = true
    return config
  }
}
