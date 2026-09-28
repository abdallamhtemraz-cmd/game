import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const CATALOG:any[]=[
  {id:'p001',name:'Cristiano Ronaldo',rating:96,pos:'ATT'}, {id:'p002',name:'Lionel Messi',rating:97,pos:'ATT'},
  {id:'p003',name:'Kylian Mbappé',rating:95,pos:'ATT'}, {id:'p004',name:'Erling Haaland',rating:95,pos:'ATT'},
  {id:'p006',name:'Mohamed Salah',rating:92,pos:'ATT'}, {id:'p007',name:'Jude Bellingham',rating:94,pos:'MID'},
  {id:'p009',name:'Rodri',rating:94,pos:'MID'}, {id:'p013',name:'Virgil van Dijk',rating:93,pos:'DEF'},
  {id:'p016',name:'Achraf Hakimi',rating:91,pos:'DEF'}, {id:'p020',name:'Alisson',rating:92,pos:'GK'},
  {id:'p023',name:'Lamine Yamal',rating:91,pos:'ATT'}, {id:'p028',name:'Jamal Musiala',rating:91,pos:'MID'},
  {id:'p034',name:'Gianluigi Donnarumma',rating:91,pos:'GK'}, {id:'p040',name:'Bruno Fernandes',rating:91,pos:'MID'}
];
const pick=(a:any[])=>a[Math.floor(Math.random()*a.length)];
function simulate(teams:any[]){
  const out=teams.map(t=>({...t,players:Array.isArray(t.players)?t.players:[],score:0,strength:Math.max(1, (Array.isArray(t.players)&&t.players.length?t.players.reduce((s:any,p:any)=>s+(Number(p.rating)||0),0)/t.players.length:78))}));
  const logs:any[]=[];
  for(const minute of [6,14,23,31,42,51,60,69,78,87,90]){
    if(Math.random()>.64) continue;
    const team=pick(out); const roster=team.players.length?team.players:CATALOG; const actor=pick(roster);
    const goal=Math.random()<Math.min(.75,.30+(team.strength-78)/125);
    if(goal){team.score++;logs.push({minute,team:team.name,player:actor.name,text:`${minute}' ${actor.name} finds the finish for ${team.name}.`,goal:true});}
    else logs.push({minute,team:team.name,player:actor.name,text:`${minute}' ${actor.name} gets the chance away, but the keeper holds it.`,goal:false});
  }
  const max=Math.max(...out.map(x=>x.score)); const tied=out.filter(x=>x.score===max); const motm=out.flatMap(t=>t.players.map((p:any)=>({...p,team:t.name}))).sort((a:any,b:any)=>((b.rating||0)+(b.goals||0)*20)-((a.rating||0)+(a.goals||0)*20))[0]||CATALOG[0];
  return {teams:out.map(t=>({name:t.name,score:t.score})),logs,scoreline:out.map(t=>t.score).join(' — '),winner:tied.length===1?tied[0].name:'DRAW',winnerSeat:tied.length===1?out.indexOf(tied[0]):null,motm:motm.name};
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  try{
    const auth=req.headers.get('Authorization')||''; const url=Deno.env.get('SUPABASE_URL')||''; const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await userClient.auth.getUser(); if(!user) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const body=await req.json(); const admin=createClient(url,secret);
    if(!body.room_id) throw new Error('Room ID is required');
    const {data:room}=await admin.from('rooms').select('id,host_id,status,game_type,game_state').eq('id',body.room_id).single();
    if(!room) throw new Error('Room not found'); if(room.host_id!==user.id) throw new Error('Only host can run the match'); if(room.status!=='playing') throw new Error('Match is not active');
    let teams:any[]=[];
    if(room.game_type==='auction'){
      const gs=room.game_state||{}; if(gs.phase!=='complete') throw new Error('Auction is not complete');
      teams=(gs.teams||[]).map((t:any,i:number)=>({name:`TEAM ${i+1}`,players:(t.players||[]).filter((p:any)=>p.compensation!==true)}));
    } else {
      const {data:members}=await admin.from('room_players').select('seat,username').eq('room_id',room.id).order('seat');
      teams=(members||[]).map((m:any)=>({name:m.username||`TEAM ${m.seat+1}`,players:CATALOG.slice().sort(()=>Math.random()-.5).slice(0,7)}));
    }
    const result=simulate(teams);
    const full={...result,gameType:room.game_type};
    const {error:re}=await admin.rpc('record_match_result',{p_room_id:room.id,p_game_type:room.game_type,p_result:full,p_winner_seat:result.winnerSeat});
    if(re) throw re;
    return new Response(JSON.stringify(full),{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:String((e as Error)?.message||e)}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}
});
