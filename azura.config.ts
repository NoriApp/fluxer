import type { ConfigTypes } from "azurajs/config";

const config: ConfigTypes = {
  environment: "production",
  server: {
    port: 8080,
    cluster: false,
    ipHost: true,
  },
  logging: {
    enabled: true,
    showDetails: false,
  },
  plugins: {
    cors: {
      enabled: true,
      origins: ["*"],
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  },
};

export default config;