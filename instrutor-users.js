"use strict";
(function(){
const host=document.getElementById("listaAlunosVinculados"),count=document.getElementById("totalAlunosVinculados"),search=document.getElementById("buscaAlunosVinculados");
if(!host)return;let rows=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function render(){const q=String(search?.value||"").trim().toLocaleLowerCase("pt-BR");const list=rows.filter(s=>[s.nome,s.email,s.cpf].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(q)));
if(count)count.textContent=rows.length+(rows.length===1?" aluno vinculado":" alunos vinculados");
host.innerHTML=list.length?list.map(s=>'<article class="record"><div class="record-info"><strong>'+esc(s.nome||"Aluno sem nome")+'</strong><p>E-mail: '+esc(s.email||"Não informado")+'</p><p>CPF: '+esc(s.cpf||"Não informado")+'</p><p>Acesso: Vinculado</p></div></article>').join(""):'<div class="empty-state">Nenhum aluno vinculado encontrado.</div>';}
async function load(){const client=window.getMarcusSupabase?.();if(!client){host.innerHTML='<div class="empty-state">Entre novamente para consultar os alunos vinculados.</div>';return;}host.innerHTML='<div class="empty-state">Carregando alunos vinculados...</div>';
try{const {data:auth,error:authError}=await client.auth.getUser();if(authError||!auth?.user?.id)throw new Error("Sessão não encontrada.");
const {data,error}=await client.from("students").select("id,nome,email,cpf,user_id").eq("owner_id",auth.user.id).not("user_id","is",null).order("nome",{ascending:true});if(error)throw error;rows=Array.isArray(data)?data:[];render();}
catch(error){console.error("Falha ao carregar alunos vinculados:",error);host.innerHTML='<div class="empty-state">Não foi possível carregar os alunos vinculados. Atualize a página e tente novamente.</div>';if(count)count.textContent="Não disponível";}}
search?.addEventListener("input",render);window.addEventListener("marcus-authenticated",load);if(document.body.classList.contains("autenticado"))load();
})();