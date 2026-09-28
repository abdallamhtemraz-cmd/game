import { supabase } from './supabase.js';
export function subscribeRoom(roomId,onChange){
  if(!supabase) return null;
  const channel=supabase.channel(`room:${roomId}`,{config:{broadcast:{ack:true}}});
  channel.on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},onChange);
  channel.on('postgres_changes',{event:'*',schema:'public',table:'room_players',filter:`room_id=eq.${roomId}`},onChange);
  channel.on('postgres_changes',{event:'*',schema:'public',table:'auction_bids',filter:`room_id=eq.${roomId}`},onChange);
  channel.subscribe(); return channel;
}
export function unsubscribeRoom(channel){if(channel) channel.unsubscribe();}
