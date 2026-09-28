import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const body=await req.json();
    const username=String(body?.identifier||'').trim().toLowerCase();
    const password=String(body?.password||'');
    if(!/^[a-z0-9_]{3,16}$/.test(username)||!password) throw new Error('Invalid login details');
    const url=Deno.env.get('SUPABASE_URL')||'';
    const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const admin=createClient(url,secret);
    const {data:profile,error:pe}=await admin.from('profiles').select('id').eq('username_normalized',username).maybeSingle();
    if(pe||!profile) throw new Error('Invalid login details');
    const {data:{user},error:ue}=await admin.auth.admin.getUserById(profile.id);
    if(ue||!user?.email) throw new Error('Invalid login details');
    const authClient=createClient(url,publishable);
    const {data,error}=await authClient.auth.signInWithPassword({email:user.email,password});
    if(error||!data.session) throw new Error('Invalid login details');
    return new Response(JSON.stringify({session:data.session,user:data.user}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch{
    return new Response(JSON.stringify({error:'Invalid login details'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}});
  }
});
