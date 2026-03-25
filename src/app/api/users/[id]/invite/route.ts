import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { inviteEmailHtml } from "../../route";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: profile, error: profileErr } = await sb
    .from("user_profiles")
    .select("email, full_name")
    .eq("id", id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Generate a recovery link — for users who haven't set a password this acts as an invite
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "recovery",
    email: profile.email,
  });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

  const inviteUrl = linkData.properties.action_link;
  const firstName = profile.full_name ? profile.full_name.split(" ")[0] : null;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailErr } = await resend.emails.send({
    from: "Atlas <atlas@interrivus.com>",
    to: profile.email,
    subject: "You've been invited to Atlas",
    html: inviteEmailHtml(inviteUrl, firstName),
  });

  if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 });

  await sb.from("user_profiles").update({ invite_sent: true }).eq("id", id);

  return NextResponse.json({ ok: true });
}
