import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export const runtime = "nodejs";

const BUCKET = "takeoff-plans";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tmpPdf  = join(tmpdir(), `takeoff-${params.id}.pdf`);
  const tmpBase = join(tmpdir(), `takeoff-${params.id}-render`);
  const tmpPng  = `${tmpBase}-1.ppm`;
  const tmpJpg  = join(tmpdir(), `takeoff-${params.id}.jpg`);

  try {
    const sb = supabaseAdmin();
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_storage_path")
      .eq("id", params.id)
      .single();
    if (te || !takeoff?.plan_storage_path)
      return NextResponse.json({ error: "No plan uploaded yet" }, { status: 400 });

    const path = takeoff.plan_storage_path as string;

    // Only re-render PDFs; images are already usable
    if (!path.endsWith(".pdf")) {
      const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
      return NextResponse.json({ imageUrl: urlData?.publicUrl ?? null, imagePath: path });
    }

    // Download PDF from Supabase storage
    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(path);
    if (fe || !fileData) return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    writeFileSync(tmpPdf, buf);

    // Render first page to PPM at 200dpi
    execSync(`pdftoppm -r 200 -f 1 -l 1 "${tmpPdf}" "${tmpBase}"`, { timeout: 30000 });

    // Convert PPM → JPEG using sips (macOS) or fallback to ppm rename
    let imgBuf: Buffer;
    if (existsSync(tmpPng)) {
      try {
        execSync(`sips -s format jpeg "${tmpPng}" --out "${tmpJpg}"`, { timeout: 10000 });
        imgBuf = readFileSync(tmpJpg);
      } catch {
        imgBuf = readFileSync(tmpPng);
      }
    } else {
      return NextResponse.json({ error: "PDF render failed — no output file" }, { status: 500 });
    }

    // Store rendered image alongside PDF
    const imgPath = path.replace(/\.pdf$/i, "-rendered.jpg");
    const { error: ue } = await sb.storage.from(BUCKET).upload(imgPath, imgBuf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    // Save image path to takeoff record
    await sb.from("takeoffs").update({ plan_image_path: imgPath }).eq("id", params.id);

    const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(imgPath);
    return NextResponse.json({ imageUrl: urlData?.publicUrl, imagePath: imgPath });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    for (const f of [tmpPdf, tmpPng, tmpJpg]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
  }
}
