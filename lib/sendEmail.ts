// import * as sgMail from '@sendgrid/mail';


// sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// type SendEmailParams = {
//   to: string;
//   subject: string;
//   html: string;
// };

// export async function sendEmail({ to, subject, html }: SendEmailParams) {
//   await sgMail.send({
//     to,
//     from: {
//       email: process.env.SENDGRID_SENDER_EMAIL!,
//       name: process.env.SENDGRID_SENDER_NAME!,
//     },
//     subject,
//     html,
//   });
// }


// // import sgMail from '@sendgrid/mail';

// // if (!process.env.SENDGRID_API_KEY) {
// //   throw new Error('SENDGRID_API_KEY missing');
// // }

// // sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// // type SendEmailArgs = {
// //   to: string;
// //   subject: string;
// //   text?: string;
// //   html?: string;
// // };

// // export async function sendEmail({
// //   to,
// //   subject,
// //   text,
// //   html,
// // }: SendEmailArgs) {
// //   const msg = {
// //     to,
// //     from: {
// //       email: process.env.SENDGRID_SENDER_EMAIL!,
// //       name: 'Junior Seas',
// //     },
// //     subject,
// //     text,
// //     html,
// //   };

// //   return await sgMail.send(msg);
// // }





import * as sgMail from '@sendgrid/mail';
import type { MailDataRequired } from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

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

  const msg: Partial<MailDataRequired> = {
    to,
    from: {
      email: process.env.SENDGRID_SENDER_EMAIL as string,
      name: process.env.SENDGRID_SENDER_NAME as string,
    },
    subject,
  };

  if (text) {
    msg.text = text;
  }

  if (html) {
    msg.html = html;
  }

  await sgMail.send(msg as MailDataRequired);
}
