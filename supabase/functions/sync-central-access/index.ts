import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function hmac(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 const secret=Deno.env.get("CENTRAL_ACCESS_SYNC_SECRET"),url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!secret||!url||!service)return json({error:"Sincronização não configurada."},503);
 const raw=await req.text(),stamp=req.headers.get("x-central-timestamp")||"",sig=req.headers.get("x-central-signature")||"";
 const ts=Number(stamp);
 if(!Number.isFinite(ts)||Math.abs(Date.now()-ts)>5*60*1000)return json({error:"Assinatura expirada."},401);
 const expected=await hmac(secret,stamp+"."+raw);
 if(!safeEqual(expected,sig.toLowerCase()))return json({error:"Assinatura inválida."},401);
 let body:any;try{body=JSON.parse(raw)}catch{return json({error:"JSON inválido."},400)}
 const eventId=String(body.event_id||""),centralInstructorId=String(body.central_instructor_id||""),appUserId=String(body.app_user_id||"");
 const revision=Number(body.access_revision);
 const accessUntil=body.access_until===null?null:String(body.access_until||"");
 if(!/^[0-9a-f-]{36}$/i.test(eventId)||!/^[0-9a-f-]{36}$/i.test(centralInstructorId)||!/^[0-9a-f-]{36}$/i.test(appUserId)||!Number.isSafeInteger(revision)||revision<1||(accessUntil!==null&&!Number.isFinite(Date.parse(accessUntil))))return json({error:"Dados de sincronização inválidos."},400);
 const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
 const result=await fetch(url+"/rest/v1/rpc/apply_central_access_state_sync",{method:"POST",headers,body:JSON.stringify({p_central_event_id:eventId,p_central_instructor_id:centralInstructorId,p_app_user_id:appUserId,p_access_until:accessUntil,p_access_revision:revision})});
 if(!result.ok){console.error("Falha na aplicação da sincronização autoritativa",result.status,await result.text());return json({error:"Não foi possível aplicar o acesso."},500)}
 return json({received:true,result:await result.json()});
});