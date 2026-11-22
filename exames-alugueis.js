"use strict";
(function () {
  const URL = "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const KEY = "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
  const $ = id => document.getElementById(id);
  let client, ownerId, role, students = [], exams = [], settings = {};
  let activeTab = "resumo";
  let selectedStudentId = null;
  let pendingFixedSaleId = null, pendingFixedSaleFingerprint = null;

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
    const overlay=document.createElement("div");overlay.id="marcus-exam-overlay";
    overlay.innerHTML='<section id="marcus-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="mx-title"><header><h2 id="mx-title">Exames e aluguéis</h2><button id="marcus-exam-close" aria-label="Fechar">×</button></header><div id="marcus-exam-content"></div></section>';
    document.body.append(overlay);
    $("marcus-exam-close").onclick=close;
    overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
    document.addEventListener("keydown",escClose);
    render();
  }
  function escClose(e){if(e.key==="Escape")close();}
  function close(){ $("marcus-exam-overlay")?.remove();document.removeEventListener("keydown",escClose);}
  function nav(){if($("marcus-exam-launch"))return;const actions=document.querySelector("#page-inicio .quick-actions");if(!actions)return;const b=document.createElement("button");b.id="marcus-exam-launch";b.type="button";b.className="primary-button";b.textContent="Exames e aluguéis";b.setAttribute("aria-label","Abrir exames e aluguéis");b.onclick=async()=>{selectedStudentId=null;activeTab="resumo";modal();await refresh();};actions.append(b);}
  async function init(){
    if(!window.supabase?.createClient)return;
    client=window.getMarcusSupabase?.()||window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,storage:window.sessionStorage,detectSessionInUrl:true}});
    const {data,error}=await client.auth.getSession();if(error||!data?.session?.user)return;
    ownerId=data.session.user.id;
    const p=await client.from("profiles").select("role").eq("id",ownerId).maybeSingle();
    if(p.error||!["admin","instrutor"].includes(p.data?.role))return;
    role=p.data.role;nav();
    $("btnPrecosItensFixos")?.addEventListener("click",()=>window.MarcusExamsRentals?.openPrices());
  }
  async function refresh(){
    say("Carregando...");
    const [s,e,a]=await Promise.all([
      client.from("students").select("id,nome,alugueis_comprados,alugueis_disponiveis").eq("owner_id",ownerId).order("nome"),
      client.from("student_practical_exams").select("id,student_id,scheduled_at,status,resultado,aluguel_consumido,observacoes").eq("owner_id",ownerId).order("scheduled_at",{ascending:false}),
      client.from("app_settings").select("aluguel_veiculo_preco,cartao_moto_pista_preco").eq("owner_id",ownerId).maybeSingle()
    ]);
    const err=s.error||e.error||a.error;if(err){say("Não foi possível carregar os dados: "+err.message);return;}
    students=s.data||[];exams=e.data||[];settings=a.data||{};
    render();say("");
  }
  function studentOptions(selected=selectedStudentId||""){return '<option value="">Selecione o aluno</option>'+students.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===selected?'selected':'')+'>'+esc(s.nome)+'</option>').join("");}
  function render(){
    const host=$("marcus-exam-content");if(!host)return;
    const tabs=[["resumo","Resumo"],["venda","Vender item"],["agendar","Agendar exame"],["historico","Histórico"],["precos","Preços"]];
    if(selectedStudentId)tabs.push(["aluno","Aluno"]);
    let body="";
    if(activeTab==="resumo"){
      body='<div class="mx-card"><h3>Saldo de aluguéis por aluno</h3><p class="mx-muted">Cada resultado de exame (aprovado ou reprovado) consome um aluguel. Agendamentos e cancelamentos não consomem.</p><div class="mx-scroll"><table class="mx-table"><thead><tr><th>Aluno</th><th>Comprados</th><th>Disponíveis</th><th>Exames</th></tr></thead><tbody>'+
      (students.length?students.map(s=>'<tr><td>'+esc(s.nome)+'</td><td>'+Number(s.alugueis_comprados||0)+'</td><td><strong>'+Number(s.alugueis_disponiveis||0)+'</strong></td><td>'+exams.filter(x=>x.student_id===s.id&&x.status==="realizado").length+'</td></tr>').join(""):'<tr><td colspan="4">Nenhum aluno cadastrado.</td></tr>')+'</tbody></table></div></div>';
    } else if(activeTab==="venda"){
      body='<div class="mx-card"><h3>Registrar venda de item fixo</h3><p class="mx-muted">Aluguel de Veículo aumenta o saldo do aluno. Cartão Moto Pista é apenas uma cobrança, sem controle de saldo.</p><form id="mx-sale"><label>Aluno</label><select name="student" required>'+studentOptions()+'</select><div class="mx-grid"><div><label>Item</label><select name="item"><option value="aluguel_veiculo">Aluguel de Veículo</option><option value="cartao_moto_pista">Cartão Moto Pista</option></select></div><div><label>Quantidade</label><input name="quantity" type="number" min="1" max="100" value="1" required></div><div><label>Forma de pagamento</label><select name="payment"><option value="">Não informada</option><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência bancária</option><option>Outro</option></select></div><div><label>Observações</label><input name="notes" maxlength="500"></div></div><button class="mx-btn" type="submit">Confirmar venda</button></form></div>';
    } else if(activeTab==="agendar"){
      body='<div class="mx-card"><h3>Agendar exame prático</h3><p class="mx-muted">O agendamento não desconta aluguel. O saldo será conferido e consumido somente quando o resultado for registrado.</p><form id="mx-exam-form"><label>Aluno</label><select name="student" required>'+studentOptions()+'</select><div class="mx-grid"><div><label>Data</label><input name="date" type="date" required></div><div><label>Horário</label><input name="time" type="time" required></div></div><label>Observações</label><textarea name="notes" rows="2" maxlength="500"></textarea><button class="mx-btn" type="submit">Salvar agendamento</button></form></div>';
    } else if(activeTab==="aluno"){
      const student=students.find(s=>String(s.id)===String(selectedStudentId));
      const attempts=exams.filter(x=>String(x.student_id)===String(selectedStudentId)).sort((a,b)=>new Date(b.scheduled_at)-new Date(a.scheduled_at));
      const upcoming=attempts.filter(x=>x.status==="agendado"&&new Date(x.scheduled_at)>=new Date()).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))[0];
      const completed=attempts.filter(x=>x.status==="realizado");
      const history=attempts.map(x=>'<tr><td>'+date(x.scheduled_at)+'</td><td>'+({agendado:"Agendado",realizado:"Realizado",cancelado:"Cancelado"}[x.status]||x.status)+'</td><td>'+({aprovado:"Aprovado",reprovado:"Reprovado"}[x.resultado]||"—")+'</td><td>'+(x.aluguel_consumido?"Sim":"Não")+'</td><td>'+(x.status==="agendado"?'<button class="mx-btn" data-result="'+esc(x.id)+'" data-value="aprovado">Aprovado</button><button class="mx-btn alt" data-result="'+esc(x.id)+'" data-value="reprovado">Reprovado</button><button class="mx-btn danger" data-cancel="'+esc(x.id)+'">Cancelar</button>':"—")+'</td></tr>').join("");
      body=student?'<div class="mx-card"><h3>'+esc(student.nome)+'</h3><div class="mx-stat"><span>Aluguéis comprados: <strong>'+Number(student.alugueis_comprados||0)+'</strong></span><span>Disponíveis: <strong>'+Number(student.alugueis_disponiveis||0)+'</strong></span><span>Exames realizados: <strong>'+completed.length+'</strong></span></div><h4>Próximo exame</h4><p>'+(upcoming?date(upcoming.scheduled_at):'Nenhum exame futuro agendado')+'</p><h4>Histórico de tentativas</h4><div class="mx-scroll"><table class="mx-table"><thead><tr><th>Data</th><th>Status</th><th>Resultado</th><th>Consumiu aluguel</th><th>Ação</th></tr></thead><tbody>'+(history||'<tr><td colspan="5">Nenhuma tentativa registrada.</td></tr>')+'</tbody></table></div><button class="mx-btn alt" type="button" data-tab="agendar">Agendar novo exame</button></div>':'<div class="mx-card">Aluno não encontrado nesta conta.</div>';
    } else if(activeTab==="historico"){
      const rows=exams.filter(x=>!selectedStudentId||String(x.student_id)===String(selectedStudentId)).map(x=>{const st=students.find(s=>s.id===x.student_id);return '<tr><td>'+esc(st?.nome||"Aluno")+'</td><td>'+date(x.scheduled_at)+'</td><td>'+({agendado:"Agendado",realizado:"Realizado",cancelado:"Cancelado"}[x.status]||x.status)+'</td><td>'+({aprovado:"Aprovado",reprovado:"Reprovado"}[x.resultado]||"—")+'</td><td>'+(x.aluguel_consumido?"Sim":"Não")+'</td><td>'+(x.status==="agendado"?'<button class="mx-btn" data-result="'+esc(x.id)+'" data-value="aprovado">Aprovado</button><button class="mx-btn alt" data-result="'+esc(x.id)+'" data-value="reprovado">Reprovado</button><button class="mx-btn danger" data-cancel="'+esc(x.id)+'">Cancelar</button>':"—")+'</td></tr>';}).join("");
      body='<div class="mx-card"><h3>Histórico de exames</h3><p class="mx-muted">O histórico é preservado após a realização ou cancelamento. Registre o resultado apenas após o exame acontecer.</p><div class="mx-scroll"><table class="mx-table"><thead><tr><th>Aluno</th><th>Data</th><th>Status</th><th>Resultado</th><th>Consumiu aluguel</th><th>Ação</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Nenhum exame registrado.</td></tr>')+'</tbody></table></div></div>';
    } else {
      body='<div class="mx-card"><h3>Valores dos itens fixos</h3><p class="mx-muted">Os preços são exclusivos desta conta e não aparecem no catálogo comum de produtos.</p><form id="mx-prices"><div class="mx-grid"><div><label>Aluguel de Veículo (R$)</label><input name="aluguel" type="number" min="0" step="0.01" value="'+Number(settings.aluguel_veiculo_preco||0).toFixed(2)+'" required></div><div><label>Cartão Moto Pista (R$)</label><input name="cartao" type="number" min="0" step="0.01" value="'+Number(settings.cartao_moto_pista_preco||0).toFixed(2)+'" required></div></div><button class="mx-btn" type="submit">Salvar valores</button></form></div>';
    }
    host.innerHTML='<nav class="mx-tabs">'+tabs.map(t=>'<button type="button" data-tab="'+t[0]+'" class="'+(activeTab===t[0]?'active':'')+'">'+t[1]+'</button>').join("")+'</nav>'+body+'<p id="mx-message" class="mx-message" role="status" aria-live="polite"></p>';
    host.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
    $("mx-sale")?.addEventListener("submit",sell);
    $("mx-exam-form")?.addEventListener("submit",schedule);
    $("mx-prices")?.addEventListener("submit",savePrices);
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
  async function sell(ev){
    ev.preventDefault();const f=ev.currentTarget;const qty=Number(f.quantity.value);
    if(!Number.isInteger(qty)||qty<1||qty>100){say("Informe uma quantidade entre 1 e 100.");return;}
    const btn=f.querySelector("button[type=submit]");
    const request={student:f.student.value,item:f.elements["item"].value,quantity:qty,payment:f.payment.value||null,notes:f.notes.value.trim()||null};
    const fingerprint=JSON.stringify(request);
    if(!pendingFixedSaleId||pendingFixedSaleFingerprint!==fingerprint){pendingFixedSaleId=crypto.randomUUID();pendingFixedSaleFingerprint=fingerprint;}
    btn.disabled=true;
    try{
      const {error}=await client.rpc("register_fixed_item_sale",{p_sale_id:pendingFixedSaleId,p_student_id:request.student,p_fixed_item_key:request.item,p_quantity:qty,p_payment_method:request.payment,p_notes:request.notes});
      if(error)throw error;
      pendingFixedSaleId=null;pendingFixedSaleFingerprint=null;
      try{await refresh();await syncParentApp();tab("resumo");say("Venda registrada com sucesso. "+(request.item==="aluguel_veiculo"?"O saldo de aluguéis foi atualizado.":"O Cartão Moto Pista foi lançado sem alterar o saldo."),false);}
      catch(refreshError){console.error("Venda fixa confirmada, mas houve falha ao atualizar a tela:",refreshError);say("A venda foi registrada. Atualize a tela para conferir os saldos.",false);}
    }catch(e){say(e.message||"Não foi possível registrar a venda. Você pode tentar novamente sem duplicar o lançamento.");}
    finally{btn.disabled=false;}
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
  async function savePrices(ev){
    ev.preventDefault();const f=ev.currentTarget;const aluguel=Number(f.aluguel.value),cartao=Number(f.cartao.value);
    if(!Number.isFinite(aluguel)||!Number.isFinite(cartao)||aluguel<0||cartao<0){say("Informe valores válidos.");return;}
    const btn=f.querySelector("button[type=submit]");btn.disabled=true;
    try{const {error}=await client.from("app_settings").upsert({owner_id:ownerId,aluguel_veiculo_preco:aluguel,cartao_moto_pista_preco:cartao},{onConflict:"owner_id"});if(error)throw error;await refresh();tab("precos");say("Valores salvos somente nesta conta.",false);}
    catch(e){say(e.message||"Não foi possível salvar os valores.");}finally{btn.disabled=false;}
  }
  window.MarcusExamsRentals={
    open:async()=>{selectedStudentId=null;activeTab="resumo";modal();await refresh();},
    openPrices:async()=>{selectedStudentId=null;activeTab="precos";modal();await refresh();},
    openForStudent:async id=>{selectedStudentId=String(id);activeTab="aluno";modal();await refresh();}
  };
  document.addEventListener("DOMContentLoaded",()=>{init().catch(e=>console.error("Módulo de exames e aluguéis:",e));});
  if(document.readyState!=="loading")init().catch(e=>console.error("Módulo de exames e aluguéis:",e));
})();