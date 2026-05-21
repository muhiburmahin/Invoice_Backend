import IORedis from "ioredis";

import { config } from "../config";
import { logger } from "../shared/logger";

let connection: IORedis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(config.redisUrl?.trim());
}

export function getRedisConnection(): IORedis {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!connection) {
    connection = new IORedis(config.redisUrl!, {
      maxRetriesPerRequest: null,
    });

    connection.on("error", (error) => {
      logger.error("Redis connection error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (!connection) return;

  await connection.quit();
  connection = null;
}
