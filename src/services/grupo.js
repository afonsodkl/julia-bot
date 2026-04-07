const { TOKENS_ATIVOS } = require('../config/tokens');

function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// Tipos que precisam de sinalização especial no grupo
const TIPOS_SINALIZADOS = ['TED', 'SAQUE INTERNO'];

async function enviarRelatorioGrupo(bot, session) {
  const grupoId = process.env.GRUPO_ID;

  // ── Montar linha de modalidades ──────────────────────────
  let linhaModalidades = '';
  if (session.tokens_selecionados.length === 1) {
    const token = TOKENS_ATIVOS.find(t => t.id === session.tokens_selecionados[0]);
    linhaModalidades = `*${token.nome}* — ${formatarValor(session.valores_tokens[token.id])}`;
  } else {
    linhaModalidades = session.tokens_selecionados.map(id => {
      const token = TOKENS_ATIVOS.find(t => t.id === id);
      return `   • ${token.nome}: ${formatarValor(session.valores_tokens[id])}`;
    }).join('\n');
  }

  // ── Identificar tipos de pagamento dos comprovantes ──────
  const tiposEncontrados = [...new Set(
    session.comprovantes.map(c => (c.dados?.tipo_pagamento || '').toUpperCase())
  )].filter(Boolean);

  // Montar bloco de sinalização de pagamento
  let blocoTipoPagamento = '';
  const temTipoSinalizado = tiposEncontrados.some(t => TIPOS_SINALIZADOS.includes(t));

  if (temTipoSinalizado) {
    const avisos = tiposEncontrados
      .filter(t => TIPOS_SINALIZADOS.includes(t))
      .map(t => {
        if (t === 'TED')            return '🔴 *ATENÇÃO: Pagamento via TED*';
        if (t === 'SAQUE INTERNO')  return '🟠 *ATENÇÃO: Pagamento via SAQUE INTERNO*';
        return `⚠️ *ATENÇÃO: ${t}*`;
      }).join('\n');
    blocoTipoPagamento = `\n${avisos}\n`;
  } else {
    // PIX ou não identificado — apenas informa
    const tipos = tiposEncontrados.length > 0 ? tiposEncontrados.join(', ') : 'PIX';
    blocoTipoPagamento = `\n💳 *Origem do pagamento:* ${tipos}\n`;
  }

  // ── Montar a mensagem final ──────────────────────────────
  const nComprovantes = session.comprovantes.length;
  const textoComprovantes = nComprovantes === 1
    ? '1 comprovante'
    : `${nComprovantes} comprovantes`;

  const mensagem = [
    `🟢 *NOVO APORTE REGISTRADO*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `👤 *Nome:* ${session.nome}`,
    `📧 *E-mail BDM:* ${session.email_bdm}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💼 *Modalidade(s):*`,
    linhaModalidades,
    ``,
    `💰 *Valor Total:* ${formatarValor(session.valor_total_declarado)}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    blocoTipoPagamento.trim(),
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📎 ${textoComprovantes} anexado(s) abaixo`,
    `🕐 *Recebido em:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ].join('\n');

  // Envia a mensagem de texto
  await bot.telegram.sendMessage(grupoId, mensagem, { parse_mode: 'Markdown' });

  // Envia cada comprovante como foto
  for (let i = 0; i < session.comprovantes.length; i++) {
    const comp = session.comprovantes[i];
    const dados = comp.dados || {};
    const legenda = [
      `📎 Comprovante ${i + 1}/${session.comprovantes.length} — ${session.nome}`,
      dados.tipo_pagamento ? `Tipo: ${dados.tipo_pagamento}` : '',
      dados.valor         ? `Valor: ${formatarValor(dados.valor)}` : '',
      dados.data          ? `Data: ${dados.data}` : '',
      dados.codigo_transacao ? `Cód: ${dados.codigo_transacao}` : '',
    ].filter(Boolean).join('\n');

    await bot.telegram.sendPhoto(grupoId, comp.file_id, { caption: legenda });
  }
}

module.exports = { enviarRelatorioGrupo };
