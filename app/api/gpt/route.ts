import { NextResponse } from "next/server";
import { getGPTResponse } from "@/lib/gpt";

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json(
        { error: "No prompt provided" },
        { status: 400 }
      );
    }
    const message = await getGPTResponse(prompt);
    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("GPT API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
