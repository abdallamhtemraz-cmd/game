-- MIND ARENA production schema v2
-- Run this whole file in Supabase SQL Editor.
-- Never expose a service_role key in the browser.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null unique,
  display_name text not null default 'Player',
  avatar_url text,
  points integer not null default 0,
  wins integer not null default 0,
  matches integer not null default 0,
  coins bigint not null default 50000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_type text not null check (game_type in ('fifa','auction','lebes')),
  max_players integer not null check (max_players between 2 and 4),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','playing','finished','cancelled')),
  settings jsonb not null default '{}'::jsonb,
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat integer not null check (seat between 0 and 3),
  username text not null,
  ready boolean not null default false,
  team integer not null default 0 check (team between 0 and 3),
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id),
  unique (room_id,seat)
);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat integer not null check (seat between 0 and 3),
  lot_index integer not null check (lot_index >= 0),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.owned_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null,
  rarity text not null,
  source text not null check (source in ('fifa_pack','lebes','auction','reward')),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms(id) on delete set null,
  game_type text not null check (game_type in ('fifa','auction','lebes')),
  result jsonb not null,
  winner_seat integer check (winner_seat between 0 and 3),
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_rooms_host on public.rooms(host_id);
create index if not exists idx_room_players_room on public.room_players(room_id);
create index if not exists idx_owned_cards_user on public.owned_cards(user_id);
create index if not exists idx_bids_room_lot on public.auction_bids(room_id,lot_index,created_at);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at before update on public.rooms for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n integer:=0;
begin
  base:=lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username','player'),'[^a-z0-9_]','','g'));
  if length(base)<3 then base:='player'; end if;
  candidate:=left(base,16);
  while exists(select 1 from public.profiles where username_normalized=candidate) loop
    n:=n+1; candidate:=left(base,12)||lpad(n::text,4,'0');
  end loop;
  insert into public.profiles(id,username,username_normalized,display_name,avatar_url)
  values(new.id,candidate,candidate,coalesce(new.raw_user_meta_data->>'display_name','Player'),new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_my_username(p_username text)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare n text; out_row public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  n:=lower(trim(p_username));
  if n !~ '^[a-z0-9_]{3,16}$' then raise exception 'Username must be 3-16 chars using letters, numbers or _'; end if;
  if exists(select 1 from public.profiles where username_normalized=n and id<>auth.uid()) then raise exception 'Username already taken'; end if;
  update public.profiles set username=trim(p_username),username_normalized=n where id=auth.uid() returning * into out_row;
  if out_row.id is null then raise exception 'Profile not found'; end if;
  return out_row;
end; $$;
grant execute on function public.set_my_username(text) to authenticated;

create or replace function public.create_room(p_game_type text,p_max_players integer,p_settings jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare code text; rid uuid; p public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_game_type not in ('fifa','auction','lebes') then raise exception 'Invalid game'; end if;
  if p_max_players not between 2 and 4 then raise exception 'Players must be 2-4'; end if;
  select * into p from public.profiles where id=auth.uid(); if p.id is null then raise exception 'Profile not found'; end if;
  loop
    code:=upper(substring(encode(gen_random_bytes(5),'hex') from 1 for 6));
    exit when not exists(select 1 from public.rooms where rooms.code=code);
  end loop;
  insert into public.rooms(code,game_type,max_players,host_id,settings) values(code,p_game_type,p_max_players,auth.uid(),coalesce(p_settings,'{}'::jsonb)) returning id into rid;
  insert into public.room_players(room_id,user_id,seat,username,team) values(rid,auth.uid(),0,p.username,0);
  return jsonb_build_object('room_id',rid,'code',code);
end; $$;
grant execute on function public.create_room(text,integer,jsonb) to authenticated;

create or replace function public.join_room(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; p public.profiles; seat_no integer; c integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into r from public.rooms where code=upper(trim(p_code)) and status='lobby' for update;
  if r.id is null then raise exception 'Room not found or already started'; end if;
  if exists(select 1 from public.room_players where room_id=r.id and user_id=auth.uid()) then return jsonb_build_object('room_id',r.id,'code',r.code); end if;
  select * into p from public.profiles where id=auth.uid();
  select coalesce(max(seat)+1,0) into seat_no from public.room_players where room_id=r.id;
  if seat_no>=r.max_players then raise exception 'Room is full'; end if;
  insert into public.room_players(room_id,user_id,seat,username,team) values(r.id,auth.uid(),seat_no,p.username,seat_no);
  select count(*) into c from public.room_players where room_id=r.id;
  return jsonb_build_object('room_id',r.id,'code',r.code,'players',c);
end; $$;
grant execute on function public.join_room(text) to authenticated;

create or replace function public.set_room_ready(p_room_id uuid,p_ready boolean)
returns boolean language plpgsql security definer set search_path=public as $$ begin
  update public.room_players set ready=p_ready where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'You are not in this room'; end if; return true;
end; $$;
grant execute on function public.set_room_ready(uuid,boolean) to authenticated;

create or replace function public.start_room(p_room_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.rooms; total integer; ready_count integer;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if r.id is null then raise exception 'Room not found'; end if;
  if r.host_id<>auth.uid() then raise exception 'Only host can start'; end if;
  select count(*),count(*) filter(where ready) into total,ready_count from public.room_players where room_id=p_room_id;
  if total<>r.max_players then raise exception 'Room needs all players'; end if;
  if ready_count<>total then raise exception 'All players must be ready'; end if;
  update public.rooms set status='playing',game_state=jsonb_build_object('phase','started','started_at',now()) where id=p_room_id;
  return true;
end; $$;
grant execute on function public.start_room(uuid) to authenticated;

create or replace function public.leave_room(p_room_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if r.id is null then return true; end if;
  if r.status='playing' then raise exception 'Leave is disabled during a live match'; end if;
  delete from public.room_players where room_id=p_room_id and user_id=auth.uid();
  if r.host_id=auth.uid() then update public.rooms set status='cancelled' where id=p_room_id; end if;
  return true;
end; $$;
grant execute on function public.leave_room(uuid) to authenticated;

create or replace function public.place_auction_bid(p_room_id uuid,p_lot_index integer,p_amount bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; me public.room_players; gs jsonb; lot jsonb; team jsonb; budget bigint; newgs jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into r from public.rooms where id=p_room_id for update;
  if r.id is null or r.status<>'playing' or r.game_type<>'auction' then raise exception 'Auction is not active'; end if;
  select * into me from public.room_players where room_id=p_room_id and user_id=auth.uid(); if me.user_id is null then raise exception 'Not in room'; end if;
  gs:=r.game_state;
  if coalesce((gs->>'phase'),'')<>'auction' then raise exception 'Auction is not accepting bids'; end if;
  if coalesce((gs->>'currentIndex')::int,-1)<>p_lot_index then raise exception 'Lot has moved'; end if;
  lot:=gs->'players'->p_lot_index;
  if lot->>'removedFromAuction'='true' then raise exception 'This lot is unavailable'; end if;
  if p_amount<=coalesce((gs->>'currentBid')::bigint,0) then raise exception 'Bid must be higher'; end if;
  if coalesce((gs->>'highestSeat')::int,-1)=me.seat then raise exception 'You already lead'; end if;
  team:=gs->'teams'->me.seat; budget:=coalesce((team->>'budget')::bigint,0);
  if p_amount>budget then raise exception 'Not enough budget'; end if;
  newgs:=jsonb_set(jsonb_set(gs,'{currentBid}',to_jsonb(p_amount)),'{highestSeat}',to_jsonb(me.seat));
  update public.rooms set game_state=newgs where id=r.id;
  insert into public.auction_bids(room_id,user_id,seat,lot_index,amount) values(r.id,auth.uid(),me.seat,p_lot_index,p_amount);
  return newgs;
end; $$;
grant execute on function public.place_auction_bid(uuid,integer,bigint) to authenticated;

create or replace function public.close_auction_lot(p_room_id uuid,p_lot_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; gs jsonb; teams jsonb; lot jsonb; winner integer; amount bigint; loser integer; comp jsonb; value bigint; comp_team jsonb; winner_team jsonb; nextidx integer; arr jsonb; i integer;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if r.id is null or r.status<>'playing' or r.game_type<>'auction' then raise exception 'Auction is not active'; end if;
  if r.host_id<>auth.uid() then raise exception 'Only host can close a lot'; end if;
  gs:=r.game_state;
  if coalesce((gs->>'phase'),'')<>'auction' then raise exception 'Auction has already moved'; end if;
  if coalesce((gs->>'currentIndex')::int,-1)<>p_lot_index then raise exception 'Lot has already moved'; end if;
  lot:=gs->'players'->p_lot_index; teams:=gs->'teams'; winner:=coalesce((gs->>'highestSeat')::int,-1);
  if winner>=0 then
    amount:=coalesce((gs->>'currentBid')::bigint,0); winner_team:=teams->winner;
    if amount>(winner_team->>'budget')::bigint then raise exception 'Winning bid exceeds budget'; end if;
    winner_team:=jsonb_set(winner_team,'{budget}',to_jsonb((winner_team->>'budget')::bigint-amount));
    winner_team:=jsonb_set(winner_team,'{players}',coalesce(winner_team->'players','[]'::jsonb)||jsonb_build_array(lot||jsonb_build_object('paidPrice',amount,'compensation',false)));
    teams:=jsonb_set(teams,ARRAY[winner::text],winner_team);

    -- Special rule: first lot, exactly 2 teams only.
    if p_lot_index=0 and jsonb_array_length(teams)=2 then
      loser:=case when winner=0 then 1 else 0 end; comp:=null;
      for i in 0..jsonb_array_length(gs->'players')-1 loop
        if i<>p_lot_index then
          arr:=gs->'players'->i;
          if coalesce(arr->>'removedFromAuction','false')<>'true'
             and not exists(select 1 from jsonb_array_elements(coalesce(teams->0->'players','[]'::jsonb)||coalesce(teams->1->'players','[]'::jsonb)) q where q->>'id'=arr->>'id') then
            comp:=arr; exit;
          end if;
        end if;
      end loop;
      if comp is not null then
        value:=floor(amount/2); comp:=comp||jsonb_build_object('removedFromAuction',true,'compensation',true,'compensationValue',value,'paidPrice',0);
        comp_team:=teams->loser; comp_team:=jsonb_set(comp_team,'{players}',coalesce(comp_team->'players','[]'::jsonb)||jsonb_build_array(comp)); teams:=jsonb_set(teams,ARRAY[loser::text],comp_team);
        gs:=jsonb_set(gs,'{lastCompensation}',jsonb_build_object('seat',loser,'player',comp,'value',value,'free',true,'sourceLot',0));
      else gs:=jsonb_set(gs,'{lastCompensation}','null'::jsonb); end if;
    else gs:=jsonb_set(gs,'{lastCompensation}','null'::jsonb); end if;
  else gs:=jsonb_set(gs,'{lastCompensation}','null'::jsonb); end if;

  nextidx:=p_lot_index+1;
  while nextidx<jsonb_array_length(gs->'players') and coalesce((gs->'players'->nextidx->>'removedFromAuction'),'false')='true' loop nextidx:=nextidx+1; end loop;
  gs:=jsonb_set(gs,'{teams}',teams); gs:=jsonb_set(gs,'{currentIndex}',to_jsonb(nextidx)); gs:=jsonb_set(gs,'{highestSeat}','null'::jsonb); gs:=jsonb_set(gs,'{currentBid}',to_jsonb(case when nextidx<jsonb_array_length(gs->'players') then coalesce((gs->'players'->nextidx->>'startBid')::bigint,0) else 0 end)); gs:=jsonb_set(gs,'{lastWinner}',case when winner>=0 then jsonb_build_object('seat',winner,'player',lot,'amount',amount) else 'null'::jsonb end);
  if nextidx>=jsonb_array_length(gs->'players') then gs:=jsonb_set(gs,'{phase}',to_jsonb('complete')) else gs:=jsonb_set(gs,'{phase}',to_jsonb('auction')); end if;
  update public.rooms set game_state=gs where id=r.id; return gs;
end; $$;
grant execute on function public.close_auction_lot(uuid,integer) to authenticated;

-- Only server-side functions may award points / modify sensitive profile counters.
create or replace function public.record_match_result(p_room_id uuid,p_game_type text,p_result jsonb,p_winner_seat integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.rooms; already boolean; m record;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if r.id is null then raise exception 'Room not found'; end if;
  if exists(select 1 from public.matches where room_id=p_room_id) then return false; end if;
  insert into public.matches(room_id,game_type,result,winner_seat) values(p_room_id,p_game_type,p_result,p_winner_seat);
  update public.rooms set status='finished',game_state=jsonb_build_object('phase','result','result',p_result,'winnerSeat',p_winner_seat) where id=p_room_id;
  for m in select user_id,seat from public.room_players where room_id=p_room_id loop
    update public.profiles set points=points+case when p_winner_seat is not null and m.seat=p_winner_seat then 3 else 0 end,
      wins=wins+case when p_winner_seat is not null and m.seat=p_winner_seat then 1 else 0 end,
      matches=matches+1 where id=m.user_id;
  end loop;
  return true;
end; $$;
revoke all on function public.record_match_result(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.record_match_result(uuid,text,jsonb,integer) to service_role;

-- Prevent direct client edits of sensitive profile counters.
revoke update on table public.profiles from authenticated;
grant update(username,username_normalized,display_name,avatar_url) on public.profiles to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.auction_bids enable row level security;
alter table public.owned_cards enable row level security;
alter table public.matches enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using(true);
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated using(exists(select 1 from public.room_players rp where rp.room_id=id and rp.user_id=auth.uid()) or host_id=auth.uid());
drop policy if exists room_players_select on public.room_players;
create policy room_players_select on public.room_players for select to authenticated using(true);
drop policy if exists bids_select on public.auction_bids;
create policy bids_select on public.auction_bids for select to authenticated using(exists(select 1 from public.room_players rp where rp.room_id=auction_bids.room_id and rp.user_id=auth.uid()));
drop policy if exists cards_select on public.owned_cards;
create policy cards_select on public.owned_cards for select to authenticated using(user_id=auth.uid());
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select to authenticated using(exists(select 1 from public.room_players rp where rp.room_id=matches.room_id and rp.user_id=auth.uid()));

-- Realtime tables. Broadcast can replace this as the project scales.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then alter publication supabase_realtime add table public.rooms; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_players') then alter publication supabase_realtime add table public.room_players; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='auction_bids') then alter publication supabase_realtime add table public.auction_bids; end if;
end $$;
