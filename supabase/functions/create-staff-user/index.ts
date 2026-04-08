import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerUser } = await callerClient
      .from('users')
      .select('id, role')
      .eq('auth_user_id', caller.id)
      .single()

    if (!callerUser || callerUser.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, first_name, last_name, role, staff_no, department } = await req.json()

    if (!email || !password || !first_name || !last_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const allowedRoles = ['registrar', 'academic_advisor', 'department_head', 'it_admin']
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authErr) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newAuthUserId = authData.user!.id

    const { data: newUser, error: userErr } = await adminClient
      .from('users')
      .insert({ auth_user_id: newAuthUserId, first_name: first_name.trim(), last_name: last_name.trim(), email: email.toLowerCase(), role })
      .select()
      .single()

    if (userErr) {
      await adminClient.auth.admin.deleteUser(newAuthUserId)
      return new Response(JSON.stringify({ error: userErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let profileErr = null

    if (role === 'registrar') {
      const { error } = await adminClient.from('registrar_profiles').insert({
        user_id: newUser.id, staff_no: staff_no || null, department: department || null,
        profile_status: 'active', created_by: callerUser.id,
      })
      profileErr = error
    } else if (role === 'academic_advisor') {
      const { error } = await adminClient.from('academic_advisor_profiles').insert({
        user_id: newUser.id, staff_no: staff_no || null, profile_status: 'active', created_by: callerUser.id,
      })
      profileErr = error
    } else if (role === 'department_head') {
      const { error } = await adminClient.from('department_head_profiles').insert({
        user_id: newUser.id, staff_no: staff_no || null, profile_status: 'active',
        created_by: callerUser.id, department_id: department || null,
      })
      profileErr = error
    } else if (role === 'it_admin') {
      const { error } = await adminClient.from('it_admin_profiles').insert({
        user_id: newUser.id, staff_no: staff_no || null, access_level: 'standard',
        profile_status: 'active', created_by: callerUser.id,
      })
      profileErr = error
    }

    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.id, message: `${role} account created successfully` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
