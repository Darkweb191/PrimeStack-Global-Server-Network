import pino from "pino";
import { config } from "../config/index.js";

const isDev = config.app.env === "development";

export const logger = pino({
  level: config.app.logLevel,
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: config.app.name,
    env: config.app.env,
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        "content-type": req.headers?.["content-type"],
        "accept-language": req.headers?.["accept-language"],
      },
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export type Logger = typeof logger;
