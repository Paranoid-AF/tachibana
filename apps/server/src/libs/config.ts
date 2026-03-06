const DEFAULT_DEV_PORT = 5173
const DEFAULT_PROD_PORT = 13370
const DEFAULT_EXPOSE_TO_NETWORK = false

export const getConfig = async (isDev?: boolean) => {
  const config = {
    server: {
      port: DEFAULT_PROD_PORT,
      hostname: DEFAULT_EXPOSE_TO_NETWORK ? '0.0.0.0' : 'localhost',
    },
  }

  if (isDev) {
    config.server.port = DEFAULT_DEV_PORT
    config.server.hostname = 'localhost'
  }

  return config
}
