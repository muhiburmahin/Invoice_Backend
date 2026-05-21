import { z } from "zod";

import { paginationQuerySchema } from "../shared/pagination";

export { paginationQuerySchema };

export const idParamSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const cuidParamSchema = z.object({
  id: z.string().cuid("Invalid id"),
});
