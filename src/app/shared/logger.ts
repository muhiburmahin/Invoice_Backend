import { createLogger, format, transports } from "winston";

import { config } from "../config";

const { printf, colorize } = format;

const logFormat = printf(({ level, message, time, ...meta }) => {
  const extra =
    Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  return `${time} [${level}] ${message}${extra}`;
});

export const logger = createLogger({
  level:
    config.logLevel ?? (config.isProduction ? "info" : "debug"),
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat,
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        colorize(),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        logFormat,
      ),
    }),
  ],
});
