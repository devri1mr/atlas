import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const STABILITY_URL = "https://api.stability.ai/v2beta/stable-image/generate/inpaint";
const MONTHLY_LIMIT = 50; // generations per company per calendar month

function align64(n: number) {
  return Math.max(64, Math.round(n / 64) * 64);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const bidId = String(form.get("bid_id") ?? "").trim();
    const prompt = String(form.get("prompt") ?? "").trim();
    const imageFile = form.get("image") as File | null;
    const maskFile = form.get("mask") as File | null;

    if (!bidId || !prompt || !imageFile || !maskFile) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Stability API key not configured" }, { status: 500 });
    }

    const supabase = supabaseAdmin();

    const { data: bid } = await supabase
      .from("bids")
      .select("id, company_id")
      .eq("id", bidId)
      .single();

    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    // Monthly usage check
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const { count } = await supabase
      .from("bid_ai_designs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", bid.company_id)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd);

    if ((count ?? 0) >= MONTHLY_LIMIT) {
      return NextResponse.json(
        { error: `Monthly design limit of ${MONTHLY_LIMIT} reached. Resets on the 1st of next month.` },
        { status: 429 }
      );
    }

    // Resize both image and mask to Stability-friendly dimensions
    const rawImage = Buffer.from(await imageFile.arrayBuffer());
    const rawMask = Buffer.from(await maskFile.arrayBuffer());

    const meta = await sharp(rawImage).metadata();
    const origW = meta.width ?? 1024;
    const origH = meta.height ?? 1024;

    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(origW, origH));
    const targetW = align64(Math.round(origW * scale));
    const targetH = align64(Math.round(origH * scale));

    const [processedImage, processedMask] = await Promise.all([
      sharp(rawImage)
        .resize(targetW, targetH, { fit: "fill" })
        .png()
        .toBuffer(),
      sharp(rawMask)
        .resize(targetW, targetH, { fit: "fill" })
        .greyscale()
        .png()
        .toBuffer(),
    ]);

    // Call Stability AI
    const stabilityForm = new FormData();
    stabilityForm.append("image", new Blob([new Uint8Array(processedImage)], { type: "image/png" }), "image.png");
    stabilityForm.append("mask", new Blob([new Uint8Array(processedMask)], { type: "image/png" }), "mask.png");
    stabilityForm.append("prompt", prompt);
    stabilityForm.append("output_format", "png");
    stabilityForm.append("strength", "0.95");
    stabilityForm.append(
      "negative_prompt",
      "low quality, blurry, distorted, deformed, unrealistic, text, watermark"
    );

    const stabRes = await fetch(STABILITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: stabilityForm,
    });

    const stabJson = await stabRes.json();

    if (!stabRes.ok || !stabJson.image) {
      const msg =
        stabJson.errors?.[0] ??
        stabJson.message ??
        stabJson.name ??
        "Generation failed";
      return NextResponse.json({ error: msg }, { status: stabRes.status });
    }

    // Save result to storage
    const resultBuffer = Buffer.from(stabJson.image, "base64");
    const storagePath = `${bid.company_id}/${bidId}/ai-designs/${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("bid-photos")
      .upload(storagePath, resultBuffer, { contentType: "image/png", upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = await supabase.storage
      .from("bid-photos")
      .createSignedUrl(storagePath, 7200);

    // Record the generation
    const { data: design } = await supabase
      .from("bid_ai_designs")
      .insert({
        bid_id: bidId,
        company_id: bid.company_id,
        refined_prompt: prompt,
        result_storage_path: storagePath,
      })
      .select("id")
      .single();

    return NextResponse.json({
      result_url: urlData?.signedUrl ?? null,
      design_id: design?.id ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
