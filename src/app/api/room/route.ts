import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { data, error } = await supabase.from("rooms").insert({}).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const id = data!.id as string;

  // ALWAYS use the host that handled this request (works on Vercel and locally)
  const { protocol, host } = new URL(req.url);
  const base = `${protocol}//${host}`;

  return NextResponse.json({
    id,
    joinUrl: `${base}/room/${id}`,
    spectateUrl: `${base}/vote/${id}`,
  });
}
