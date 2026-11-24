import { DurableObject } from "cloudflare:workers";

const APP_ID = "1572909135501070397";
const GUILD_ID = "1572910663787872287";
const CHANNELS = { audit:"1573271426159484998", pending:"1573271467712319528", commands:"1573271493327200297", moderation:"1573273571562623047", general:"1572910665444884493", announcements:"1573273477194973245", outage:"1573709709092065441", sessions:"1574355077861351454", ticketPanel:"1574355318560002118", ticketCategory:"1574355361627111506", ticketTranscripts:"1574357055840587886", fastpassPanel:"1574357769266528306", fastpassReview:"1574357807484899418", logArchive:"1574355077861351454", promotions:"1574355190536998912", infractions:"1574358164722159739", warnings:"1574355158727393361", strikes:"1574355114469101670" };
const ROLE_IDS = ["1573028899405693049","1573038142963978441","1573038132289343609","1573038226510192864"];
const PUBLIC_KEY = "61eaafd4c8e2b5531497e7e7682393d80fd19567186670df7c78021245738174";
const SITE_URL = "https://texas-state-roleplay-site.greatermanchesterroleplay.workers.dev";
const INVITE = "https://discord.gg/7q2Hr63YH";
const COMMANDS = [
  { name: "ping", description: "Check whether Texas State Roleplay bot is online.", type: 1 },
  { name: "help", description: "See the Texas State Roleplay bot commands.", type: 1 },
  { name: "server", description: "Post a Texas State Roleplay session update.", type: 1, options: [{type:1,name:"start-up",description:"Announce that the server session has started."},{type:1,name:"shutdown",description:"Announce session shutdown and archive in-game logs."},{type:1,name:"low-on-players",description:"Announce that the session is low on players."},{type:1,name:"invite",description:"Get the Texas State Roleplay Discord invite."}] },
  { name: "website", description: "Get the Texas State Roleplay website.", type: 1 },
  { name: "departments", description: "View the community's roleplay departments.", type: 1 },
  { name: "rules", description: "Read the community standards reminder.", type: 1 },
  { name: "erlc", description: "View live ER:LC server status.", type: 1 },
  { name: "players", description: "View players currently in the ER:LC server.", type: 1 },
  { name: "staff", description: "View on-duty ER:LC staff.", type: 1 },
  { name: "queue", description: "View the ER:LC server queue.", type: 1 },
  { name: "calls", description: "View active ER:LC emergency calls.", type: 1 },
  { name: "vehicles", description: "View ER:LC server vehicles.", type: 1 },
  { name: "kick", description: "Kick a player from ER:LC.", type: 1, options: [{name:"player",description:"Player username",type:3,required:true},{name:"reason",description:"Reason for the action",type:3,required:true,max_length:160}] },
  { name: "ban", description: "Ban a player from ER:LC.", type: 1, options: [{name:"player",description:"Player username or Roblox ID",type:3,required:true},{name:"reason",description:"Reason for the action",type:3,required:true,max_length:160}] },
  { name: "unban", description: "Unban a player from ER:LC.", type: 1, options: [{name:"player",description:"Player username or Roblox ID",type:3,required:true},{name:"reason",description:"Reason for the action",type:3,required:true,max_length:160}] },
  { name: "erlc-command", description: "Run an approved ER:LC server command (admins and ownership).", type: 1, options: [{name:"command",description:"Command, with or without the leading colon",type:3,required:true,max_length:160}] },
  { name: "modlogs", description: "View recent moderation records.", type: 1 },
  { name: "ban-bolo", description: "Submit a player ban request for Admin review.", type: 1, options: [{name:"player",description:"Roblox username or ID",type:3,required:true,max_length:32},{name:"reason",description:"What happened and why a ban is requested",type:3,required:true,max_length:1000},{name:"evidence",description:"Optional HTTPS evidence links separated by spaces",type:3,required:false,max_length:500}] },
  { name: "ticket-panel", description: "Post the public ticket creation panel.", type: 1 },
  { name: "close-ticket", description: "Close the ticket channel and save its transcript.", type: 1 },
  { name: "fastpass-panel", description: "Post the Fast Pass application panel.", type: 1 },
  { name: "fastpass-delete", description: "Delete a Fast Pass application by its ID.", type: 1, options: [{name:"id",description:"Fast Pass ID, for example FP-0003",type:3,required:true,max_length:16}] },
  { name: "staff-record", description: "Create a staff record in the appropriate channel.", type: 1, options: [
    {type:1,name:"promotion",description:"Record a staff promotion.",options:[{name:"player",description:"Discord or Roblox name",type:3,required:true},{name:"role",description:"The new staff role or rank",type:8,required:true},{name:"reason",description:"Promotion details",type:3,required:true,max_length:1000}]},
    {type:1,name:"infraction",description:"Record a staff infraction.",options:[{name:"player",description:"Staff member",type:3,required:true},{name:"reason",description:"Infraction details",type:3,required:true,max_length:1000},{name:"evidence",description:"Optional evidence URL",type:3,required:false,max_length:500}]},
    {type:1,name:"warning",description:"Record a staff warning.",options:[{name:"player",description:"Staff member",type:3,required:true},{name:"reason",description:"Warning details",type:3,required:true,max_length:1000},{name:"appealable",description:"Can this warning be appealed?",type:3,required:true,choices:[{name:"Appealable",value:"yes"},{name:"Not appealable",value:"no"}]},{name:"evidence",description:"Optional evidence URL",type:3,required:false,max_length:500}]},
    {type:1,name:"strike",description:"Record a staff strike.",options:[{name:"player",description:"Staff member",type:3,required:true},{name:"reason",description:"Strike details",type:3,required:true,max_length:1000},{name:"evidence",description:"Optional evidence URL",type:3,required:false,max_length:500}]}
  ] }
];

function nextGatewayAlarm(tasks = {}) {
  const due = Object.values(tasks).filter(value => Number.isFinite(value));
  return due.length ? Math.min(...due) : null;
}
const COMMANDS_VERSION = "texas-state-roleplay-commands-v4";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
function tokenFrom(env) {
  return String(env.DISCORD_BOT_TOKEN || "").trim().replace(/^Bot\s+/i, "");
}
function hexBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex || "")) throw new Error("Invalid hex value");
  return Uint8Array.from(hex.match(/.{2}/g), (x) => parseInt(x, 16));
}
async function verifyDiscord(request, body) {
  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{1,20}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexBytes(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}
async function registerCommands(env) {
  const token = tokenFrom(env);
  if (!token) return { ok: false, reason: "DISCORD_BOT_TOKEN secret is not configured" };
  const response = await fetch("https://discord.com/api/v10/applications/" + APP_ID + "/guilds/" + GUILD_ID + "/commands", {
    method: "PUT",
    headers: { Authorization: "Bot " + token, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS)
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Discord command registration failed (" + response.status + "): " + body.slice(0, 400));
  const registered = JSON.parse(body).map((command) => command.name);
  return { ok: true, registered };
}
function gatewayStub(env) {
  const id = env.DISCORD_GATEWAY.idFromName("manchester-roleplay-v2");
  return env.DISCORD_GATEWAY.get(id);
}
function dataRequest(env, path, init = {}) {
  if (!env.MANCHESTER_DATA) throw new Error("Texas data service binding is missing.");
  return env.MANCHESTER_DATA.fetch("https://manchester-data.internal" + path, init);
}
async function startGateway(env) {
  if (!tokenFrom(env)) return { status: "needs_token" };
  const response = await gatewayStub(env).fetch("https://gateway-control/start", { method: "POST" });
  return response.json();
}

async function erlcServerData(env, include = []) {
 const key=String(env.ERLC_SERVER_KEY||"").trim(); if(!key) throw new Error("ERLC_SERVER_KEY is not configured");
 const url=new URL("https://api.erlc.gg/v2/server"); for(const field of include) url.searchParams.set(field,"true");
 const globalKey=String(env.ERLC_GLOBAL_API_KEY||"").trim(); const headers={"server-key":key}; if(globalKey) headers.Authorization=globalKey; const response=await fetch(url,{headers}), text=await response.text(); let data;
 try{data=JSON.parse(text)}catch{throw new Error("ER:LC returned invalid JSON ("+response.status+")")}
 if(!response.ok) throw new Error("ER:LC API request failed ("+response.status+"): "+String(data.message||data.error||"Request rejected").slice(0,160));
 return data;
}
const AUTOMOD_PROFANITY = ["fuck","shit","bitch","ass","asshole","arse","arsehole","motherfucker","cunt","twat","wanker","bollocks","bastard","prick","dickhead","whore","slut","piss","damn","hell","crap","bugger","bloody","faggot","fag","nigger","nigga","kike","chink","spic","wetback","tranny","retard","coon","gook","dyke"];
// Compile once at module load instead of allocating dozens of RegExp objects for every message.
const AUTOMOD_PATTERNS = AUTOMOD_PROFANITY.map(term => new RegExp("(^|[^a-z])"+term.split("").join("[^a-z]*")+"($|[^a-z])","i"));
function automodViolation(content,allowLinks=false){const normalized=String(content||"").toLowerCase().normalize("NFKD").replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/[0]/g,"o").replace(/[1!|]/g,"i").replace(/[3]/g,"e").replace(/[4@]/g,"a").replace(/[5$]/g,"s").replace(/[7]/g,"t");for(const pattern of AUTOMOD_PATTERNS){if(pattern.test(normalized))return "profanity";}if(allowLinks)return "";const links=String(content||"").match(/(?:https?:\/\/|www\.)[^\s<>()]+|(?:^|\s)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gg|co|uk|io|dev|app|me|xyz|info|biz|gov|edu|tv|ly|to|link|site|cloud|store)(?:\/[^\s<>()]*)?/gi)||[];for(const link of links){const raw=link.trim();let u;try{u=new URL(/^https?:\/\//i.test(raw)?raw:"https://"+raw);}catch{return "unapproved_link";}const host=u.hostname.toLowerCase(),path=u.pathname.toLowerCase(),gif=path.endsWith(".gif")||path.endsWith(".gifv")||host==="tenor.com"||host.endsWith(".tenor.com")||host==="giphy.com"||host.endsWith(".giphy.com");if(gif)continue;return "unapproved_link";}return "";}
async function discordChannelMessage(env,channelId,payload){const token=tokenFrom(env);if(!token)throw Error("Discord bot token missing");const r=await fetch("https://discord.com/api/v10/channels/"+encodeURIComponent(channelId)+"/messages",{method:"POST",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch{data={message:raw.slice(0,300)};}if(!r.ok)throw Error("Discord channel post failed (HTTP "+r.status+"): "+String(data?.message||data?.error||raw||"Request failed").slice(0,300));return data;}
async function clearPreviousSessionStatusMessages(env,channelId){
  const messages=await discordApi(env,"/channels/"+encodeURIComponent(channelId)+"/messages?limit=100");
  const bot=await discordApi(env,"/users/@me");
  const statusTitles=new Set(["SESSION STARTED","SESSION SHUTDOWN","SESSION LOW ON PLAYERS"]);
  const previous=(Array.isArray(messages)?messages:[]).filter(message=>
    message.author?.id===bot.id &&
    Array.isArray(message.embeds) &&
    message.embeds.some(embed=>statusTitles.has(String(embed.title||"").toUpperCase()))
  );
  for(const message of previous){
    await discordApi(env,"/channels/"+encodeURIComponent(channelId)+"/messages/"+encodeURIComponent(message.id),{method:"DELETE"});
  }
  return previous.length;
}
async function sendModerationLog(env,text){try{const embed={title:"MODERATION ACTION",description:String(text).slice(0,3500),color:15158332,footer:{text:"Texas State Roleplay • Moderation log"},timestamp:new Date().toISOString()};await discordChannelMessage(env,CHANNELS.moderation,{embeds:[embed],allowed_mentions:{parse:[]}});}catch(e){console.error("Moderation log delivery failed",e.message);}}
async function discordUserDM(env,userId,embed){if(!userId)return false;const dm=await discordApi(env,"/users/@me/channels",{method:"POST",body:JSON.stringify({recipient_id:String(userId)})});if(!dm?.id)throw new Error("Discord did not return a DM channel.");await discordChannelMessage(env,dm.id,{embeds:[embed],allowed_mentions:{parse:[]}});return true;}
function erlcList(value,limit=14){
 if(Array.isArray(value)) return value.slice(0,limit).map(x=>typeof x==="string"||typeof x==="number"?String(x):[x?.Username,x?.Name,x?.Player,x?.User,x?.Vehicle,x?.Team].filter(Boolean).join(" · ")||JSON.stringify(x));
 if(value&&typeof value==="object") return Object.entries(value).slice(0,limit).map(([k,v])=>k+": "+(Array.isArray(v)?v.length+" listed":typeof v==="object"?JSON.stringify(v):String(v)));
 return [];
}
async function erlcInteraction(name,env){
 const fields={players:["Players"],staff:["Staff"],queue:["Queue"],calls:["EmergencyCalls"],vehicles:["Vehicles"]};
 try{
  const data=await erlcServerData(env,fields[name]||[]); let title="ER:LC server status",lines=[];
  if(name==="players"){title="Players online";lines=erlcList(data.Players);if(!lines.length)lines=["No players reported."]}
  else if(name==="staff"){title="ER:LC staff";lines=erlcList(data.Staff);if(!lines.length)lines=["No staff reported."]}
  else if(name==="queue"){title="Server queue";lines=erlcList(data.Queue);if(!lines.length)lines=["The queue is empty."]}
  else if(name==="calls"){title="Emergency calls";lines=erlcList(data.EmergencyCalls);if(!lines.length)lines=["No emergency calls reported."]}
  else if(name==="vehicles"){title="Server vehicles";lines=erlcList(data.Vehicles);if(!lines.length)lines=["No vehicles reported."]}
  else lines=["Server: "+(data.Name||"Texas State Roleplay"),"Players: "+(data.CurrentPlayers??"Unknown")+" / "+(data.MaxPlayers??"Unknown"),"Join key: "+(data.JoinKey||"Not provided"),"Team balance: "+(data.TeamBalance===true?"Enabled":data.TeamBalance===false?"Disabled":"Unknown")];
  return {type:4,data:{content:("**"+title+"**\n"+lines.join("\n")).slice(0,1900),flags:64,allowed_mentions:{parse:[]}}};
 }catch(e){return {type:4,data:{content:"ER:LC integration error: "+String(e.message||e).slice(0,350),flags:64,allowed_mentions:{parse:[]}}}}
}

async function moderationRun(env, interaction, name) {
 const reply=(s)=>({type:4,data:{content:String(s).slice(0,1900),flags:64,allowed_mentions:{parse:[]}}});
 const roles=interaction.member?.roles||[], perms=BigInt(interaction.member?.permissions||"0");
 if(interaction.channel_id && interaction.channel_id!==CHANNELS.commands)return reply("Moderation commands can only be used in the designated Commands channel.");
 const owner=roles.includes("1573038226510192864")||(perms&8n)===8n;
 const admin=owner||roles.includes("1573038142963978441");
 const ia=roles.includes("1573038132289343609"), mod=admin||roles.includes("1573028899405693049");
 const opts=Object.fromEntries((interaction.data?.options||[]).map(x=>[x.name,x.value]));
 const user=interaction.member?.user||interaction.user||{};
 if(name==="modlogs"){ if(!owner&&!ia&&!admin) return reply("Internal Affairs, Admin or Ownership access is required."); const r=await dataRequest(env, "/modlogs"); const d=await r.json(); const rows=(d.logs||[]).slice(0,12); return reply("**Recent moderation records**\n"+(rows.length?rows.map(x=>"- "+x.at+" · "+x.action+" · "+x.player+" · "+x.staff+" · "+(x.ok?"Success":"Failed")+" · "+x.reason).join("\n"):"No records yet.")); }
 if(name==="kick"&&!mod) return reply("The Texas State Roleplay Staff role or higher is required.");
 if(["ban","unban","erlc-command"].includes(name)&&!admin) return reply("Admin or Ownership role is required.");
 let player=String(opts.player||"").trim(), reason=String(opts.reason||"").replace(/[\r\n]/g," ").trim().slice(0,160), command="";
 if(["kick","ban","unban"].includes(name)){
   if(!player||player.length>32||/[\r\n]/.test(player)) return reply("Enter a valid player name or Roblox ID.");
   if(!reason) return reply("A reason is required.");
   if(name!=="kick"&&!/^[A-Za-z0-9_]{1,20}$/.test(player)&&!/^\d{5,20}$/.test(player)) return reply("Enter a valid Roblox username or numeric ID.");
   if(name==="kick"&&!/^[A-Za-z0-9_]{1,20}$/.test(player)) return reply("Enter a valid Roblox username.");
   command=":"+name+" "+player+(name==="kick"?" "+reason:"");
 } else {
   command=String(opts.command||"").trim();
   if(!command||/[\r\n]/.test(command)) return reply("Enter one single-line command.");
   if(!command.startsWith(":")) command=":"+command;
   if(command.length>160) return reply("Command is too long (maximum 160 characters).");
   const parts=command.slice(1).trim().split(/\s+/);
   const verb=(parts.shift()||"").toLowerCase();
   const allowed=new Set(["h","m","pm","weather","time","prty","pt","jail","unjail","free","respawn","load","heal","kill","down","wanted","unwanted","bring","to","tp","view","refresh","startfire","startnearfire","stopfire","stopdumpsterfire","logs","killlogs","kl","bans","commands","cmds","helpers","mods","admins","tocar","toatv"]);
   if(!allowed.has(verb)) return reply("That command is not approved for remote use. Use an ER:LC private-server command from the approved list.");
   if(/(^|\s)(all|others)(\s|$)/i.test(command)) return reply("Commands targeting all players or others are blocked for remote use.");
   if(["h","m","pm"].includes(verb)&&parts.length< (verb==="pm"?2:1)) return reply(verb==="pm"?"Use :pm Player message":"Add a message after :"+verb+".");
   if(["weather","time","prty","pt","jail","unjail","free","respawn","load","heal","kill","down","wanted","unwanted","bring","to","view","refresh"].includes(verb)&&parts.length<1) return reply("Add the required player or value after :"+verb+".");
   if(verb==="tp"&&parts.length<2) return reply("Use :tp Player1 Player2.");
   if(["startfire","startnearfire"].includes(verb)&&!["house","brush","building"].includes((parts[0]||"").toLowerCase())) return reply("Fire type must be House, Brush, or Building.");
   if(verb==="weather"&&!["clear","fog","rain","thunderstorm"].includes((parts[0]||"").toLowerCase())) return reply("Weather must be Clear, Fog, Rain, or Thunderstorm.");
   if(["time","prty","pt"].includes(verb)&&(!/^\d+$/.test(parts[0]||"")||(verb==="time"&&Number(parts[0])>24)||(verb!=="time"&&Number(parts[0])<1))) return reply(verb==="time"?"Time must be between 0 and 24.":"Enter a positive number of seconds for :"+verb+".");
   player="—"; reason="Administrator server command";
 }
 const gate=await dataRequest(env, "/modgate",{method:"POST"}); if(!gate.ok){const d=await gate.json();return reply(d.message||"Please wait before sending another ER:LC command.");}
 let ok=false, result=""; try { const key=String(env.ERLC_SERVER_KEY||"").trim(); if(!key) throw new Error("ER:LC server key is not configured."); const res=await fetch("https://api.erlc.gg/v2/server/command",{method:"POST",headers:{"server-key":key,...(String(env.ERLC_GLOBAL_API_KEY||"").trim()?{Authorization:String(env.ERLC_GLOBAL_API_KEY).trim()}:{}),"content-type":"application/json"},body:JSON.stringify({command})}); const body=await res.text(); let data={}; try{data=JSON.parse(body)}catch{} if(!res.ok||data.success===false||data.Success===false) throw new Error(String(data.message||data.Message||"ER:LC rejected the command (HTTP "+res.status+")").slice(0,200)); ok=true; result=String(data.message||data.Message||"ER:LC accepted the command."); } catch(e){result=String(e.message||e)}
 if(!ok) return reply("ER:LC action failed: "+result); return reply("ER:LC accepted "+name+" for "+player+". Reason: "+reason+". Recorded in moderation logs.");
}

async function auditedModerationRun(env, interaction, name, source) {
  const user=interaction.member?.user||interaction.user||{};
  const options=Object.fromEntries((interaction.data?.options||[]).map(item=>[item.name,item.value]));
  const attempt=name==="erlc-command"?String(options.command||""):[options.player,options.reason].filter(Boolean).join(" — ");
  let response, failure="";
  try { response=await moderationRun(env,interaction,name); }
  catch(error){failure=String(error?.message||error).slice(0,500);response={type:4,data:{content:"Moderation command failed: "+failure,flags:64,allowed_mentions:{parse:[]}}};}
  const message=String(response?.data?.content||"No response");
  const success=message.startsWith("ER:LC accepted");
  const outcome=failure||message;
  await sendModerationLog(env,"**"+name.toUpperCase()+" — "+(success?"SUCCESS":"ATTEMPT / FAILED")+"**\nSource: "+source+"\nStaff: "+(user.global_name||user.username||"Unknown")+" ("+(user.id||"unknown")+")\nAttempt: "+(attempt||"No arguments")+"\nOutcome: "+outcome);
  try { await dataRequest(env,"/modlog-write",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({at:new Date().toISOString(),action:name,player:String(options.player||"—"),reason:String(options.reason||""),staff:user.global_name||user.username||"Unknown",discordId:user.id||"",command:name==="erlc-command"?String(options.command||""):"",source,ok:success,result:outcome})}); }
  catch(error){console.error("Moderation audit database write failed; Discord log was attempted independently:",error.message);}
  return response;
}

async function banBoloInteraction(env, interaction) {
 const roles=interaction.member?.roles||[],perms=BigInt(interaction.member?.permissions||"0");
 const owner=roles.includes("1573038226510192864")||(perms&8n)===8n;
 const admin=owner||roles.includes("1573038142963978441");
 const staff=admin||roles.includes("1573028899405693049");
 const reply=(content)=>({type:4,data:{content,allowed_mentions:{parse:[]}}});
 if(!staff)return reply("Texas State Roleplay Staff or Admin access is required to submit a Ban BOLO.");
 if(interaction.channel_id && interaction.channel_id!==CHANNELS.commands)return reply("Ban BOLO submissions are only available in the designated Commands channel.");
 const opts=Object.fromEntries((interaction.data?.options||[]).map(x=>[x.name,x.value]));
 const player=String(opts.player||"").trim(),reason=String(opts.reason||"").trim();
 const evidence=String(opts.evidence||"").trim().split(/\s+/).filter(Boolean);
 if(!/^[A-Za-z0-9_]{1,20}$/.test(player)&&!/^\d{5,20}$/.test(player))return reply("Enter a valid Roblox username or numeric ID.");
 if(!reason||reason.length>1000)return reply("A clear reason is required (maximum 1,000 characters).");
 if(evidence.length>5||evidence.some(x=>x.length>500||!/^https:\/\//i.test(x)))return reply("Evidence must be up to five HTTPS links, separated by spaces.");
 const user=interaction.member?.user||interaction.user||{},now=new Date().toISOString(),id=crypto.randomUUID();
 const entry={id,player,category:"other",reason,evidence,requestedPunishment:"ban",submitter:user.global_name||user.username||"Unknown",submitterId:user.id||"",createdAt:now,updatedAt:now,status:"pending",adminNote:"",punishment:"",history:[{at:now,by:user.global_name||user.username||"Unknown",byId:user.id||"",status:"pending",note:"Ban BOLO submitted through Discord"}]};
 const saved=await dataRequest(env, "/bolo-create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(entry)});
 if(!saved.ok)return reply("Could not save this Ban BOLO. Please try again or contact Ownership.");
 const row={type:1,components:[{type:2,style:3,label:"Accept",custom_id:"bolo:accept:"+id},{type:2,style:4,label:"Deny",custom_id:"bolo:deny:"+id},{type:2,style:2,label:"Need More Evidence",custom_id:"bolo:evidence:"+id}]};
 let posted; try { posted=await discordChannelMessage(env,CHANNELS.pending,{embeds:[{title:"NEW BAN BOLO — PENDING ADMIN REVIEW",color:16763904,fields:[{name:"Player",value:player},{name:"Reason",value:reason.slice(0,1024)},{name:"Evidence",value:(evidence.length?evidence.join("\n"):"Not supplied").slice(0,1024)},{name:"Submitted by",value:user.global_name||user.username||"Unknown"},{name:"Reference",value:id}],footer:{text:"Accepting records approval only; Admin must apply the ER:LC ban separately."}}],components:[row],allowed_mentions:{parse:[]}}); } catch(e) { console.error("Ban BOLO saved but Discord approval-channel delivery failed",e.message); return {type:4,data:{content:"Your Ban BOLO was saved, but the approval embed could not be posted. Check the bot's View Channel, Send Messages, Embed Links and Use External Apps permissions in the Pending Ban BOLO channel. Discord error: "+String(e.message||e).slice(0,180),flags:64,allowed_mentions:{parse:[]}}}; }
 const messageSaved=await dataRequest(env, "/bolo-message",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,messageId:posted.id,channelId:CHANNELS.pending})}); if(!messageSaved.ok) console.error("Ban BOLO posted but message reference could not be saved.");
 return {type:4,data:{content:"Your Ban BOLO for **"+player+"** was saved and sent to the Pending Ban BOLO channel. Reference: "+id,flags:64,allowed_mentions:{parse:[]}}};
}
async function banBoloReviewInteraction(env, interaction) {
 const reply=(content)=>({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
 const parts=String(interaction.data?.custom_id||"").split(":");
 if(parts.length!==3||parts[0]!=="bolo")return reply("Unknown Ban BOLO action.");
 const action=parts[1],id=parts[2],roles=interaction.member?.roles||[],perms=BigInt(interaction.member?.permissions||"0");
 const admin=roles.includes("1573038226510192864")||roles.includes("1573038142963978441")||(perms&8n)===8n;
 if(!admin)return reply("Only Admin or Ownership can review Ban BOLOs.");
 if(interaction.channel_id && interaction.channel_id!==CHANNELS.pending)return reply("Ban BOLO review buttons only work in the Pending Ban BOLO channel.");
 const states={accept:"accepted",deny:"rejected",evidence:"evidence_needed"},status=states[action];
 if(!status)return reply("Unknown Ban BOLO decision.");
 const all=await dataRequest(env, "/bolos?all=1"),data=await all.json(),bolo=(data.bolos||[]).find(x=>x.id===id);
 if(!bolo)return reply("This Ban BOLO could not be found.");
 if(["accepted","rejected"].includes(bolo.status))return reply("This Ban BOLO has already been reviewed.");
 const notes={accept:"Accepted by Admin. Admin must now apply the ER:LC ban separately.",deny:"Denied by Admin.",evidence:"More evidence is required. Please add clear screenshot/video evidence and submit an updated Ban BOLO."};
 const user=interaction.member?.user||interaction.user||{},at=new Date().toISOString();
 const update=await dataRequest(env, "/bolo-update",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,status,adminNote:notes[action],punishment:"",by:user.global_name||user.username||"Admin",byId:user.id||"",at})});
 const result=await update.json();if(!update.ok||!result.ok)return reply(result.error||"Could not save the Admin decision.");
 try {
  const token=tokenFrom(env);
  if(token&&bolo.submitterId){
   const dm=await fetch("https://discord.com/api/v10/users/@me/channels",{method:"POST",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},body:JSON.stringify({recipient_id:bolo.submitterId})});
   if(dm.ok){const channel=await dm.json();await fetch("https://discord.com/api/v10/channels/"+channel.id+"/messages",{method:"POST",headers:{Authorization:"Bot "+token,"Content-Type":"application/json"},body:JSON.stringify({content:"Your Ban BOLO for **"+bolo.player+"** was updated to **"+status.replace("_"," ")+"**.\nAdmin response: "+notes[action],allowed_mentions:{parse:[]}})});}
  }
 } catch {}
 await sendModerationLog(env,"**BAN BOLO "+status.replace("_"," ").toUpperCase()+"**\nPlayer: "+bolo.player+"\nReviewed by: "+(user.global_name||user.username||"Admin")+"\nReference: "+id+"\n"+notes[action]);
 const message=interaction.message?.content||("Ban BOLO for "+bolo.player);
 return {type:7,data:{content:message+"\n\n**Admin decision:** "+status.replace("_"," ").toUpperCase()+"\n**Reviewed by:** "+(user.global_name||user.username||"Admin")+"\n**Response:** "+notes[action],components:[],allowed_mentions:{parse:[]}}};
}



function deferWorkflowResponse(env,interaction,waitUntil,task) {
  const job = Promise.resolve().then(task).then(async result => {
    const payload = result?.data || {};
    const body = {};
    if (payload.content !== undefined) body.content = payload.content;
    if (payload.embeds !== undefined) body.embeds = payload.embeds;
    if (payload.components !== undefined) body.components = payload.components;
    body.allowed_mentions = payload.allowed_mentions || {parse:[]};
    const url = "https://discord.com/api/v10/webhooks/" + APP_ID + "/" + encodeURIComponent(interaction.token) + "/messages/@original";
    const response = await fetch(url,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    if (!response.ok) console.error("Deferred Discord interaction update failed:",response.status,(await response.text()).slice(0,250));
  }).catch(async error => {
    const url = "https://discord.com/api/v10/webhooks/" + APP_ID + "/" + encodeURIComponent(interaction.token) + "/messages/@original";
    try {
      await fetch(url,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({content:"The workflow failed: " + String(error.message||error).slice(0,1200),allowed_mentions:{parse:[]}})});
    } catch {}
    console.error("Deferred Discord workflow failed:",String(error.message||error));
  });
  waitUntil(job);
  return {type:5,data:{flags:64}};
}

function interactionRoleState(interaction) {
  const roles = interaction.member?.roles || [];
  const perms = BigInt(interaction.member?.permissions || "0");
  const owner = roles.includes("1573038226510192864") || (perms & 8n) === 8n;
  const admin = owner || roles.includes("1573038142963978441");
  const ia = roles.includes("1573038132289343609");
  const staff = roles.includes("1573028899405693049");
  return { roles, owner, admin, ia, staff, manager:owner || admin || ia, moderator:owner || admin || staff };
}
function interactionUser(interaction) {
  return interaction.member?.user || interaction.user || {};
}
function workflowReply(content, ephemeral = true) {
  return { type:4, data:{ content:String(content).slice(0,1900), ...(ephemeral?{flags:64}:{}), allowed_mentions:{parse:[]} } };
}
async function discordApi(env, path, init = {}) {
  const token = tokenFrom(env);
  if (!token) throw new Error("Discord bot token is not configured.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization","Bot " + token);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("content-type")) headers.set("content-type","application/json");
  const response = await fetch("https://discord.com/api/v10" + path,{...init,headers});
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message:raw.slice(0,300) }; }
  if (!response.ok) throw new Error("Discord API " + response.status + ": " + String(data?.message || data?.error || raw || "Request failed").slice(0,350));
  return data;
}
async function discordFileMessage(env, channelId, payload, filename, content, contentType = "text/plain") {
  const form = new FormData();
  form.append("payload_json",JSON.stringify(payload));
  form.append("files[0]",new Blob([content],{type:contentType}),filename);
  return discordApi(env,"/channels/" + encodeURIComponent(channelId) + "/messages",{method:"POST",body:form});
}

async function discordUploadAttachments(env,channelId,payload,attachments) {
  const form = new FormData();
  form.append("payload_json",JSON.stringify(payload));
  let totalBytes = 0;
  for (let index=0; index<attachments.length; index++) {
    const attachment = attachments[index];
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error("Could not retrieve uploaded proof file " + attachment.filename + " (HTTP " + response.status + ").");
    const bytes = await response.arrayBuffer();
    totalBytes += bytes.byteLength;
    if (totalBytes > 8 * 1024 * 1024) throw new Error("Uploaded proof files exceed the 8 MB review-message limit.");
    const filename = String(attachment.filename || ("proof-" + (index+1))).replace(/[\r\n"\\]/g,"_").slice(0,100);
    form.append("files[" + index + "]",new Blob([bytes],{type:attachment.content_type || "application/octet-stream"}),filename);
  }
  return discordApi(env,"/channels/" + encodeURIComponent(channelId) + "/messages",{method:"POST",body:form});
}

async function workflowData(env,path,method="GET",body) {
  const init = {method,headers:{"content-type":"application/json"}};
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await dataRequest(env,path,init);
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = {error:raw.slice(0,300)}; }
  if (!response.ok || data.ok === false) throw new Error(data.error || "Workflow storage request failed (HTTP " + response.status + ").");
  return data;
}
function ticketSupportRoles(category) {
  if (category === "ownership") return ["1573038226510192864","1573038142963978441"];
  if (category === "internal-affairs") return ["1573038132289343609","1573038142963978441","1573038226510192864"];
  return ["1573028899405693049","1573038132289343609","1573038142963978441","1573038226510192864"];
}
function ticketPingRoles(category) {
  if (category === "ownership") return ["1573038226510192864"];
  if (category === "internal-affairs") return ["1573038132289343609"];
  return ["1573028899405693049"];
}
function slug(value) {
  const out = String(value || "member").toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,45);
  return out || "member";
}
async function postTicketPanel(env) {
  const embed = {title:"Texas State Roleplay | Support Center",description:"Select the ticket type that best matches your request.\n\n**General Ticket** — general queries, support and community assistance.\n**Ownership Ticket** — Private matters that require Ownership review.\n**Internal Affairs ticket:** Staff complaints, staff conduct or sensitive investigations.\n\nPlease one ticket per issue and include all the relevant details. Don't open duplicate tickets.",color:5793266,footer:{text:"Texas State Roleplay • Ticket Support"}};
  return discordChannelMessage(env,CHANNELS.ticketPanel,{embeds:[embed],components:[{type:1,components:[
    {type:2,style:1,label:"General Ticket",custom_id:"ticket:create:general"},
    {type:2,style:2,label:"Ownership",custom_id:"ticket:create:ownership"},
    {type:2,style:4,label:"Internal Affairs",custom_id:"ticket:create:internal-affairs"}
  ]}],allowed_mentions:{parse:[]}});
}
async function createTicket(env,interaction,category) {
  const user = interactionUser(interaction);
  if (!user.id) return workflowReply("Could not identify your Discord account.");
  if (!["general","ownership","internal-affairs"].includes(category)) return workflowReply("That ticket type is not available.");
  let created;
  try { created = await workflowData(env,"/workflow/ticket-create","POST",{ownerId:user.id,username:user.global_name||user.username||"member",category,guildId:GUILD_ID}); }
  catch (error) {
    const existing = /already have an open ticket:\s*([0-9]+)/i.exec(error.message);
    if (existing) {
      try {
        const old = await workflowData(env,"/workflow/ticket","GET");
        return workflowReply("You already have an open ticket. Please use that ticket instead.");
      } catch {}
    }
    return workflowReply(error.message);
  }
  const ticket = created.ticket, supportRoles = ticketSupportRoles(category);
  const viewSend = "117760";
  const overwrites = [
    {id:GUILD_ID,type:0,allow:"0",deny:"1024"},
    {id:user.id,type:1,allow:viewSend,deny:"0"},
    {id:APP_ID,type:1,allow:viewSend,deny:"0"},
    ...supportRoles.map(id=>({id,type:0,allow:viewSend,deny:"0"}))
  ];
  let channel;
  try {
    channel = await discordApi(env,"/guilds/" + GUILD_ID + "/channels",{method:"POST",body:JSON.stringify({
      name:slug((user.username||user.global_name||"member") + "-" + ticket.id),
      type:0,
      parent_id:CHANNELS.ticketCategory,
      topic:"Texas State Roleplay ticket #" + ticket.id + " | owner:" + user.id + " | type:" + category,
      permission_overwrites:overwrites
    })});
    await workflowData(env,"/workflow/ticket-update","POST",{id:ticket.id,status:"open",channelId:channel.id});
    const intro = {embeds:[{title:"Ticket #" + ticket.id + " • " + category.replace(/-/g," ").toUpperCase(),description:"Welcome <@" + user.id + ">. Please explain your request clearly and include any relevant evidence.\n\n**Ticket owner:** <@" + user.id + ">\n**Ticket type:** " + category.replace(/-/g," ") + "\n**Ticket number:** #" + ticket.id + "\n\nUse **Claim** when a staff member takes responsibility, **Ping Staff** when you need attention, and **Close Ticket** when the matter is resolved.",color:5793266,footer:{text:"Texas State Roleplay Support"}}],components:[{type:1,components:[
      {type:2,style:4,label:"Close Ticket",custom_id:"ticket:close:" + ticket.id},
      {type:2,style:2,label:"Claim Ticket",custom_id:"ticket:claim:" + ticket.id},
      {type:2,style:1,label:"Ping Staff",custom_id:"ticket:ping:" + ticket.id}
    ]}],allowed_mentions:{users:[user.id]}};
    await discordChannelMessage(env,channel.id,intro);
    return workflowReply("Your ticket #" + ticket.id + " has been created: <#" + channel.id + ">.");
  } catch (error) {
    try { await workflowData(env,"/workflow/ticket-update","POST",{id:ticket.id,status:"closed",closedAt:new Date().toISOString()}); } catch {}
    if (channel?.id) { try { await discordApi(env,"/channels/" + channel.id,{method:"DELETE"}); } catch {} }
    return workflowReply("Ticket creation failed: " + error.message);
  }
}
async function ticketByChannel(env,channelId) {
  return workflowData(env,"/workflow/ticket?channelId=" + encodeURIComponent(channelId),"GET");
}
async function ticketTranscript(env,ticket,channelId,closedBy) {
  let before = "", messages = [];
  for (let page=0; page<10; page++) {
    const query = before ? "?limit=100&before=" + encodeURIComponent(before) : "?limit=100";
    const batch = await discordApi(env,"/channels/" + channelId + "/messages" + query);
    if (!Array.isArray(batch) || !batch.length) break;
    messages.push(...batch);
    before = batch[batch.length-1].id;
    if (batch.length < 100) break;
  }
  messages.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
  const lines = [
    "Texas State Roleplay — Ticket Transcript",
    "Ticket: #" + ticket.id,
    "Type: " + ticket.category,
    "Owner: " + ticket.username + " (" + ticket.ownerId + ")",
    "Claimed by: " + (ticket.claimedBy || "Unclaimed"),
    "Closed by: " + (closedBy.global_name || closedBy.username || closedBy.id || "Unknown"),
    "Exported: " + new Date().toISOString(),
    "Messages exported: " + messages.length,
    "============================================================"
  ];
  for (const message of messages) {
    const author = message.author || {};
    lines.push("[" + (message.timestamp || "") + "] " + (author.global_name || author.username || "Unknown") + " (" + (author.id || "") + "):");
    if (message.content) lines.push(String(message.content).replace(/\r/g,"").slice(0,4000));
    for (const attachment of message.attachments || []) lines.push("[Attachment] " + attachment.filename + " — " + attachment.url);
    for (const embed of message.embeds || []) lines.push("[Embed] " + (embed.title || "") + " " + (embed.description || ""));
    lines.push("");
  }
  const content = lines.join("\n");
  const payload = {embeds:[{title:"Ticket #" + ticket.id + " closed",description:"Transcript for **" + ticket.username + "** was saved.\nType: " + ticket.category + "\nMessages: " + messages.length + "\nClosed by: <@" + (closedBy.id || ticket.ownerId) + ">",color:15158332,footer:{text:"Texas State Roleplay • Ticket Archive"}}],allowed_mentions:{parse:[]}};
  return discordFileMessage(env,CHANNELS.ticketTranscripts,payload,"ticket-" + ticket.id + "-transcript.txt",content,"text/plain");
}
async function closeTicket(env,interaction,ticketId) {
  const user = interactionUser(interaction), state = interactionRoleState(interaction);
  let result;
  try { result = ticketId ? await workflowData(env,"/workflow/ticket?id=" + encodeURIComponent(ticketId),"GET") : await ticketByChannel(env,interaction.channel_id); }
  catch (error) { return workflowReply(error.message); }
  const ticket = result.ticket;
  const allowed = user.id === ticket.ownerId || state.owner || state.admin || state.ia || state.staff;
  if (!allowed) return workflowReply("Only the ticket owner or an authorized staff member can close this ticket.");
  if (ticket.status === "closed" && !ticket.transcriptMessageId) return workflowReply("This ticket is already closed.");
  try {
    // Reuse an existing archive on retries so a failed channel deletion never creates duplicate transcripts.
    const archived = ticket.transcriptMessageId
      ? { id: ticket.transcriptMessageId }
      : await ticketTranscript(env,ticket,interaction.channel_id || ticket.channelId,user);
    if (!ticket.transcriptMessageId) {
      await workflowData(env,"/workflow/ticket-update","POST",{id:ticket.id,transcriptMessageId:archived.id,transcriptChannelId:CHANNELS.ticketTranscripts});
    }
    // Delete only after Discord confirms the transcript upload succeeded.
    try {
      await discordApi(env,"/channels/" + ticket.channelId,{method:"DELETE"});
    } catch (deleteError) {
      console.error("Ticket channel deletion failed after transcript archive", {ticketId:ticket.id,channelId:ticket.channelId,error:deleteError.message});
      return workflowReply("The transcript was saved, but Discord could not delete the ticket channel: " + deleteError.message + ". The ticket can be retried without creating another transcript.");
    }
    await workflowData(env,"/workflow/ticket-update","POST",{id:ticket.id,status:"closed",closedAt:new Date().toISOString(),transcriptMessageId:archived.id,transcriptChannelId:CHANNELS.ticketTranscripts});
    return workflowReply("Ticket #" + ticket.id + " was closed, its transcript was saved, and its channel was deleted.");
  } catch (error) {
    return workflowReply("The transcript could not be safely saved or the ticket could not be finalized: " + error.message);
  }
}
async function ticketComponent(env,interaction) {
  const parts = String(interaction.data?.custom_id || "").split(":");
  if (parts.length !== 3 || parts[0] !== "ticket") return workflowReply("Unknown ticket action.");
  const action = parts[1], id = parts[2];
  if (action === "create") return createTicket(env,interaction,id);
  let result;
  try { result = await workflowData(env,"/workflow/ticket?id=" + encodeURIComponent(id),"GET"); }
  catch (error) { return workflowReply(error.message); }
  const ticket = result.ticket, user = interactionUser(interaction), state = interactionRoleState(interaction);
  if (ticket.channelId !== interaction.channel_id) return workflowReply("This ticket button is no longer active in this channel.");
  const permitted = user.id === ticket.ownerId || state.owner || state.admin || state.ia || state.staff;
  if (!permitted) return workflowReply("You do not have access to manage this ticket.");
  if (action === "close") return closeTicket(env,interaction,id);
  if (action === "claim") {
    if (!(state.owner || state.admin || state.ia || state.staff)) return workflowReply("Only support staff can claim tickets.");
    if (ticket.claimedById && ticket.claimedById !== user.id) return workflowReply("This ticket is already claimed by <@" + ticket.claimedById + ">.");
    const label = user.global_name || user.username || user.id;
    await workflowData(env,"/workflow/ticket-update","POST",{id,claimedBy:label,claimedById:user.id});
    await discordChannelMessage(env,ticket.channelId,{content:"<@" + user.id + "> has claimed ticket #" + id + ".",allowed_mentions:{users:[user.id]}});
    return workflowReply("You have claimed ticket #" + id + ".");
  }
  if (action === "ping") {
    let pingResult;
    try { pingResult = await workflowData(env,"/workflow/ticket-ping","POST",{id}); }
    catch (error) { return workflowReply(error.message); }
    const roles = ticketPingRoles(ticket.category);
    const ownerId = ticket.ownerId;
    await discordChannelMessage(env,ticket.channelId,{content:"Staff assistance requested for ticket owner <@" + ownerId + "> (requested by <@" + user.id + ">). " + roles.map(role=>"<@&"+role+">").join(" "),allowed_mentions:{users:[ownerId,user.id],roles}});
    const minutes = Math.ceil(Number(pingResult.cooldownSeconds || 300) / 60);
    return workflowReply("The relevant staff team has been pinged. The next ping is available in " + minutes + " minute" + (minutes === 1 ? "" : "s") + ".");
  }
  return workflowReply("Unknown ticket action.");
}
async function postFastpassPanel(env) {
  return discordChannelMessage(env,CHANNELS.fastpassPanel,{embeds:[{title:"Texas State Roleplay | Fast Pass Application",description:"Use the button below to apply for a Fast Pass.\n\nYou must provide:\n• Your previous role(s) and the communities where you held them.\n• Links to proof of those roles (screenshots or other evidence).\n• A valid invite to the server where you currently hold or held those roles.\n\nApplications are reviewed by authorized staff. Submitting false evidence may result in denial.",color:5793266,footer:{text:"Texas State Roleplay • Fast Pass"}}],components:[{type:1,components:[{type:2,style:1,label:"Apply for Fast Pass",custom_id:"fastpass:open"}]}],allowed_mentions:{parse:[]}});
}
function modalValue(interaction,customId) {
  const visit = components => {
    for (const component of components || []) {
      if (component.custom_id === customId && component.value !== undefined) return String(component.value || "").trim();
      if (component.component) {
        const value = visit([component.component]);
        if (value) return value;
      }
      const value = visit(component.components);
      if (value) return value;
    }
    return "";
  };
  return visit(interaction.data?.components || []);
}
function modalFileValues(interaction,customId) {
  const visit = components => {
    for (const component of components || []) {
      if (component.custom_id === customId && Array.isArray(component.values)) return component.values;
      if (component.component) {
        const value = visit([component.component]);
        if (value.length) return value;
      }
      const value = visit(component.components);
      if (value.length) return value;
    }
    return [];
  };
  return visit(interaction.data?.components || []);
}
async function fastpassModal(env,interaction) {
  if (interaction.data?.custom_id !== "fastpass:submit") return workflowReply("Unknown Fast Pass form.");
  const user = interactionUser(interaction);
  const previousRoles = modalValue(interaction,"previous_roles"), invite = modalValue(interaction,"server_invite");
  const uploadedIds = modalFileValues(interaction,"proof_files");
  const resolved = interaction.data?.resolved?.attachments || {};
  const attachments = uploadedIds.map(id=>resolved[id]).filter(Boolean);
  if (!previousRoles || !invite || !uploadedIds.length || attachments.length !== uploadedIds.length) return workflowReply("Please complete your previous roles, upload at least one proof file, and provide the server invite.");
  if (attachments.length > 5) return workflowReply("You may upload a maximum of five proof files.");
  const validAttachments = attachments.filter(file => /^https:\/\//i.test(file.url||"") && (Number(file.size||0) <= 8*1024*1024) && /\.(png|jpe?g|webp|gif|mp4|mov|pdf)$/i.test(file.filename||""));
  if (validAttachments.length !== attachments.length) return workflowReply("Proof files must be PNG, JPG, WEBP, GIF, MP4, MOV or PDF, and each file must be no larger than 8 MB.");
  const urls = validAttachments.map(file=>file.url);
  if (!/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+\/?$/i.test(invite)) return workflowReply("Please provide a valid Discord invite URL.");
  let created;
  try { created = await workflowData(env,"/workflow/fastpass-create","POST",{ownerId:user.id,username:user.global_name||user.username||"member",previousRoles,proofLinks:urls.join("\n"),proofFiles:validAttachments.map(file=>({filename:file.filename,url:file.url,size:Number(file.size||0),content_type:file.content_type||""})),invite}); }
  catch (error) { return workflowReply(error.message); }
  const record = created.record;
  let posted;
  try {
    const imageEmbeds = validAttachments
      .filter(file => /^image\//i.test(file.content_type || "") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.filename || ""))
      .map((file,index) => {
        const safeName = String(file.filename || ("proof-" + (index+1))).replace(/[\r\n"\\]/g,"_").slice(0,100);
        return {image:{url:"attachment://" + safeName},description:"Proof image " + (index+1) + " • " + safeName};
      });
    const payload = {embeds:[{title:"FAST PASS APPLICATION • " + record.id,description:"A new Fast Pass application is awaiting review. Proof photos are displayed directly below for easy viewing on desktop and mobile.",color:16763904,fields:[
      {name:"Applicant",value:"<@" + user.id + "> (" + (user.global_name || user.username || "Unknown") + ")"},
      {name:"Previous roles",value:previousRoles.slice(0,1024)},
      {name:"Proof files",value:validAttachments.map(file=>file.filename).join("\n").slice(0,1024)},
      {name:"Server invite",value:invite},
      {name:"Application ID",value:record.id}
    ],footer:{text:"Only Admin, Internal Affairs and Ownership may review this application."}},...imageEmbeds],components:[{type:1,components:[
      {type:2,style:3,label:"Approve",custom_id:"fastpass:approve:" + record.id},
      {type:2,style:4,label:"Deny",custom_id:"fastpass:deny:" + record.id},
      {type:2,style:2,label:"Need More Evidence",custom_id:"fastpass:evidence:" + record.id}
    ]}],allowed_mentions:{users:[user.id],parse:[]}};
    posted = await discordUploadAttachments(env,CHANNELS.fastpassReview,payload,validAttachments);
    await workflowData(env,"/workflow/fastpass-update","POST",{id:record.id,status:"pending",reviewMessageId:posted.id,reviewChannelId:CHANNELS.fastpassReview,reviewer:""});
  } catch (error) { return workflowReply("Your application was saved as " + record.id + " but could not be posted for review: " + error.message); }
  return workflowReply("Your Fast Pass application **" + record.id + "** was submitted with " + attachments.length + " proof file(s).");
}

async function fastpassComponent(env,interaction) {
  const customId = String(interaction.data?.custom_id || "");
  if (customId === "fastpass:open") return {type:9,data:{custom_id:"fastpass:submit",title:"Fast Pass Application",components:[
    {type:18,label:"Previous roles and communities",component:{type:4,custom_id:"previous_roles",style:2,min_length:3,max_length:1000,required:true,placeholder:"List your previous ranks and server names."}},
    {type:18,label:"Upload proof of previous roles (1–5 files)",description:"Screenshots, videos or PDF proof. Max 8 MB each.",component:{type:19,custom_id:"proof_files",min_values:1,max_values:5,required:true,file_types:["image","video",".pdf"]}},
    {type:18,label:"Previous server invite",component:{type:4,custom_id:"server_invite",style:1,min_length:8,max_length:200,required:true,placeholder:"https://discord.gg/..."} }
  ]}};
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "fastpass") return workflowReply("Unknown Fast Pass action.");
  const action = parts[1], id = parts[2], state = interactionRoleState(interaction), user = interactionUser(interaction);
  if (!(state.owner || state.admin || state.ia)) return workflowReply("Only Admin, Internal Affairs or Ownership may review Fast Pass applications.");
  if (interaction.channel_id !== CHANNELS.fastpassReview) return workflowReply("Fast Pass review buttons only work in the configured review channel.");
  let result;
  try { result = await workflowData(env,"/workflow/fastpass?id=" + encodeURIComponent(id),"GET"); }
  catch (error) { return workflowReply(error.message); }
  const record = result.record;
  if (record.status === "approved" || record.status === "denied") return workflowReply("This Fast Pass application has already been reviewed.");
  const states = {approve:"approved",deny:"denied",evidence:"evidence_needed"};
  const status = states[action];
  if (!status) return workflowReply("Unknown Fast Pass decision.");
  const note = status === "approved" ? "Approved" : status === "denied" ? "Denied" : "More evidence requested";
  await workflowData(env,"/workflow/fastpass-update","POST",{id,status,reviewer:user.global_name||user.username||user.id,reviewNote:note,reviewMessageId:interaction.message?.id||record.reviewMessageId,reviewChannelId:CHANNELS.fastpassReview});
  const embed = {...(interaction.message?.embeds?.[0] || {}),title:"FAST PASS APPLICATION • " + id + " • " + status.toUpperCase(),description:note + " by " + (user.global_name||user.username||"staff") + ".",color:status==="approved"?5763719:status==="denied"?15548997:16763904};
  const components = (interaction.message?.components || []).map(row=>({...row,components:(row.components||[]).map(component=>({...component,disabled:true}))}));
  try { await discordApi(env,"/channels/" + interaction.channel_id + "/messages/" + interaction.message.id,{method:"PATCH",body:JSON.stringify({embeds:[embed],components})}); } catch {}
  try { await sendModerationLog(env,"**FAST PASS " + status.toUpperCase() + "**\nApplication: " + id + "\nApplicant: " + record.username + "\nReviewed by: " + (user.global_name||user.username||"Unknown")); } catch {}
  return workflowReply("Fast Pass application " + id + " marked **" + status.replace("_"," ") + "**.");
}
async function staffRecordCommand(env,interaction) {
  const state = interactionRoleState(interaction);
  if (!(state.owner || state.admin || state.ia)) return workflowReply("Only Admin, Internal Affairs or Ownership can create staff records.");
  const group = interaction.data?.options?.[0] || {}, type = String(group.name || "").toLowerCase();
  const opts = Object.fromEntries((group.options || []).map(option=>[option.name,option.value]));
  const player = String(opts.player || "").trim(), reason = String(opts.reason || "").trim();
  const roleId = type === "promotion" ? String(opts.role || "").trim() : "";
  const appealable = type === "warning" ? String(opts.appealable || "").toLowerCase() : "";
  const roleData = roleId ? interaction.data?.resolved?.roles?.[roleId] : null;
  const roleName = roleData?.name || "";
  const channels = {promotion:CHANNELS.promotions,infraction:CHANNELS.infractions,warning:CHANNELS.warnings,strike:CHANNELS.strikes};
  if (!channels[type] || !player || !reason) return workflowReply("Select a record type and provide both a staff member and a reason.");
  if (type === "promotion" && (!roleId || !/^\d{17,20}$/.test(roleId))) return workflowReply("Choose the new role/rank for this promotion.");
  if (type === "warning" && !["yes","no"].includes(appealable)) return workflowReply("Choose whether this warning is appealable or not appealable.");
  const user = interactionUser(interaction), now = new Date().toISOString(), id = type.toUpperCase() + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
  const record = {id,type,player,reason,roleId:roleId||null,roleName:roleName||null,appealable:type==="warning"?appealable==="yes":null,staff:user.global_name||user.username||"Unknown",staffId:user.id,createdAt:now};
  try { await workflowData(env,"/workflow/record","POST",record); }
  catch (error) { return workflowReply("The record could not be saved: " + error.message); }
  const fields = [{name:"Staff member",value:player.slice(0,1024)}];
  if (type === "promotion") fields.push({name:"New role / rank",value:"<@&"+roleId+">"+(roleName?" ("+roleName+")":"")});
  if (type === "warning") fields.push({name:"Appealability",value:appealable==="yes"?"Appealable":"Not appealable",inline:true});
  fields.push({name:"Details",value:reason.slice(0,1024)},{name:"Issued by",value:"<@" + user.id + ">"},{name:"Record ID",value:id});
  try { await discordChannelMessage(env,channels[type],{embeds:[{title:"STAFF " + type.toUpperCase(),color:type==="promotion"?5763719:type==="warning"?16763904:15548997,fields,timestamp:now,footer:{text:"Texas State Roleplay • Staff Records"}}],allowed_mentions:{users:[user.id],parse:[]}}); }
  catch (error) { return workflowReply("Record was saved to the data store, but the Discord channel post failed: " + error.message); }
  return workflowReply(type.charAt(0).toUpperCase()+type.slice(1)+" record " + id + " was saved.");
}
async function archiveInGameLogs(env,sessionId) {
  let erlc={},erlcError="";
  try{erlc=await erlcServerData(env,["CommandLogs","ModCalls","JoinLogs","KillLogs"]);}catch(error){erlcError=String(error?.message||error).slice(0,500);}
  const storedLogs=await workflowData(env,"/workflow/modlogs-export","GET");
  const commandLogs=Array.isArray(erlc.CommandLogs)?erlc.CommandLogs:[],modCalls=Array.isArray(erlc.ModCalls)?erlc.ModCalls:[],joinLogs=Array.isArray(erlc.JoinLogs)?erlc.JoinLogs:[],killLogs=Array.isArray(erlc.KillLogs)?erlc.KillLogs:[];
  const websiteModerationLogs=Array.isArray(storedLogs.logs)?storedLogs.logs:[],websiteLogIds=Array.isArray(storedLogs.ids)?storedLogs.ids:[];
  const activeSessionId=String(storedLogs.sessionId||sessionId||"");
  const capturedAt=new Date().toISOString();
  const archive={community:"Texas State Roleplay",capturedAt,sessionId:activeSessionId||"unspecified",server:erlc.Name||"Texas State Roleplay",erlcLogsAvailable:!erlcError,erlcError:erlcError||null,commandLogs,modCalls,joinLogs,killLogs,websiteModerationLogs};
  const serialized=JSON.stringify(archive,null,2);
  if(serialized.length>7500000)throw new Error("The combined session archive is too large for one Discord file.");
  const counts={commandLogs:commandLogs.length,modCalls:modCalls.length,joinLogs:joinLogs.length,killLogs:killLogs.length,websiteModerationLogs:websiteModerationLogs.length};
  const message = await discordFileMessage(env,CHANNELS.logArchive,{embeds:[{title:"ER:LC SESSION LOG ARCHIVE",description:erlcError?"ER:LC was unavailable at shutdown. Available website audit records have still been archived.":"ER:LC logs and website moderation records captured before shutdown.",color:erlcError?16763904:5793266,fields:[
    {name:"Session",value:String(activeSessionId||"Unspecified")},{name:"ER:LC API",value:erlcError?"Unavailable — see archive file":"Available",inline:true},
    {name:"Command logs",value:String(counts.commandLogs),inline:true},{name:"Moderator calls",value:String(counts.modCalls),inline:true},{name:"Join/leave logs",value:String(counts.joinLogs),inline:true},{name:"Kill logs",value:String(counts.killLogs),inline:true},{name:"Website moderation records",value:String(counts.websiteModerationLogs),inline:true}
  ],timestamp:capturedAt,footer:{text:"Texas State Roleplay • Permanent Session Archive"}}],allowed_mentions:{parse:[]}},"texasrp-session-"+slug(activeSessionId||"session")+"-logs.json",serialized,"application/json");
  let websiteLogsDeleted=0,cleanupError="";
  if(websiteLogIds.length){try{const cleared=await workflowData(env,"/workflow/modlogs-clear","POST",{ids:websiteLogIds});websiteLogsDeleted=Number(cleared.deleted||0);}catch(error){cleanupError=String(error.message||error).slice(0,300);console.error("Discord archive saved but website log cleanup failed:",cleanupError);}}
  if(activeSessionId){try{await workflowData(env,"/workflow/session-end","POST",{sessionId:activeSessionId,endedAt:capturedAt,discordMessageId:message.id});}catch(error){cleanupError=[cleanupError,String(error.message||error).slice(0,250)].filter(Boolean).join("; ");console.error("Discord archive saved but session state could not be ended:",error.message);}}
  try{await workflowData(env,"/workflow/archive","POST",{id:"archive-"+slug(activeSessionId||"session")+"-"+Date.now(),createdAt:capturedAt,sessionId:activeSessionId,channelId:CHANNELS.logArchive,commandLogCount:counts.commandLogs,modCallCount:counts.modCalls,killLogCount:counts.killLogs,joinLogCount:counts.joinLogs,websiteModerationLogCount:counts.websiteModerationLogs,websiteModerationLogsDeleted:websiteLogsDeleted,discordMessageId:message.id,status:cleanupError?"archived_cleanup_failed":"archived",erlcLogsAvailable:!erlcError});}catch(error){console.error("Archive metadata could not be saved:",error.message);}
  return{counts,websiteLogsDeleted,cleanupError,messageId:message.id,erlcLogsAvailable:!erlcError,erlcError};
}
async function serverSessionCommand(env,interaction) {
  const state=interactionRoleState(interaction);
  if(!(state.owner||state.admin||state.ia))return workflowReply("Only Admin, Internal Affairs or Ownership can post server session updates.");
  const action=interaction.data?.options?.[0]?.name||"";
  if(action==="invite")return workflowReply("Join Texas State Roleplay: "+INVITE);
  const labels={"start-up":"SESSION STARTED","shutdown":"SESSION SHUTDOWN","low-on-players":"SESSION LOW ON PLAYERS"};
  if(!labels[action])return workflowReply("Choose start-up, shutdown or low-on-players.");
  if(!CHANNELS.sessions)return workflowReply("The session announcement channel has not been configured yet. Send Ownership the channel ID for session embeds.");
  const user=interactionUser(interaction),now=new Date().toISOString();
  let sessionId="";
  if(action==="start-up"){
    sessionId="session-"+crypto.randomUUID();
    try{await workflowData(env,"/workflow/session-start","POST",{sessionId,startedAt:now,hostId:user.id||"",host:user.global_name||user.username||"Unknown"});}
    catch(error){return workflowReply("Could not start website session logging: "+error.message);}
  }
  if(action==="shutdown"){
    try{
      const current=await workflowData(env,"/workflow/session-status","GET");
      if(!current.activeSessionId)return workflowReply("There is no active session to shut down. Start a session first.");
      sessionId=current.activeSessionId;
      await archiveInGameLogs(env,sessionId);
    }catch(error){return workflowReply("Shutdown was not completed because the Discord archive failed: "+String(error.message||error).slice(0,450)+". The active session remains open so you can retry.");}
  }
  if(!CHANNELS.sessions)return workflowReply("The session announcement channel has not been configured yet. Send Ownership the channel ID for session embeds.");
  const description=action==="start-up"?"A new Texas State Roleplay ER:LC session is now starting. Join the server and follow all session instructions.":action==="shutdown"?"The Texas State Roleplay ER:LC session has been shut down. The permanent session archive was saved to Discord.":"The server is currently low on players. More community members are needed to keep the session active.";
  const color=action==="start-up"?5763719:action==="shutdown"?15548997:16763904;
  try{
    await clearPreviousSessionStatusMessages(env,CHANNELS.sessions);
    await discordChannelMessage(env,CHANNELS.sessions,{embeds:[{title:labels[action],description,color,fields:[{name:"Session host",value:"<@"+user.id+">"},{name:"Time",value:now}],timestamp:now,footer:{text:"Texas State Roleplay • Server Sessions"}}],allowed_mentions:{users:[user.id],parse:[]}});
  }catch(error){
    if(action==="start-up"&&sessionId){try{await workflowData(env,"/workflow/session-end","POST",{sessionId,endedAt:new Date().toISOString(),discordMessageId:""});}catch{}}
    return workflowReply("Could not update the session channel: "+error.message);
  }
  return workflowReply("Updated the session channel with **"+labels[action]+"**."+(action==="start-up"?" Website session logging is now active.":action==="shutdown"?" Discord archive saved; website session logs are cleared.":""));
}
async function workflowCommand(env,interaction,name) {
  if (name === "server") return serverSessionCommand(env,interaction);
  if (name === "ticket-panel") {
    const state = interactionRoleState(interaction);
    if (!(state.owner || state.admin || state.ia)) return workflowReply("Only Admin, Internal Affairs or Ownership can post the ticket panel.");
    try { const message = await postTicketPanel(env); return workflowReply("Ticket panel posted in <#" + CHANNELS.ticketPanel + "> (message " + message.id + ")."); }
    catch (error) { return workflowReply("Could not post the ticket panel: " + error.message); }
  }
  if (name === "close-ticket") return closeTicket(env,interaction,"");
  if (name === "fastpass-delete") {
    const state = interactionRoleState(interaction);
    if (!state.owner) return workflowReply("Only Ownership can delete Fast Pass applications.");
    const id = String(interaction.data?.options?.find(option => option.name === "id")?.value || "").trim().toUpperCase();
    if (!/^FP-\d{4}$/.test(id)) return workflowReply("Enter a valid Fast Pass ID, for example FP-0003.");
    try {
      const result = await workflowData(env,"/workflow/fastpass-delete","POST",{id});
      return workflowReply(result.deleted ? id + " has been deleted" + (result.clearedPending ? " and its matching pending-submission lock was cleared." : ".") : id + " was not found; no other Fast Pass applications were changed.");
    } catch (error) { return workflowReply("Could not delete " + id + ": " + error.message); }
  }
  if (name === "fastpass-panel") {
    const state = interactionRoleState(interaction);
    if (!(state.owner || state.admin || state.ia)) return workflowReply("Only Admin, Internal Affairs or Ownership can post the Fast Pass panel.");
    try { const message = await postFastpassPanel(env); return workflowReply("Fast Pass application panel posted in <#" + CHANNELS.fastpassPanel + "> (message " + message.id + ")."); }
    catch (error) { return workflowReply("Could not post the Fast Pass panel: " + error.message); }
  }
  if (name === "staff-record") return staffRecordCommand(env,interaction);
  return null;
}
async function workflowComponent(env,interaction) {
  const customId = String(interaction.data?.custom_id || "");
  if (customId.startsWith("ticket:")) return ticketComponent(env,interaction);
  if (customId.startsWith("fastpass:")) return fastpassComponent(env,interaction);
  return workflowReply("Unknown button action.");
}

function commandResponse(name) {
  const messages = {
    ping: "Pong! Texas State Roleplay bot is online. ✅",
    help: "**Texas State Roleplay bot**\n/ping — bot status\n/help — show commands\n/erlc — server status\n/players — online players\n/kick — moderator action (Staff+)\n/ban and /unban — Admin+\n/ban-bolo — submit a ban request for Admin review (Staff+)\n/erlc-command — approved server commands (Admin+)\n/modlogs — Internal Affairs, Admin and Ownership",
    server: "Join Texas State Roleplay: " + INVITE,
    website: "Texas State Roleplay website: " + SITE_URL,
    departments: "**Roleplay departments**\n🚓 Texas State Police\n🚒 Texas Fire & Rescue\n🚑 Texas EMS\n\nCheck the community Discord for recruitment information: " + INVITE,
    rules: "**Community standards**\n• Respect everyone.\n• Keep roleplay fair and avoid exploiting.\n• Follow community rules and session-host guidance.\n• Help new members feel welcome.\nSee the Discord server for the full rules."
  };
  return { type: 4, data: { content: messages[name] || "I don't recognise that command. Use /help.", allowed_mentions: { parse: [] } } };
}

export default {
  async scheduled(controller, env, ctx) {
    // Keep Discord connected independently of the one-time legacy data migration.
    try {
      const gateway = await startGateway(env);
      console.log("Texas Discord Gateway scheduled health check:", gateway.status || "unknown");
      const recoveryResponse = await gatewayStub(env).fetch("https://gateway-control/recover", { method: "POST" });
      const recovery = await recoveryResponse.json();
      console.log("Texas Discord recovery scan:", recovery.complete ? "complete" : (recovery.status || "continuing"));
    } catch (error) {
      console.error("Texas Discord Gateway start failed:", String(error.message || error));
    }
    try {
      const statusResponse = await dataRequest(env, "/meta/status");
      const status = await statusResponse.json();
      if (status.legacyDataImported) return;
      // Export existing Durable Object records without stopping the live Gateway.
      const legacyResponse = await gatewayStub(env).fetch("https://gateway-control/export");
      if (!legacyResponse.ok) throw new Error("Legacy data export failed (HTTP " + legacyResponse.status + ").");
      const legacy = await legacyResponse.json();
      const importResponse = await dataRequest(env, "/legacy/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(legacy) });
      const imported = await importResponse.json();
      if (!importResponse.ok || !imported.ok) throw new Error(imported.error || "Legacy data import failed.");
      console.log("Texas legacy data migration completed.", imported.imported);
    } catch (error) {
      console.error("Texas legacy data migration will retry without stopping the Gateway:", String(error.message || error));
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      const gateway = await gatewayStub(env).fetch("https://gateway-control/status")
        .then((r) => r.json()).catch((e) => ({ status: "unavailable", error: e.message }));
      let dataMigration = { status: "unknown" };
      try {
        const migrationStatusResponse = await dataRequest(env, "/meta/status");
        const migrationStatus = await migrationStatusResponse.json();
        dataMigration = migrationStatus.legacyDataImported
          ? { status: "already_imported", counts: migrationStatus.counts }
          : { status: "not_imported", counts: migrationStatus.counts };
      } catch (e) {
        dataMigration = { status: "unavailable", reason: String(e.message || e).slice(0, 220) };
      }
      return json({
        service: "Texas State Roleplay Discord bot",
        application_id: APP_ID,
        test_server_id: GUILD_ID,
        token_configured: Boolean(tokenFrom(env)),
        gateway,
        data_migration: dataMigration,
        mode: "http_interactions_with_gateway_events",
        next_step: "Use POST /gateway/start to start Discord message-event automation. Health checks do not stop the Gateway."
      });
    }
    if (request.method === "GET" && url.pathname === "/commands") return json(COMMANDS);
    if (request.method === "GET" && url.pathname === "/data/health") return dataRequest(env, "/health");
    if (request.method === "GET" && url.pathname === "/data/status") return dataRequest(env, "/meta/status");
    if (request.method === "GET" && url.pathname === "/erlc/authorize") {
      const serverKey=String(env.ERLC_SERVER_KEY||"").trim();
      const parts=serverKey.split("-");
      if(parts.length!==2||!parts[1]) return json({ok:false,error:"Could not derive the ER:LC internal server ID from the configured server key."},400);
      const authorizationUrl="https://api.erlc.gg/server-owners/server/"+encodeURIComponent(parts[1])+"/authorize/249265190143097686";
      return json({ok:true,authorization_url:authorizationUrl,instructions:"Open this link while signed in to the Roblox account that owns the Texas State Roleplay private server, then approve Texas State Roleplay Management."});
    }
    if (request.method === "GET" && url.pathname === "/erlc/status") {
      try { const d=await erlcServerData(env); return json({ok:true,server:d.Name,current_players:d.CurrentPlayers,max_players:d.MaxPlayers,team_balance:d.TeamBalance}); }
      catch(e) { return json({ok:false,error:String(e.message||e).slice(0,300)},502); }
    }
    if(request.method==="GET"&&url.pathname==="/public/announcements"){return dataRequest(env, "/announcements");}
    if ((request.method === "POST" || request.method === "GET") && url.pathname === "/gateway/start") {
      try {
        const registration = await registerCommands(env);
        const gateway = await startGateway(env);
        return json({status:gateway.status||"starting",commands:registration.registered||[],gateway});
      } catch (e) { return json({ status: "error", error: String(e.message || e).slice(0, 300) }, 502); }
    }
    if (request.method === "GET" && url.pathname === "/gateway/status") {
      return gatewayStub(env).fetch("https://gateway-control/status");
    }
    if (request.method === "GET" && url.pathname === "/gateway/restart-once") {
      try {
        const stub = gatewayStub(env);
        const stopped = await stub.fetch("https://gateway-control/stop", { method: "POST" });
        const stopState = await stopped.json();
        await new Promise(resolve => setTimeout(resolve, 1200));
        const started = await stub.fetch("https://gateway-control/start", { method: "POST" });
        const startState = await started.json();
        return json({ ok: true, preservedDurableObjectStorage: true, stopped: stopState.status || "unknown", gateway: startState });
      } catch (e) {
        return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
      }
    }


    async function dashboardApi(request, env, url) {
      const auth=request.headers.get("authorization")||"";
      const match=auth.match(/^Bearer\s+(.+)$/i);
      if(!match) return json({ok:false,error:"Discord sign-in required."},401);
      const token=match[1].trim(), headers={authorization:"Bearer "+token};
      const ur=await fetch("https://discord.com/api/v10/users/@me",{headers});
      const user=await ur.json().catch(()=>({}));
      if(!ur.ok||!user.id) return json({ok:false,error:"Discord session expired. Sign in again."},401);
      const botToken=tokenFrom(env);
      if(!botToken) return json({ok:false,error:"Discord bot token is not configured."},503);
      const mr=await fetch("https://discord.com/api/v10/guilds/"+GUILD_ID+"/members/"+user.id,{headers:{authorization:"Bot "+botToken}});
      const member=await mr.json().catch(()=>({}));
      if(!mr.ok||!Array.isArray(member.roles)) return json({ok:false,error:mr.status===404?"You must be a member of the Texas State Roleplay Discord server.":"Could not verify Discord server membership (HTTP "+mr.status+"). Please try again."},mr.status===404?403:502);
      const roles=member.roles, owner=roles.includes("1573038226510192864");
      const admin=owner||roles.includes("1573038142963978441"), ia=roles.includes("1573038132289343609"), staff=roles.includes("1573028899405693049");
      const canKick=admin||staff, canManage=admin, canViewLogs=admin||ia;
      if(url.pathname==="/dashboard/me"&&request.method==="GET") return json({ok:true,username:user.global_name||user.username,permissions:{owner,admin,internalAffairs:ia,staff,canKick,canManage,canViewLogs}});
      if(url.pathname==="/dashboard/announcement-delete"&&request.method==="POST"){if(!owner)return json({ok:false,error:"Ownership role is required to delete website announcements."},403);let body;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body."},400)}const id=String(body.id||"").trim();if(id.length<17||id.length>20||[...id].some(c=>c<'0'||c>'9'))return json({ok:false,error:"Invalid Discord announcement ID."},400);const removed=await dataRequest(env,"/announcement-delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});if(!removed.ok)return json({ok:false,error:"Could not delete announcement from website storage."},502);return json({ok:true,message:"Announcement removed from the website."});}
      if(url.pathname==="/dashboard/modlogs"&&request.method==="GET"){
        if(!canViewLogs) return json({ok:false,error:"Internal Affairs, Admin or Ownership access is required."},403);
        const r=await dataRequest(env, "/modlogs"), data=await r.json();
        return json({ok:true,logs:(data.logs||[]).slice(0,100)});
      }

      if(url.pathname==="/dashboard/bolos" && request.method==="GET"){
        if(!staff&&!admin) return json({ok:false,error:"Staff or Admin access is required."},403);
        const r=await dataRequest(env, "/bolos?"+(admin?"all=1":"user="+encodeURIComponent(user.id)));
        const d=await r.json(); return json({ok:true,bolos:d.bolos||[]});
      }
      if(url.pathname==="/dashboard/bolos" && request.method==="POST"){
        if(!staff&&!admin) return json({ok:false,error:"Staff or Admin access is required."},403);
        let body;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body."},400)}
        const player=String(body.player||"").trim(), category=String(body.category||"other"), reason=String(body.reason||"").trim(), evidence=Array.isArray(body.evidence)?body.evidence:[], requested=String(body.requestedPunishment||"ban");
        if(!player||player.length>32||!reason||reason.length>1500) return json({ok:false,error:"Player and a detailed reason are required."},400);
        if(!/^[A-Za-z0-9_]{1,20}$/.test(player)&&!/^\d{5,20}$/.test(player)) return json({ok:false,error:"Enter a valid Roblox username or numeric ID."},400);
        if(!["frp","vdm","rdm","ltap","exploiting","trolling","nitrp","other"].includes(category)) return json({ok:false,error:"Choose a valid violation category."},400);
        if(evidence.length>5||evidence.some(x=>typeof x!=="string"||x.length>500||!/^https:\/\//i.test(x))) return json({ok:false,error:"Evidence must be up to five HTTPS links."},400);
        if(!["ban","temporary ban","review"].includes(requested.toLowerCase())) return json({ok:false,error:"Invalid requested punishment."},400);
        const entry={id:crypto.randomUUID(),player,category,reason,evidence,requestedPunishment:requested,submitter:user.global_name||user.username,submitterId:user.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:"pending",adminNote:"",punishment:"",history:[{at:new Date().toISOString(),by:user.global_name||user.username,byId:user.id,status:"pending",note:"Ban request submitted"}]};
        const r=await dataRequest(env, "/bolo-create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(entry)});
        if(!r.ok)return json({ok:false,error:"Could not save the ban request."},502);
        const row={type:1,components:[{type:2,style:3,label:"Accept",custom_id:"bolo:accept:"+entry.id},{type:2,style:4,label:"Deny",custom_id:"bolo:deny:"+entry.id},{type:2,style:2,label:"Need More Evidence",custom_id:"bolo:evidence:"+entry.id}]};
        let posted;
        try {
          posted=await discordChannelMessage(env,CHANNELS.pending,{embeds:[{title:"NEW BAN BOLO — PENDING ADMIN REVIEW",color:16763904,fields:[{name:"Player",value:player},{name:"Category",value:category.toUpperCase()},{name:"Reason",value:reason.slice(0,1024)},{name:"Evidence",value:(evidence.length?evidence.join("\n"):"Not supplied").slice(0,1024)},{name:"Requested punishment",value:requested},{name:"Submitted by",value:user.global_name||user.username||"Unknown"},{name:"Reference",value:entry.id}],footer:{text:"Accepting records approval only; Admin must apply the ER:LC ban separately."}}],components:[row],allowed_mentions:{parse:[]}});
        } catch(e) {
          console.error("Dashboard Ban BOLO saved but approval embed delivery failed",e.message);
          return json({ok:true,warning:"Ban BOLO was saved, but Discord could not post the approval embed: "+String(e.message||e).slice(0,220),bolo:entry},202);
        }
        const linked=await dataRequest(env,"/bolo-message",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:entry.id,messageId:posted.id,channelId:CHANNELS.pending})});
        if(!linked.ok)console.error("Dashboard Ban BOLO posted but message reference could not be saved.");
        return json({ok:true,message:"Ban BOLO submitted and sent to the Pending Ban BOLO channel.",bolo:entry});
      }
      if(url.pathname==="/dashboard/bolo-update" && request.method==="POST"){
        if(!admin)return json({ok:false,error:"Admin or Ownership access is required to review ban BOLOs."},403);
        let body;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body."},400)}
        const status=String(body.status||"");
        if(!["under_review","evidence_needed","accepted","rejected","completed"].includes(status))return json({ok:false,error:"Invalid BOLO status."},400);
        const note=String(body.adminNote||"").trim().slice(0,1500), punishment=String(body.punishment||"").trim().slice(0,200);
        if(["evidence_needed","rejected"].includes(status)&&!note)return json({ok:false,error:"Add an Admin response when requesting evidence or rejecting a BOLO."},400);
        if(status==="completed"&&!punishment)return json({ok:false,error:"Record the punishment applied before marking this BOLO completed."},400);
        const r=await dataRequest(env, "/bolo-update",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:String(body.id||""),status,adminNote:note,punishment,by:user.global_name||user.username,byId:user.id,at:new Date().toISOString()})});
        const d=await r.json();if(!r.ok||!d.ok)return json({ok:false,error:d.error||"Could not update this BOLO."},400);
        return json({ok:true,message:"Ban BOLO updated.",bolo:d.bolo});
      }
      if(url.pathname==="/dashboard/warnings" && request.method==="GET"){
        if(!staff&&!admin)return json({ok:false,error:"Staff or Admin access is required."},403);
        const r=await dataRequest(env, "/warnings?all=1");
        const d=await r.json();return json({ok:true,warnings:d.warnings||[]});
      }
      if(url.pathname==="/dashboard/warnings" && request.method==="POST"){
        if(!staff&&!admin)return json({ok:false,error:"Staff or Admin access is required to issue formal warnings."},403);
        let body;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body."},400)}
        const player=String(body.player||"").trim(),reason=String(body.reason||"").trim(),category=String(body.category||"other");
        if(!player||player.length>32||!reason||reason.length>1500)return json({ok:false,error:"Player and a detailed warning reason are required."},400);
        if(!/^[A-Za-z0-9_]{1,20}$/.test(player)&&!/^\d{5,20}$/.test(player))return json({ok:false,error:"Enter a valid Roblox username or numeric ID."},400);
        if(!["frp","vdm","rdm","ltap","exploiting","trolling","nitrp","other"].includes(category))return json({ok:false,error:"Choose a valid violation category."},400);
        const entry={id:crypto.randomUUID(),player,category,reason,staff:user.global_name||user.username,staffId:user.id,createdAt:new Date().toISOString()};
        const r=await dataRequest(env, "/warning-create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(entry)});
        if(!r.ok)return json({ok:false,error:"Could not save the warning."},502);
        await sendModerationLog(env,"**FORMAL WARNING RECORDED**\nPlayer: "+player+"\nCategory: "+category.toUpperCase()+"\nStaff: "+entry.staff+"\nReason: "+reason);
        return json({ok:true,message:"Formal warning recorded and sent to the Moderation Logs channel.",warning:entry});
      }
      if(url.pathname==="/dashboard/action"&&request.method==="POST"){
        let body;try{body=await request.json()}catch{return json({ok:false,error:"Invalid request body."},400)}
        const action=String(body.action||"");
        if(!["kick","ban","unban","erlc-command"].includes(action)) return json({ok:false,error:"Unsupported moderation action."},400);
        if(action==="kick"&&!canKick) return json({ok:false,error:"Staff role or higher is required to kick."},403);
        if(action!=="kick"&&!canManage) return json({ok:false,error:"Admin or Ownership role is required for this action."},403);
        const options=action==="erlc-command"?[{name:"command",value:String(body.command||"")}]:[{name:"player",value:String(body.player||"")},{name:"reason",value:String(body.reason||"")}];
        const interaction={member:{roles,permissions:"0",user:{id:user.id,username:user.username,global_name:user.global_name}},user,data:{options}};
        const response=await auditedModerationRun(env,interaction,action,"Website"), message=String(response?.data?.content||"Moderation action returned no response.");
        const success=message.startsWith("ER:LC accepted");
        return json({ok:success,message},success?200:400);
      }
      return json({ok:false,error:"Not found."},404);
    }

    if (request.method === "GET" && url.pathname === "/dashboard/me") return dashboardApi(request,env,url);
    if (url.pathname.startsWith("/dashboard/")) return dashboardApi(request,env,url);
    if (request.method !== "POST" || url.pathname !== "/") return new Response("Not found", { status: 404 });
    const rawBody = await request.text();
    if (!await verifyDiscord(request, rawBody)) return new Response("Invalid Discord request signature", { status: 401 });
    let interaction;
    try { interaction = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (interaction.type === 1) {
      if (tokenFrom(env)) {
        ctx.waitUntil(registerCommands(env).catch((e) => console.error("Command registration:", e.message)));
      }
      return json({ type: 1 });
    }
    if (interaction.type === 2) { const name = interaction.data?.name || ""; if (name === "ban-bolo") return json(await banBoloInteraction(env,interaction)); if (["kick","ban","unban","erlc-command","modlogs"].includes(name)) return json(await auditedModerationRun(env,interaction,name,"Discord")); if (["server","ticket-panel","close-ticket","fastpass-panel","fastpass-delete","staff-record"].includes(name)) { const invite=name==="server"&&interaction.data?.options?.[0]?.name==="invite"; const task=()=>workflowCommand(env,interaction,name); return invite?json(await task()):json(deferWorkflowResponse(env,interaction,p=>ctx.waitUntil(p),task)); } return json(["erlc","players","staff","queue","calls","vehicles"].includes(name) ? await erlcInteraction(name, env) : commandResponse(name)); }
    if (interaction.type === 3) { const customId=String(interaction.data?.custom_id||""); if(customId.startsWith("bolo:")) return json(await banBoloReviewInteraction(env,interaction)); if(customId==="fastpass:open") return json(await fastpassComponent(env,interaction)); return json(deferWorkflowResponse(env,interaction,p=>ctx.waitUntil(p),()=>workflowComponent(env,interaction))); }
    if (interaction.type === 5) return json(deferWorkflowResponse(env,interaction,p=>ctx.waitUntil(p),()=>fastpassModal(env,interaction)));
    return json({ type: 4, data: { content: "This interaction type is not supported." } });
  }
};

export class ManchesterGateway extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.socket = null;
    this.heartbeatInterval = 0;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.awaitingAck = false;
    this.stopping = false;
    this.reconnectSeconds = 5;
    this.recoveryRunning = false;
    this.schedulerQueue = Promise.resolve();
  }
  async withGatewaySchedulerLock(work) {
    const previous = this.schedulerQueue;
    let release;
    this.schedulerQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); }
    finally { release(); }
  }
  async mutateGatewayTasks(mutator) {
    return this.withGatewaySchedulerLock(async () => {
      const tasks = await this.ctx.storage.get("gateway_alarm_tasks") || {};
      const result = mutator(tasks);
      await this.ctx.storage.put("gateway_alarm_tasks", tasks);
      const next = nextGatewayAlarm(tasks);
      if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 250, next));
      else await this.ctx.storage.deleteAlarm();
      return result;
    });
  }
  async scheduleGatewayTask(name, runAt, keepEarlier = false) {
    return this.mutateGatewayTasks(tasks => {
      const existing = tasks[name];
      if (keepEarlier && Number.isFinite(existing) && existing <= runAt) return false;
      tasks[name] = runAt;
      return true;
    });
  }
  async clearGatewayTask(name) {
    return this.mutateGatewayTasks(tasks => { delete tasks[name]; return true; });
  }
  async clearGatewayTasks() {
    return this.mutateGatewayTasks(tasks => { for (const name of Object.keys(tasks)) delete tasks[name]; return true; });
  }
  async takeDueGatewayTasks(now = Date.now()) {
    return this.mutateGatewayTasks(tasks => {
      const due = Object.entries(tasks).filter(([, runAt]) => Number.isFinite(runAt) && runAt <= now).map(([name]) => name);
      for (const name of due) delete tasks[name];
      return due;
    });
  }
  async state(status, extra = {}) {
    const previous = await this.ctx.storage.get("gateway_status") || {};
    const now = new Date().toISOString();
    const offline = ["reconnecting","error","connecting","unavailable"];
    if (offline.includes(status) && (previous.status === "online" || previous.status === "recovering") && !await this.ctx.storage.get("outage_started_at")) {
      await this.ctx.storage.put("outage_started_at", previous.last_heartbeat_ack || previous.updated_at || now);
      await this.ctx.storage.put("recovery_violation_found", 0);
      await this.ctx.storage.put("recovery_deleted", 0);
      await this.ctx.storage.put("recovery_delete_failed", 0);
      await this.ctx.storage.put("outage_last_known_online", previous.last_heartbeat_ack || previous.updated_at || now);
    }
    const next = { ...previous, status, updated_at: now, ...extra };
    await this.ctx.storage.put("gateway_status", next);
    return next;
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/status") {
      return json(await this.ctx.storage.get("gateway_status") || { status: "not_started" });
    }
    if (path === "/export" && request.method === "GET") {
      return json({
        bolos: await this.ctx.storage.get("ban_bolos") || [],
        warnings: await this.ctx.storage.get("formal_warnings") || [],
        logs: await this.ctx.storage.get("mod_logs") || [],
        announcements: await this.ctx.storage.get("website_announcements") || [],
        lastModCommand: await this.ctx.storage.get("last_mod_command") || 0
      });
    }
    if (path === "/recover" && request.method === "POST") {
      const current = await this.ctx.storage.get("gateway_status") || {};
      const outageStarted = await this.ctx.storage.get("outage_started_at");
      if (current.status === "online" && !outageStarted) {
        return json({ ok: true, complete: true, skipped: true, status: "online", detail: "Gateway is healthy; no recovery scan is needed." });
      }
      if (current.status !== "online" && current.status !== "recovering") return json({ ok: false, status: current.status || "not_started", detail: "Gateway is not ready for recovery yet." });
      return json(await this.runRecoveryScan("outage recovery watchdog"));
    }
    if (path === "/start") {
      this.stopping = false;
      const current = await this.ctx.storage.get("gateway_status");
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        return json(current || { status: "connecting" });
      }
      await this.clearGatewayTask("reconnect");
      await this.connect();
      return json(await this.ctx.storage.get("gateway_status") || { status: "starting" });
    }

    if(path==="/announcements"&&request.method==="GET"){return json({announcements:(await this.ctx.storage.get("website_announcements")||[]).slice(0,50)});}
    if(path==="/bolo-message"&&request.method==="POST"){const b=await request.json(),rows=await this.ctx.storage.get("ban_bolos")||[],i=rows.findIndex(x=>x.id===b.id);if(i>=0){rows[i].discordMessageId=b.messageId;rows[i].discordChannelId=b.channelId;await this.ctx.storage.put("ban_bolos",rows);}return json({ok:true});}
    if(path==="/bolos"&&request.method==="GET"){
      const all=new URL(request.url).searchParams.get("all")==="1", user=new URL(request.url).searchParams.get("user")||"";
      const rows=await this.ctx.storage.get("ban_bolos")||[];
      return json({bolos:rows.filter(x=>all||x.submitterId===user).slice(0,200)});
    }
    if(path==="/bolo-create"&&request.method==="POST"){
      const entry=await request.json(),rows=await this.ctx.storage.get("ban_bolos")||[];
      rows.unshift(entry);await this.ctx.storage.put("ban_bolos",rows.slice(0,300));return json({ok:true});
    }
    if(path==="/bolo-update"&&request.method==="POST"){
      const body=await request.json(),rows=await this.ctx.storage.get("ban_bolos")||[],i=rows.findIndex(x=>x.id===body.id);
      if(i<0)return json({ok:false,error:"Ban BOLO not found."},404);
      const old=rows[i];old.status=body.status;old.adminNote=body.adminNote;old.punishment=body.punishment;old.updatedAt=body.at;
      old.history=Array.isArray(old.history)?old.history:[];old.history.push({at:body.at,by:body.by,byId:body.byId,status:body.status,note:body.adminNote,punishment:body.punishment});
      rows[i]=old;await this.ctx.storage.put("ban_bolos",rows);return json({ok:true,bolo:old});
    }
    if(path==="/warnings"&&request.method==="GET"){
      const all=new URL(request.url).searchParams.get("all")==="1",user=new URL(request.url).searchParams.get("user")||"";
      const rows=await this.ctx.storage.get("formal_warnings")||[];
      return json({warnings:rows.filter(x=>all||x.staffId===user).slice(0,200)});
    }
    if(path==="/warning-create"&&request.method==="POST"){
      const entry=await request.json(),rows=await this.ctx.storage.get("formal_warnings")||[];
      rows.unshift(entry);await this.ctx.storage.put("formal_warnings",rows.slice(0,300));return json({ok:true});
    }
    if (path === "/modgate" && request.method === "POST") { const now=Date.now(), last=await this.ctx.storage.get("last_mod_command")||0, wait=5000-(now-last); if(wait>0) return json({allowed:false,message:"ER:LC accepts one command every five seconds. Wait "+Math.ceil(wait/1000)+" seconds."},429); await this.ctx.storage.put("last_mod_command",now); return json({allowed:true}); }
    if (path === "/modlog-write" && request.method === "POST") { const entry=await request.json(), logs=await this.ctx.storage.get("mod_logs")||[]; logs.unshift(entry); await this.ctx.storage.put("mod_logs",logs.slice(0,200)); return json({ok:true}); }
    if (path === "/modlogs" && request.method === "GET") { return json({logs:(await this.ctx.storage.get("mod_logs")||[]).slice(0,100)}); }
    if (path === "/stop") {
      this.stopping = true;
      await this.clearGatewayTasks();
      this.heartbeatInterval = 0;
      this.awaitingAck = false;
      try { this.socket?.close(1000, "Stopped by administrator"); } catch {}
      this.socket = null;
      return json(await this.state("offline", { detail: "Gateway connection stopped" }));
    }
    return new Response("Not found", { status: 404 });
  }
  async connect() {
    const token = tokenFrom(this.env);
    if (!token) return this.state("needs_token", { detail: "DISCORD_BOT_TOKEN is missing" });
    try {
      await this.state("connecting", { detail: "Preparing Discord Gateway connection" });
      this.heartbeatInterval = 0;
      this.awaitingAck = false;
      this.sessionId = await this.ctx.storage.get("discord_session_id") || null;
      this.resumeGatewayUrl = await this.ctx.storage.get("discord_resume_gateway_url") || null;
      this.sequence = await this.ctx.storage.get("discord_sequence");
      let gatewayUrl = this.resumeGatewayUrl;
      if (!this.sessionId || this.sequence === null || this.sequence === undefined || !gatewayUrl) {
        this.sessionId = null; this.resumeGatewayUrl = null; this.sequence = null;
        await this.ctx.storage.delete("discord_session_id");
        await this.ctx.storage.delete("discord_resume_gateway_url");
        await this.ctx.storage.delete("discord_sequence");
        const gatewayResponse = await fetch("https://discord.com/api/v10/gateway/bot", { headers: { Authorization: "Bot " + token } });
        if (!gatewayResponse.ok) throw new Error("Gateway discovery failed (" + gatewayResponse.status + ")");
        const gateway = await gatewayResponse.json();
        gatewayUrl = gateway.url;
      }
      const socketUrl = new URL(gatewayUrl);
      socketUrl.searchParams.set("v", "10");
      socketUrl.searchParams.set("encoding", "json");
      const socket = new WebSocket(socketUrl.toString());
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.state("connecting", { detail: "WebSocket connected; awaiting Discord Hello" }).catch(() => {});
      });
      socket.addEventListener("message", (event) => {
        this.onMessage(socket, event.data).catch((e) => {
          const detail = String(e?.message || e).slice(0, 220);
          this.state("recovering", { detail: "Gateway event processing failed; reconciliation scheduled: " + detail })
            .then(() => this.scheduleGatewayTask("recovery", Date.now() + 10000))
            .catch(() => {});
        });
      });
      socket.addEventListener("error", () => {
        this.state("reconnecting", { detail: "Discord Gateway WebSocket error; reconnect scheduled" }).catch(() => {});
        try { socket.close(4000, "Gateway socket error"); } catch {}
      });
      socket.addEventListener("close", (event) => {
        (async () => {
          if (this.socket === socket) this.socket = null;
          this.heartbeatInterval = 0;
          this.awaitingAck = false;
          await this.clearGatewayTask("heartbeat");
          await this.clearGatewayTask("connect_timeout");
          if (event.code === 4007 || event.code === 4009) {
            this.sessionId = null; this.resumeGatewayUrl = null; this.sequence = null;
            await this.ctx.storage.delete("discord_session_id");
            await this.ctx.storage.delete("discord_resume_gateway_url");
            await this.ctx.storage.delete("discord_sequence");
          }
          if (!this.stopping) {
            const reason = String(event.reason || "no reason provided").slice(0, 160);
            await this.state("reconnecting", { detail: "Discord Gateway closed (" + event.code + ", " + reason + "); reconnect scheduled", last_close_code:event.code, last_close_reason:reason, last_closed_at:new Date().toISOString() });
            await this.scheduleReconnect();
          }
        })().catch(error => console.error("Gateway close handler failed:", error.message));
      });
      await this.scheduleGatewayTask("connect_timeout", Date.now() + 15000);
    } catch (error) {
      await this.state("error", { detail: error.message });
      await this.scheduleReconnect();
    }
  }
  async onMessage(socket, raw) {
    if (this.socket !== socket) return;
    const packet = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    if (packet.s !== null && packet.s !== undefined) { this.sequence = packet.s; await this.ctx.storage.put("discord_sequence", packet.s); }
    if (packet.op === 10) {
      this.heartbeatInterval = Number(packet.d.heartbeat_interval);
      if (!Number.isFinite(this.heartbeatInterval) || this.heartbeatInterval < 1000) throw new Error("Discord sent an invalid heartbeat interval.");
      this.awaitingAck = false;
      await this.clearGatewayTask("connect_timeout");
      await this.scheduleGatewayTask("heartbeat", Date.now() + Math.floor(Math.random() * this.heartbeatInterval));
      await this.state("connecting", { heartbeat_interval_ms:this.heartbeatInterval });
      const savedSession = await this.ctx.storage.get("discord_session_id");
      const savedSequence = await this.ctx.storage.get("discord_sequence");
      if (savedSession && savedSequence !== null && savedSequence !== undefined) {
        socket.send(JSON.stringify({ op: 6, d: { token: tokenFrom(this.env), session_id: savedSession, seq: savedSequence } }));
        await this.state("resuming", { detail: "Discord Hello received; attempting session resume" });
      } else {
        socket.send(JSON.stringify({ op: 2, d: { token: tokenFrom(this.env), intents: 33287, properties: { os: "cloudflare-workers", browser: "manchester-roleplay", device: "manchester-roleplay" }, presence: { status: "online", since: null, activities: [{ name: "Texas State Roleplay | ER:LC", type: 0 }], afk: false } } }));
        await this.state("identifying", { detail: "Discord Hello received; sending Identify" });
      }
      return;
    }
    if (packet.op === 11) {
      this.awaitingAck = false;
      const current = await this.ctx.storage.get("gateway_status") || {};
      await this.state(current.status || "online", { last_heartbeat_ack: new Date().toISOString() });
      return;
    }
    if (packet.op === 1) {
      this.sendHeartbeat();
      return;
    }
    if (packet.op === 7 || packet.op === 9) {
      const resumable = packet.op === 7 || packet.d === true;
      if (!resumable) { this.sessionId = null; this.resumeGatewayUrl = null; this.sequence = null; await this.ctx.storage.delete("discord_session_id"); await this.ctx.storage.delete("discord_resume_gateway_url"); await this.ctx.storage.delete("discord_sequence"); }
      await this.state("reconnecting", { detail: packet.op === 7 ? "Discord requested reconnect; preserving resumable session" : (resumable ? "Discord session temporarily unavailable; retrying resume" : "Discord invalidated the session; starting fresh") });
      try { socket.close(4000, "Reconnect requested"); } catch {}
      await this.scheduleReconnect(packet.op === 9 ? 5000 : 1500);
      return;
    }
    if (packet.op === 0 && packet.t && packet.t !== "READY" && packet.t !== "RESUMED" && packet.t !== "INTERACTION_CREATE") {
      await this.handleGatewayEvent(packet.t, packet.d || {});
      return;
    }
    if (packet.op === 0 && packet.t === "READY") {
      this.botUserId = packet.d.user?.id || "";
      this.sessionId = packet.d.session_id || null;
      this.resumeGatewayUrl = packet.d.resume_gateway_url || null;
      if (this.sessionId) await this.ctx.storage.put("discord_session_id", this.sessionId);
      if (this.resumeGatewayUrl) await this.ctx.storage.put("discord_resume_gateway_url", this.resumeGatewayUrl);
      this.reconnectSeconds = 5;
      await this.clearGatewayTask("reconnect");
      await this.state("recovering", { detail: "Gateway READY; reconciling recent messages and audit logs", user: packet.d.user?.username || "Texas State Roleplay bot", user_id: packet.d.user?.id });
      await this.runRecoveryScan("fresh Gateway session");
    } else if (packet.op === 0 && packet.t === "RESUMED") {
      this.reconnectSeconds = 5;
      await this.clearGatewayTask("reconnect");
      await this.state("recovering", { detail: "Gateway session resumed; reconciling missed events" });
      await this.runRecoveryScan("resumed Gateway session");
    } else if (packet.op === 0 && packet.t === "INTERACTION_CREATE") {
      const interaction = packet.d || {};
      if ((interaction.type === 2 || interaction.type === 3 || interaction.type === 5) && interaction.id && interaction.token) {
        const name = interaction.data?.name || "";
        const customId = String(interaction.data?.custom_id || "");
        const isWorkflowCommand = interaction.type === 2 && ["server","ticket-panel","close-ticket","fastpass-panel","staff-record"].includes(name) && !(name === "server" && interaction.data?.options?.[0]?.name === "invite");
        const isWorkflowComponent = interaction.type === 3 && !customId.startsWith("bolo:") && customId !== "fastpass:open";
        const shouldDefer = interaction.type === 5 || isWorkflowCommand || isWorkflowComponent;
        const task = () => interaction.type === 5 ? fastpassModal(this.env,interaction) : interaction.type === 3 ? (customId.startsWith("bolo:") ? banBoloReviewInteraction(this.env,interaction) : workflowComponent(this.env,interaction)) : name === "ban-bolo" ? banBoloInteraction(this.env, interaction) : ["kick","ban","unban","erlc-command","modlogs"].includes(name) ? moderationRun(this.env, interaction, name) : ["server","ticket-panel","close-ticket","fastpass-panel","fastpass-delete","staff-record"].includes(name) ? workflowCommand(this.env,interaction,name) : ["erlc","players","staff","queue","calls","vehicles"].includes(name) ? erlcInteraction(name, this.env) : commandResponse(name);
        const response = shouldDefer ? deferWorkflowResponse(this.env,interaction,p=>this.ctx.waitUntil(p),task) : await task();
        const callback = await fetch("https://discord.com/api/v10/interactions/" + encodeURIComponent(interaction.id) + "/" + encodeURIComponent(interaction.token) + "/callback", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(response)});
        if (callback.ok) await this.state("online", {detail:"Discord Gateway READY; handled "+(interaction.type===3?"component interaction":interaction.type===5?"Fast Pass form":"/"+name),last_command:name||customId||"modal"});
        else {const detail=await callback.text();await this.state("online",{detail:"Interaction callback failed ("+callback.status+"): "+detail.slice(0,180),last_command:name});}
      }
    }
  }
  async handleGatewayEvent(eventName,data){
    if(!data||data.guild_id!==GUILD_ID)return;if(eventName==="GUILD_AUDIT_LOG_ENTRY_CREATE"&&data.id){const seen=await this.ctx.storage.get("processed_audit_ids")||[];if(seen.includes(data.id))return;}
    const addLog=async(entry,destination="audit")=>{const logs=await this.ctx.storage.get("mod_logs")||[];const row={id:entry.id||crypto.randomUUID(),at:new Date().toISOString(),...entry};logs.unshift(row);await this.ctx.storage.put("mod_logs",logs.slice(0,200));try{const saved=await dataRequest(this.env,"/modlog-write",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(row)});if(!saved.ok)throw new Error("Data API HTTP "+saved.status);}catch(e){const q=await this.ctx.storage.get("pending_data_logs")||[];q.unshift(row);await this.ctx.storage.put("pending_data_logs",q.slice(0,300));console.error("Website moderation-log sync queued:",e.message);}const target=destination==="moderation"?CHANNELS.moderation:CHANNELS.audit;const channelLink=row.channel_id?"[Open channel](https://discord.com/channels/"+GUILD_ID+"/"+row.channel_id+")":"Not applicable";const actor=row.staff||"Discord system";const fields=[{name:"Actor",value:String(actor).slice(0,900),inline:true},{name:"User",value:(row.user_id?"<@"+row.user_id+">":"")+(row.player?" ("+String(row.player).slice(0,150)+")":row.user_id?"":"Unknown"),inline:true},{name:"Channel",value:channelLink,inline:true},{name:"Details",value:String(row.reason||"No additional details").slice(0,1000),inline:false}];if(row.message_id)fields.push({name:"Message",value:"[Jump to message](https://discord.com/channels/"+GUILD_ID+"/"+(row.channel_id||"@me")+"/"+row.message_id+")",inline:true});if(row.content)fields.push({name:"Message content",value:String(row.content).slice(0,900),inline:false});if(row.ok===false)fields.push({name:"Status",value:"FAILED • "+String(row.result||"No response detail").slice(0,700),inline:false});else if(row.ok===true)fields.push({name:"Status",value:"SUCCESS",inline:true});const payload={embeds:[{title:String(row.action||"Discord event").replace(/_/g," ").toUpperCase().slice(0,250),color:destination==="moderation"?15158332:3447003,fields,footer:{text:"Texas State Roleplay • "+(destination==="moderation"?"Moderation log":"Audit log")},timestamp:row.at||new Date().toISOString()}],allowed_mentions:{parse:[]}};try{await discordChannelMessage(this.env,target,payload);}catch(e){const q=await this.ctx.storage.get("pending_discord_logs")||[];q.unshift({target,payload});await this.ctx.storage.put("pending_discord_logs",q.slice(0,300));console.error("Event log delivery queued:",e.message);}};
    const markGeneralCursor=async()=>{if(data.channel_id!==CHANNELS.general||!data.id||this.recoveryRunning)return;const old=await this.ctx.storage.get("recovery_general_cursor");if(!old||BigInt(data.id)>BigInt(old))await this.ctx.storage.put("recovery_general_cursor",data.id);};
    if(eventName==="MESSAGE_CREATE"||eventName==="MESSAGE_UPDATE"){const author=data.author||{};if(!data.id||!data.channel_id||!author.id||author.bot||author.id===this.botUserId){await markGeneralCursor();return;}const content=String(data.content||"");
      if(data.channel_id===CHANNELS.announcements){const entry={id:data.id,author:author.global_name||author.username||"Community member",authorId:author.id,content:content.slice(0,4000),createdAt:data.timestamp||new Date().toISOString(),editedAt:data.edited_timestamp||null,attachments:(data.attachments||[]).slice(0,8).map(x=>({url:x.url,filename:x.filename,content_type:x.content_type||""})),embeds:(data.embeds||[]).slice(0,5).map(x=>({title:x.title||"",description:String(x.description||"").slice(0,1000),url:x.url||""}))};const saved=await dataRequest(this.env,"/announcement-upsert",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(entry)});if(!saved.ok)throw new Error("Announcement could not be saved to the website data store (HTTP "+saved.status+")");const rows=await this.ctx.storage.get("website_announcements")||[];const keep=rows.filter(x=>x.id!==entry.id);keep.unshift(entry);await this.ctx.storage.put("website_announcements",keep.slice(0,100));return;}
      if(data.channel_id!==CHANNELS.general)return;let roles=data.member?.roles;if(!Array.isArray(roles)){try{const mr=await fetch("https://discord.com/api/v10/guilds/"+GUILD_ID+"/members/"+author.id,{headers:{Authorization:"Bot "+tokenFrom(this.env)}});if(mr.ok)roles=(await mr.json()).roles||[];}catch{}}
      const bypass=(roles||[]).some(id=>ROLE_IDS.includes(id)),violation=automodViolation(content,bypass);if(violation){let ok=false,result="";try{const r=await fetch("https://discord.com/api/v10/channels/"+encodeURIComponent(data.channel_id)+"/messages/"+encodeURIComponent(data.id),{method:"DELETE",headers:{Authorization:"Bot "+tokenFrom(this.env)}});ok=r.status===204;if(!ok)result="Discord deletion failed (HTTP "+r.status+")";}catch(e){result=String(e.message||e).slice(0,160);}if(this.recoveryRunning){await this.ctx.storage.put("recovery_violation_found",(await this.ctx.storage.get("recovery_violation_found")||0)+1);await this.ctx.storage.put(ok?"recovery_deleted":"recovery_delete_failed",(await this.ctx.storage.get(ok?"recovery_deleted":"recovery_delete_failed")||0)+1);}const violationReason=violation==="profanity"?"Prohibited profanity, slur or discriminatory language":"Unapproved link (only approved GIF links are allowed)";if(ok){try{await discordUserDM(this.env,author.id,{title:"Your message was removed • Texas State Roleplay",description:"Your message in <#"+data.channel_id+"> was automatically deleted by the **Texas State Roleplay bot**.",color:15158332,fields:[{name:"What happened",value:violationReason},{name:"What to do next",value:"Please follow the server rules and avoid posting this type of content again. If you believe this was a mistake, contact the staff team."}],footer:{text:"Automated moderation • Texas State Roleplay"},timestamp:new Date().toISOString()});}catch(dmError){console.error("AutoMod DM delivery failed for "+author.id+":",dmError.message);}}await addLog({action:"automod_"+violation,player:author.username||author.global_name||author.id,user_id:author.id,channel_id:data.channel_id,message_id:data.id,content:content.slice(0,300),id:"automod-"+data.id,ok,result:result||"Message removed automatically",staff:"Texas State Roleplay bot (AutoMod)",reason:violationReason},"moderation");await markGeneralCursor();return;}
      if(eventName==="MESSAGE_UPDATE")await addLog({action:"message_edited",player:author.username||author.global_name||author.id,user_id:author.id,channel_id:data.channel_id,message_id:data.id,content:content.slice(0,200),ok:true,staff:"Discord Gateway",reason:"Message edit event"},"audit");await markGeneralCursor();return;}
    if(eventName==="MESSAGE_DELETE"){if(data.channel_id===CHANNELS.announcements){const deleted=await dataRequest(this.env,"/announcement-delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:data.id})});if(!deleted.ok)throw new Error("Announcement could not be deleted from the website data store (HTTP "+deleted.status+")");const rows=await this.ctx.storage.get("website_announcements")||[];await this.ctx.storage.put("website_announcements",rows.filter(x=>x.id!==data.id));}await addLog({id:"discord-message-delete-"+(data.id||crypto.randomUUID()),action:"message_deleted",player:"Unknown",channel_id:data.channel_id||"",message_id:data.id||"",ok:true,staff:"Discord Gateway",reason:"Message deletion event"},"audit");return;}
    if(eventName==="GUILD_MEMBER_ADD"||eventName==="GUILD_MEMBER_REMOVE"){const u=data.user||{};await addLog({action:eventName==="GUILD_MEMBER_ADD"?"member_joined":"member_left",player:u.username||u.global_name||u.id||"Unknown",user_id:u.id||"",ok:true,staff:"Discord Gateway",reason:eventName==="GUILD_MEMBER_ADD"?"Member joined":"Member left"},"audit");return;}
    if(eventName==="GUILD_AUDIT_LOG_ENTRY_CREATE"){const names={1:"guild_updated",10:"channel_created",11:"channel_updated",12:"channel_deleted",20:"member_kicked",22:"member_banned",23:"member_unbanned",24:"member_updated",25:"member_role_updated",72:"message_deleted",73:"messages_bulk_deleted",80:"role_created",81:"role_updated",82:"role_deleted"};await addLog({id:"discord-audit-"+data.id,action:"audit_"+(names[data.action_type]||("action_"+data.action_type)),player:data.target_id||"Unknown",user_id:data.user_id||"",ok:true,staff:"Discord audit log",reason:String(data.reason||"Discord audit event").slice(0,250)},"audit");const seen=await this.ctx.storage.get("processed_audit_ids")||[];if(data.id&&!seen.includes(data.id)){seen.unshift(data.id);await this.ctx.storage.put("processed_audit_ids",seen.slice(0,500));}}
  }
  async discordApi(path) {
    const response = await fetch("https://discord.com/api/v10" + path, { headers: { Authorization: "Bot " + tokenFrom(this.env) } });
    if (!response.ok) { const detail = await response.text(); throw new Error("Discord recovery API failed (" + response.status + "): " + detail.slice(0, 220)); }
    return response.json();
  }
  async scanGeneralMessages() {
    let cursor = await this.ctx.storage.get("recovery_general_cursor") || null;
    let scanned = 0, complete = false;
    const initial = !cursor;
    for (let page = 0; page < 1; page++) {
      const query = new URLSearchParams({ limit: "10" });
      if (cursor) query.set("after", cursor);
      const rows = await this.discordApi("/channels/" + CHANNELS.general + "/messages?" + query.toString());
      if (!Array.isArray(rows) || !rows.length) { complete = true; break; }
      rows.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
      for (const message of rows) {
        if (cursor && BigInt(message.id) <= BigInt(cursor)) continue;
        await this.handleGatewayEvent("MESSAGE_CREATE", { ...message, guild_id: GUILD_ID });
        cursor = message.id;
        await this.ctx.storage.put("recovery_general_cursor", cursor);
        scanned++;
      }
      if (initial || rows.length < 10) { complete = true; break; }
    }
    return { complete, scanned, cursor };
  }
  async scanAuditLogs() {
    let cursor = await this.ctx.storage.get("recovery_audit_cursor") || null;
    let scanned = 0, complete = false;
    const initial = !cursor, cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (let page = 0; page < 1; page++) {
      const query = new URLSearchParams({ limit: "10" });
      if (cursor) query.set("after", cursor);
      const result = await this.discordApi("/guilds/" + GUILD_ID + "/audit-logs?" + query.toString());
      const rows = result.audit_log_entries || [];
      if (!rows.length) { complete = true; break; }
      rows.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
      for (const entry of rows) {
        if (cursor && BigInt(entry.id) <= BigInt(cursor)) continue;
        const createdAt = Number((BigInt(entry.id) >> 22n) + 1420070400000n);
        if (!initial || createdAt >= cutoff) { await this.handleGatewayEvent("GUILD_AUDIT_LOG_ENTRY_CREATE", { ...entry, guild_id: GUILD_ID }); scanned++; }
        cursor = entry.id;
        await this.ctx.storage.put("recovery_audit_cursor", cursor);
      }
      if (initial || rows.length < 10) { complete = true; break; }
    }
    return { complete, scanned, cursor };
  }
  async flushPendingDeliveries() {
    let dataQueue = await this.ctx.storage.get("pending_data_logs") || [];
    for (let i = 0, attempts = Math.min(10, dataQueue.length); i < attempts; i++) {
      const row = dataQueue[0];
      try { const response = await dataRequest(this.env, "/modlog-write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(row) }); if (!response.ok) break; dataQueue.shift(); await this.ctx.storage.put("pending_data_logs", dataQueue); }
      catch (error) { console.error("Pending website log retry failed:", error.message); break; }
    }
    let discordQueue = await this.ctx.storage.get("pending_discord_logs") || [];
    for (let i = 0, attempts = Math.min(10, discordQueue.length); i < attempts; i++) {
      const item = discordQueue[0];
      try { await discordChannelMessage(this.env, item.target, item.payload); discordQueue.shift(); await this.ctx.storage.put("pending_discord_logs", discordQueue); }
      catch (error) { console.error("Pending Discord audit delivery retry failed:", error.message); break; }
    }
    return { pendingData: dataQueue.length, pendingDiscord: discordQueue.length };
  }
  async sendOutageReport(messages, audit, pending) {
    const started = await this.ctx.storage.get("outage_started_at");
    if (!started) return { sent: false, reason: "no_recorded_outage" };
    const reportId = "gateway-recovery-" + started;
    if (await this.ctx.storage.get("last_outage_report_id") === reportId) return { sent: true, duplicate: true };
    const end = Date.now(), start = new Date(started).getTime();
    const seconds = Math.max(0, Math.floor((end - start) / 1000));
    const duration = seconds >= 3600 ? Math.floor(seconds/3600)+"h "+Math.floor((seconds%3600)/60)+"m" : seconds >= 60 ? Math.floor(seconds/60)+"m "+(seconds%60)+"s" : seconds+"s";
    const found = await this.ctx.storage.get("recovery_violation_found") || 0;
    const deleted = await this.ctx.storage.get("recovery_deleted") || 0;
    const failed = await this.ctx.storage.get("recovery_delete_failed") || 0;
    const embed = { title: "Texas State Roleplay — Gateway outage recovery", color: 3066993, description: "The Discord Gateway has reconnected and its recovery scan has completed.", fields: [
      { name: "Downtime", value: duration, inline: true },
      { name: "Messages scanned", value: String(messages.scanned), inline: true },
      { name: "Audit entries found", value: String(audit.scanned), inline: true },
      { name: "Prohibited messages found", value: String(found), inline: true },
      { name: "Messages deleted", value: String(deleted), inline: true },
      { name: "Deletion failures", value: String(failed), inline: true },
      { name: "Recovery started", value: "<t:"+Math.floor(start/1000)+":F>", inline: false },
      { name: "Recovery completed", value: "<t:"+Math.floor(end/1000)+":F>", inline: false }
    ], footer: { text: "Texas State Roleplay • Automatic recovery report" }, timestamp: new Date(end).toISOString() };
    const payload = { embeds: [embed], allowed_mentions: { parse: [] } };
    const queue = await this.ctx.storage.get("pending_discord_logs") || [];
    queue.unshift({ target: CHANNELS.outage, payload, id: reportId });
    await this.ctx.storage.put("pending_discord_logs", queue.slice(0, 300));
    await this.ctx.storage.put("last_outage_report_id", reportId);
    await this.ctx.storage.delete("outage_started_at");
    await this.ctx.storage.delete("outage_last_known_online");
    const delivery = await this.flushPendingDeliveries();
    return { sent: delivery.pendingDiscord === 0, queued: delivery.pendingDiscord > 0, pending: delivery.pendingDiscord };
  }
  async runRecoveryScan(reason) {
    if (this.recoveryRunning) return { complete: false, status: "already_running" };
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return { complete: false, status: "gateway_not_connected" };
    this.recoveryRunning = true;
    await this.state("recovering", { detail: "Recovery scan running: " + reason });
    try {
      const messages = await this.scanGeneralMessages();
      const audit = await this.scanAuditLogs();
      let pending = await this.flushPendingDeliveries();
      const complete = messages.complete && audit.complete && pending.pendingData === 0 && pending.pendingDiscord === 0;
      const stats = { last_recovery_at: new Date().toISOString(), recovery_messages_scanned: messages.scanned, recovery_audit_entries_scanned: audit.scanned, pending_data_logs: pending.pendingData, pending_discord_logs: pending.pendingDiscord };
      if (complete) {
        const report = await this.sendOutageReport(messages, audit, pending);
        pending = await this.flushPendingDeliveries();
        await this.clearGatewayTask("recovery");
        await this.state("online", { detail: "Gateway connected; recovery scan complete", ...stats, outage_report: report });
      } else { await this.state("recovering", { detail: "Recovery scan is continuing; another pass is scheduled", ...stats }); await this.scheduleGatewayTask("recovery", Date.now() + 10000); }
      return { complete, messages, audit, pending };
    } catch (error) {
      await this.state("recovering", { detail: "Recovery scan failed and will retry: " + String(error.message || error).slice(0, 220), last_recovery_error_at: new Date().toISOString() });
      await this.scheduleGatewayTask("recovery", Date.now() + 15000);
      return { complete: false, error: String(error.message || error).slice(0, 300) };
    } finally { this.recoveryRunning = false; }
  }
  sendHeartbeat() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify({ op: 1, d: this.sequence }));
      this.awaitingAck = true;
      return true;
    } catch (error) {
      console.error("Discord heartbeat send failed:", error.message);
      try { this.socket.close(4000, "Heartbeat send failed"); } catch {}
      return false;
    }
  }
  async scheduleReconnect(delayMs) {
    if (this.stopping) return;
    const delay = delayMs ?? this.reconnectSeconds * 1000;
    const added = await this.scheduleGatewayTask("reconnect", Date.now() + delay, true);
    if (added) this.reconnectSeconds = Math.min(60, Math.max(5, this.reconnectSeconds * 2));
  }
  async alarm() {
    if (this.stopping) return;
    if ((await this.ctx.storage.get("moderation_commands_version")) !== COMMANDS_VERSION) {
      try {
        const registration = await registerCommands(this.env);
        if (registration.ok) {
          await this.ctx.storage.put("moderation_commands_registered", true);
          await this.ctx.storage.put("moderation_commands_version", COMMANDS_VERSION);
        }
      } catch (error) { console.error("Moderation command registration:", error.message); }
    }

    const dueTasks = new Set(await this.takeDueGatewayTasks());
    if (dueTasks.has("reconnect") && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {
      await this.connect();
    }

    if (dueTasks.has("connect_timeout")) {
      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        await this.scheduleGatewayTask("connect_timeout", Date.now() + 15000);
      } else if (this.socket && this.socket.readyState === WebSocket.OPEN && !this.heartbeatInterval) {
        try { this.socket.close(4000, "Discord Hello timed out"); } catch {}
      } else if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        await this.scheduleReconnect();
      }
    }

    // A deployment or runtime eviction can leave persisted tasks but no live in-memory socket.
    // Recover from that state even if the old instance's close callback never ran.
    if ((!this.socket || this.socket.readyState === WebSocket.CLOSED) && !dueTasks.has("reconnect")) {
      await this.scheduleReconnect();
    }

    if (dueTasks.has("heartbeat") && this.heartbeatInterval > 0 && this.socket?.readyState === WebSocket.OPEN) {
      if (this.awaitingAck) {
        await this.state("reconnecting", { detail: "Discord heartbeat acknowledgement was not received before the next heartbeat deadline" });
        try { this.socket.close(4000, "Heartbeat acknowledgement timed out"); } catch {}
      } else if (this.sendHeartbeat()) {
        await this.scheduleGatewayTask("heartbeat", Date.now() + this.heartbeatInterval);
      }
    }

    if (dueTasks.has("recovery") && this.socket?.readyState === WebSocket.OPEN) {
      const currentStatus = await this.ctx.storage.get("gateway_status") || {};
      if (currentStatus.status === "recovering") await this.runRecoveryScan("Gateway recovery alarm");
    }
  }
}