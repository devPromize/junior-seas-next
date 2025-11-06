import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { name, email, message } = data;

    console.log("📩 New contact form submission:");
    console.log("Name:", name);
    console.log("Email:", email);
    console.log("Message:", message);

    // Simulate a short delay (like a real email send)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Respond with success message
    return NextResponse.json(
      { success: true, message: "Message received successfully (mock)" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in contact form API:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong" },
      { status: 500 }
    );
  }
}
