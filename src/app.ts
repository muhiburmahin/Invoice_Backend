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
import { requestId, globalErrorHandler, notFound } from "./app/middlewares";
import { apiRouter } from "./app/routes";
import { auth } from "./app/lib/auth";
import { sendSuccess } from "./app/shared/sendResponse";

const app = express();

app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);
app.use(compression());
app.use(morgan(config.isProduction ? "combined" : "dev"));
app.use(cookieParser());
app.all("/api/auth/{*any}", toNodeHandler(auth));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl.startsWith("/api/auth"),
  }),
);

app.get("/", (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Invoice API", version: "1.0.0" });
});

app.get("/health", (_req: Request, res: Response) => {
  sendSuccess(res, { status: "ok", message: "Server is running" });
});

app.use("/api", apiRouter);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
