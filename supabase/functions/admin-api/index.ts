import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const ORIGIN="https://kyanik010.github.io",H={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, POST, PATCH, PUT, DELETE, OPTIONS","Vary":"Origin","Content-Type":"application/json"};
const out=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:H}),bad=(error:string,status=400,detail?:string)=>out(status,{error,...(detail?{detail}:{})});
function validUrl(v:unknown):string|null {
 if (typeof v !== "string") return null;
 const raw = v.trim().replace(/\/+$/, "");
 if (raw.length < 8 || raw.length > 500) return null;
 let parsed: URL;
 try { parsed = new URL(raw); } catch { return null; }
 if (!["http:","https:"].includes(parsed.protocol) || !parsed.hostname) return null;
 if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
 const host = parsed.hostname.toLowerCase();
 if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
 const parts = host.split(".");
 if (parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
   const [a,b] = parts.map(Number);
   if (a === 0 || a === 10 || a === 127 || a >= 224 ||
       (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
       (a === 192 && b === 168)) return null;
 }
 return parsed.toString().replace(/\/$/, "");
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");if(origin&&origin!==ORIGIN)return bad("origin_not_allowed",403);if(req.method==="OPTIONS")return new Response("ok",{headers:H});if(!["GET","POST","PATCH","PUT","DELETE"].includes(req.method))return bad("method_not_allowed",405);
 const token=(req.headers.get("authorization")??"").replace(/^Bearer\s+/i,"");if(!token)return bad("authentication_required",401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!anon||!key)return bad("server_configuration_error",500);
 const auth=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}}),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:au,error:ae}=await auth.auth.getUser(token);if(ae||!au.user||au.user.email?.toLowerCase()!=="kyanik010@gmail.com")return bad("admin_only",403);const user=au.user;
 const q=new URL(req.url).searchParams,resource=q.get("resource");let b:Record<string,any>={};if(req.method!=="GET"){try{b=await req.json()}catch{return bad("invalid_json")}}
 const audit=async(action:string,type:string,id?:string,details:Record<string,unknown>={})=>{const {error}=await db.from("audit_logs").insert({actor_user_id:user.id,action,entity_type:type,entity_id:id??null,details});if(error)console.error("audit",error.message)};
 try{
 if(resource==="hosts"){
  if(req.method==="GET"){const {data,error}=await db.from("iptv_hosts").select("*").order("priority").order("created_at");if(error)return bad("host_list_failed",500,error.message);return out(200,{hosts:data??[]})}
  if(["POST","PUT"].includes(req.method)){const name=String(b.name??"").trim(),base_url=validUrl(b.base_url),priority=Number(b.priority??100),is_enabled=b.is_enabled!==false;if(!name||name.length>80||!base_url||!Number.isInteger(priority)||priority<1||priority>10000)return bad("invalid_host_data");if(req.method==="POST"){const {count,error:ce}=await db.from("iptv_hosts").select("id",{count:"exact",head:true});if(ce)return bad("host_count_failed",500,ce.message);if((count??0)>=10)return bad("host_limit_reached",409);const {data,error}=await db.from("iptv_hosts").insert({name,base_url,priority,is_enabled}).select().single();if(error)return bad(error.code==="23505"?"host_name_exists":"host_create_failed",error.code==="23505"?409:500,error.message);return out(201,{host:data})}const id=String(b.id??"");const {data,error}=await db.from("iptv_hosts").update({name,base_url,priority,is_enabled,updated_at:new Date().toISOString()}).eq("id",id).select().maybeSingle();if(error)return bad("host_update_failed",500,error.message);if(!data)return bad("host_not_found",404);return out(200,{host:data})}
  if(req.method==="DELETE"){const {data,error}=await db.from("iptv_hosts").delete().eq("id",String(b.id??"")).select("id").maybeSingle();if(error)return bad("host_delete_failed",500,error.message);if(!data)return bad("host_not_found",404);return out(200,{deleted:true})}return bad("host_method_not_allowed",405)
 }
 const action=String(b.action??q.get("action")??""),p=b.payload&&typeof b.payload==="object"?b.payload:b;
 switch(action){
 case "dashboard.summary":{
  const [d,a,bl,s,x,sv,l]=await Promise.all([db.from("device_registry").select("device_id",{count:"exact",head:true}),db.from("device_registry").select("device_id",{count:"exact",head:true}).eq("device_status","active"),db.from("device_registry").select("device_id",{count:"exact",head:true}).eq("device_status","blocked"),db.from("subscriptions").select("id",{count:"exact",head:true}).eq("status","active").gt("ends_at",new Date().toISOString()),db.from("device_registry").select("device_id",{count:"exact",head:true}).or("subscription_status.eq.expired,subscription_status.eq.revoked,subscription_expires_at.lt."+new Date().toISOString()),db.from("servers").select("id",{count:"exact",head:true}).eq("is_active",true),db.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(8)]);
  for(const r of [d,a,bl,s,x,sv,l])if(r.error)return bad("summary_query_failed",500,r.error.message);return out(200,{data:{devices:d.count??0,activeDevices:a.count??0,blockedDevices:bl.count??0,activeSubscriptions:s.count??0,expiredSubscriptions:x.count??0,activeServers:sv.count??0,recentActivity:l.data??[]}})
 }
 case "devices.list":{
  const {data,error}=await db.from("device_registry").select("*,subscriptions(id,status,starts_at,ends_at,subscription_plans(name,code,duration_days)),device_server_assignments(server_id,servers(id,name,region,is_active))").order("last_seen_at",{ascending:false,nullsFirst:false}).limit(1000);if(error)return bad("devices_query_failed",500,error.message);return out(200,{data:(data??[]).map(d=>({...d,id:d.device_id,device_uid:d.device_id,status:d.device_status}))})
 }
 case "devices.create":{
  const uid=String(p.device_uid??p.device_id??"").trim();if(uid.length<8||uid.length>128)return bad("invalid_device_uid");const {data,error}=await db.from("device_registry").insert({device_id:uid,device_name:p.device_name?String(p.device_name).slice(0,120):null,platform:["android","android_tv","other"].includes(String(p.platform))?p.platform:"android",manufacturer:p.manufacturer?String(p.manufacturer).slice(0,120):null,model:p.model?String(p.model).slice(0,120):null,os_version:p.os_version?String(p.os_version).slice(0,80):null,app_version:p.app_version?String(p.app_version).slice(0,80):null}).select().single();if(error)return bad("device_create_failed",400,error.message);await audit("device_created","device_registry",uid);return out(201,{data:{...data,id:uid,device_uid:uid,status:data.device_status}})
 }
 case "devices.update":{
  const id=String(p.id??p.device_id??p.device_uid??"").trim(),patch:Record<string,unknown>={updated_at:new Date().toISOString()};if(!id)return bad("device_id_required");if(["active","blocked"].includes(String(p.status??p.device_status)))patch.device_status=p.status??p.device_status;if(["trial","active","expired","revoked"].includes(String(p.subscription_status)))patch.subscription_status=p.subscription_status;if(p.duration_days!==undefined){const days=Number(p.duration_days);if(![30,90,180,365].includes(days))return bad("invalid_subscription_duration");patch.subscription_status="active";patch.subscription_expires_at=new Date(Date.now()+days*86400000).toISOString()}else if(typeof p.subscription_expires_at==="string"||p.subscription_expires_at===null)patch.subscription_expires_at=p.subscription_expires_at;if(Object.keys(patch).length===1)return bad("no_valid_updates");const {data,error}=await db.from("device_registry").update(patch).eq("device_id",id).select().maybeSingle();if(error)return bad("device_update_failed",400,error.message);if(!data)return bad("device_not_found",404);await audit("device_updated","device_registry",id,patch);return out(200,{data:{...data,id,device_uid:id,status:data.device_status}})
 }
 case "devices.assign_server":{
  const {data,error}=await db.from("device_server_assignments").upsert({device_id:String(p.device_id),server_id:String(p.server_id),assigned_by:user.id},{onConflict:"device_id,server_id"}).select().single();if(error)return bad("server_assignment_failed",400,error.message);await audit("device_server_assigned","device_server_assignments",data.id);return out(200,{data})
 }
 case "devices.unassign_server":{
  const {data,error}=await db.from("device_server_assignments").delete().eq("device_id",String(p.device_id)).eq("server_id",String(p.server_id)).select("id").maybeSingle();if(error)return bad("server_unassignment_failed",400,error.message);await audit("device_server_unassigned","device_server_assignments",data?.id);return out(200,{data:{deleted:!!data}})
 }
 case "plans.list":{const {data,error}=await db.from("subscription_plans").select("*").order("duration_days");if(error)return bad("plans_query_failed",500,error.message);return out(200,{data})}
 case "plans.create":{
  const name=String(p.name??"").trim(),days=Number(p.duration_days),slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,36);const code=String(p.code??(slug||("plan-"+Date.now())));if(name.length<2||!Number.isInteger(days)||days<1||days>3650)return bad("invalid_plan");const {data,error}=await db.from("subscription_plans").insert({name,code,duration_days:days,price_minor_units:p.price_minor_units??null,currency_code:p.currency_code??"USD",is_active:p.is_active!==false}).select().single();if(error)return bad("plan_create_failed",400,error.message);await audit("plan_created","subscription_plans",data.id);return out(201,{data})
 }
 case "subscriptions.list":{const {data,error}=await db.from("subscriptions").select("*,subscription_plans(name,code,duration_days)").order("created_at",{ascending:false}).limit(1000);if(error)return bad("subscriptions_query_failed",500,error.message);return out(200,{data})}
 case "subscriptions.create":{
  const device_id=String(p.device_id??""),plan_id=String(p.plan_id??"");const {data:plan,error:pe}=await db.from("subscription_plans").select("duration_days").eq("id",plan_id).eq("is_active",true).single();if(!device_id||pe||!plan)return bad("active_plan_not_found");const starts=p.starts_at?new Date(String(p.starts_at)):new Date();if(Number.isNaN(starts.getTime()))return bad("invalid_start_date");const ends=new Date(starts.getTime()+Number(plan.duration_days)*86400000);const {data,error}=await db.from("subscriptions").insert({device_id,plan_id,status:"active",starts_at:starts.toISOString(),ends_at:ends.toISOString(),notes:p.notes??null,created_by:user.id}).select("*,subscription_plans(name,code,duration_days)").single();if(error)return bad("subscription_create_failed",400,error.message);await db.from("device_registry").update({subscription_status:"active",subscription_expires_at:ends.toISOString(),device_status:"active"}).eq("device_id",device_id);await audit("subscription_created","subscriptions",data.id,{device_id});return out(201,{data})
 }
 case "subscriptions.revoke":{
  const {data,error}=await db.from("subscriptions").update({status:"revoked",updated_at:new Date().toISOString()}).eq("id",String(p.id)).select().single();if(error)return bad("subscription_revoke_failed",400,error.message);await db.from("device_registry").update({subscription_status:"revoked"}).eq("device_id",data.device_id);await audit("subscription_revoked","subscriptions",data.id);return out(200,{data})
 }
 case "servers.list":{const {data,error}=await db.from("servers").select("*").order("priority");if(error)return bad("servers_query_failed",500,error.message);return out(200,{data})}
 case "servers.create":{
  const name=String(p.name??"").trim(),server_url=validUrl(p.server_url);if(!name||!server_url)return bad("invalid_server_data");const {data,error}=await db.from("servers").insert({name,server_url,region:p.region??null,priority:Number(p.priority??100),is_active:p.is_active!==false,notes:p.notes??null,created_by:user.id}).select().single();if(error)return bad("server_create_failed",400,error.message);await audit("server_created","servers",data.id);return out(201,{data})
 }
 case "servers.update":{
  const id=String(p.id??""),patch:Record<string,unknown>={updated_at:new Date().toISOString()};for(const k of ["name","region","priority","is_active","notes"])if(p[k]!==undefined)patch[k]=p[k];if(p.server_url!==undefined){const u=validUrl(p.server_url);if(!u)return bad("invalid_server_url");patch.server_url=u}const {data,error}=await db.from("servers").update(patch).eq("id",id).select().single();if(error)return bad("server_update_failed",400,error.message);await audit("server_updated","servers",id);return out(200,{data})
 }
 case "themes.list":{const {data,error}=await db.from("app_themes").select("*").order("sort_order").order("created_at");if(error)return bad("themes_query_failed",500,error.message);return out(200,{data})}
 case "themes.create":{
  const name=String(p.name??"").trim();if(name.length<2||name.length>80)return bad("invalid_theme_name");const {data,error}=await db.from("app_themes").insert({name,palette:p.palette??{},is_active:p.is_active!==false,sort_order:Number(p.sort_order??100),created_by:user.id}).select().single();if(error)return bad("theme_create_failed",400,error.message);await audit("theme_created","app_themes",data.id);return out(201,{data})
 }
 case "themes.update":{
  const id=String(p.id??""),patch:Record<string,unknown>={updated_at:new Date().toISOString()};for(const k of ["name","palette","is_active","sort_order"])if(p[k]!==undefined)patch[k]=p[k];const {data,error}=await db.from("app_themes").update(patch).eq("id",id).select().single();if(error)return bad("theme_update_failed",400,error.message);await audit("theme_updated","app_themes",id);return out(200,{data})
 }
 case "themes.set_default":{
  const id=String(p.id??""),{data:t,error:te}=await db.from("app_themes").select("id").eq("id",id).eq("is_active",true).maybeSingle();if(te||!t)return bad("active_theme_not_found",404);const {error:ce}=await db.from("app_themes").update({is_default:false}).eq("is_default",true);if(ce)return bad("theme_default_clear_failed",500,ce.message);const {data,error}=await db.from("app_themes").update({is_default:true}).eq("id",id).select().single();if(error)return bad("theme_default_set_failed",500,error.message);await audit("theme_set_default","app_themes",id);return out(200,{data})
 }
 case "messages.list":{const {data,error}=await db.from("app_messages").select("*").order("created_at",{ascending:false});if(error)return bad("messages_query_failed",500,error.message);return out(200,{data})}
 case "messages.create":{
  const {data,error}=await db.from("app_messages").insert({title:String(p.title??"").trim(),body:String(p.body??"").trim(),message_type:p.message_type??"info",target_type:p.target_type??"all",target_device_id:p.target_device_id??null,is_published:p.is_published===true,publish_at:p.publish_at??new Date().toISOString(),expires_at:p.expires_at??null,created_by:user.id}).select().single();if(error)return bad("message_create_failed",400,error.message);await audit("message_created","app_messages",data.id);return out(201,{data})
 }
 case "messages.update":{
  const patch:Record<string,unknown>={};for(const k of ["title","body","message_type","target_type","target_device_id","is_published","publish_at","expires_at"])if(p[k]!==undefined)patch[k]=p[k];const {data,error}=await db.from("app_messages").update(patch).eq("id",String(p.id)).select().single();if(error)return bad("message_update_failed",400,error.message);await audit("message_updated","app_messages",String(p.id));return out(200,{data})
 }
 case "messages.delete":{const {data,error}=await db.from("app_messages").delete().eq("id",String(p.id)).select("id").maybeSingle();if(error)return bad("message_delete_failed",400,error.message);await audit("message_deleted","app_messages",String(p.id));return out(200,{data:{deleted:!!data}})}
 case "activity.list":{const {data,error}=await db.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(500);if(error)return bad("activity_query_failed",500,error.message);return out(200,{data})}
 default:{
  // Original EAGLE API compatibility: GET device registry, PATCH subscription/device state.
  if(req.method==="GET"){const {data,error}=await db.from("device_registry").select("device_id,first_seen_at,trial_expires_at,subscription_status,subscription_expires_at,device_status,last_seen_at,created_at,updated_at").order("last_seen_at",{ascending:false,nullsFirst:false}).limit(1000);if(error)return bad("device_list_failed",500,error.message);return out(200,{devices:data??[]})}
  if(req.method==="PATCH"){const id=String(b.device_id??"");const patch:Record<string,unknown>={updated_at:new Date().toISOString()};if(["trial","active","expired","revoked"].includes(String(b.subscription_status)))patch.subscription_status=b.subscription_status;if(b.duration_days!==undefined){const n=Number(b.duration_days);if(![30,90,180,365].includes(n))return bad("invalid_subscription_duration");patch.subscription_status="active";patch.subscription_expires_at=new Date(Date.now()+n*86400000).toISOString()}else if(typeof b.subscription_expires_at==="string"||b.subscription_expires_at===null)patch.subscription_expires_at=b.subscription_expires_at;if(["active","blocked"].includes(String(b.device_status)))patch.device_status=b.device_status;if(Object.keys(patch).length===1)return bad("no_valid_updates");const {data,error}=await db.from("device_registry").update(patch).eq("device_id",id).select().maybeSingle();if(error)return bad("device_update_failed",500,error.message);if(!data)return bad("device_not_found",404);await audit("device_updated","device_registry",id);return out(200,{device:data})}
  return bad("unknown_action")
 }
 }
 }catch(e){console.error("EAGLE admin-api",e);return bad("internal_error",500,e instanceof Error?e.message:"unknown")}
});