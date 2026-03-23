import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export const runtime = "nodejs";

const BUCKET = "takeoff-plans";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmpPdf  = join(tmpdir(), `takeoff-${id}.pdf`);
  const tmpBase = join(tmpdir(), `takeoff-${id}-render`);
  const tmpJpg  = join(tmpdir(), `takeoff-${id}.jpg`);

  try {
    const sb = supabaseAdmin();
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_storage_path")
      .eq("id", id)
      .single();
    if (te || !takeoff?.plan_storage_path)
      return NextResponse.json({ error: "No plan uploaded yet" }, { status: 400 });

    const path = takeoff.plan_storage_path as string;

    // Images don't need rendering — return public URL directly
    if (!path.toLowerCase().endsWith(".pdf")) {
      const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
      await sb.from("takeoffs").update({ plan_image_path: path }).eq("id", id);
      return NextResponse.json({ imageUrl: urlData?.publicUrl ?? null, imagePath: path });
    }

    // Download PDF from Supabase storage
    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(path);
    if (fe || !fileData) return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 });

    writeFileSync(tmpPdf, Buffer.from(await fileData.arrayBuffer()));

    // Render first page to PPM at 200dpi
    execSync(`pdftoppm -r 200 -f 1 -l 1 "${tmpPdf}" "${tmpBase}"`, { timeout: 30000 });

    // Find the output PPM file (pdftoppm names it with page number suffix)
    const dir = tmpdir();
    const prefix = `takeoff-${id}-render-`;
    const ppmFiles = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith(".ppm"));
    if (ppmFiles.length === 0) return NextResponse.json({ error: "PDF render produced no output" }, { status: 500 });
    const tmpPpm = join(dir, ppmFiles[0]);

    // Convert PPM → JPEG using sips (macOS built-in)
    execSync(`sips -s format jpeg "${tmpPpm}" --out "${tmpJpg}"`, { timeout: 15000 });

    const imgBuf = readFileSync(tmpJpg);

    // Upload rendered JPEG to storage alongside PDF
    const imgPath = path.replace(/\.pdf$/i, "-rendered.jpg");
    const { error: ue } = await sb.storage.from(BUCKET).upload(imgPath, imgBuf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    await sb.from("takeoffs").update({ plan_image_path: imgPath }).eq("id", id);

    const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(imgPath);
    return NextResponse.json({ imageUrl: urlData?.publicUrl, imagePath: imgPath });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    const dir = tmpdir();
    const prefix = `takeoff-${id}-render-`;
    try { readdirSync(dir).filter(f => f.startsWith(prefix)).forEach(f => unlinkSync(join(dir, f))); } catch {}
    for (const f of [tmpPdf, tmpJpg]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
  }
}
