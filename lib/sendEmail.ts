import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY as string);

type SendEmailParams = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailParams) {
  if (!text && !html) {
    throw new Error('sendEmail requires either text or html');
  }

  // Sender address — reuses the existing SENDGRID_SENDER_* values (they still
  // hold orders@juniorseastech.com / the store name); MAIL_FROM_* override if set.
  const fromEmail =
    process.env.MAIL_FROM_EMAIL ?? process.env.SENDGRID_SENDER_EMAIL;
  const fromName =
    process.env.MAIL_FROM_NAME ??
    process.env.SENDGRID_SENDER_NAME ??
    'Junior Seas Technologies';

  const payload: any = {
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;

  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
