import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Safely create Supabase client at runtime
 * (Prevents build-time crashes in Next 16 / Turbopack)
 */
function getSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseKey)
}

/**
 * GET — Fetch bid settings
 */
export async function GET() {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('bid_settings')
      .select('*')
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}

/**
 * POST — Update bid settings
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('bid_settings')
      .upsert(body)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}