import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST() {
  const { data, error } = await supabase
    .from('rooms')
    .insert({})
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const id = data!.id as string;
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  return NextResponse.json({
    id,
    joinUrl: `${base}/room/${id}`,
    spectateUrl: `${base}/vote/${id}`
  });
}
