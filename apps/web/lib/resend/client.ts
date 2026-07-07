import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

let resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendApiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable');
  }
  if (!resend) {
    resend = new Resend(resendApiKey);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const client = getResendClient();
  const { to, subject, html, text, from = resendFromEmail } = options;

  try {
    const result = await client.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('[resend] Failed to send email:', error);
    return { success: false, error };
  }
}
