import nodemailer from "nodemailer";

import { config } from "../../config";
import { logger } from "../../shared/logger";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = config.smtp;
  if (!host || !port) {
    throw new Error(
      "SMTP not configured (SMTP_HOST, SMTP_PORT). Set env to send mail.",
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure ?? port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  return transporter;
}

export type SendMailInput = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
};

/** Transactional email — password reset, invoice notices, etc. */
export async function sendTransactionalMail(input: SendMailInput): Promise<void> {
  const from = config.smtp.from;
  if (!from) {
    throw new Error("SMTP_FROM is not set");
  }

  const t = getTransporter();
  await t.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  logger.info("Mail sent", { to: input.to, subject: input.subject });
}

export function isEmailConfigured(): boolean {
  const s = config.smtp;
  return Boolean(s.host && s.port && s.from);
}
