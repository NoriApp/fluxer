import { AzuraServer } from "azurajs";

const app = new AzuraServer({
  environment: "production",
  server: {
    port: 8080,
    host: "0.0.0.0",
    keepAliveTimeout: 72000,
  },
  logging: {
    level: "warn",
    requestLogging: true,
  },
  debug: false,
});