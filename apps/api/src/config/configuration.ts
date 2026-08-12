export default () => ({
  port: parseInt(process.env.API_PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    uri: process.env.MONGODB_URI,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  aiEngine: {
    url: process.env.AI_ENGINE_URL || 'http://localhost:8000',
  },
  localAi: {
    enabled: process.env.LOCAL_AI_ENABLED === 'true',
    engine: process.env.LOCAL_AI_ENGINE || 'llamacpp',
    baseUrl: process.env.LOCAL_AI_BASE_URL || 'http://localhost:8080',
    model: process.env.LOCAL_AI_MODEL || '',
  },
});
