import nodemailer from "nodemailer";

/**
 * Sends an email via plain SMTP. Configure with:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 * These work as-is with AWS SES's SMTP interface (generate SMTP
 * credentials in the SES console) or any other SMTP provider (Resend,
 * SendGrid, etc. all offer an SMTP endpoint too).
 *
 * If SMTP isn't configured yet, this logs instead of throwing — so store
 * signup and other flows that trigger a notification never break just
 * because email delivery isn't wired up yet.
 */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    console.warn("Email not sent (SMTP not configured):", params.subject, "->", params.to);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html
    });
    return true;
  } catch (err) {
    console.error("sendEmail failed", err);
    return false; // non-fatal — the calling route should still succeed
  }
}
