export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function NewAtlasBidPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        console.error('Supabase not initialized')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error(error.message)
        setLoading(false)
        return
      }

      if (!data.session) {
        router.push('/login')
        return
      }

      setUserEmail(data.session.user.email ?? null)
      setLoading(false)
    }

    checkSession()
  }, [router])

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Loading...</h1>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create New Atlas Bid</h1>

      {userEmail && (
        <p className="mb-6 text-sm text-gray-600">
          Signed in as {userEmail}
        </p>
      )}

      <div className="border p-4 rounded-lg">
        <p className="text-gray-700">
          Bid creation form goes here.
        </p>
      </div>
    </div>
  )
}