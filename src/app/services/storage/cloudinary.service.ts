import { v2 as cloudinary } from "cloudinary";

import { config } from "../../config";
import { logger } from "../../shared/logger";

let configured = false;

function ensureConfigured(): void {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)",
    );
  }
  if (!configured) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    configured = true;
  }
}

export type UploadBufferInput = {
  buffer: Buffer;
  folder?: string;
  publicId?: string;
};

/** SaaS file storage — invoices/logos. Throws if env vars missing. */
export async function uploadBuffer(
  input: UploadBufferInput,
): Promise<{ url: string; publicId: string }> {
  ensureConfigured();

  const result = await new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: input.folder,
        public_id: input.publicId,
        resource_type: "auto",
      },
      (err, res) => {
        if (err || !res) reject(err ?? new Error("Upload failed"));
        else resolve({ secure_url: res.secure_url, public_id: res.public_id });
      },
    );
    stream.end(input.buffer);
  });

  logger.debug(`Cloudinary upload ok: ${result.public_id}`);
  return { url: result.secure_url, publicId: result.public_id };
}

export function isStorageConfigured(): boolean {
  const c = config.cloudinary;
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}
