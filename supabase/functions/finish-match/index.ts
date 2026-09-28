import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const auth=req.headers.get('Authorization')||''; const url=Deno.env.get('SUPABASE_URL')||''; const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await userClient.auth.getUser(); if(!user) throw new Error('Unauthorized');
    const body=await req.json(); const admin=createClient(url,secret); const {data:room}=await admin.from('rooms').select('id,host_id,game_type,status,game_state').eq('id',body.room_id).single(); if(!room) throw new Error('Room not found');
    if(room.host_id!==user.id) throw new Error('Only host can finish the match');
    const result=body.result||room.game_state?.result||{}; const winnerSeat=Number.isInteger(body.winner_seat)?body.winner_seat:null;
    const {data,error}=await admin.rpc('record_match_result',{p_room_id:room.id,p_game_type:room.game_type,p_result:result,p_winner_seat:winnerSeat}); if(error) throw error;
    return new Response(JSON.stringify({ok:true,recorded:data===true}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:String((e as Error)?.message||e)}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}
});
