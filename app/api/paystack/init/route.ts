
// import { NextResponse } from 'next/server';
// import { supabaseServer } from '@/lib/supabaseServer';

// export async function POST(req: Request) {
//   try {
//     const { order_ref } = await req.json();

//     if (!order_ref) {
//       return NextResponse.json(
//         { message: 'Order reference required' },
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
//         { message: 'Order not found' },
//         { status: 404 }
//       );
//     }

//     if (order.payment_status === 'paid') {
//       return NextResponse.json(
//         { message: 'Order already paid' },
//         { status: 400 }
//       );
//     }

//     const paystackRes = await fetch(
//       'https://api.paystack.co/transaction/initialize',
//       {
//         method: 'POST',
//         headers: {
//           Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           reference: order.order_ref,
//           amount: order.amount, // kobo from DB
//           email: order.billing.email || 'test@example.com',
//           callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${order.order_ref}/verify`,

//         }),
//       }
//     );

//     // const data = await paystackRes.json();

//     // if (!data.status) {
//     //   return NextResponse.json(
//     //     { message: 'Paystack init failed' },
//     //     { status: 500 }
//     //   );
//     // }

// const data = await paystackRes.json();

// console.log('PAYSTACK INIT RESPONSE:', data);

// if (!data.status) {
//   return NextResponse.json(
//     {
//       message: data.message,
//       paystack: data,
//     },
//     { status: 500 }
//   );
// }


//     return NextResponse.json({
//       authorization_url: data.data.authorization_url,
//     });
//   } catch (err: any) {
//     return NextResponse.json(
//       { message: err.message },
//       { status: 500 }
//     );
//   }
// }







// import { NextResponse } from 'next/server';
// import { supabaseServer } from '@/lib/supabaseServer';

// export async function POST(req: Request) {
//   try {
//     const { order_ref } = await req.json();

//     if (!order_ref) {
//       return NextResponse.json(
//         { message: 'Order reference required' },
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
//         { message: 'Order not found' },
//         { status: 404 }
//       );
//     }

//     if (order.payment_status === 'paid') {
//       return NextResponse.json(
//         { message: 'Order already paid' },
//         { status: 400 }
//       );
//     }

//     const paystackRes = await fetch(
//       'https://api.paystack.co/transaction/initialize',
//       {
//         method: 'POST',
//         headers: {
//           Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           reference: order.order_ref,
//           amount: order.amount, // must be in kobo
//           email: order.billing?.email,
//           callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${order.order_ref}/verify`,
//         }),
//       }
//     );

//     const data = await paystackRes.json();

//     console.log('PAYSTACK INIT RESPONSE:', data);

//     if (!data.status) {
//       return NextResponse.json(
//         { message: data.message, paystack: data },
//         { status: 500 }
//       );
//     }

//     return NextResponse.json({
//       authorization_url: data.data.authorization_url,
//     });
//   } catch (err: any) {
//     return NextResponse.json(
//       { message: err.message },
//       { status: 500 }
//     );
//   }
// }








import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const { order_ref } = await req.json();

    if (!order_ref) {
      return NextResponse.json(
        { message: 'Order reference required' },
        { status: 400 }
      );
    }

    const { data: order, error } = await supabaseServer
      .from('orders')
      .select('*')
      .eq('order_ref', order_ref)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { message: 'Order already paid' },
        { status: 400 }
      );
    }

    const paystackRes = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: order.order_ref,
          amount: order.amount,
          email: order.billing.email,
          callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/paystack/verify`,
        }),
      }
    );

    const data = await paystackRes.json();

    console.log('PAYSTACK INIT RESPONSE:', data);

    if (!data.status) {
      return NextResponse.json(
        { message: data.message, paystack: data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message },
      { status: 500 }
    );
  }
}
