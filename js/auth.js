import { supabase } from './supabase.js';
import { APP_URL, IS_SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const localKey = 'mind_arena_local_profile_v2';
const providerCache = { value: null, expires: 0 };

export function normalizeUsername(value){ return String(value ?? '').trim().toLowerCase(); }
export function validUsername(value){ return /^[a-z0-9_]{3,16}$/.test(normalizeUsername(value)); }

export async function getOAuthProviders({force=false}={}){
  if (!IS_SUPABASE_CONFIGURED) return {google:false, apple:false, configured:false};
  if (!force && providerCache.value && providerCache.expires>Date.now()) return providerCache.value;
  try{
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept:'application/json' },
      cache:'no-store'
    });
    if (!response.ok) throw new Error(`Auth settings returned ${response.status}`);
    const json = await response.json();
    const external = json.external || {};
    const value = { google: external.google === true, apple: external.apple === true, configured:true };
    providerCache.value = value; providerCache.expires = Date.now()+30000;
    return value;
  }catch{
    // Settings endpoint failures should not lock the buttons out. The OAuth call below still gives the exact server error.
    return {google:true, apple:true, configured:true, unknown:true};
  }
}

export async function signUp({username,email,password}){
  const normalized = normalizeUsername(username);
  if (!validUsername(normalized)) throw new Error('Username must be 3–16 characters: letters, numbers, or _.');
  if (!email || !password) throw new Error('Email and password are required.');
  if (!supabase) return localSignup({username:normalized,email,password});
  const {data,error} = await supabase.auth.signUp({
    email: String(email).trim().toLowerCase(), password,
    options: { data:{ username:normalized, display_name:username.trim() }, emailRedirectTo:APP_URL }
  });
  if(error) throw error;
  return data;
}

export async function login(identifier,password){
  if (!supabase) return localLogin(identifier,password);
  const value = String(identifier||'').trim();
  if (!value || !password) throw new Error('Enter your username/email and password.');
  if (!value.includes('@')) {
    const {data,error} = await supabase.functions.invoke('login-with-username',{body:{identifier:value,password}});
    if(error) throw normalizeFunctionError(error);
    if(data?.error) throw new Error(data.error);
    if(!data?.session) throw new Error('Login did not create a session.');
    const sessionResult = await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
    if(sessionResult.error) throw sessionResult.error;
    return {user:data.user,session:data.session};
  }
  const {data,error} = await supabase.auth.signInWithPassword({email:value.toLowerCase(),password});
  if(error) throw error;
  return data;
}

export async function oauth(provider){
  if(!supabase) throw new Error('Connect Supabase first. Google and Apple use Supabase Auth.');
  if(!['google','apple'].includes(provider)) throw new Error('Unsupported sign-in provider.');
  const providers = await getOAuthProviders({force:true});
  if(providers[provider] === false){
    throw new Error(`${provider==='google'?'Google':'Apple'} sign-in is not enabled in Supabase yet. Open Authentication → Sign In / Providers and enable it.`);
  }
  const {error} = await supabase.auth.signInWithOAuth({provider,options:{redirectTo:APP_URL,queryParams: provider==='google'?{prompt:'select_account'}:undefined}});
  if(error) throw normalizeOAuthError(error,provider);
}

function normalizeOAuthError(error,provider){
  const msg = String(error?.message||'');
  if (/provider.*not enabled|unsupported provider/i.test(msg)) {
    return new Error(`${provider==='google'?'Google':'Apple'} sign-in is disabled in Supabase. Enable the provider first, then try again.`);
  }
  if (/redirect|url.*allow|not allowed/i.test(msg)) return new Error('The current website address is not in Supabase Auth redirect URLs.');
  return error;
}
function normalizeFunctionError(error){
  const msg = String(error?.message||'');
  if(/Failed to send a request to the Edge Function|FunctionsFetchError/i.test(msg)){
    return new Error('The login function is not reachable. Deploy login-with-username and check Supabase Functions.');
  }
  if(/401|invalid login/i.test(msg)) return new Error('Wrong username or password.');
  return error;
}

export async function logout(){
  if(supabase) await supabase.auth.signOut();
  localStorage.removeItem(localKey);
}
export async function currentUser(){
  if(!supabase) return JSON.parse(localStorage.getItem(localKey)||'null');
  const {data,error}=await supabase.auth.getUser();
  if(error) return null;
  return data?.user||null;
}
export async function loadProfile(user){
  if(!user) return null;
  if(!supabase) return JSON.parse(localStorage.getItem(localKey)||'null');
  const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(error) throw error;
  return data;
}
export async function saveUsername(username){
  const normalized=normalizeUsername(username);
  if(!validUsername(normalized)) throw new Error('Username must be 3–16 characters: letters, numbers, or _.');
  if(!supabase) return localSaveUsername(normalized);
  const {data,error}=await supabase.rpc('set_my_username',{p_username:normalized});
  if(error) throw error; return data;
}
export function onAuthStateChange(cb){
  if(!supabase) return ()=>{};
  const {data}=supabase.auth.onAuthStateChange((event,session)=>cb(event,session));
  return ()=>data.subscription.unsubscribe();
}

function localSignup({username,email,password}){
  const exists=JSON.parse(localStorage.getItem(localKey)||'null');
  if(exists && normalizeUsername(exists.username)===username) throw new Error('Username already used in local demo.');
  const profile={id:crypto.randomUUID(),username,display_name:username,email,password,points:0,wins:0,matches:0,coins:50000,created_at:new Date().toISOString()};
  localStorage.setItem(localKey,JSON.stringify(profile)); return {user:profile,session:null};
}
function localLogin(identifier,password){
  const p=JSON.parse(localStorage.getItem(localKey)||'null');
  const id=String(identifier||'').trim().toLowerCase();
  if(!p || p.password!==password || (id.includes('@')?p.email.toLowerCase()!==id:p.username.toLowerCase()!==id)) throw new Error('Wrong username or password.');
  return {user:p,session:null};
}
function localSaveUsername(username){
  const p=JSON.parse(localStorage.getItem(localKey)||'null'); if(!p) throw new Error('No local account.');
  p.username=username;localStorage.setItem(localKey,JSON.stringify(p));return p;
}
