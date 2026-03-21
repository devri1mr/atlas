import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { email, full_name, role, invited_by } = body;

  if (!email || !role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Generate invite link without sending Supabase's default email
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name, role } },
  });

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

  const userId = linkData.user.id;
  const inviteUrl = linkData.properties.action_link;

  // Upsert profile
  const { data, error } = await sb
    .from("user_profiles")
    .upsert({ id: userId, email, full_name, role, invited_by: invited_by ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send branded email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const firstName = full_name ? full_name.split(" ")[0] : null;

  const { error: emailErr } = await resend.emails.send({
    from: "Atlas <atlas@interrivus.com>",
    to: email,
    subject: "You've been invited to Atlas",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:40px auto;padding:0 16px 40px;">

    <!-- Card -->
    <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0d2616 0%,#123b1f 50%,#1a5c2a 100%);padding:40px;text-align:center;position:relative;">
        <img src="https://atlas.interrivus.com/atlas-logo.png" alt="Atlas"
          style="width:150px;background:white;padding:10px 16px;border-radius:12px;display:block;margin:0 auto;" />
      </div>

      <!-- Body -->
      <div style="padding:40px;text-align:center;">
        <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#0d1e10;letter-spacing:-0.3px;">
          ${firstName ? `Hey ${firstName}, you're in.` : "You've been invited."}
        </h1>
        <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.65;">
          You've been added to <strong style="color:#111;">Atlas</strong> — the operations platform for Garpiel Group.
          Click below to set up your account and get started.
        </p>

        <a href="${inviteUrl}"
          style="display:inline-block;background:#16a34a;color:white;font-weight:600;font-size:15px;padding:15px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.01em;">
          Accept Invitation →
        </a>

        <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
          This invitation link expires in 24 hours.<br/>
          If you weren't expecting this, you can safely ignore this email.
        </p>
      </div>

      <!-- Divider -->
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(90,140,190,0.2),transparent);margin:0 40px;"></div>

      <!-- Footer -->
      <div style="padding:20px 40px;text-align:center;">
        <span style="font-size:11px;color:#9ca3af;">© InterRivus Systems</span>
      </div>

    </div>
  </div>
</body>
</html>`,
  });

  if (emailErr) {
    console.error("Resend error:", emailErr);
    return NextResponse.json({ data, emailWarning: emailErr.message }, { status: 200 });
  }

  return NextResponse.json({ data });
}
