require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { TOKENS_ATIVOS, DADOS_PAGAMENTO } = require('./config/tokens');
const { getSession, saveSession } = require('./services/supabase');
const { lerComprovante } = require('./services/ocr');
const { enviarRelatorioGrupo } = require('./services/grupo');
const { enviarEmailConfirmacao } = require('./services/email');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── UTILITÁRIOS ────────────────────────────────────────────

function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// Simula a Júlia "digitando" antes de responder (humanização)
async function typing(ctx, ms = 1400) {
  await ctx.sendChatAction('typing');
  await new Promise(r => setTimeout(r, ms + Math.random() * 400));
}

// ─── TECLADO DE SELEÇÃO DE TOKENS ───────────────────────────

function buildTokenKeyboard(selecionados = []) {
  const botoes = TOKENS_ATIVOS.map(token => {
    const marcado = selecionados.includes(token.id);
    return [Markup.button.callback(
      `${marcado ? '✅' : '⬜'} ${token.nome}`,
      `toggle_${token.id}`
    )];
  });
  botoes.push([Markup.button.callback('▶️  Confirmar seleção', 'confirmar_tokens')]);
  return Markup.inlineKeyboard(botoes);
}

// ─── BOAS-VINDAS ─────────────────────────────────────────────

async function enviarBoasVindas(ctx, telegramId) {
  await typing(ctx, 1000);

  const listaTokens = TOKENS_ATIVOS.map(t => `   • ${t.nome}`).join('\n');

  await ctx.reply(
    `Olá! Seja muito bem-vindo(a)! 🌟\n\n` +
    `Eu sou a *Júlia*, assistente virtual da *BDM Digital*. ` +
    `Estou aqui para te ajudar a registrar sua participação com toda a segurança e praticidade. 💎\n\n` +
    `⚠️ *Atenção:* Para envios *internacionais*, entre em contato diretamente com @juliadakila.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Modalidades ativas:*\n${listaTokens}\n\n` +
    `💡 As participações são feitas apenas em *múltiplos de R$100,00*, com valor mínimo de *R$100,00*.\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Selecione abaixo em qual(is) modalidade(s) você deseja participar: 👇`,
    { parse_mode: 'Markdown', ...buildTokenKeyboard([]) }
  );

  await saveSession(telegramId, {
    estado: 'selecionando_tokens',
    tokens_selecionados: [],
    token_valor_index: 0,
    valores_tokens: {},
    valor_total_declarado: 0,
    nome: null,
    email_bdm: null,
    comprovantes: [],
  });
}

// ─── PEDIR VALOR DO PRÓXIMO TOKEN ───────────────────────────

async function pedirProximoValor(ctx, selecionados, index) {
  const token = TOKENS_ATIVOS.find(t => t.id === selecionados[index]);
  await typing(ctx, 900);
  await ctx.reply(
    `Qual o valor da sua participação em *${token.nome}*? 💰\n\n` +
    `_Digite somente o número. Ex: 500_\n` +
    `_(Mínimo R$100,00 | Somente múltiplos de R$100,00)_`,
    { parse_mode: 'Markdown' }
  );
}

// ─── CONCLUIR O PROCESSO ─────────────────────────────────────

async function concluirProcesso(ctx, telegramId, session) {
  await saveSession(telegramId, {
    estado: 'finalizado',
    finalizado_em: new Date().toISOString(),
  });

  const primeiroNome = session.nome.split(' ')[0];

  const modalidades = session.tokens_selecionados.map(id => {
    const token = TOKENS_ATIVOS.find(t => t.id === id);
    return `   • *${token.nome}:* ${formatarValor(session.valores_tokens[id])}`;
  }).join('\n');

  await typing(ctx, 2200);
  await ctx.reply(
    `✅ *Participação registrada com sucesso!*\n\n` +
    `${primeiroNome}, que alegria ter você conosco! 🎉\n\n` +
    `Sua participação foi registrada e nossa equipe já foi notificada. ` +
    `Em breve você receberá um e-mail de confirmação em *${session.email_bdm}*. 📩\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Resumo da sua participação:*\n${modalidades}\n\n` +
    `💰 *Total:* ${formatarValor(session.valor_total_declarado)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pode ficar tranquilo(a)! Tudo está em boas mãos. 🙏\n` +
    `Se precisar de qualquer coisa, é só me chamar ou falar com @juliadakila.\n\n` +
    `Um grande abraço da equipe Allyance! 💜`,
    { parse_mode: 'Markdown' }
  );

  // Dispara email para o cliente
  try {
    await enviarEmailConfirmacao(session);
    console.log(`📧 Email enviado para ${session.email_bdm}`);
  } catch (e) {
    console.error('Erro ao enviar email:', e.message);
  }

  // Envia relatório para o grupo
  try {
    await enviarRelatorioGrupo(bot, session);
    console.log(`📤 Relatório enviado ao grupo`);
  } catch (e) {
    console.error('Erro ao enviar pro grupo:', e.message);
  }
}

// ─── CALLBACKS (botões inline) ───────────────────────────────

bot.on('callback_query', async (ctx) => {
  const telegramId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  // Toggle de seleção de token
  if (data.startsWith('toggle_')) {
    const tokenId = data.replace('toggle_', '');
    const session = await getSession(telegramId);
    const selecionados = session?.tokens_selecionados || [];

    const novosSelecionados = selecionados.includes(tokenId)
      ? selecionados.filter(t => t !== tokenId)
      : [...selecionados, tokenId];

    await saveSession(telegramId, { tokens_selecionados: novosSelecionados });

    try {
      await ctx.editMessageReplyMarkup(buildTokenKeyboard(novosSelecionados).reply_markup);
    } catch (_) {}

    await ctx.answerCbQuery();
    return;
  }

  // Confirmar tokens selecionados
  if (data === 'confirmar_tokens') {
    const session = await getSession(telegramId);
    const selecionados = session?.tokens_selecionados || [];

    if (selecionados.length === 0) {
      await ctx.answerCbQuery('⚠️ Selecione pelo menos uma modalidade!', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();
    await saveSession(telegramId, { estado: 'coletando_valores', token_valor_index: 0 });
    await pedirProximoValor(ctx, selecionados, 0);
    return;
  }

  // Finalizar envio de comprovantes
  if (data === 'finalizar_comprovantes') {
    await ctx.answerCbQuery();
    const session = await getSession(telegramId);

    if (!session?.comprovantes?.length) {
      await ctx.reply('⚠️ Por favor, envie ao menos um comprovante antes de finalizar.');
      return;
    }

    await typing(ctx, 2000);
    await ctx.reply('🔍 Verificando os comprovantes, aguarde um instante...');

    // Valida se soma dos comprovantes bate com o valor declarado
    const somaComprovantes = session.comprovantes.reduce(
      (acc, c) => acc + (parseFloat(c.dados?.valor) || 0), 0
    );
    const valorDeclarado = session.valor_total_declarado;
    const diferenca = Math.abs(somaComprovantes - valorDeclarado);
    const tolerancia = 1.00; // R$1 de tolerância

    if (somaComprovantes > 0 && diferenca > tolerancia) {
      await typing(ctx, 1000);
      await ctx.reply(
        `⚠️ Percebi uma diferença nos valores:\n\n` +
        `💬 *Valor declarado:* ${formatarValor(valorDeclarado)}\n` +
        `🧾 *Soma dos comprovantes:* ${formatarValor(somaComprovantes)}\n\n` +
        `Você tem mais algum comprovante para enviar? Se já enviou tudo e o valor estiver certo, ` +
        `digite *confirmar* para prosseguir mesmo assim.`,
        { parse_mode: 'Markdown' }
      );
      await saveSession(telegramId, { estado: 'aguardando_confirmacao_valor' });
      return;
    }

    await concluirProcesso(ctx, telegramId, session);
    return;
  }

  await ctx.answerCbQuery();
});

// ─── HANDLER DE TEXTO ────────────────────────────────────────

bot.on('text', async (ctx) => {
  if (ctx.chat.type !== 'private') return; // ignora mensagens no grupo

  const telegramId = ctx.from.id;
  const texto = ctx.message.text.trim();

  // /start sempre reinicia o fluxo
  if (texto === '/start') {
    await enviarBoasVindas(ctx, telegramId);
    return;
  }

  const session = await getSession(telegramId);

  // Sem sessão ou finalizado → boas vindas
  if (!session || session.estado === 'finalizado' || session.estado === 'inicio') {
    await enviarBoasVindas(ctx, telegramId);
    return;
  }

  // ── Coletando valores dos tokens ──
  if (session.estado === 'coletando_valores') {
    const valor = parseFloat(texto.replace(',', '.').replace(/[^\d.]/g, ''));

    if (isNaN(valor) || valor <= 0) {
      await ctx.reply('⚠️ Valor inválido. Digite apenas o número. Ex: _500_', { parse_mode: 'Markdown' });
      return;
    }
    if (valor < 100) {
      await ctx.reply('⚠️ O valor mínimo de participação é *R$100,00*. Tente novamente:', { parse_mode: 'Markdown' });
      return;
    }
    if (valor % 100 !== 0) {
      await ctx.reply('⚠️ O valor precisa ser *múltiplo de R$100,00*.\nExemplos válidos: 100, 200, 500, 1000...\n\nDigite novamente:', { parse_mode: 'Markdown' });
      return;
    }

    const index = session.token_valor_index;
    const selecionados = session.tokens_selecionados;
    const novosValores = { ...session.valores_tokens, [selecionados[index]]: valor };
    const novoIndex = index + 1;

    await saveSession(telegramId, { valores_tokens: novosValores, token_valor_index: novoIndex });

    if (novoIndex < selecionados.length) {
      // Ainda tem tokens para perguntar
      await pedirProximoValor(ctx, selecionados, novoIndex);
    } else {
      // Todos preenchidos → pedir nome
      const totalDeclarado = Object.values(novosValores).reduce((a, b) => a + b, 0);
      await saveSession(telegramId, { estado: 'coletando_nome', valor_total_declarado: totalDeclarado });

      await typing(ctx, 1200);
      await ctx.reply(
        `Ótimo! 🙌\n\n` +
        `*Valor total da participação: ${formatarValor(totalDeclarado)}*\n\n` +
        `Agora preciso de alguns dados seus para finalizar o registro.\n\n` +
        `📝 Qual é o seu *nome completo*?`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  // ── Coletando nome ──
  if (session.estado === 'coletando_nome') {
    if (texto.split(' ').length < 2 || texto.length < 6) {
      await ctx.reply('Por favor, informe seu *nome completo* (nome e sobrenome):', { parse_mode: 'Markdown' });
      return;
    }
    const nomeFmt = texto.replace(/\b\w/g, c => c.toUpperCase()); // capitaliza
    await saveSession(telegramId, { nome: nomeFmt, estado: 'coletando_email' });
    await typing(ctx, 1000);
    await ctx.reply(
      `Prazer, *${nomeFmt.split(' ')[0]}*! 😊\n\n` +
      `Qual é o *e-mail da sua conta BDM Digital*?`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ── Coletando email ──
  if (session.estado === 'coletando_email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(texto)) {
      await ctx.reply('⚠️ E-mail inválido. Por favor, informe um e-mail válido:');
      return;
    }
    await saveSession(telegramId, { email_bdm: texto.toLowerCase(), estado: 'aguardando_comprovantes' });

    const { empresa, banco, agencia, conta, chave_pix } = DADOS_PAGAMENTO;

    await typing(ctx, 1500);
    await ctx.reply(
      `Perfeito! ✅\n\n` +
      `Agora envie o(s) *comprovante(s) de pagamento*. 📎\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏢 *${empresa}*\n` +
      `🏦 ${banco}\n` +
      `Agência: \`${agencia}\`\n` +
      `Conta Corrente: \`${conta}\`\n` +
      `🔑 *Chave PIX (CNPJ):* \`${chave_pix}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `_Pode enviar mais de um comprovante caso tenha feito transferências em dias diferentes._\n\n` +
      `Quando terminar de enviar todos os comprovantes, clique no botão abaixo 👇`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]])
      }
    );
    return;
  }

  // ── Confirmação manual de valor divergente ──
  if (session.estado === 'aguardando_confirmacao_valor') {
    if (texto.toLowerCase() === 'confirmar') {
      await concluirProcesso(ctx, telegramId, session);
    } else {
      await saveSession(telegramId, { estado: 'aguardando_comprovantes' });
      await ctx.reply(
        'Ok! Pode enviar o(s) comprovante(s) correto(s). Quando terminar, clique no botão ✅.',
        Markup.inlineKeyboard([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]])
      );
    }
    return;
  }

  // Mensagem fora de contexto
  await ctx.reply('Para iniciar ou reiniciar o processo, digite /start 😊');
});

// ─── HANDLER DE FOTOS (COMPROVANTES) ─────────────────────────

bot.on('photo', async (ctx) => {
  if (ctx.chat.type !== 'private') return;

  const telegramId = ctx.from.id;
  const session = await getSession(telegramId);

  const estadosAceitos = ['aguardando_comprovantes', 'aguardando_confirmacao_valor'];
  if (!session || !estadosAceitos.includes(session.estado)) {
    await ctx.reply('Siga o fluxo normalmente. Digite /start para começar. 😊');
    return;
  }

  await typing(ctx, 1800);
  await ctx.reply('🔍 Recebi o comprovante! Deixa eu dar uma olhadinha...');

  try {
    // Pega a foto de maior resolução
    const foto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(foto.file_id);

    const dadosOCR = await lerComprovante(fileLink.href);

    const comprovantes = [
      ...(session.comprovantes || []),
      { file_id: foto.file_id, file_url: fileLink.href, dados: dadosOCR }
    ];

    await saveSession(telegramId, { comprovantes, estado: 'aguardando_comprovantes' });

    const tipo    = dadosOCR.tipo_pagamento  || 'Não identificado';
    const valor   = dadosOCR.valor           ? formatarValor(dadosOCR.valor) : 'Não identificado';
    const data    = dadosOCR.data            || 'Não identificada';
    const nComp   = comprovantes.length;

    await typing(ctx, 800);
    await ctx.reply(
      `✅ *Comprovante ${nComp} recebido!*\n\n` +
      `O que identifiquei:\n` +
      `• Tipo: *${tipo}*\n` +
      `• Valor: *${valor}*\n` +
      `• Data: ${data}\n\n` +
      `Tem mais algum comprovante para enviar?\n` +
      `Se sim, manda aí! Se não, clique no botão abaixo 👇`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]])
      }
    );
  } catch (e) {
    console.error('Erro OCR:', e.message);
    await ctx.reply(
      '⚠️ Tive dificuldade em ler esse comprovante. Pode ser que a imagem esteja escura ou desfocada.\n\n' +
      'Tente enviar uma foto mais nítida, ou tire um *screenshot* diretamente do aplicativo do banco.',
      { parse_mode: 'Markdown' }
    );
  }
});

// ─── INICIAR ─────────────────────────────────────────────────

bot.launch()
  .then(() => console.log('🤖 Júlia Bot está online e pronto para atender!'))
  .catch(err => console.error('Erro ao iniciar o bot:', err));

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
