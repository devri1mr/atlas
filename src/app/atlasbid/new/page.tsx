'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type BidSettings = {
  id?: string | number
  created_at?: string
  updated_at?: string

  // Common settings your app likely uses — keep flexible
  company_name?: string
  default_division?: string
  default_contingency_pct?: number
  round_to_100?: boolean
  prepay_discount_enabled?: boolean
  prepay_discount_pct?: number
  [key: string]: any
}

type CreateProjectPayload = {
  client_name: string
  project_name?: string
  division?: string
  notes?: string
  source?: string
}

export default function NewAtlasBidPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [settings, setSettings] = useState<BidSettings | null>(null)

  // Minimal inputs for creating a new bid/project
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [division, setDivision] = useState('')
  const [notes, setNotes] = useState('')

  const canSubmit = useMemo(() => {
    return clientName.trim().length > 0 && !saving
  }, [clientName, saving])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)

      try {
        // IMPORTANT:
        // Do NOT import/use supabase client here.
        // Fetch settings via your API route so build-time prerender never evaluates env vars.
        const res = await fetch('/api/atlasbid/bid-settings', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })

        if (!res.ok) {
          const j = await safeJson(res)
          throw new Error(j?.error || `Failed to load bid settings (${res.status})`)
        }

        const data = (await res.json()) as BidSettings

        if (cancelled) return
        setSettings(data || null)

        // Set defaults if present
        if (data?.default_division && !division) setDivision(String(data.default_division))
        if (data?.company_name) {
          // no-op, but available for future UI
        }
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Failed to initialize')
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    if (!canSubmit) return

    setSaving(true)
    setError(null)

    try {
      const payload: CreateProjectPayload = {
        client_name: clientName.trim(),
        project_name: projectName.trim() || undefined,
        division: division.trim() || undefined,
        notes: notes.trim() || undefined,
        source: 'atlasbid/new',
      }

      // Try the likely project-create route first.
      // If your route is different, you can change this ONE endpoint without touching any Supabase logic.
      const res = await fetch('/api/atlasbid/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const j = await safeJson(res)
        throw new Error(j?.error || `Failed to create project (${res.status})`)
      }

      const created = await safeJson(res)

      // If API returns an id, route to it; otherwise fallback to bid list/home
      const newId =
        created?.id ??
        created?.project_id ??
        created?.data?.id ??
        created?.data?.project_id

      if (newId) {
        router.push(`/atlasbid/projects/${newId}`)
      } else {
        router.push('/atlasbid')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '18px 14px' }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}>New Atlas Bid</h1>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
              {loading ? 'Loading settings…' : settings ? 'Ready' : 'Ready (no settings loaded)'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/atlasbid')}
            style={{
              border: '1px solid #e5e7eb',
              background: '#fff',
              borderRadius: 10,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              color: '#9f1239',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field
            label="Client name *"
            value={clientName}
            onChange={setClientName}
            placeholder="e.g., Smith"
          />
          <Field
            label="Project name"
            value={projectName}
            onChange={setProjectName}
            placeholder="e.g., Smith 1"
          />
          <Field
            label="Division"
            value={division}
            onChange={setDivision}
            placeholder="e.g., Landscaping"
          />
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 13, color: '#0f172a', marginBottom: 6 }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional internal notes…"
              rows={4}
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                padding: 10,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleCreate}
            style={{
              border: '1px solid #111827',
              background: canSubmit ? '#111827' : '#94a3b8',
              color: '#fff',
              borderRadius: 10,
              padding: '10px 14px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              minWidth: 160,
            }}
          >
            {saving ? 'Creating…' : 'Create Bid'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: '#0f172a', marginBottom: 6 }}>
        {props.label}
      </label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          padding: '10px 10px',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </div>
  )
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}