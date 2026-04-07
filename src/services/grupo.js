const { TOKENS_ATIVOS } = require('../config/tokens');

function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

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

  // ── Identificar tipos de pagamento ───────────────────────
  const tiposEncontrados = [...new Set(
    session.comprovantes.map(c => (c.dados?.tipo_pagamento || '').toUpperCase())
  )].filter(Boolean);

  let blocoTipoPagamento = '';
  const temTipoSinalizado = tiposEncontrados.some(t => TIPOS_SINALIZADOS.includes(t));

  if (temTipoSinalizado) {
    const avisos = tiposEncontrados
      .filter(t => TIPOS_SINALIZADOS.includes(t))
      .map(t => {
        if (t === 'TED')           return '🔴 *ATENÇÃO: Pagamento via TED*';
        if (t === 'SAQUE INTERNO') return '🟠 *ATENÇÃO: Pagamento via SAQUE INTERNO*';
        return `⚠️ *ATENÇÃO: ${t}*`;
      }).join('\n');
    blocoTipoPagamento = avisos;
  } else {
    const tipos = tiposEncontrados.length > 0 ? tiposEncontrados.join(', ') : 'PIX';
    blocoTipoPagamento = `💳 *Origem do pagamento:* ${tipos}`;
  }

  const nComprovantes = session.comprovantes.length;
  const textoComprovantes = nComprovantes === 1
    ? '1 comprovante anexado'
    : `${nComprovantes} comprovantes anexados`;

  // ── Montar mensagem que vai como LEGENDA do comprovante ──
  const mensagem = [
    `🟠 *NOVA PARTICIPAÇÃO*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `👤 *Nome:* ${session.nome}`,
    `📧 *Conta BDM:* ${session.email_bdm}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💼 *Modalidade(s):*`,
    linhaModalidades,
    ``,
    `💰 *Valor Total:* ${formatarValor(session.valor_total_declarado)}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    blocoTipoPagamento,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📎 ${textoComprovantes}`,
    `🕐 *Recebido em:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ].join('\n');

  // ── Se for apenas 1 comprovante → mensagem como legenda ──
  if (nComprovantes === 1) {
    await bot.telegram.sendPhoto(grupoId, session.comprovantes[0].file_id, {
      caption: mensagem,
      parse_mode: 'Markdown'
    });
    return;
  }

  // ── Se forem múltiplos → envia comprovantes avulsos primeiro, último com a legenda ──
  for (let i = 0; i < nComprovantes; i++) {
    const comp = session.comprovantes[i];
    const isUltimo = i === nComprovantes - 1;

    if (isUltimo) {
      // Último comprovante leva a mensagem completa como legenda
      await bot.telegram.sendPhoto(grupoId, comp.file_id, {
        caption: mensagem,
        parse_mode: 'Markdown'
      });
    } else {
      // Comprovantes anteriores vão com legenda simples
      await bot.telegram.sendPhoto(grupoId, comp.file_id, {
        caption: `📎 Comprovante ${i + 1}/${nComprovantes} — ${session.nome}`
      });
    }
  }
}

module.exports = { enviarRelatorioGrupo };
