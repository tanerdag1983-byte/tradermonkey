import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/resend/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, subject, html, text, from } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    const result = await sendEmail({ to, subject, html, text, from });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to send email', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[api/send-email] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
