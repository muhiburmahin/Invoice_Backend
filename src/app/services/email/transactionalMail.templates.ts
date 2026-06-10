/** Brand-aligned HTML for auth & system transactional emails. */

const BRAND = {
  primary: "#0F766E",
  primaryDark: "#115E59",
  accent: "#0891B2",
  surface: "#F0FDFA",
  border: "#CCFBF1",
  text: "#0F172A",
  muted: "#64748B",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ActionEmailInput = {
  recipientName: string;
  headline: string;
  previewText: string;
  bodyParagraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footerNote: string;
  secondaryNote?: string;
};

function buildActionEmailHtml(input: ActionEmailInput): string {
  const name = escapeHtml(input.recipientName || "there");
  const headline = escapeHtml(input.headline);
  const preview = escapeHtml(input.previewText);
  const actionLabel = escapeHtml(input.actionLabel);
  const actionUrl = escapeHtml(input.actionUrl);
  const footerNote = escapeHtml(input.footerNote);
  const secondaryNote = input.secondaryNote
    ? escapeHtml(input.secondaryNote)
    : "";

  const paragraphs = input.bodyParagraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(p)}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              <div style="display:inline-block;padding:10px 16px;border-radius:12px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.accent});color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.03em;">
                Invoice<span style="opacity:0.9;">.</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,118,110,0.08);">
              <div style="height:4px;background:linear-gradient(90deg,${BRAND.primary},${BRAND.accent});"></div>
              <div style="padding:32px 28px;">
                <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.text};">${headline}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${BRAND.muted};">Hi ${name},</p>
                ${paragraphs}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
                  <tr>
                    <td align="center" style="border-radius:10px;background:${BRAND.primary};">
                      <a href="${actionUrl}" target="_blank" rel="noopener noreferrer"
                         style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                        ${actionLabel}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
                  Or copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${actionUrl}" style="color:${BRAND.accent};text-decoration:underline;">${actionUrl}</a>
                </p>
                <div style="padding:14px 16px;border-radius:10px;background:${BRAND.surface};border:1px solid ${BRAND.border};">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${footerNote}</p>
                  ${secondaryNote ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${secondaryNote}</p>` : ""}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};">
                Sent by <strong style="color:${BRAND.primaryDark};">Invoice</strong> — invoices, clients &amp; payments in one place.
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                You received this email because an action was requested on your account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildActionEmailText(input: ActionEmailInput): string {
  const lines = [
    input.headline,
    "",
    `Hi ${input.recipientName || "there"},`,
    "",
    ...input.bodyParagraphs,
    "",
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    input.footerNote,
  ];
  if (input.secondaryNote) {
    lines.push("", input.secondaryNote);
  }
  lines.push("", "— Invoice");
  return lines.join("\n");
}

export function buildVerifyEmailContent(input: {
  recipientName: string;
  verifyUrl: string;
}): { html: string; text: string; subject: string } {
  const payload: ActionEmailInput = {
    recipientName: input.recipientName,
    headline: "Verify your email address",
    previewText: "Confirm your email to unlock your Invoice workspace.",
    bodyParagraphs: [
      "Welcome to Invoice! You're one step away from creating professional invoices, managing clients, and tracking payments.",
      "Please confirm that this email address belongs to you by clicking the button below.",
    ],
    actionLabel: "Verify email address",
    actionUrl: input.verifyUrl,
    footerNote: "This verification link expires in 24 hours.",
    secondaryNote:
      "If you did not create an Invoice account, you can safely ignore this email.",
  };

  return {
    subject: "Verify your Invoice email",
    html: buildActionEmailHtml(payload),
    text: buildActionEmailText(payload),
  };
}

export function buildResetPasswordEmailContent(input: {
  recipientName: string;
  resetUrl: string;
}): { html: string; text: string; subject: string } {
  const payload: ActionEmailInput = {
    recipientName: input.recipientName,
    headline: "Reset your password",
    previewText: "Use the link below to set a new Invoice password.",
    bodyParagraphs: [
      "We received a request to reset the password for your Invoice account.",
      "Click the button below to choose a new password. For your security, this link can only be used once.",
    ],
    actionLabel: "Reset password",
    actionUrl: input.resetUrl,
    footerNote: "This password reset link expires in 1 hour.",
    secondaryNote:
      "If you did not request a password reset, you can safely ignore this email. Your password will stay the same.",
  };

  return {
    subject: "Reset your Invoice password",
    html: buildActionEmailHtml(payload),
    text: buildActionEmailText(payload),
  };
}
