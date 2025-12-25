// // app/api/send-order-email/route.ts
// export const runtime = 'nodejs';

// import { NextResponse } from 'next/server';
// import { supabaseServer } from '@/lib/supabaseServer';
// import { sendEmail } from '@/lib/sendEmail';

// export async function POST(req: Request) {
//   try {
//     const { order_ref } = await req.json();

//     if (!order_ref) {
//       return NextResponse.json(
//         { error: 'order_ref required' },
//         { status: 400 }
//       );
//     }

//     const { data: order, error } = await supabaseServer
//       .from('orders')
//       .select('*')
//       .eq('order_ref', order_ref)
//       .single();

//     if (error || !order) {
//       return NextResponse.json(
//         { error: 'Order not found' },
//         { status: 404 }
//       );
//     }

//     const emailBody = `
// Hello ${order.billing?.firstName || 'Customer'},

// Thank you for your order ${order.order_ref}.

// Amount: ₦${(order.amount / 100).toLocaleString()}

// Items:
// ${order.items.map((i: any) => `- ${i.name} x ${i.quantity}`).join('\n')}

// We will notify you once your order ships.

// — Junior Seas
// `;

//     console.log('📩 Sending order email to:', order.billing.email);

//     await sendEmail({
//       to: order.billing.email,
//       subject: `Order Confirmation — ${order.order_ref}`,
//       text: emailBody,
//     });

//     console.log('✅ Order email sent successfully');

//     return NextResponse.json({ success: true });
//   } catch (err: any) {
//     console.error('❌ SEND ORDER EMAIL ERROR:', err);

//     return NextResponse.json(
//       { success: false, error: err.message },
//       { status: 500 }
//     );
//   }
// }

//
//TO BE DELETED - TESTING ONLY======================================