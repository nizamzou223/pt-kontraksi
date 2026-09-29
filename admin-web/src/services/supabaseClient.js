import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://zrgzersltowinheqtdpc.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZ3plcnNsdG93aW5oZXF0ZHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTYxNTksImV4cCI6MjA5NTA5MjE1OX0.XTxfR2tJrKteulY7yh2ixQrx0pCPoGsktK3tnqkO_RM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
})

export default supabase
