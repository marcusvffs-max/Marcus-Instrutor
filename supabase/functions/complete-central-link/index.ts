import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400","Content-Type":"application/json","Vary":"Origin"};
const json=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
function eq(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(msg)));return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{status:200,headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 const secret=Deno.env.get("CENTRAL_ACCESS_SYNC_SECRET"),url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!secret||!url||!service||!anon)return json({error:"Serviço indisponível."},503);
 const bearer=req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!bearer)return json({error:"Faça login no aplicativo."},401);
 const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+bearer}});
 if(!auth.ok)return json({error:"Sessão inválida."},401);
 const user=await auth.json();let body:any;
 try{body=await req.json()}catch{return json({error:"JSON inválido."},400)}
 const code=String(body.code||"").trim();
 if(!/^\d{8}$/.test(code))return json({error:"Informe o código de 8 dígitos."},400);
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code)));
 const codeHash=[...digest].map(x=>x.toString(16).padStart(2,"0")).join("");
 const payload=JSON.stringify({code_hash:codeHash,app_user_id:user.id});
 const stamp=String(Date.now()),signature=await sign(secret,stamp+"."+payload);
 const response=await fetch("https://yklljrfshqoxsruibsws.supabase.co/functions/v1/complete-app-link",{method:"POST",headers:{"Content-Type":"application/json","x-central-timestamp":stamp,"x-central-signature":signature},body:payload});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)return json({error:result.error||"Não foi possível vincular as contas.",linked:result.linked===true,access_sync_pending:result.access_sync_pending===true},response.status);
 return json({linked:true,access_synced:result.access_synced===true,message:result.message||"Conta Central vinculada com sucesso."});
});