export const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
export const money = value => `€${Math.max(0,Number(value)||0).toLocaleString('en-US')}`;
export const pick = arr => arr[Math.floor(Math.random()*arr.length)];
export const average = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

const EVENT_TEMPLATES = [
  ({m,p,t})=>`${m}' ${p} slips a pass through the middle for ${t}.`,
  ({m,p,t})=>`${m}' ${p} takes the chance first time — saved by the keeper.`,
  ({m,p,t})=>`${m}' ${p} gets into the box and finishes calmly for ${t}.`,
  ({m,p,t})=>`${m}' ${p} wins the second ball and keeps the pressure alive.`,
  ({m,p,t})=>`${m}' ${p} tries from range. It sails just wide.`,
  ({m,p,t})=>`${m}' ${p} finds space on the wing and sends one across the face of goal.`
];

export function runMatchSimulation(inputTeams){
  const teams = inputTeams.map((team,i)=>{
    const roster = (team.players||[]).filter(Boolean);
    const strength = roster.length ? average(roster.map(p=>Number(p.rating)||0)) : 75;
    const coach = Number(team.coachRating)||0;
    return {...team, score:0, strength:strength + coach*.05 + roster.length*.15, players:roster};
  });
  const events=[];
  const minutes=[7,14,22,31,39,48,56,64,73,81,89];
  for(const minute of minutes){
    if(Math.random()>.62) continue;
    const weights=teams.map(t=>Math.max(1,t.strength));
    const total=weights.reduce((a,b)=>a+b,0); let r=Math.random()*total, winner=0;
    for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){winner=i;break;}}
    const team=teams[winner];
    if(!team.players.length) continue;
    const player=pick(team.players);
    const goalChance=Math.min(.72,Math.max(.20,.29+(team.strength-75)/120));
    const scored=Math.random()<goalChance;
    if(scored){team.score++;player._goals=(player._goals||0)+1;}
    events.push({minute,team:team.name,player:player.name,text:EVENT_TEMPLATES[Math.floor(Math.random()*EVENT_TEMPLATES.length)]({m:minute,p:player.name,t:team.name}),goal:scored});
  }
  const top=teams.flatMap(t=>t.players.map(p=>({p,t}))).sort((a,b)=>((b.p._goals||0)*2+(b.p.rating||0)/50)-((a.p._goals||0)*2+(a.p.rating||0)/50));
  const max=Math.max(...teams.map(t=>t.score));
  const winnerTeams=teams.filter(t=>t.score===max);
  const motm=top[0]?.p || teams[0]?.players[0] || {name:'Unknown Player',rating:0};
  return {teams,events,winner:winnerTeams.length===1?winnerTeams[0]:null,motm,scoreline:teams.map(t=>t.score).join(' — ')};
}
