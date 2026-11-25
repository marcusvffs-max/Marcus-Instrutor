"use strict";
let tipoContratoAtual="cliente";
function escapeC(v){return String(v||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function carregarAlunosContrato(){const s=document.getElementById("contratoAluno");if(!s)return;s.innerHTML='<option value="">Preencher manualmente</option>'+(db.alunos||[]).map(a=>'<option value="'+escapeC(a.id)+'">'+escapeC(a.nome)+'</option>').join("");}
function selecionarAlunoContrato(){const a=(db.alunos||[]).find(x=>String(x.id)===document.getElementById("contratoAluno").value);if(!a)return;document.getElementById("clienteNome").value=a.nome||"";document.getElementById("clienteCpf").value=a.cpf||"";document.getElementById("clienteCategoria").value=a.categoria||"";}
function tipoC(t){tipoContratoAtual=t;const cliente=document.getElementById("formContratoCliente");const parceiro=document.getElementById("formContratoParceiro");cliente.hidden=t!=="cliente";parceiro.hidden=t!=="parceiro";cliente.style.display=t==="cliente"?"block":"none";parceiro.style.display=t==="parceiro"?"block":"none";document.getElementById("tituloTipoContrato").textContent=t==="cliente"?"Contrato de cliente":"Contrato de parceiro";document.getElementById("contratoPreview").innerHTML="";document.querySelectorAll("[data-tipo-contrato]").forEach(b=>{const ativo=b.dataset.tipoContrato===t;b.classList.toggle("active",ativo);b.classList.toggle("primary-button",ativo);b.classList.toggle("secondary-button",!ativo);});}
window.tipoC = tipoC;

async function carregarParceirosContrato(){
  const select=document.getElementById("contratoParceiroSelecionar");
  if(!select)return;
  const anterior=select.value;
  const cliente=window.getMarcusSupabase?.();
  if(!cliente)return;
  try{
    const {data,error}=await cliente.functions.invoke("admin-manage-partners",{body:{action:"list"}});
    if(error)throw error;
    const rows=Array.isArray(data?.partners)?data.partners:[];
    select.innerHTML='<option value="">Preencher manualmente</option>'+rows.map(p=>'<option value="'+escapeC(p.id)+'">'+escapeC(p.nome)+'</option>').join("");
    if(rows.some(p=>String(p.id)===String(anterior)))select.value=anterior;
    select.dataset.partnerRows=JSON.stringify(rows.map(p=>({id:p.id,nome:p.nome,nacionalidade:p.nacionalidade,estado_civil:p.estado_civil,profissao:p.profissao,cpf_cnpj:p.cpf_cnpj,endereco:p.endereco,commission_percent:p.commission_percent})));
  }catch(error){console.warn("Não foi possível carregar parceiros para o contrato:",error);}
}
function selecionarParceiroContrato(){
  const select=document.getElementById("contratoParceiroSelecionar");
  let rows=[];try{rows=JSON.parse(select?.dataset.partnerRows||"[]");}catch(_){rows=[];}
  const p=rows.find(x=>String(x.id)===String(select?.value));
  if(!p)return;
  document.getElementById("parceiroNome").value=p.nome||"";
  document.getElementById("parceiroNacionalidade").value=p.nacionalidade||"";
  document.getElementById("parceiroCivil").value=p.estado_civil||"";
  document.getElementById("parceiroProfissao").value=p.profissao||"";
  document.getElementById("parceiroDocumento").value=p.cpf_cnpj||"";
  document.getElementById("parceiroEndereco").value=p.endereco||"";
  document.getElementById("parceiroComissao").value=String(p.commission_percent??5);
}
function numeroPorExtensoC(valor){const unidades=["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove"];const especiais=["dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];const dezenas=["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];function inteiro(n){if(n<10)return unidades[n];if(n<20)return especiais[n-10];if(n<100){const d=Math.floor(n/10),u=n%10;return dezenas[d]+(u?" e "+unidades[u]:"");}return "cem";}const partes=valor.toFixed(2).split(".");const base=Number(partes[0]),dec=Number(partes[1]);return inteiro(base)+(dec?" vírgula "+inteiro(dec):"");}
function inteiroExtensoMoedaC(n){
  const u=["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove"];
  const teens=["dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const tens=["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const hundreds=["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  function ate999(v){
    if(v===0)return "";
    if(v===100)return "cem";
    const c=Math.floor(v/100),r=v%100;
    let s=c?hundreds[c]:"";
    if(r){const t=r<10?u[r]:r<20?teens[r-10]:tens[Math.floor(r/10)]+(r%10?" e "+u[r%10]:"");s+=(s?" e ":"")+t;}
    return s;
  }
  if(n===0)return "zero";
  const milhoes=Math.floor(n/1000000), milhares=Math.floor((n%1000000)/1000), unidades=n%1000;
  const partes=[];
  if(milhoes)partes.push(milhoes===1?"um milhão":ate999(milhoes)+" milhões");
  if(milhares)partes.push(milhares===1?"mil":ate999(milhares)+" mil");
  if(unidades)partes.push(ate999(unidades));
  if(partes.length===1)return partes[0];
  const ultima=partes[partes.length-1];
  const usarE=(unidades>0&&(unidades<100||unidades%100===0))||(unidades===0&&milhares>0);
  return partes.slice(0,-1).join(" ") + (usarE?" e ":", ") + ultima;
}
function valorMonetarioPorExtensoC(valor){
  const numero=Number(String(valor).replace(",","."));
  if(!Number.isFinite(numero)||numero<0)throw new Error("Valor do pacote inválido.");
  const totalCentavos=Math.round((numero+Number.EPSILON)*100);
  const reais=Math.floor(totalCentavos/100), centavos=totalCentavos%100;
  const partesMoeda=(totalCentavos/100).toFixed(2).split(".");
  const inteiroFormatado=partesMoeda[0].replace(/\B(?=(\d{3})+(?!\d))/g,".");
  const moeda="R$ "+inteiroFormatado+","+partesMoeda[1];
  const textoReais=reais===1?"um real":inteiroExtensoMoedaC(reais)+" reais";
  const textoCentavos=centavos?(centavos===1?"um centavo":inteiroExtensoMoedaC(centavos)+" centavos"):"";
  return moeda+" ("+textoReais+(textoCentavos?" e "+textoCentavos:"")+")";
}
function paginaC(html){const nome=escapeC(db.configuracoes?.nome||"Marcus Instrutor");const subtitulo=tipoContratoAtual==="cliente"?"Contrato de cliente":"Contrato de parceiro";const classe=tipoContratoAtual==="parceiro"?" contrato-parceiro":" contrato-aluno";return '<article class="contrato-folha'+classe+'"><header class="cabecalho-relatorio contrato-cabecalho"><div class="identificacao-relatorio"><h1>'+nome+'</h1><p>'+subtitulo+'</p></div></header><main>'+html+'</main></article>'}
function aplicarLogoContrato(){const logo=db.configuracoes?.logo||"";if(!logo)return;document.querySelectorAll("#contratoPreview .contrato-cabecalho").forEach(cabecalho=>{if(cabecalho.querySelector(".contrato-logo"))return;const img=document.createElement("img");img.className="logo-relatorio contrato-logo";img.alt="Logo da empresa";img.src=logo;img.style.setProperty("display","block","important");img.style.setProperty("width","auto","important");img.style.setProperty("max-width","110px","important");img.style.setProperty("max-height","85px","important");img.style.setProperty("height","auto","important");img.style.setProperty("margin","0","important");img.style.setProperty("flex","0 0 auto","important");cabecalho.style.setProperty("display","flex","important");cabecalho.style.setProperty("flex-direction","row","important");cabecalho.style.setProperty("align-items","center","important");cabecalho.style.setProperty("justify-content","flex-start","important");cabecalho.style.setProperty("gap","16px","important");cabecalho.insertBefore(img,cabecalho.firstChild);});}
function gerarC(){
const g=id=>document.getElementById(id).value.trim();
const contratanteNome=g("contratanteNome"),contratanteDocumento=g("contratanteDocumento");
const contratanteNacionalidade=g("contratanteNacionalidade"),contratanteCivil=g("contratanteCivil");
const contratanteProfissao=g("contratanteProfissao"),contratanteEndereco=g("contratanteEndereco");
if(!contratanteNome||!contratanteDocumento){mostrarAviso("Preencha nome e CPF/CNPJ no menu Meu cadastro antes de gerar o contrato.");return;}
if(tipoContratoAtual==="parceiro"&&(!contratanteNacionalidade||!contratanteCivil||!contratanteProfissao||!contratanteEndereco)){mostrarAviso("Preencha todos os dados de identificação do instrutor/contratante.");return;}
if(tipoContratoAtual==="cliente"){
const nome=g("clienteNome"),cpf=g("clienteCpf"),cat=g("clienteCategoria"),aulas=g("clienteAulas"),valor=g("clienteValor"),pag=g("clientePagamento");
if(!nome||!cpf||!cat||!aulas||!valor||!pag){mostrarAviso("Preencha os campos obrigatórios do cliente.");return;}
const cart=document.getElementById("clienteCartao").checked?", CARTÃO MOTO PISTA":"";const alug=document.getElementById("clienteAluguel").checked?" E ALUGUEL DO VEÍCULO":"";const valorFormatado=valorMonetarioPorExtensoC(valor).replace(/(?:R\$\s*)+/g,"R$ ");
const p1="<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1><p><b>CONTRATANTE:</b> "+escapeC(nome)+"</p><p><b>CPF:</b> "+escapeC(cpf)+"</p><p><b>CONTRATADO / INSTRUTOR:</b> "+escapeC(contratanteNome)+"</p><p><b>CPF/CNPJ:</b> "+escapeC(contratanteDocumento)+"</p><p>O CONTRATADO compromete-se a fornecer ao CONTRATANTE os seguintes serviços: Pacote de aulas adquirido, aluguel de veículo para exame prático.</p><p>O CONTRATANTE deverá estar com o pagamento em dia para o agendamento de aulas práticas e para marcação de exames junto ao DETRAN.</p><h3>1. MATRÍCULAS</h3><p>Pelos serviços contratado(s) "+escapeC(cat)+" COM "+escapeC(aulas)+" AULAS"+cart+alug+" O CONTRATANTE paga ao CONTRATADO a importância de "+escapeC(valorFormatado)+" da seguinte forma: "+escapeC(pag)+"</p><h3>SÃO OBRIGAÇÕES DO CONTRATADO:</h3><p>2- A realização das aulas práticas e disponibilizar ao Candidato, para a realização das aulas práticas e exame, veículos em boas condições de uso, de acordo com a sua disponibilidade.</p><h3>3- SÃO OBRIGAÇÕES DO CONTRATANTE:</h3><p>3.1- Caso seja necessária a realização de novos exames o Aluno deverá arcar com as novas taxas cobradas.</p><p>3.2- Para marcação de retestes do CONTRATANTE junto ao DETRAN, seja por não comparecimento ou reprovação em exames, o mesmo deverá pagar ao CONTRATADO os valores referentes ao pagamento de novo aluguel do veículo quantas vezes for necessário para a conclusão do curso.</p><p>3.3- Em caso de adição ou mudança de categoria, o número mínimo necessário de aulas práticas será de 02 aulas práticas na categoria devidamente inclusa no presente contrato. Se houver necessidade de mais aulas que a carga horária obrigatória, o mesmo deverá adquiri-las com o CONTRATADO.</p><p>3.4- O CONTRATANTE está ciente e concorda que o processo de habilitação terá início assim que houver vaga do contratado, para as aulas práticas.</p><p>3.5- Observar e cumprir estrita e rigorosamente tudo o que lhe for determinado durante o aprendizado, inclusive no que diz respeito aos horários de aulas práticas, às quais o CONTRATANTE deverá chegar com antecedência mínima de 10 (dez) minutos do horário marcado para início. Havendo atraso do mesmo, a aula será reposta mediante pagamento da multa no valor de R20,00 (vinte reais).</p><p>3.6- Quando o CONTRATANTE solicitar serviços junto ao CONTRATADO, deverá retirá-los nas datas indicadas nas solicitações, sob pena de perder os serviços solicitados e incorrer em novas taxas do DETRAN, bem como novos honorários do CONTRATADO.</p><p>3.7- É obrigação de o CONTRATANTE entrar em contato com o CONTRATADO, no prazo de 48 horas após ter requerido a marcação de seus exames para que tome ciência da data marcada e posteriormente retire o protocolo junto ao CONTRATADO.</p><p>3.8- Na impossibilidade de comparecer às aulas, o (a) CONTRATANTE deverá cientificar o CONTRATADO, com antecedência mínima de 24 (vinte e quatro) horas, para que seja efetivada a transferência das referidas aulas. O não cumprimento implicará em novos valores para aulas não canceladas. Para as aulas marcadas nas segundas-feiras o prazo de adiamento e transferências será até às 12h00min (doze horas) do Sábado que as antecede. A transferência fora da hipótese acima NÃO OCORRERÁ, devendo o CONTRATANTE adquirir novas aulas.</p>";
const p2="<p>3.9- Os exames marcados no DETRAN são INTRANSMISSÍVEIS e se realizarão independente das condições climáticas, devendo o CONTRATANTE comparecer aos mesmos na data marcada no PROTOCOLO DO DETRAN, com um mínimo de 30 (trinta) minutos de antecedência dos mesmos, portando Carteira de Identidade, LADV, protocolo do DETRAN e lentes corretivas visuais se for o caso.</p><p>3.10- O CONTRATANTE após autorização do INSTRUTOR, para a marcação do exame prático, deverá dirigir-se ao CONTRATADO, no prazo máximo de 48 (quarenta e oito) horas para efetivar a solicitação de marcação dos mesmos, sob pena, de ter que submeter-se a nova avaliação prática através da aquisição de novas aulas.</p><p>3.11- É obrigatório portar carteira de identidade e LADV enquanto o Aluno estiver frequentando as aulas e realizando os exames. A falta destes documentos impedirá a participação nas aulas e realização de exames junto ao DETRAN.</p><p>3.12- Da mesma forma, é necessária a utilização de calçado adequado para a realização das aulas e dos exames práticos sob pena do Aluno não poder realizá-los. A perda da aula ou do exame, quando decorrer do fato do aluno estar utilizando vestimenta incompatível é de inteira responsabilidade do CONTRATANTE, razão pela qual a aula e o exame só serão repostos após novo pagamento.</p><p>3.13- Os Alunos matriculados no curso prático de condução para qualquer das categorias assumem o risco por eventuais acidentes que possam lhe ocorrer.</p><p>3.14- O CONTRATANTE compromete-se a informar qualquer alteração do seu telefone junto ao contratado, durante a vigência deste contrato, sob pena de não responsabilizar o CONTRATADO por danos decorrentes da impossibilidade ou dificuldade de comunicação.</p><p>3.15- O CONTRATANTE autoriza, desde o ato de assinatura desse contrato, em caráter irretratável, irrevogável e de forma não onerosa o uso de sua imagem, seja foto ou vídeo, para utilizar e veicular em fins de publicidade institucional, sem qualquer limitação de número de inserções e reproduções junto ao site e às redes sociais do CONTRATADO, na internet e extranet do CONTRATADO.</p><h3>4. CONDIÇÕES GERAIS:</h3><p>4.1- O CONTRATANTE não comparecendo junto ao CONTRATADO no prazo de 90 dias para qualquer utilização do serviço CONTRATADO deverá efetuar nova matrícula obedecendo a disponibilidade do CONTRATADO.</p><p>4.2- O CONTRATADO não se responsabilizará por falhas que decorram de erro no sistema de informações do DETRAN e que comprometam a autenticação e reconhecimento das aulas. Neste caso o CONTRATADO realizará o reagendamento apenas após resposta conclusiva do DETRAN.</p><p>4.3- Nas aulas práticas contar-se-á o tempo a partir do momento que o veículo for colocado à disposição do CONTRATANTE (50 minutos), desde a locomoção até a área de treinamento e o retorno à sede do CONTRATADO, mesmo que realizado pelo Instrutor.</p><p>4.4- O CONTRATANTE fica ciente desde já, que a disponibilidade de vagas junto ao DETRAN para exames independe da vontade do CONTRATADO, além deste não assumir compromissos com datas e horários para marcação dos exames.</p><p>4.5- Conforme previsão legal contida na Resolução 168/04 CONTRAN, os processos de primeira habilitação, obrigatoriamente, deverão estar concluídos no prazo de 12 (doze) meses, contados da data de abertura dos mesmos, sob pena de cancelamento.</p><p>4.6- Depois de firmado o presente CONTRATATO DE PRESTAÇÃO DE SERVIÇOS o mesmo poderá ser cancelado desde que o CONTRATANTE efetue o pagamento dos serviços prestados pelo CONTRATADO.</p><p>4.7- A Título de custos administrativos será cobrado do CONTRATANTE 20% (vinte por cento) sobre o valor a ser devolvido no prazo de até 120 dias.</p><p>4.8- Assim CONTRATADO e CONTRATANTE firmam o presente contrato em duas vias de igual teor e forma, para os fins de direito, ficando eleito o Foro Regional da cidade, para dirimir quaisquer divergências de correntes deste contrato. Passando o prazo estipulado, a importância paga, não será devolvida, poderá ser feita somente a transferência para outro CONTRATADO, com o mesmo pagando a diferença em caso de reajuste. NÃO FAZEMOS TRANSFERÊNCIA PARA OUTRO CPF.</p><div class='contrato-assinaturas-aluno'><p class='contrato-data-assinatura'>Governador Valadares - ______/______/_________</p><section class='contrato-assinatura-parte'><div class='contrato-linhas-em-branco'><div></div><div></div><div></div><div></div><div></div><div></div></div><p><b>___________________________________________</b><br>MARCUS VINICIUS FELIPE DA FONSECA SILVA<br>CPF: 01523019689</p></section><section class='contrato-assinatura-parte'><div class='contrato-linhas-em-branco'><div></div><div></div><div></div><div></div><div></div><div></div></div><p><b>___________________________________________</b><br>MARCUS VINICIUS FELIPE DA FONSECA SILVA<br>CPF: F</p></section></div>";
document.getElementById("contratoPreview").innerHTML=paginaC(p1+p2);aplicarLogoContrato();void registrarContratoGerado("aluno",nome,cpf,document.getElementById("contratoAluno")?.value||null,null);
} else {
const nome=g("parceiroNome"),nac=g("parceiroNacionalidade"),civil=g("parceiroCivil"),prof=g("parceiroProfissao"),doc=g("parceiroDocumento"),end=g("parceiroEndereco"),com=Number(g("parceiroComissao"));
if(!nome||!nac||!civil||!prof||!doc||!end||!Number.isFinite(com)||com<0||com>100){mostrarAviso("Preencha os dados do parceiro e comissão entre 0 e 100%.");return;}
const ext=numeroPorExtensoC(com);
const p1="<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PARCERIA COMERCIAL E INTERMEDIAÇÃO DE VENDAS</h1><h3>1. DAS PARTES</h3><p><b>CONTRATANTE:</b> "+escapeC(contratanteNome)+", "+escapeC(contratanteNacionalidade)+", "+escapeC(contratanteCivil)+", "+escapeC(contratanteProfissao)+", inscrito(a) no CPF/CNPJ sob o nº "+escapeC(contratanteDocumento)+", residente e domiciliado(a) / sediado(a) em "+escapeC(contratanteEndereco)+", doravante denominado simplesmente CONTRATANTE.</p><p><b>CONTRATADO(A):</b> "+escapeC(nome)+", "+escapeC(nac)+", "+escapeC(civil)+", "+escapeC(prof)+", inscrito(a) no CPF/CNPJ sob o nº "+escapeC(doc)+", residente e domiciliado(a) / sediado(a) em "+escapeC(end)+", doravante denominado(a) simplesmente CONTRATADO(A).</p><h3>2. DO OBJETO</h3><p>2.1. O presente contrato tem como objeto a prestação de serviços autônomos de captação de clientes e intermediação de vendas das aulas ministradas pelo CONTRATANTE, sem qualquer exclusividade, vínculo de subordinação ou dependência econômica.</p><h3>3. DA AUSÊNCIA DE VÍNCULO EMPREGATÍCIO</h3><p>3.1. As partes declaram expressamente que o presente contrato possui natureza estritamente civil e mercantil, regido pelas disposições do Código Civil Brasileiro.</p><p>3.2. O(A) CONTRATADO(A) atuará com total autonomia, definindo livremente seus horários, rotinas, métodos e locais de trabalho, não estando sujeito(a) ao cumprimento de jornada, controle de ponto ou ordens diretas do CONTRATANTE.</p><p>3.3. O(A) CONTRATADO(A) poderá exercer simultaneamente outras atividades profissionais e prestar serviços para terceiros, sem necessidade de autorização prévia.</p><h3>4. DA REMUNERAÇÃO E FORMA DE PAGAMENTO</h3><p>4.1. Pela prestação dos serviços de intermediação comercial, o(a) CONTRATADO(A) fará jus a uma comissão de "+escapeC(ext)+" por cento ("+com+"%) sobre o valor efetivamente recebido por cada aula vendida por sua intermediação.</p><p>4.2. O pagamento da comissão será devido tão somente após o término e conclusão do total de aulas referente à venda realizada.</p><p>4.3. O repasse dos valores será efetuado em até 2 (dois) dias úteis após a realização das aulas, mediante PIX na conta bancária a ser indicada pelo(a) CONTRATADO(A).</p><p>4.4. Em caso de cancelamento da aula pelo aluno com reembolso integral ou inadimplência antes da realização da aula, nenhuma comissão será devida ao(à) CONTRATADO(A).</p>";
const p2="<h3>5. DAS OBRIGAÇÕES DAS PARTES</h3><p>5.1. Do(a) CONTRATADO(A): Promover as vendas das aulas de forma ética, clara e transparente, fornecendo informações precisas sobre conteúdo, horários e valores definidos pelo CONTRATANTE; arcar com todos os custos operacionais, computadores, telefonia ou transporte necessários ao desempenho de sua atividade de intermediação; arcar com os tributos e encargos fiscais decorrentes de sua atividade profissional autônoma.</p><p>5.2. Do CONTRATANTE: Fornecer ao(à) CONTRATADO(A) as informações necessárias sobre as aulas (conteúdo, agenda, preços e condições de pagamento); ministrar as aulas contratadas com zelo e qualidade; efetuar o pagamento das comissões devidas nos prazos e condições estabelecidos neste contrato.</p><h3>6. DA VIGÊNCIA E RESCISÃO</h3><p>6.1. O presente contrato é firmado por prazo indeterminado, entrando em vigor na data de sua assinatura.</p><p>6.2. Qualquer uma das partes poderá rescindir o presente contrato a qualquer momento, sem incidência de multa, mediante comunicação prévia por escrito com antecedência mínima de 2 (dois) dias.</p><p>6.3. As comissões relativas a aulas já vendidas e agendadas antes da notificação de rescisão serão devidas ao(à) CONTRATADO(A) assim que as respectivas aulas forem ministradas.</p><h3>7. DO FORO</h3><p>7.1. Para dirimir quaisquer controvérsias oriundas deste instrumento, as partes elegem o Foro da Comarca de Governador Valadares, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p><p>Por estarem assim justos e contratados, assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p><p>Governador Valadares, ______ de __________________ de __________.</p><div class='contrato-espaco-assinatura'><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div></div><p>__________________________________________________<br>CONTRATANTE: "+escapeC(contratanteNome)+"</p><div class='contrato-espaco-assinatura'><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div><div class='contrato-linha-assinatura'>&nbsp;</div></div><p>__________________________________________________<br>CONTRATADO(A): "+escapeC(nome)+"</p>";
document.getElementById("contratoPreview").innerHTML=paginaC(p1+p2);aplicarLogoContrato();void registrarContratoGerado("parceiro",nome,doc,null,document.getElementById("contratoParceiroSelecionar")?.value||null);
}
}
function imprimirDocumentoContrato(html,nome){
  // Imprime dentro da própria página, sem abrir nova aba ou janela.
  const titulo=escapeC(nome||"Contrato");
  const htmlPreparado=(()=>{
    const raiz=document.createElement("div");
    raiz.innerHTML=String(html||"");
    const folha=raiz.querySelector(".contrato-folha.contrato-aluno");
    if(!folha)return raiz.innerHTML;
    const bloco=folha.querySelector(".contrato-assinaturas-aluno");
    if(!bloco)return raiz.innerHTML;
    const data=bloco.querySelector(".contrato-data-assinatura")?.textContent?.trim()||"Governador Valadares - ______/______/_________";
    bloco.innerHTML=
      "<p class='contrato-data-assinatura'>"+escapeC(data)+"</p>"+
      "<section class='contrato-assinatura-parte'><div class='contrato-linhas-em-branco' aria-hidden='true'>"+Array.from({length:6},()=>"<div class='contrato-linha-vazia'></div>").join("")+"</div>"+
      "<p><b>___________________________________________</b><br>MARCUS VINICIUS FELIPE DA FONSECA SILVA<br>CPF: 01523019689</p></section>"+
      "<section class='contrato-assinatura-parte'><div class='contrato-linhas-em-branco' aria-hidden='true'>"+Array.from({length:6},()=>"<div class='contrato-linha-vazia'></div>").join("")+"</div>"+
      "<p><b>___________________________________________</b><br>MARCUS VINICIUS FELIPE DA FONSECA SILVA<br>CPF: F</p></section>";
    return raiz.innerHTML;
  })();
  const estilos=`<style>
    @page{size:A4 portrait;margin:12mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;width:100%;font-family:Arial,sans-serif;color:#111}
    body{font-size:8.5pt;line-height:1.2}
    .contrato-folha{display:block;width:100%;max-width:100%;min-height:0;margin:0;padding:0;background:#fff;box-shadow:none;box-sizing:border-box}
    .contrato-folha main{display:block;width:100%;margin:0;padding:0}
    .contrato-folha p{font-size:8.5pt;line-height:1.2;text-align:justify;margin:0 0 1.5mm;orphans:2;widows:2}
    .contrato-folha h1{font-size:11pt;line-height:1.15;margin:0 0 2.5mm;text-align:center}
    .contrato-folha h3{font-size:8.8pt;line-height:1.15;margin:2mm 0 1mm;break-after:avoid}
    .contrato-cabecalho{display:flex;width:100%;align-items:center;gap:5mm;margin:0 0 3mm!important;padding:0 0 2mm!important;border-bottom:1px solid #333}
    .contrato-cabecalho .identificacao-relatorio{flex:1;min-width:0}
    .contrato-logo{display:block;width:auto!important;max-width:25mm!important;max-height:18mm!important;object-fit:contain}
    .contrato-parceiro{break-inside:auto}
    .contrato-aluno{break-inside:auto}
    .contrato-aluno p,.contrato-aluno h3{break-inside:auto}
    .contrato-assinaturas-aluno{display:block;margin-top:2mm;break-inside:avoid;page-break-inside:avoid}
    .contrato-data-assinatura{margin:0 0 1mm!important;text-align:left!important}
    .contrato-assinatura-parte{min-width:0;margin:0;break-inside:avoid;page-break-inside:avoid}
    .contrato-linhas-em-branco{display:flex!important;flex-direction:column!important;width:100%!important;height:48mm!important;min-height:48mm!important;max-height:48mm!important;margin:0!important;padding:0!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important}.contrato-linha-vazia{display:block!important;flex:0 0 8mm!important;width:100%!important;height:8mm!important;min-height:8mm!important;max-height:8mm!important;margin:0!important;padding:0!important;border:0!important;line-height:8mm!important}
    .contrato-assinatura-parte p{text-align:center!important;font-size:8pt!important;line-height:1.25!important;margin:0 0 1mm!important}
    .contrato-parceiro p{font-size:7.5pt;line-height:1.08;margin:0 0 .8mm}
    .contrato-parceiro h1{font-size:10pt;line-height:1.08;margin:0 0 1.5mm}
    .contrato-parceiro h3{font-size:7.8pt;line-height:1.08;margin:1.2mm 0 .6mm}
    .contrato-parceiro .contrato-cabecalho{margin-bottom:1.5mm!important;padding-bottom:1mm!important}
    .contrato-parceiro .contrato-espaco-assinatura{margin:0;padding:0}
    @media screen{
      @page{margin:12mm}
      body{width:auto;padding:12px;background:#f2f4f7}
      .contrato-folha{width:min(100%,850px);margin:16px auto;padding:18px;background:#fff;box-shadow:0 2px 12px #0002}
    }
  </style>`;
  const iframe=document.createElement("iframe");
  iframe.setAttribute("title","Área de impressão do contrato");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument;
  if(!doc){iframe.remove();mostrarAviso("Não foi possível preparar a impressão do contrato.");return;}
  let finalizado=false;
  const limpar=()=>{if(finalizado)return;finalizado=true;setTimeout(()=>iframe.remove(),1000);};
  iframe.contentWindow.addEventListener("afterprint",limpar,{once:true});
  doc.open();
  doc.write("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+titulo+"</title>"+estilos+"</head><body>"+htmlPreparado+"</body></html>");
  doc.close();
  const imprimir=()=>{
    try{
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(limpar,60000);
    }catch(error){
      console.error("Falha ao imprimir contrato:",error);
      limpar();
      mostrarAviso("Não foi possível abrir a impressão do contrato neste navegador.");
    }
  };
  iframe.contentWindow.addEventListener("load",()=>setTimeout(imprimir,250),{once:true});
  setTimeout(()=>{if(!finalizado)imprimir();},1000);
}
async function registrarContratoGerado(tipo,nome,documento,studentId,partnerId){
  const cliente=window.getMarcusSupabase?.();
  if(!cliente){mostrarAviso("Contrato gerado, mas não foi possível salvar o histórico: conexão indisponível.");return;}
  try{
    const {data:auth,error:authError}=await cliente.auth.getUser();
    if(authError||!auth?.user?.id)throw new Error("Sessão administrativa não encontrada.");
    const html=document.getElementById("contratoPreview")?.innerHTML||"";
    const {error}=await cliente.from("generated_contracts").insert({
      owner_id:auth.user.id,contract_type:tipo,party_name:String(nome||"").trim(),
      party_document:String(documento||"").trim()||null,student_id:studentId||null,
      partner_id:partnerId||null,document_html:html
    });
    if(error)throw error;
    mostrarAviso("Contrato gerado e salvo no histórico.");
  }catch(error){console.error("Não foi possível salvar o contrato gerado:",error);mostrarAviso("Contrato gerado, mas não foi salvo no histórico: "+(error.message||"erro desconhecido"));}
}
async function carregarListaContratosGerados(tipo){
  const modal=document.getElementById("modalListaContratos");
  const host=document.getElementById("listaContratosGerados");
  const titulo=document.getElementById("tituloListaContratos");
  const cliente=window.getMarcusSupabase?.();
  if(!modal||!host||!cliente)return;
  titulo.textContent=tipo==="aluno"?"Contratos de alunos gerados":"Contratos de parceiros gerados";
  host.replaceChildren(Object.assign(document.createElement("p"),{className:"empty-state",textContent:"Carregando contratos…"}));
  if(!modal.open)modal.showModal();
  try{
    const {data:auth,error:authError}=await cliente.auth.getUser();if(authError||!auth?.user?.id)throw new Error("Sessão administrativa não encontrada.");
    const {data,error}=await cliente.from("generated_contracts").select("id,contract_type,party_name,party_document,created_at,document_html")
      .eq("owner_id",auth.user.id).eq("contract_type",tipo).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    host.replaceChildren();
    if(!data?.length){host.append(Object.assign(document.createElement("p"),{className:"empty-state",textContent:"Nenhum contrato gerado ainda."}));return;}
    data.forEach(item=>{
      const card=document.createElement("article");card.className="record";
      const name=document.createElement("strong");name.textContent=item.party_name||"Sem nome";
      const date=document.createElement("p");date.textContent=new Date(item.created_at).toLocaleString("pt-BR");
      const actions=document.createElement("div");actions.className="contract-record-actions";
      const open=document.createElement("button");open.type="button";open.className="secondary-button";open.textContent="Abrir / Imprimir";
      open.addEventListener("click",()=>imprimirDocumentoContrato(item.document_html,item.party_name));
      const del=document.createElement("button");del.type="button";del.className="secondary-button";del.textContent="Excluir";
      del.addEventListener("click",async()=>{
        if(!window.confirm("Excluir este contrato do histórico?"))return;
        del.disabled=true;
        try{const {error}=await cliente.from("generated_contracts").delete().eq("id",item.id).eq("owner_id",auth.user.id);if(error)throw error;await carregarListaContratosGerados(tipo);}
        catch(error){mostrarAviso(error.message||"Não foi possível excluir o contrato.");del.disabled=false;}
      });
      actions.append(open,del);card.append(name,date,actions);host.append(card);
    });
  }catch(error){host.replaceChildren(Object.assign(document.createElement("p"),{className:"empty-state",textContent:error.message||"Não foi possível carregar os contratos."}));}
}
async function iniciarPerfilContratanteAdmin(){const perfil=window.MarcusContractorProfile;if(!perfil)return;const obterCliente=()=>window.getMarcusSupabase?.();const obterUsuario=()=>window.sessionStorage.getItem("marcus_admin_user_id");try{await perfil.carregar(obterCliente(),obterUsuario());}catch(erro){console.error("Não foi possível carregar os dados do contratante:",erro);const status=document.getElementById("statusDadosContratante");if(status)status.textContent="Não foi possível carregar seus dados salvos. Você ainda pode preencher e salvar novamente.";}perfil.vincular(obterCliente,obterUsuario);}
function iniciarContratos(){
  carregarAlunosContrato();carregarParceirosContrato();iniciarPerfilContratanteAdmin();
  const modal=document.getElementById("modalGeradorContrato");
  document.getElementById("btnAbrirContratoAluno")?.addEventListener("click",()=>{tipoC("cliente");carregarAlunosContrato();if(modal&&!modal.open)modal.showModal();});
  document.getElementById("btnAbrirContratoParceiro")?.addEventListener("click",()=>{tipoC("parceiro");carregarParceirosContrato();if(modal&&!modal.open)modal.showModal();});
  document.getElementById("btnFecharGeradorContrato")?.addEventListener("click",()=>modal?.close());
  document.getElementById("btnFecharListaContratos")?.addEventListener("click",()=>document.getElementById("modalListaContratos")?.close());
  document.getElementById("btnListaContratosAluno")?.addEventListener("click",()=>carregarListaContratosGerados("aluno"));
  document.getElementById("btnListaContratosParceiro")?.addEventListener("click",()=>carregarListaContratosGerados("parceiro"));
  document.getElementById("contratoAluno")?.addEventListener("change",selecionarAlunoContrato);
  document.getElementById("contratoParceiroSelecionar")?.addEventListener("change",selecionarParceiroContrato);
  document.getElementById("btnGerarContrato")?.addEventListener("click",gerarC);
  document.getElementById("btnImprimirContrato")?.addEventListener("click",()=>{
    const folha=document.querySelector("#contratoPreview .contrato-folha");
    if(!folha){mostrarAviso("Gere a pré-visualização antes de imprimir.");return;}
    imprimirDocumentoContrato(folha.outerHTML,tipoContratoAtual==="cliente"?"Contrato de aluno":"Contrato de parceiro");
  });
}
window.addEventListener("afterprint",()=>document.body.classList.remove("contrato-impressao"));
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",iniciarContratos,{once:true});}else{iniciarContratos();}