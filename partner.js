(() => {
  "use strict";
  const host=location.hostname;
  const qa=host==="marcusinstrutor-git-feature-acessos-alun-ffc22b-marcusvffs-2839.vercel.app" ||
    /^marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(host);
  const url=qa?"https://voyjssflroiwdyaacthh.supabase.co":"https://ydyqagqsuqntuibzgwzd.supabase.co";
  const key=qa?"sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9":"sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
  const db=window.supabase.createClient(url,key,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,storage:sessionStorage}});
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const date=v=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
  let current=null;
  async function call(action,extra={}){
    const {data,error}=await db.functions.invoke("partner-portal",{body:{action,...extra}});
    if(error){let detail="";try{detail=(await error.context?.clone?.().json())?.error||""}catch(_){}throw new Error(detail||error.message||"Não foi possível acessar a área do parceiro.");}
    if(data?.error)throw new Error(data.error);return data;
  }
  function table(rows,headers,renderRow,empty){
    if(!rows?.length)return '<p class="partner-empty">'+esc(empty)+'</p>';
    return '<div class="partner-table-wrap"><table class="partner-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(renderRow).join("")+'</tbody></table></div>';
  }
  function render(data){
    current=data;
    $("partner-welcome").textContent="Olá, "+data.partner.nome+". Aqui você acompanha seus alunos indicados e suas comissões.";
    $("partner-contact").textContent=[data.partner.email,data.partner.telefone].filter(Boolean).join(" · ")+" · Comissão atual: "+Number(data.partner.commission_percent).toLocaleString("pt-BR")+"%";
    $("partner-pix").value=data.partner.pix_key||"";
    $("partner-pending").textContent=money(data.totals.pending);
    $("partner-available").textContent=money(data.totals.available);
    $("partner-paid").textContent=money(data.totals.paid);
    $("partner-students").innerHTML=table(data.students,["Aluno","Categoria","Situação","Cadastro"],s=>'<tr><td>'+esc(s.nome)+'</td><td>'+esc(s.categoria||"—")+'</td><td>'+esc(s.status||"—")+'</td><td>'+date(s.created_at)+'</td></tr>',"Você ainda não possui alunos indicados.");
    $("partner-commissions").innerHTML=table(data.commissions,["Aluno","Serviço","Aulas concluídas","Comissão","Situação"],c=>'<tr><td>'+esc(c.student_name)+'</td><td>'+esc(c.descricao)+'</td><td>'+Number(c.lessons_completed)+'/'+Number(c.lessons_required)+'</td><td>'+money(c.commission_amount)+'</td><td>'+esc(({pendente:"Pendente",disponivel:"Disponível",pago:"Pago",cancelado:"Cancelado"})[c.status]||c.status)+'</td></tr>',"Nenhuma comissão registrada até o momento.");
    $("partner-payouts").innerHTML=table(data.payouts,["Data","Valor","Forma","Referência"],p=>'<tr><td>'+date(p.paid_at)+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_method)+'</td><td>'+esc(p.reference||"—")+'</td></tr>',"Nenhum pagamento registrado.");
    const messages=$("partner-messages");
    if(!data.messages.length)messages.innerHTML='<p class="partner-empty">Você não possui mensagens.</p>';
    else messages.innerHTML=data.messages.map(m=>'<article class="partner-message '+(!m.read_at?"unread":"")+'"><h3>'+esc(m.message.assunto)+'</h3><p>'+esc(m.message.mensagem)+'</p><span class="partner-muted">'+date(m.message.created_at)+(m.read_at?" · Lida":" · Não lida")+'</span>'+(!m.read_at?'<p><button class="partner-btn" type="button" data-read="'+esc(m.id)+'">Marcar como lida</button></p>':"")+'</article>').join("");
    messages.querySelectorAll("[data-read]").forEach(btn=>btn.addEventListener("click",async()=>{
      btn.disabled=true;try{await call("mark_read",{recipient_id:btn.dataset.read});await refresh();}catch(e){$("partner-status").textContent=e.message;btn.disabled=false;}
    }));
  }
  async function refresh(){
    $("partner-status").textContent="Atualizando...";
    try{const data=await call("overview");render(data);$("partner-status").textContent="";}
    catch(e){$("partner-status").textContent=e.message;}
  }
  $("partner-save-pix").addEventListener("click",async()=>{
    const btn=$("partner-save-pix");btn.disabled=true;
    try{await call("update_pix_key",{pix_key:$("partner-pix").value});$("partner-status").textContent="Chave PIX atualizada.";await refresh();}
    catch(e){$("partner-status").textContent=e.message;}
    finally{btn.disabled=false;}
  });
  $("partner-logout").addEventListener("click",async()=>{
    const btn=$("partner-logout");btn.disabled=true;
    try{await db.auth.signOut({scope:"local"});location.replace("index.html");}
    catch(e){$("partner-status").textContent="Não foi possível encerrar a sessão.";}
    finally{btn.disabled=false;}
  });
  (async()=>{
    const {data,error}=await db.auth.getSession();
    if(error||!data.session){location.replace("index.html");return;}
    await refresh();
  })();
})();