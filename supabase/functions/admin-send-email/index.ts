import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verify user is admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) throw new Error('Unauthorized')

    const { data: isAdmin } = await supabaseClient.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    if (!isAdmin) throw new Error('Access denied: Admin role required')

    // 2. Parse request
    const { subject, body, target, targetId } = await req.json()
    if (!subject || !body || !target) throw new Error('Missing required fields')

    const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
    
    // In a real environment, you'd iterate over users from auth.users or profiles
    // For this prototype, we'll return success to the UI to simulate the sending behavior
    console.log(`Sending email "[${subject}]" to target: ${target} ${targetId ? `(ID: ${targetId})` : ''}`)
    
    // Simulate successful send
    return new Response(
      JSON.stringify({ success: true, message: `Email simulated sent to ${target}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
