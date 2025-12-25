// export const runtime = 'nodejs';

// import { NextResponse } from 'next/server';
// import * as sgMail from '@sendgrid/mail';

// export async function GET() {
//   try {
//     console.log('🟡 TEST EMAIL ROUTE HIT');
// console.log('KEY EXISTS:', !!process.env.SENDGRID_API_KEY);
// console.log('SENDER:', process.env.SENDGRID_SENDER_EMAIL);

//     sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

//     const result = await sgMail.send({
//       to: 'juniorseastechnologies@gmail.com', // SEND TO YOURSELF
//       from: {
//         email: process.env.SENDGRID_SENDER_EMAIL!,
//         name: 'Junior Seas Test',
//       },
//       subject: 'SendGrid Test Email',
//       text: 'If you received this, SendGrid works.',
//     });

//     console.log('🟢 SENDGRID RESPONSE:', result);

//     return NextResponse.json({ success: true });
//   } catch (err: any) {
//     console.error('🔴 SENDGRID ERROR:', err);
//     return NextResponse.json(
//       { error: err.message, details: err },
//       { status: 500 }
//     );
//   }
// }



//TO BE DELETED - TESTING ONLY======================================