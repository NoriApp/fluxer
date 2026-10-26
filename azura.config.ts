import type { AzuraConfig } from "azurajs/types";

const config: AzuraConfig = {
  environment: "production",
  server: {
    port: 8080,
    host: "0.0.0.0",
  },
  logging: {
    level: "warn",
    requestLogging: true,
    timestamp: true,
    colors: true,
  },
  debug: false,
};

export default config;