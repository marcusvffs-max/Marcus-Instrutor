(() => {
  "use strict";
  const db = window.getMarcusSupabase?.();
  const trigger = document.getElementById("btnParceiros");
  if (!db || !trigger || trigger.dataset.ready === "1") return;
  trigger.dataset.ready = "1";
  const style = document.createElement("style");
  style.textContent = `
    .pa-overlay{position:fixed;inset:0;z-index:18000;background:rgba(15,23,42,.64);display:flex;align-items:center;justify-content:center;padding:12px}
    .pa-dialog{width:min(100%,980px);max-height:94vh;overflow:auto;background:#f4f7fb;color:#172536;border-radius:18px;padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.3)}
    .pa-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.pa-head h2{margin:0}.pa-close{border:0;border-radius:9px;padding:9px 13px}
    .pa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pa-card{background:#fff;border:1px solid #dce4ed;border-radius:13px;padding:14px;margin:12px 0}
    .pa-card label{display:block;font-size:13px;font-weight:700;margin:8px 0 4px}.pa-card input,.pa-card select,.pa-card textarea{width:100%;min-height:40px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#172536;font:inherit}
    .pa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pa-btn{border:0;border-radius:8px;padding:10px 13px;background:#12345a;color:white;font-weight:700}.pa-btn.alt{background:#e8edf3;color:#12345a}.pa-btn.warn{background:#a12b2b}.pa-btn:disabled{opacity:.55}
    .pa-list{display:grid;gap:10px}.pa-item{background:#fff;border:1px solid #dce4ed;border-radius:12px;padding:13px}.pa-item strong{display:block}.pa-muted{color:#64748b;font-size:13px}.pa-message{min-height:22px;color:#166534;margin:8px 0}.pa-table-wrap{overflow:auto}.pa-table{border-collapse:collapse;width:100%;min-width:650px}.pa-table th,.pa-table td{text-align:left;padding:9px;border-bottom:1px solid #e5eaf0;font-size:13px}
    @media(max-width:600px){.pa-grid{grid-template-columns:1fr}.pa-dialog{padding:12px}}
  `;
  document.head.append(style);
  const overlay=document.createElement("div");overlay.className="pa-overlay";overlay.hidden=true;
  overlay.innerHTML='<section class="pa-dialog" role="dialog" aria-modal="true" aria-labelledby="pa-title"><div class="pa-head"><h2 id="pa-title">Parceiros</h2><button class="pa-close" type="button" aria-label="Fechar">✕</button></div><p class="pa-message" role="status" aria-live="polite"></p><div id="pa-body"></div></section>';
  document.body.append(overlay);
  const body=overlay.querySelector("#pa-body"),message=overlay.querySelector(".pa-message");
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const call=async(action,extra={})=>{
    const {data,error}=await db.functions.invoke("admin-manage-partners",{body:{action,...extra}});
    if(error){let detail="";try{detail=(await error.context?.clone?.().json())?.error||""}catch(_){}throw new Error(detail||error.message||"Falha na operação.");}
    if(data?.error)throw new Error(data.error);return data;
  };
  let partners=[];
  function close(){overlay.hidden=true;}
  overlay.querySelector(".pa-close").onclick=close;
  overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)close();});
  async function load(){
    message.textContent="Carregando parceiros...";
    try{const result=await call("list");partners=result.partners||[];render();message.textContent="";}
    catch(e){message.textContent=e.message;}
  }
  function render(){
    body.innerHTML=`
      <div class="pa-card"><h3>Cadastrar parceiro</h3>
        <form id="pa-invite">
          <div class="pa-grid">
            <div><label>Nome completo</label><input name="nome" maxlength="160" required></div>
            <div><label>E-mail para acesso</label><input name="email" type="email" maxlength="254" required></div>
            <div><label>Telefone</label><input name="telefone" maxlength="30"></div>
            <div><label>CPF / CNPJ</label><input name="cpf_cnpj" maxlength="24"></div>
            <div><label>Comissão (%)</label><input name="commission_percent" type="number" min="0" max="100" step="0.01" value="5" required></div>
          </div><div class="pa-actions"><button class="pa-btn" type="submit">Enviar convite</button></div>
          <p class="pa-muted">O parceiro começa pendente e só terá acesso financeiro depois da sua aprovação.</p>
        </form>
      </div>
      <div class="pa-card"><h3>Parceiros cadastrados</h3><div class="pa-list" id="pa-list"></div></div>
      <div class="pa-card"><h3>Enviar mensagem</h3>
        <form id="pa-message-form"><label>Destinatários</label><select name="target"><option value="all">Todos os parceiros aprovados</option><option value="selected">Selecionar parceiro</option></select>
        <div id="pa-recipient-wrap" hidden><label>Parceiro</label><select name="partner_id"></select></div>
        <label>Assunto</label><input name="assunto" maxlength="160" required><label>Mensagem</label><textarea name="mensagem" rows="3" maxlength="5000" required></textarea>
        <div class="pa-actions"><button class="pa-btn" type="submit">Enviar mensagem</button></div></form>
      </div>
      <div class="pa-card"><h3>Registrar pagamento de comissão</h3>
        <form id="pa-payout-form"><label>Parceiro</label><select name="partner_id" required></select><div id="pa-available"></div>
        <label>Forma de pagamento</label><select name="payment_method"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select>
        <label>Comprovante / referência</label><input name="reference" maxlength="160"><div class="pa-actions"><button class="pa-btn" type="submit">Registrar pagamento selecionado</button></div></form>
      </div>`;
    const list=body.querySelector("#pa-list");
    if(!partners.length)list.innerHTML='<p class="pa-muted">Nenhum parceiro cadastrado.</p>';
    else list.innerHTML=partners.map(p=>`<article class="pa-item"><strong>${esc(p.nome)}</strong><div class="pa-muted">${esc(p.email)} · ${esc(p.telefone||"Sem telefone")}</div><div class="pa-muted">Comissão: ${Number(p.commission_percent).toLocaleString("pt-BR")}% · Situação: <b>${esc(p.status)}</b></div>
      <div class="pa-actions"><select data-status="${esc(p.id)}"><option value="pendente" ${p.status==="pendente"?"selected":""}>Pendente</option><option value="aprovado" ${p.status==="aprovado"?"selected":""}>Aprovado</option><option value="reprovado" ${p.status==="reprovado"?"selected":""}>Reprovado</option><option value="suspenso" ${p.status==="suspenso"?"selected":""}>Suspenso</option></select><input data-percent="${esc(p.id)}" type="number" min="0" max="100" step="0.01" value="${esc(p.commission_percent)}" aria-label="Comissão percentual" style="max-width:110px"><button class="pa-btn alt" data-save="${esc(p.id)}">Salvar</button></div></article>`).join("");
    const approved=partners.filter(p=>p.status==="aprovado");
    const target=body.querySelector('[name="partner_id"]');
    target.innerHTML=approved.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
    const msgSelect=body.querySelector('#pa-message-form [name="partner_id"]');
    msgSelect.innerHTML=approved.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
    body.querySelector('#pa-message-form [name="target"]').addEventListener("change",e=>{body.querySelector("#pa-recipient-wrap").hidden=e.target.value!=="selected";});
    body.querySelectorAll("[data-save]").forEach(btn=>btn.onclick=async()=>{
      btn.disabled=true;try{const id=btn.dataset.save;const status=body.querySelector('[data-status="'+id+'"]').value;const commission_percent=Number(body.querySelector('[data-percent="'+id+'"]').value);
        await call("update_commission",{partner_id:id,commission_percent});await call("update_status",{partner_id:id,status});message.textContent="Cadastro do parceiro atualizado.";await load();
      }catch(e){message.textContent=e.message;btn.disabled=false;}
    });
    body.querySelector("#pa-invite").onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form).entries());data.commission_percent=Number(data.commission_percent);
      const btn=form.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Enviando...";
      try{const r=await call("invite",data);message.textContent=r.message;form.reset();await load();}
      catch(err){message.textContent=err.message;}finally{btn.disabled=false;btn.textContent="Enviar convite";}
    };
    body.querySelector("#pa-message-form").onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget;const target=form.elements.target.value;const extra={assunto:form.elements.assunto.value,mensagem:form.elements.mensagem.value,todos_aprovados:target==="all"};
      if(target==="selected")extra.partner_ids=[form.elements.partner_id.value];
      const btn=form.querySelector("button[type=submit]");btn.disabled=true;
      try{const r=await call("send_message",extra);message.textContent=r.message+" ("+r.recipients+")";form.reset();body.querySelector("#pa-recipient-wrap").hidden=true;}
      catch(err){message.textContent=err.message;}finally{btn.disabled=false;}
    };
    body.querySelector("#pa-payout-form").onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget;const selected=[...body.querySelectorAll('input[name="commission_id"]:checked')].map(x=>x.value);
      if(!selected.length){message.textContent="Selecione ao menos uma comissão disponível.";return;}
      const btn=form.querySelector("button[type=submit]");btn.disabled=true;
      try{const r=await call("record_payout",{partner_id:form.elements.partner_id.value,commission_ids:selected,payment_method:form.elements.payment_method.value,reference:form.elements.reference.value});message.textContent=r.message;await load();}
      catch(err){message.textContent=err.message;}finally{btn.disabled=false;}
    };
    body.querySelector("#pa-payout-form [name=partner_id]").addEventListener("change",loadAvailable);
    loadAvailable();
  }
  async function loadAvailable(){
    const partnerId=body.querySelector("#pa-payout-form [name=partner_id]")?.value;
    const host=body.querySelector("#pa-available");if(!host)return;
    if(!partnerId){host.textContent="Aprove um parceiro para habilitar pagamentos.";return;}
    host.textContent="Carregando comissões disponíveis...";
    try{
      const result=await call("list");
      const {data,error}=await db.from("partner_commissions").select("id,descricao,commission_amount,student_id,lessons_completed,lessons_required")
        .eq("partner_id",partnerId).eq("status","disponivel").order("created_at",{ascending:true});
      if(error)throw error;
      if(!data?.length){host.innerHTML='<p class="pa-muted">Nenhuma comissão disponível para este parceiro.</p>';return;}
      host.innerHTML='<div class="pa-table-wrap"><table class="pa-table"><thead><tr><th></th><th>Serviço</th><th>Aulas</th><th>Valor</th></tr></thead><tbody>'+data.map(c=>'<tr><td><input type="checkbox" name="commission_id" value="'+esc(c.id)+'"></td><td>'+esc(c.descricao)+'</td><td>'+Number(c.lessons_completed)+'/'+Number(c.lessons_required)+'</td><td>'+money(c.commission_amount)+'</td></tr>').join("")+'</tbody></table></div>';
    }catch(e){host.textContent=e.message;}
  }
  trigger.addEventListener("click",async()=>{overlay.hidden=false;await load();});
})();