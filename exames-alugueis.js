"use strict";
(function () {
  const $ = id => document.getElementById(id);
  let client, ownerId, role, students = [], exams = [];
  let activeTab = "historico";
  let selectedStudentId = null;
  let selectedStatus = "todos";

  const css = `
    #marcus-exam-launch{margin-left:8px;white-space:nowrap}
    #marcus-exam-overlay{position:fixed;inset:0;z-index:25000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:12px}
    #marcus-exam-dialog{width:min(100%,900px);max-height:94vh;overflow:auto;background:#f5f7fa;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#172536}
    #marcus-exam-dialog *{box-sizing:border-box}
    #marcus-exam-dialog header{position:sticky;top:0;z-index:2;background:#12345a;color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:18px 18px 0 0}
    #marcus-exam-dialog header h2{font-size:18px;margin:0}
    #marcus-exam-close{background:transparent;border:0;color:white;font-size:28px;line-height:1}
    #marcus-exam-content{padding:16px}
    .mx-tabs{display:flex;gap:7px;overflow:auto;margin-bottom:14px}
    .mx-tabs button{border:1px solid #d6e0eb;background:white;color:#12345a;border-radius:9px;padding:10px 12px;font-weight:700;white-space:nowrap}
    .mx-tabs button.active{background:#12345a;color:white}
    .mx-card{background:white;border:1px solid #dce4ed;border-radius:13px;padding:15px;margin-bottom:12px}
    .mx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .mx-card label{display:block;font-size:12px;font-weight:700;margin:10px 0 5px;color:#536579}
    .mx-card input,.mx-card select,.mx-card textarea{width:100%;min-height:42px;padding:9px 10px;border:1px solid #ccd7e3;border-radius:8px;background:white;color:#172536;font:inherit}
    .mx-btn{border:0;border-radius:9px;padding:10px 13px;background:#12345a;color:white;font-weight:700;margin:8px 6px 0 0}
    .mx-btn.alt{background:#e9eff5;color:#12345a}.mx-btn.danger{background:#a12b2b}
    .mx-btn:disabled{opacity:.55}
    .mx-table{width:100%;border-collapse:collapse;min-width:580px}
    .mx-table th,.mx-table td{padding:9px;border-bottom:1px solid #e5ebf1;text-align:left;font-size:13px}
    .mx-table th{background:#f3f6fa;color:#536579}
    .mx-scroll{overflow-x:auto}
    .mx-stat{display:flex;gap:10px;flex-wrap:wrap}
    .mx-stat span{background:#edf3f9;padding:9px 12px;border-radius:9px;font-size:13px}
    .mx-muted{color:#63758a;font-size:13px;line-height:1.5}
    .mx-message{min-height:20px;color:#a12b2b;font-size:13px;margin:8px 0}
    @media(max-width:600px){#marcus-exam-launch{font-size:12px;padding:10px}.mx-grid{grid-template-columns:1fr}#marcus-exam-content{padding:10px}}
  `;
  function injectStyle(){if(!$("marcus-exam-style")){const s=document.createElement("style");s.id="marcus-exam-style";s.textContent=css;document.head.append(s);}}
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
  function date(v){if(!v)return "—";return new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});}
  function say(message,error=true){const el=$("mx-message");if(el){el.textContent=message||"";el.style.color=error?"#a12b2b":"#16794b";}}
  function tab(name){activeTab=name;render();}
  function modal(){
    if($("marcus-exam-overlay"))return;
    injectStyle();
    const overlay=document.createElement("div");overlay.id="marcus-exam-overlay";
    overlay.innerHTML='<section id="marcus-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="mx-title"><header><h2 id="mx-title">Exames</h2><button id="marcus-exam-close" aria-label="Fechar">×</button></header><div id="marcus-exam-content"></div></section>';
    document.body.append(overlay);
    $("marcus-exam-close").onclick=close;
    overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
    document.addEventListener("keydown",escClose);
    render();
  }
  function escClose(e){if(e.key==="Escape")close();}
  function close(){ $("marcus-exam-overlay")?.remove();document.removeEventListener("keydown",escClose);}
  function nav(){if($("marcus-exam-launch"))return;const actions=document.querySelector("#page-inicio .quick-actions")||document.querySelector(".intro[data-view=\"inicio\"]");if(!actions)return;const b=document.createElement("button");b.id="marcus-exam-launch";b.type="button";b.className=actions.matches(".intro")?"button button-primary":"primary-button";b.textContent="Exames";b.setAttribute("aria-label","Abrir Exames");b.onclick=async()=>{selectedStudentId=null;activeTab="historico";modal();await refresh();};actions.append(b);}
  async function init(){
    if(!window.supabase?.createClient)return;
    const getClient=window.getMarcusSupabase;
    if(typeof getClient!=="function")return;
    client=getClient();
    if(!client)return;
    const {data,error}=await client.auth.getSession();if(error||!data?.session?.user)return;
    ownerId=data.session.user.id;
    const p=await client.from("profiles").select("role").eq("id",ownerId).maybeSingle();
    if(p.error||!["admin","instrutor"].includes(p.data?.role))return;
    role=p.data.role;nav();
  }
  async function refresh(){
    say("Carregando...");
    const [s,e]=await Promise.all([
      client.from("students").select("id,nome").eq("owner_id",ownerId).order("nome"),
      client.from("student_practical_exams").select("id,student_id,scheduled_at,status,resultado,aluguel_consumido,observacoes").eq("owner_id",ownerId).order("scheduled_at",{ascending:false})
    ]);
    const err=s.error||e.error;if(err){say("Não foi possível carregar os dados: "+err.message);return;}
    students=s.data||[];exams=e.data||[];
    render();say("");
  }
  function studentOptions(selected=selectedStudentId||""){return '<option value="">Selecione o aluno</option>'+students.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?'selected':'')+'>'+esc(s.nome)+'</option>').join("");}
  function render(){
    const host=$("marcus-exam-content");if(!host)return;
    const tabs=[["historico","Histórico"],["agendar","Agendar exame"]];
    let body="";
    if(activeTab==="agendar"){
      body='<div class="mx-card"><h3>Agendar exame prático</h3><p class="mx-muted">O agendamento não desconta aluguel. O saldo será conferido e consumido somente quando o resultado for registrado.</p><form id="mx-exam-form"><label>Aluno</label><select name="student" required>'+studentOptions()+'</select><div class="mx-grid"><div><label>Data</label><input name="date" type="date" required></div><div><label>Horário</label><input name="time" type="time" required></div></div><label>Observações</label><textarea name="notes" rows="2" maxlength="500"></textarea><button class="mx-btn" type="submit">Salvar agendamento</button></form></div>';
    }else{
      const rows=exams.filter(x=>(!selectedStudentId||String(x.student_id)===String(selectedStudentId))&&(selectedStatus==="todos"||x.status===selectedStatus)).map(x=>{
        const st=students.find(s=>s.id===x.student_id);
        return '<tr><td>'+esc(st?.nome||"Aluno")+'</td><td>'+date(x.scheduled_at)+'</td><td>'+({agendado:"Agendado",realizado:"Realizado",cancelado:"Cancelado"}[x.status]||x.status)+'</td><td>'+({aprovado:"Aprovado",reprovado:"Reprovado"}[x.resultado]||"—")+'</td><td>'+(x.aluguel_consumido?"Sim":"Não")+'</td><td>'+(x.status==="agendado"?'<button class="mx-btn" data-result="'+esc(x.id)+'" data-value="aprovado">Aprovado</button><button class="mx-btn alt" data-result="'+esc(x.id)+'" data-value="reprovado">Reprovado</button><button class="mx-btn danger" data-cancel="'+esc(x.id)+'">Cancelar</button>':"—")+'</td></tr>';
      }).join("");
      body='<div class="mx-card"><h3>Histórico de exames</h3><p class="mx-muted">O histórico é preservado após a realização ou cancelamento. Registre o resultado apenas após o exame acontecer.</p><div class="mx-filter"><label for="mx-status-filter">Filtrar por status</label><select id="mx-status-filter"><option value="todos" ${selectedStatus==="todos"?"selected":""}>Todos os status</option><option value="agendado" ${selectedStatus==="agendado"?"selected":""}>Agendados</option><option value="realizado" ${selectedStatus==="realizado"?"selected":""}>Realizados</option><option value="cancelado" ${selectedStatus==="cancelado"?"selected":""}>Cancelados</option></select></div><div class="mx-scroll"><table class="mx-table"><thead><tr><th>Aluno</th><th>Data</th><th>Status</th><th>Resultado</th><th>Consumiu aluguel</th><th>Ação</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Nenhum exame registrado.</td></tr>')+'</tbody></table></div></div>';
    }
    host.innerHTML='<nav class="mx-tabs">'+tabs.map(t=>'<button type="button" data-tab="'+t[0]+'" class="'+(activeTab===t[0]?'active':'')+'">'+t[1]+'</button>').join("")+'</nav>'+body+'<p id="mx-message" class="mx-message" role="status" aria-live="polite"></p>';
    host.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
    $("mx-status-filter")?.addEventListener("change",e=>{selectedStatus=e.target.value;render();});
    $("mx-exam-form")?.addEventListener("submit",schedule);
    host.querySelectorAll("[data-result]").forEach(b=>b.onclick=()=>recordResult(b.dataset.result,b.dataset.value));
    host.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>cancelExam(b.dataset.cancel));
  }
  async function syncParentApp(){
    if(role==="admin" && typeof carregarDadosAdminSupabase==="function"){
      try{await carregarDadosAdminSupabase();if(typeof listarAlunos==="function")listarAlunos();if(typeof atualizarPainel==="function")atualizarPainel();}
      catch(error){console.warn("Não foi possível atualizar o painel administrativo após a operação:",error);}
    }else{
      window.dispatchEvent(new Event("marcus-rentals-updated"));
    }
  }
  async function schedule(ev){
    ev.preventDefault();const f=ev.currentTarget;const local=f.elements["date"].value+"T"+f.elements["time"].value;
    if(!f.student.value||!f.date.value||!f.time.value){say("Informe aluno, data e horário.");return;}
    const scheduled=new Date(local);if(!Number.isFinite(scheduled.getTime())){say("Data ou horário inválido.");return;}
    const btn=f.querySelector("button[type=submit]");btn.disabled=true;
    try{const {error}=await client.from("student_practical_exams").insert({owner_id:ownerId,student_id:f.student.value,scheduled_at:scheduled.toISOString(),status:"agendado",observacoes:f.notes.value.trim()||null});if(error)throw error;try{await refresh();}catch(refreshError){console.warn("Agendamento confirmado, mas a tela não foi atualizada:",refreshError);say("Exame agendado. Atualize a tela para conferir.",false);return;}tab("historico");say("Exame agendado. Nenhum aluguel foi descontado.",false);}
    catch(e){say(e.message||"Não foi possível agendar o exame.");}finally{btn.disabled=false;}
  }
  async function recordResult(id,result){
    const label=result==="aprovado"?"APROVADO":"REPROVADO";
    if(!window.confirm("Confirmar resultado "+label+"? Esta ação consumirá 1 Aluguel de Veículo e não poderá ser desfeita."))return;
    try{const {error}=await client.rpc("record_student_practical_exam_result",{p_exam_id:id,p_resultado:result});if(error)throw error;try{await refresh();await syncParentApp();}catch(refreshError){console.warn("Resultado confirmado, mas a tela não foi atualizada:",refreshError);say("Resultado registrado e aluguel consumido. Atualize a tela para conferir.",false);return;}tab("historico");say("Resultado registrado. Um aluguel foi consumido.",false);}
    catch(e){say(e.message||"Não foi possível registrar o resultado.");}
  }
  async function cancelExam(id){
    if(!window.confirm("Cancelar este agendamento? Nenhum aluguel será consumido."))return;
    try{const {error}=await client.rpc("cancel_student_practical_exam",{p_exam_id:id});if(error)throw error;try{await refresh();}catch(refreshError){console.warn("Cancelamento confirmado, mas a tela não foi atualizada:",refreshError);say("Exame cancelado. Atualize a tela para conferir.",false);return;}tab("historico");say("Exame cancelado sem consumir aluguel.",false);}
    catch(e){say(e.message||"Não foi possível cancelar o exame.");}
  }
  window.MarcusExamsRentals={
    open:async()=>{selectedStudentId=null;selectedStatus="todos";activeTab="historico";modal();await refresh();},
    openForStudent:async id=>{selectedStudentId=String(id);selectedStatus="todos";activeTab="historico";modal();await refresh();}
  };
  document.addEventListener("DOMContentLoaded",()=>{init().catch(e=>console.error("Módulo de exames e aluguéis:",e));});
  if(document.readyState!=="loading")init().catch(e=>console.error("Módulo de exames e aluguéis:",e));
})();