import "dotenv/config";

import { toNodeHandler } from "better-auth/node";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./app/config";
import { corsOptions } from "./app/lib/cors";
import { auth } from "./app/lib/auth";
import {
  globalErrorHandler,
  notFound,
  requestId,
  requestTimeout,
  workspaceContext,
} from "./app/middlewares";
import { systemRouter } from "./app/routes/system.routes";
import { v1Router } from "./app/routes";
import { stripeWebhookHandler } from "./app/routes/v1/billing.routes";
import { catchAsync } from "./app/shared/catchAsync";
import { sendSuccess } from "./app/shared/sendResponse";

const app = express();

if (config.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestId);
app.use(workspaceContext);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors(corsOptions));
app.use(compression());

morgan.token("request-id", (req: Request) => req.requestId ?? "-");
app.use(
  morgan(
    ":request-id :remote-addr :method :url :status :res[content-length] - :response-time ms",
    {
      skip: () => config.isTest,
    },
  ),
);

app.use(cookieParser());
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.post(
  "/api/v1/billing/webhook/stripe",
  express.raw({ type: "application/json" }),
  catchAsync(stripeWebhookHandler),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(requestTimeout());

app.use("/health", systemRouter);

app.use(
  "/api",
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.nodeEnv === "development" ? 2000 : config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl.startsWith("/api/auth"),
  }),
);

app.get("/", (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Invoice API", version: "1.0.0" });
});

app.use("/api/v1", v1Router);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
