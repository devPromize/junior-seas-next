// app/api/orders/create/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendOrderEmails } from '@/lib/SendOrderEmails';
import { generateOrderRef, koboToNaira } from '@/lib/payments';
import { createOrderSchema } from '@/lib/validation';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate the untrusted request body (shape, valid email, positive amount,
    // at least one item) before touching the database.
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: 'Invalid order data',
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }

    const {
      billing,
      shipping,
      items,
      amount,
      currency = 'NGN',
      user_id,
    } = parsed.data;

    const order_ref = generateOrderRef();

    // 1️⃣ Create order
    const { data: order, error } = await supabaseServer
      .from('orders')
      .insert({
        user_id,
        order_ref,
        billing,
        shipping,
        items,
        amount, // kobo
        currency,
        payment_status: 'pending',
      })
      .select()
      .single();

    if (error || !order) {
      console.error(error);
      return NextResponse.json(
        { message: 'Failed to create order' },
        { status: 500 }
      );
    }

    // 2️⃣ Send email (non-blocking)
    // try {
    //   await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/orders/email`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       order_ref: order.order_ref,
    //       customer_email: billing.email,
    //       customer_name: billing.full_name || billing.name || 'Customer',
    //       billing,
    //       shipping,
    //       items,
    //       total_amount: amount / 100,
    //     }),
    //   });
    // } catch (emailErr) {
    //   console.error('Email failed:', emailErr);
    // }

    // after order is created successfully

try {
  await sendOrderEmails({
    order_ref: order.order_ref,
    customer_email: billing.email,
    customer_name: billing.full_name || billing.name || 'Customer',
    items,
    total_amount: koboToNaira(amount),
  });
} catch (emailErr) {
  console.error('Order email failed:', emailErr);
}


    return NextResponse.json({
      order_ref: order.order_ref,
      order_id: order.id,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { message: err.message || 'Server error' },
      { status: 500 }
    );
  }
}







// // app/api/orders/create/route.ts
// import { NextResponse } from 'next/server';
// import { supabaseServer } from '@/lib/supabaseServer';

// function generateOrderRef() {
//   return `JS-${Math.floor(100000 + Math.random() * 900000)}-${new Date().getFullYear()}`;
// }

// export async function POST(req: Request) {
//   try {
//     const body = await req.json();
//     const { billing, shipping, items, amount, currency = 'NGN', user_id } = body;

//     if (!billing || !items || !amount) {
//       return NextResponse.json(
//         { message: 'Missing required fields' },
//         { status: 400 }
//       );
//     }

//     const order_ref = generateOrderRef();

//     // 1️⃣ CREATE ORDER
//     const { data: order, error } = await supabaseServer
//       .from('orders')
//       .insert({
//         user_id,
//         order_ref,
//         billing,
//         shipping,
//         items,
//         amount, // kobo
//         currency,
//         payment_status: 'pending',
//       })
//       .select()
//       .single();

//     if (error || !order) {
//       console.error(error);
//       return NextResponse.json(
//         { message: 'Failed to create order' },
//         { status: 500 }
//       );
//     }

//     // 2️⃣ SEND EMAILS (SERVER → SERVER)
//     // fire-and-forget, but safe
//     try {
//       await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/orders/email`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           order_ref: order.order_ref,
//           customer_email: billing.email,
//           customer_name: billing.full_name || billing.name || 'Customer',
//           items: items,
//           total_amount: amount / 100, // convert kobo → naira
//         }),
//       });
//     } catch (emailErr) {
//       // ⚠️ DO NOT fail order if email fails
//       console.error('Order created but email failed:', emailErr);
//     }

//     // 3️⃣ RETURN SUCCESS
//     return NextResponse.json({
//       order_ref: order.order_ref,
//       order_id: order.id,
//     });
//   } catch (err: any) {
//     console.error(err);
//     return NextResponse.json(
//       { message: err.message || 'Server error' },
//       { status: 500 }
//     );
//   }
// }
