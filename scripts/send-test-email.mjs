import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'tanerdag1983@gmail.com',
      subject: 'Hello World',
      html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
    });
    console.log('Email sent:', result);
  } catch (error) {
    console.error('Email failed:', error);
    process.exit(1);
  }
}

main();
