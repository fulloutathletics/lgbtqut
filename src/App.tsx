import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking')

  useEffect(() => {
    supabase.auth.getSession()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <main style={{ padding: 24, fontFamily: 'Outfit, sans-serif' }}>
      <h1>LGBTQ.UT</h1>
      <p>Supabase: {status}</p>
    </main>
  )
}

export default App
