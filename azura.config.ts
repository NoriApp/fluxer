import type { AzuraConfig } from 'azurajs/types';
import config from '#nori/config/default.config.js';

const config: AzuraConfig = {
  environment: 'production',
  server: {
    port: config.api.port,
    host: config.api.host,
    keepAliveTimeout: 72000,
  },
  logging: {
    enabled: false,
    level: 'silent',
    timestamp: false,
    colors: false,
    requestLogging: false,
  },
  debug: false,
};

export default config;