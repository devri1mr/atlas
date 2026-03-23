import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "No description provided" }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 200,
      system: `You are an expert at writing prompts for Stability AI image inpainting in the context of professional landscape design and outdoor spaces.

The user has painted over a specific area of a property photo and wants to visualize a design change there.
Convert their description into a precise, photorealistic inpainting prompt optimized for Stability AI.

Guidelines:
- Be specific about plants, materials, textures, and features
- Include lighting and seasonal context if relevant
- Use professional landscape design vocabulary
- Emphasize photorealism and high quality
- Keep under 250 characters

Output ONLY the refined prompt — no explanation, no quotes, no prefix.`,
      messages: [{ role: "user", content: description }],
    });

    const refined = (message.content[0] as any).text?.trim() ?? "";
    return NextResponse.json({ refined });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
