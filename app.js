'use strict';
// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const aCentavos = (v) => {
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(s) * 100) || 0;
};
const deCentavos = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
const api = (nome, args) => window.lojaApi.chamar(nome, args);
const PAG = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito' };
const STATUS = { pedido: 'Pedido feito', pago: 'Pago', entregue: 'Entregue', cancelado: 'Cancelado' };
const ORIGENS = ['Instagram direto', 'Anúncio (tráfego pago)', 'WhatsApp', 'Presencial', 'Outro'];
const corStatus = { pedido: 'alerta', pago: 'azul', entregue: 'ok', cancelado: 'perigo' };

function dataBR(iso) {
  if (!iso) return '';
  const [d, h] = iso.split('T');
  const [a, m, di] = d.split('-');
  return `${di}/${m}/${a}${h ? ' ' + h : ''}`;
}
function agoraLocal() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

let infoApp = null;
const fotoUrl = (arq) => (!arq ? '' : infoApp.web ? (window.lojaFotos[arq] || '') : `${infoApp.fotosBase}${encodeURIComponent(arq)}`);
const imgTag = (arq, cls = 'miniatura') => (arq ? `<img class="${cls}" src="${fotoUrl(arq)}" alt="">` : `<div class="${cls}"></div>`);

function aviso(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg;
  el.className = 'aviso' + (erro ? ' erro' : '');
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.hidden = true), erro ? 6000 : 2500);
}
async function tentar(fn) {
  try { return await fn(); } catch (e) { aviso(e.message || String(e), true); return undefined; }
}
function abrirModal(html, estreita = false) {
  const m = $('#modal');
  m.innerHTML = `<div class="caixa${estreita ? ' estreita' : ''}">${html}</div>`;
  m.hidden = false;
  return m;
}
function fecharModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });

// ---------- rotas ----------
const rotas = {
  painel: telaPainel, sugestoes: telaSugestoes, 'nova-venda': telaNovaVenda, vendas: telaVendas,
  produtos: telaProdutos, estoque: telaEstoque, config: telaConfig,
};
let filaNavegacao = Promise.resolve();
function navegar() {
  // Uma tela por vez, na ordem dos cliques (evita uma tela lenta aparecer por cima de outra)
  filaNavegacao = filaNavegacao.then(async () => {
    const rota = (location.hash || '#painel').slice(1);
    $$('.menu nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota));
    fecharModal();
    await tentar(() => (rotas[rota] || telaPainel)());
    atualizaSelo();
  });
  return filaNavegacao;
}
async function atualizaSelo() {
  const lista = await tentar(() => api('sugestoes'));
  const n = (lista || []).filter((s) => s.nivel === 'alerta').length;
  const el = $('#selo-sug');
  el.textContent = n;
  el.hidden = n === 0;
}

// ---------- SUGESTÕES ----------
const ROTULO_ROTA = { painel: 'Ver painel', estoque: 'Ir para Estoque', produtos: 'Ir para Produtos', config: 'Ir para Configurações', 'nova-venda': 'Nova venda' };
const ICONE = { alerta: '⚠️', dica: '💡', info: 'ℹ️', ok: '⭐' };
async function telaSugestoes() {
  const lista = await api('sugestoes');
  const grupos = [['alerta', 'Precisa de atenção'], ['dica', 'Dicas para vender mais'], ['info', 'Para começar'], ['ok', 'Está indo bem']];
  $('#view').innerHTML = `
    <h1>Sugestões</h1>
    <p class="dica" style="margin:-8px 0 16px">Avisos calculados com as suas vendas e o seu estoque. Atualizam sozinhos.</p>
    ${lista.length ? grupos.map(([nivel, titulo]) => {
      const itens = lista.filter((s) => s.nivel === nivel);
      return itens.length ? `<h2 style="margin-top:18px">${titulo}</h2>${itens.map((s) => `<div class="sug ${nivel}"><div class="ic">${ICONE[nivel]}</div>
        <div class="corpo"><b>${esc(s.titulo)}</b><div>${esc(s.texto)}</div></div><button class="pequeno" data-ir="${s.rota}">${ROTULO_ROTA[s.rota] || 'Abrir'}</button></div>`).join('')}` : '';
    }).join('') : '<div class="cartao vazio">Tudo em ordem por aqui. 🎉</div>'}`;
  $$('[data-ir]').forEach((b) => (b.onclick = () => (location.hash = '#' + b.dataset.ir)));
}
window.addEventListener('hashchange', navegar);

// ---------- PAINEL ----------
async function telaPainel() {
  const p = await api('painel');
  const alertas = (await api('sugestoes')).filter((s) => s.nivel === 'alerta');
  const diasSemBackup = p.ultimoBackup ? Math.floor((Date.now() - new Date(p.ultimoBackup).getTime()) / 86400000) : null;
  const precisaBackup = diasSemBackup === null || diasSemBackup >= 7;
  const card = (rot, per) => `<div class="cartao"><div class="rotulo">${rot}</div><div class="num">${brl(per.faturamento)}</div>
    <div class="rotulo">${per.vendas} venda(s) · líquido ${brl(per.liquido)} · lucro ${brl(per.lucro)}</div></div>`;
  $('#view').innerHTML = `
    <h1>Painel</h1>
    ${alertas.length ? `<div class="banner"><span>⚠️ <b>${alertas.length} ${alertas.length === 1 ? 'coisa precisa' : 'coisas precisam'} da sua atenção:</b> ${esc(alertas[0].titulo)}${alertas.length > 1 ? ' e mais ' + (alertas.length - 1) : ''}.</span><span class="espaco"></span><button id="ver-sug" class="principal">Ver sugestões</button></div>` : ''}
    ${precisaBackup ? `<div class="banner"><span>${diasSemBackup === null ? 'Você ainda não fez nenhum backup.' : `Último backup há ${diasSemBackup} dias.`} Salve uma cópia dos seus dados.</span><span class="espaco"></span><button id="bk" class="principal">Fazer backup agora</button></div>` : ''}
    <div class="cards">${card('Hoje', p.hoje)}${card('Esta semana', p.semana)}${card('Este mês', p.mes)}
      <div class="cartao"><div class="rotulo">Ticket médio (mês)</div><div class="num">${brl(p.mes.ticket)}</div></div>
      <div class="cartao"><div class="rotulo">Estoque (${p.estoque.unidades} un.)</div><div class="num">${brl(p.estoque.investido)}</div><div class="rotulo">a custo · vale ${brl(p.estoque.potencial)} vendendo</div></div></div>
    <div class="duas">
      <div class="cartao"><h2>Por forma de pagamento (mês)</h2>${tabelaSimples(p.porPagamento, ['Pagamento', 'Vendas', 'Total', 'Líquido'], (r) => [PAG[r.pagamento], r.vendas, brl(r.total), brl(r.liquido)])}</div>
      <div class="cartao"><h2>Origem das vendas (mês)</h2>${tabelaSimples(p.porOrigem, ['Origem', 'Vendas', 'Total'], (r) => [esc(r.origem), r.vendas, brl(r.total)])}</div>
      <div class="cartao"><h2>Mais vendidos (mês)</h2>${tabelaSimples(p.maisVendidos, ['Produto', 'Qtd', 'Total'], (r) => [esc(r.nome), r.qtd, brl(r.total)])}</div>
      <div class="cartao"><h2>Estoque baixo ou esgotado</h2>${tabelaSimples(p.estoqueBaixo, ['Produto', 'Estoque', 'Mínimo'], (r) => [esc(r.nome), r.estoque === 0 ? '<span class="selo perigo">Esgotado</span>' : `<span class="selo alerta">${r.estoque}</span>`, r.estoque_min])}</div>
    </div>
    <div class="cartao" style="margin-top:16px"><h2>Últimas vendas</h2>${tabelaSimples(p.ultimasVendas, ['#', 'Data', 'Itens', 'Pagamento', 'Total', 'Status'],
      (r) => [r.id, dataBR(r.data), esc(r.resumo), PAG[r.pagamento], brl(r.total), `<span class="selo ${corStatus[r.status]}">${STATUS[r.status]}</span>`])}</div>`;
  const bk = $('#bk');
  if (bk) bk.onclick = fazerBackup;
  const vs = $('#ver-sug');
  if (vs) vs.onclick = () => (location.hash = '#sugestoes');
}
function tabelaSimples(linhas, cab, fn) {
  if (!linhas.length) return '<div class="vazio">Nada por aqui ainda.</div>';
  return `<table style="border:0"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${fn(l).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function fazerBackup() {
  const destino = await tentar(() => api('backup.escolherEFazer'));
  if (destino) { aviso('Backup salvo em: ' + destino); navegar(); }
}

// ---------- PRODUTOS ----------
let filtroProdutos = { busca: '', inativos: false, categoria: '' };
async function telaProdutos() {
  const [lista, cats] = await Promise.all([api('produtos.listar', filtroProdutos), api('produtos.categorias')]);
  $('#view').innerHTML = `
    <h1>Produtos</h1>
    <div class="barra">
      <input id="busca" placeholder="Buscar por nome ou código" value="${esc(filtroProdutos.busca)}" style="width:260px">
      <select id="cat"><option value="">Todas as categorias</option>${cats.map((c) => `<option ${c === filtroProdutos.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label><input type="checkbox" id="inat" ${filtroProdutos.inativos ? 'checked' : ''}> mostrar inativos</label>
      <span class="espaco"></span>
      <button class="principal" id="novo">+ Novo produto</button>
    </div>
    ${lista.length ? `<div class="grade">${lista.map(cardProduto).join('')}</div>` : '<div class="cartao vazio">Nenhum produto cadastrado. Clique em "Novo produto".</div>'}`;
  let t;
  $('#busca').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { filtroProdutos.busca = e.target.value; telaProdutos().then(() => { const b = $('#busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }); }, 250); };
  $('#cat').onchange = (e) => { filtroProdutos.categoria = e.target.value; telaProdutos(); };
  $('#inat').onchange = (e) => { filtroProdutos.inativos = e.target.checked; telaProdutos(); };
  $('#novo').onclick = () => formProduto();
  $$('.produto').forEach((el) => (el.onclick = () => formProduto(Number(el.dataset.id))));
}
function seloEstoque(p) {
  if (p.estoque <= 0) return '<span class="selo perigo">Esgotado</span>';
  if (p.estoque <= p.estoque_min) return `<span class="selo alerta">${p.estoque} un. (baixo)</span>`;
  return `<span class="selo ok">${p.estoque} un.</span>`;
}
function cardProduto(p) {
  return `<div class="produto ${p.ativo ? '' : 'inativo'}" data-id="${p.id}">
    <div class="foto" style="${p.foto ? `background-image:url('${fotoUrl(p.foto)}')` : ''}">${p.foto ? '' : 'sem foto'}</div>
    <div class="info"><div class="nome">${esc(p.nome)}</div><div class="rotulo">${esc(p.codigo)}${p.categoria ? ' · ' + esc(p.categoria) : ''}</div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;align-items:center"><b>${brl(p.preco)}</b>${p.ativo ? seloEstoque(p) : '<span class="selo">Inativo</span>'}</div></div></div>`;
}

async function formProduto(id) {
  const cats = await api('produtos.categorias');
  const cfg = await api('config.obter');
  const p = id ? await api('produtos.obter', id) : { codigo: '', nome: '', descricao: '', categoria: '', custo: 0, preco: 0, estoque: 0, estoque_min: Number(cfg.estoque_min_padrao) || 2, ativo: 1, fotos: [] };
  let fotos = (p.fotos || []).map((f) => ({ arquivo: f.arquivo, principal: !!f.principal }));
  if (fotos.length && !fotos.some((f) => f.principal)) fotos[0].principal = true;

  abrirModal(`
    <h2>${id ? 'Editar produto' : 'Novo produto'}</h2>
    <div class="campo"><label>Fotos</label><div class="fotos" id="fotos"></div><button id="addfoto" class="pequeno">+ Adicionar fotos</button></div>
    <div class="form2">
      <div class="campo cheio"><label>Nome do produto *</label><input id="f-nome" value="${esc(p.nome)}" placeholder="Ex.: Copo Térmico Stanley 800ml"></div>
      <div class="campo"><label>Preço de venda (R$) *</label><input id="f-preco" value="${p.preco ? deCentavos(p.preco) : ''}" placeholder="0,00"></div>
      ${id ? `<div class="campo"><label>Estoque atual</label><div><b>${p.estoque}</b> un.<div class="dica">Para mudar, use a tela Estoque.</div></div></div>`
           : '<div class="campo"><label>Quantidade em estoque</label><input id="f-estoque" type="number" min="0" value="1"></div>'}
    </div>
    <details class="mais"><summary>Mais detalhes (opcional)</summary>
      <div class="form2">
        <div class="campo"><label>Código</label><input id="f-codigo" value="${esc(p.codigo)}" placeholder="Deixe vazio: o sistema cria sozinho"></div>
        <div class="campo"><label>Categoria</label><input id="f-cat" list="cats" value="${esc(p.categoria)}"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="campo"><label>Quanto você pagou (custo, R$)</label><input id="f-custo" value="${p.custo ? deCentavos(p.custo) : ''}" placeholder="0,00"></div>
        <div class="campo"><label>Avisar quando restar até</label><input id="f-min" type="number" min="0" value="${p.estoque_min}"></div>
        <div class="campo cheio"><div class="rotulo" id="margem"></div></div>
        <div class="campo cheio"><label>Descrição</label><textarea id="f-desc" rows="2">${esc(p.descricao)}</textarea></div>
      </div>
    </details>
    <div class="acoes">
      ${id ? `<button class="${p.ativo ? 'perigo' : ''}" id="toggle">${p.ativo ? 'Inativar' : 'Reativar'}</button>` : ''}
      <span class="espaco"></span><button id="cancelar">Cancelar</button><button id="salvar" class="principal">Salvar</button>
    </div>`);

  const atualizaMargem = () => {
    const c = aCentavos($('#f-custo').value), v = aCentavos($('#f-preco').value);
    $('#margem').textContent = v > 0 ? `Lucro por unidade: ${brl(v - c)} (margem de ${(((v - c) / v) * 100).toFixed(0)}%)` : '';
  };
  const desenhaFotos = () => {
    $('#fotos').innerHTML = fotos.map((f, i) => `<div class="f ${f.principal ? 'princ' : ''}"><img src="${fotoUrl(f.arquivo)}" alt="">
      <button data-rm="${i}" title="Remover">×</button><button class="estrela" data-pr="${i}">${f.principal ? '★ principal' : 'tornar principal'}</button></div>`).join('');
    $$('[data-rm]').forEach((b) => (b.onclick = () => { const eraP = fotos[b.dataset.rm].principal; fotos.splice(b.dataset.rm, 1); if (eraP && fotos[0]) fotos[0].principal = true; desenhaFotos(); }));
    $$('[data-pr]').forEach((b) => (b.onclick = () => { fotos.forEach((f, i) => (f.principal = i == b.dataset.pr)); desenhaFotos(); }));
  };
  desenhaFotos(); atualizaMargem();
  $('#f-custo').oninput = atualizaMargem; $('#f-preco').oninput = atualizaMargem;
  $('#addfoto').onclick = async () => {
    const novas = await tentar(() => api('fotos.escolher'));
    (novas || []).forEach((arquivo) => fotos.push({ arquivo, principal: fotos.length === 0 }));
    desenhaFotos();
  };
  $('#cancelar').onclick = fecharModal;
  if (id) $('#toggle').onclick = async () => {
    if (p.ativo && !confirm('Inativar este produto? Ele some da lista de venda, mas o histórico fica.')) return;
    await tentar(() => api('produtos.ativo', { id, ativo: !p.ativo }));
    fecharModal(); navegar();
  };
  $('#salvar').onclick = async () => {
    if (!aCentavos($('#f-preco').value)) return aviso('Informe o preço de venda.', true);
    const dados = {
      id, codigo: $('#f-codigo').value, nome: $('#f-nome').value, categoria: $('#f-cat').value, descricao: $('#f-desc').value,
      custo: aCentavos($('#f-custo').value), preco: aCentavos($('#f-preco').value), estoque_min: $('#f-min').value, fotos,
    };
    if (!id) dados.estoque = $('#f-estoque').value;
    const ok = await tentar(() => api('produtos.salvar', dados));
    if (ok) { aviso('Produto salvo.'); fecharModal(); navegar(); }
  };
}

// ---------- ESTOQUE ----------
async function telaEstoque() {
  const [lista, movs, res] = await Promise.all([api('produtos.listar', {}), api('estoque.movimentos', { limite: 60 }), api('estoque.resumo')]);
  const nomesTipo = { entrada: 'Entrada', venda: 'Venda', ajuste: 'Ajuste', cancelamento: 'Cancelamento' };
  $('#view').innerHTML = `
    <h1>Estoque</h1>
    <div class="cards">
      <div class="cartao"><div class="rotulo">Unidades em estoque</div><div class="num">${res.unidades}</div></div>
      <div class="cartao"><div class="rotulo">Investido (a custo)</div><div class="num">${brl(res.investido)}</div></div>
      <div class="cartao"><div class="rotulo">Valor de venda</div><div class="num">${brl(res.potencial)}</div></div>
    </div>
    ${lista.length ? `<table><thead><tr><th></th><th>Produto</th><th>Código</th><th class="dir">Estoque</th><th class="dir">Mínimo</th><th class="dir">Valor (custo)</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td>${imgTag(p.foto)}</td><td>${esc(p.nome)}</td><td>${esc(p.codigo)}</td><td class="dir">${seloEstoque(p)}</td><td class="dir">${p.estoque_min}</td><td class="dir">${brl(p.estoque * p.custo)}</td>
      <td class="dir"><button class="pequeno" data-ent="${p.id}">+ Entrada</button> <button class="pequeno" data-aj="${p.id}">Ajustar</button></td></tr>`).join('')}</tbody></table>` : '<div class="cartao vazio">Cadastre produtos para controlar o estoque.</div>'}
    <h2 style="margin-top:22px">Últimas movimentações</h2>
    ${movs.length ? `<table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th class="dir">Qtd</th><th>Motivo</th></tr></thead><tbody>
      ${movs.map((m) => `<tr><td>${dataBR(m.data)}</td><td>${esc(m.nome)}</td><td>${nomesTipo[m.tipo] || m.tipo}</td><td class="dir"><b style="color:${m.qtd < 0 ? 'var(--perigo)' : 'var(--ok)'}">${m.qtd > 0 ? '+' : ''}${m.qtd}</b></td><td>${esc(m.motivo)}</td></tr>`).join('')}</tbody></table>` : '<div class="cartao vazio">Nenhuma movimentação ainda.</div>'}`;
  const porId = Object.fromEntries(lista.map((p) => [p.id, p]));
  $$('[data-ent]').forEach((b) => (b.onclick = () => modalMov(porId[b.dataset.ent], 'entrada')));
  $$('[data-aj]').forEach((b) => (b.onclick = () => modalMov(porId[b.dataset.aj], 'ajuste')));
}
function modalMov(p, tipo) {
  abrirModal(`<h2>${tipo === 'entrada' ? 'Entrada de estoque' : 'Ajustar estoque'}</h2>
    <p><b>${esc(p.nome)}</b><br><span class="rotulo">Estoque atual: ${p.estoque} un.</span></p>
    <div class="campo"><label>${tipo === 'entrada' ? 'Quantidade que chegou' : 'Nova quantidade total (contagem real)'}</label><input id="m-qtd" type="number" min="0" ${tipo === 'entrada' ? 'value="1"' : `value="${p.estoque}"`}></div>
    <div class="campo"><label>Motivo ${tipo === 'ajuste' ? '*' : '(opcional)'}</label><input id="m-motivo" placeholder="${tipo === 'entrada' ? 'Ex.: reposição do fornecedor' : 'Ex.: contagem, quebra, perda'}"></div>
    <div class="acoes"><span class="espaco"></span><button id="x">Cancelar</button><button id="ok" class="principal">Confirmar</button></div>`, true);
  $('#m-qtd').focus();
  $('#x').onclick = fecharModal;
  $('#ok').onclick = async () => {
    const r = await tentar(() => api('estoque.movimentar', { produto_id: p.id, tipo, qtd: $('#m-qtd').value, motivo: $('#m-motivo').value }));
    if (r !== undefined) { aviso('Estoque atualizado.'); fecharModal(); navegar(); }
  };
}

// ---------- NOVA VENDA ----------
async function telaNovaVenda() {
  const [produtos, cfg] = await Promise.all([api('produtos.listar', {}), api('config.obter')]);
  const porId = Object.fromEntries(produtos.map((p) => [p.id, p]));
  const carrinho = []; // {produto_id, qtd, preco}
  $('#view').innerHTML = `
    <h1>Nova venda</h1>
    <div class="venda">
      <div class="cartao"><input id="busca" placeholder="Buscar produto por nome ou código" style="width:100%"><div class="lista-prod" id="lista"></div></div>
      <div class="cartao">
        <h2>Itens da venda</h2><div id="itens"></div>
        <div class="campo"><label>Forma de pagamento</label><div class="pag">${Object.entries(PAG).map(([k, v], i) => `<label><input type="radio" name="pag" value="${k}" ${i === 0 ? 'checked' : ''}>${v}</label>`).join('')}</div></div>
        <div class="campo" id="box-parc" hidden><label>Parcelas</label><select id="parc">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></div>
        <details class="mais"><summary>Mais opções (cliente, origem, desconto, data)</summary>
          <div class="campo"><label>Cliente</label><input id="cli" placeholder="Nome"></div>
          <div class="campo"><input id="insta" placeholder="@ do Instagram ou telefone"></div>
          <div class="campo"><label>De onde veio a venda?</label><select id="origem"><option value="">Não informada</option>${ORIGENS.map((o) => `<option>${o}</option>`).join('')}</select></div>
          <div class="form2"><div class="campo"><label>Desconto (R$)</label><input id="desc" value="0,00"></div>
          <div class="campo"><label>Situação</label><select id="status"><option value="pago">Pago</option><option value="pedido">Pedido feito</option><option value="entregue">Entregue</option></select></div></div>
          <div class="campo"><label>Data e hora</label><input id="data" type="datetime-local" value="${agoraLocal()}"></div>
        </details>
        <div class="total-box"><div><span>Subtotal</span><span id="t-sub"></span></div><div><span>Desconto</span><span id="t-desc"></span></div>
          <div class="grande"><span>Total</span><span id="t-tot"></span></div><div class="rotulo"><span id="t-taxa"></span><span id="t-liq"></span></div></div>
        <button class="principal" id="registrar" style="width:100%;padding:12px">Registrar venda</button>
      </div>
    </div>`;

  const desenhaLista = () => {
    const q = $('#busca').value.toLowerCase();
    const itens = produtos.filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
    $('#lista').innerHTML = itens.length ? itens.map((p) => `<div class="linha-prod" data-id="${p.id}">${imgTag(p.foto)}
      <div class="t"><div>${esc(p.nome)}</div><div class="rotulo">${esc(p.codigo)} · ${brl(p.preco)}</div></div>${seloEstoque(p)}</div>`).join('') : '<div class="vazio">Nenhum produto encontrado.</div>';
    $$('.linha-prod').forEach((el) => (el.onclick = () => adicionar(Number(el.dataset.id))));
  };
  const adicionar = (id) => {
    const p = porId[id];
    const ex = carrinho.find((c) => c.produto_id === id);
    const qtdAtual = ex ? ex.qtd : 0;
    if (qtdAtual + 1 > p.estoque) return aviso(`Sem estoque suficiente de "${p.nome}" (disponível: ${p.estoque}).`, true);
    if (ex) ex.qtd++; else carrinho.push({ produto_id: id, qtd: 1, preco: p.preco });
    desenhaCarrinho();
  };
  const pagamento = () => $('input[name=pag]:checked').value;
  const parcelas = () => (pagamento() === 'credito' ? Number($('#parc').value) : 1);
  const calcula = () => {
    const sub = carrinho.reduce((s, c) => s + c.preco * c.qtd, 0);
    const desc = Math.min(aCentavos($('#desc').value), sub);
    const total = sub - desc;
    const chave = pagamento() === 'credito' ? 'taxa_credito_' + parcelas() : 'taxa_' + pagamento();
    const taxa = parseFloat(String(cfg[chave]).replace(',', '.')) || 0;
    $('#t-sub').textContent = brl(sub); $('#t-desc').textContent = '− ' + brl(desc); $('#t-tot').textContent = brl(total);
    $('#t-taxa').textContent = `Taxa ${taxa.toString().replace('.', ',')}% · `;
    $('#t-liq').textContent = `você recebe ${brl(Math.round(total * (1 - taxa / 100)))}`;
  };
  const desenhaCarrinho = () => {
    $('#itens').innerHTML = carrinho.length ? carrinho.map((c, i) => `<div class="carrinho-item"><div>${esc(porId[c.produto_id].nome)}</div>
      <input type="number" min="1" max="${porId[c.produto_id].estoque}" value="${c.qtd}" data-q="${i}" title="Quantidade">
      <input value="${deCentavos(c.preco)}" data-p="${i}" title="Preço unitário (R$)"><button class="pequeno" data-r="${i}">×</button></div>`).join('')
      : '<div class="vazio">Clique em um produto para adicionar.</div>';
    $$('[data-q]').forEach((el) => (el.onchange = () => { carrinho[el.dataset.q].qtd = Math.max(1, parseInt(el.value) || 1); calcula(); }));
    $$('[data-p]').forEach((el) => (el.onchange = () => { carrinho[el.dataset.p].preco = aCentavos(el.value); calcula(); }));
    $$('[data-r]').forEach((el) => (el.onclick = () => { carrinho.splice(el.dataset.r, 1); desenhaCarrinho(); }));
    calcula();
  };
  $('#busca').oninput = desenhaLista;
  $('#desc').oninput = calcula;
  $$('input[name=pag]').forEach((r) => (r.onchange = () => { $('#box-parc').hidden = pagamento() !== 'credito'; calcula(); }));
  $('#parc').onchange = calcula;
  $('#registrar').onclick = async () => {
    const id = await tentar(() => api('vendas.criar', {
      itens: carrinho, pagamento: pagamento(), parcelas: parcelas(), desconto: Math.min(aCentavos($('#desc').value), carrinho.reduce((s, c) => s + c.preco * c.qtd, 0)),
      cliente_nome: $('#cli').value, cliente_instagram: $('#insta').value, origem: $('#origem').value,
      status: $('#status').value, data: $('#data').value || agoraLocal(),
    }));
    if (id) { aviso(`Venda #${id} registrada.`); location.hash = '#vendas'; }
  };
  desenhaLista(); desenhaCarrinho();
}

// ---------- VENDAS ----------
let filtroVendas = { de: '', ate: '', pagamento: '', status: '' };
async function telaVendas() {
  const lista = await api('vendas.listar', filtroVendas);
  const validas = lista.filter((v) => v.status !== 'cancelado');
  const tot = validas.reduce((s, v) => s + v.total, 0), liq = validas.reduce((s, v) => s + v.liquido, 0);
  const opts = (obj, atual, vazio) => `<option value="">${vazio}</option>` + Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${v}</option>`).join('');
  $('#view').innerHTML = `
    <h1>Vendas</h1>
    <div class="barra">
      <label class="rotulo">De <input type="date" id="de" value="${filtroVendas.de}"></label>
      <label class="rotulo">Até <input type="date" id="ate" value="${filtroVendas.ate}"></label>
      <select id="fp">${opts(PAG, filtroVendas.pagamento, 'Todos os pagamentos')}</select>
      <select id="fs">${opts(STATUS, filtroVendas.status, 'Todos os status')}</select>
      <button id="limpar" class="pequeno">Limpar</button><span class="espaco"></span>
      <span class="rotulo">${validas.length} venda(s) · <b>${brl(tot)}</b> · líquido <b>${brl(liq)}</b></span>
      <button class="principal" id="nv">+ Nova venda</button>
    </div>
    ${lista.length ? `<table><thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th class="dir">Total</th><th class="dir">Líquido</th><th>Status</th></tr></thead><tbody>
    ${lista.map((v) => `<tr class="clicavel" data-id="${v.id}"><td>${v.id}</td><td>${dataBR(v.data)}</td><td>${esc(v.cliente_nome || '—')}</td><td>${esc(v.resumo)}</td>
      <td>${PAG[v.pagamento]}${v.pagamento === 'credito' ? ` ${v.parcelas}x` : ''}</td><td class="dir">${brl(v.total)}</td><td class="dir">${brl(v.liquido)}</td>
      <td><span class="selo ${corStatus[v.status]}">${STATUS[v.status]}</span></td></tr>`).join('')}</tbody></table>` : '<div class="cartao vazio">Nenhuma venda encontrada.</div>'}`;
  const f = () => { filtroVendas = { de: $('#de').value, ate: $('#ate').value, pagamento: $('#fp').value, status: $('#fs').value }; telaVendas(); };
  ['#de', '#ate', '#fp', '#fs'].forEach((s) => ($(s).onchange = f));
  $('#nv').onclick = () => (location.hash = '#nova-venda');
  $('#limpar').onclick = () => { filtroVendas = { de: '', ate: '', pagamento: '', status: '' }; telaVendas(); };
  $$('tr.clicavel').forEach((tr) => (tr.onclick = () => detalheVenda(Number(tr.dataset.id))));
}
async function detalheVenda(id) {
  const v = await api('vendas.obter', id);
  const cancelada = v.status === 'cancelado';
  abrirModal(`<h2>Venda #${v.id} <span class="selo ${corStatus[v.status]}">${STATUS[v.status]}</span></h2>
    <p class="rotulo">${dataBR(v.data)}${v.cliente_nome ? ' · ' + esc(v.cliente_nome) : ''}${v.cliente_instagram ? ' · ' + esc(v.cliente_instagram) : ''}${v.origem ? ' · Origem: ' + esc(v.origem) : ''}</p>
    <table><thead><tr><th>Produto</th><th class="dir">Qtd</th><th class="dir">Preço</th><th class="dir">Subtotal</th></tr></thead><tbody>
    ${v.itens.map((i) => `<tr><td>${esc(i.nome)}</td><td class="dir">${i.qtd}</td><td class="dir">${brl(i.preco)}</td><td class="dir">${brl(i.preco * i.qtd)}</td></tr>`).join('')}</tbody></table>
    <div class="total-box"><div><span>Desconto</span><span>${brl(v.desconto)}</span></div><div class="grande"><span>Total</span><span>${brl(v.total)}</span></div>
      <div class="rotulo"><span>${PAG[v.pagamento]}${v.pagamento === 'credito' ? ` ${v.parcelas}x` : ''} · taxa ${String(v.taxa_pct).replace('.', ',')}%</span><span>você recebe ${brl(v.liquido)}</span></div></div>
    ${cancelada ? '<p class="dica">Venda cancelada: os produtos voltaram ao estoque.</p>' : `<div class="campo"><label>Alterar status</label><select id="st">${['pedido', 'pago', 'entregue'].map((s) => `<option value="${s}" ${s === v.status ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></div>`}
    <div class="acoes">${cancelada ? '' : '<button class="perigo" id="canc">Cancelar venda</button>'}<span class="espaco"></span><button id="fechar">Fechar</button></div>`);
  $('#fechar').onclick = fecharModal;
  if (!cancelada) {
    $('#st').onchange = async (e) => { await tentar(() => api('vendas.status', { id, status: e.target.value })); aviso('Status atualizado.'); telaVendas(); };
    $('#canc').onclick = async () => {
      if (!confirm('Cancelar esta venda? Os produtos voltam ao estoque e a venda deixa de contar no faturamento.')) return;
      await tentar(() => api('vendas.status', { id, status: 'cancelado' }));
      fecharModal(); telaVendas();
    };
  }
}

// ---------- CONFIGURAÇÕES ----------
async function telaConfig() {
  const cfg = await api('config.obter');
  const campo = (chave, rot) => `<div class="campo"><label>${rot}</label><input data-cfg="${chave}" value="${esc(String(cfg[chave]).replace('.', ','))}"></div>`;
  $('#view').innerHTML = `
    <h1>Configurações</h1>
    <div class="cartao" style="margin-bottom:16px"><h2>Taxas da maquininha (InfinityPay) — em %</h2>
      <p class="dica" style="margin-bottom:12px">Preencha conforme o seu contrato. Elas são aplicadas em cada nova venda para calcular quanto você realmente recebe. Vendas antigas não mudam.</p>
      <div class="taxas">${campo('taxa_pix', 'Pix')}${campo('taxa_dinheiro', 'Dinheiro')}${campo('taxa_debito', 'Débito')}
      ${Array.from({ length: 12 }, (_, i) => campo('taxa_credito_' + (i + 1), `Crédito ${i + 1}x`)).join('')}</div></div>
    <div class="cartao" style="margin-bottom:16px"><h2>Estoque</h2>${campo('estoque_min_padrao', 'Estoque mínimo padrão para novos produtos')}</div>
    <div class="acoes" style="justify-content:flex-start;margin-bottom:22px"><button class="principal" id="salvar">Salvar configurações</button></div>
    <div class="cartao"><h2>Backup dos dados</h2>
      <p>${cfg.ultimo_backup ? 'Último backup: <b>' + dataBR(cfg.ultimo_backup) + '</b>' : 'Nenhum backup feito ainda.'}</p>
      <p class="dica" style="margin-bottom:12px">Copia o banco de dados e as fotos para uma pasta à sua escolha (OneDrive, pen drive, HD externo). Faça pelo menos uma vez por semana.</p>
      <button class="principal" id="bk">Fazer backup agora</button>
      ${infoApp.web ? '<button id="restaurar">Restaurar um backup</button>' : '<button id="abrir">Abrir pasta dos dados</button>'}
      <p class="dica" style="margin-top:12px">${infoApp.web ? 'Os dados ficam guardados neste aparelho. Se você limpar os dados do navegador ou apagar o app, eles se perdem: faça backup.' : 'Dados guardados em: ' + esc(infoApp.pastaDados)}</p></div>`;
  $('#salvar').onclick = async () => {
    const novo = {};
    $$('[data-cfg]').forEach((el) => (novo[el.dataset.cfg] = el.value.replace(',', '.').trim() || '0'));
    const ok = await tentar(() => api('config.salvar', novo));
    if (ok) aviso('Configurações salvas.');
  };
  $('#bk').onclick = fazerBackup;
  if ($('#abrir')) $('#abrir').onclick = () => tentar(() => api('pasta.abrir'));
  if ($('#restaurar')) $('#restaurar').onclick = () => {
    if (confirm('Restaurar substitui TODOS os dados deste aparelho pelos do backup. Continuar?')) tentar(() => api('backup.restaurar'));
  };
}

// ---------- início ----------
(async () => {
  infoApp = await tentar(() => api('info'));
  if (!infoApp) return;
  if (!infoApp.web) infoApp.fotosBase = infoApp.fotosBase ||encodeURI('file:///' + infoApp.pastaFotos.replace(/\\/g, '/').replace(/^\/+/, '') + '/');
  navegar();
})();
