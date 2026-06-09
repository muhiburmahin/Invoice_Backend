import type { RequestHandler } from "express";

import { ApiError } from "../../errors/ApiError";
import { getValidatedQuery } from "../../middlewares/validateRequest";
import { catchAsync } from "../../shared/catchAsync";
import { sendSuccess } from "../../shared/sendResponse";

import {
  createClient,
  deleteClient,
  getClientDetail,
  getClientStats,
  listClients,
  regeneratePortalToken,
  restoreClient,
  updateClient,
  updateClientStatus,
} from "./client.service";

function getUserId(req: Parameters<RequestHandler>[0]): string {
  const id = req.auth?.user?.id;
  if (!id) {
    throw new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  return id;
}

/** Express 5 returns `string | string[]` for route params. Always coerce. */
function getParamId(req: Parameters<RequestHandler>[0]): string {
  const raw = req.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new ApiError(400, "Client id is required", { code: "MISSING_PARAM" });
  }
  return value;
}

export const listClientsHandler: RequestHandler = catchAsync(async (req, res) => {
  const { rows, meta } = await listClients(
    getUserId(req),
    getValidatedQuery<Parameters<typeof listClients>[1]>(req),
  );
  sendSuccess(res, { clients: rows }, 200, meta);
});

export const clientStatsHandler: RequestHandler = catchAsync(async (req, res) => {
  const stats = await getClientStats(getUserId(req));
  sendSuccess(res, { stats });
});

export const createClientHandler: RequestHandler = catchAsync(async (req, res) => {
  const result = await createClient(req, getUserId(req), req.body);
  sendSuccess(
    res,
    {
      client: result.client,
      restored: result.restored,
      message: result.restored
        ? "Client restored and updated successfully"
        : "Client created successfully",
    },
    201,
  );
});

export const getClientHandler: RequestHandler = catchAsync(async (req, res) => {
  const data = await getClientDetail(getUserId(req), getParamId(req));
  sendSuccess(res, data);
});

export const updateClientHandler: RequestHandler = catchAsync(async (req, res) => {
  const client = await updateClient(
    req,
    getUserId(req),
    getParamId(req),
    req.body,
  );
  sendSuccess(res, { client, message: "Client updated successfully" });
});

export const updateClientStatusHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const client = await updateClientStatus(
      req,
      getUserId(req),
      getParamId(req),
      req.body,
    );
    sendSuccess(res, {
      client,
      message: req.body.isActive
        ? "Client has been activated"
        : "Client has been deactivated",
    });
  },
);

export const deleteClientHandler: RequestHandler = catchAsync(async (req, res) => {
  await deleteClient(req, getUserId(req), getParamId(req));
  sendSuccess(res, { message: "Client deleted successfully" });
});

export const restoreClientHandler: RequestHandler = catchAsync(async (req, res) => {
  const client = await restoreClient(req, getUserId(req), getParamId(req));
  sendSuccess(res, { client, message: "Client restored successfully" });
});

export const regeneratePortalTokenHandler: RequestHandler = catchAsync(
  async (req, res) => {
    const result = await regeneratePortalToken(
      req,
      getUserId(req),
      getParamId(req),
    );
    sendSuccess(res, {
      portalToken: result.portalToken,
      message: "Portal token regenerated successfully",
    });
  },
);
