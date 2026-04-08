require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
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

async function typing(ctx, ms = 1400) {
  await ctx.sendChatAction('typing');
  await new Promise(r => setTimeout(r, ms + Math.random() * 400));
}

function hashBuffer(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// ─── BOTÃO DE CORREÇÃO (aparece em todas as etapas) ─────────

function btnCorrigir() {
  return Markup.inlineKeyboard([[
    Markup.button.callback('✏️ Precisa corrigir algo?', 'menu_corrigir')
  ]]);
}

function btnCorrigirComExtra(botoesExtras = []) {
  return Markup.inlineKeyboard([
    ...botoesExtras,
    [Markup.button.callback('✏️ Precisa corrigir algo?', 'menu_corrigir')]
  ]);
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
    `Olá! Seja muito bem-vindo(a)! 🍀\n\n` +
    `Sou a assistente virtual da *Allyance*. ` +
    `Estou aqui para te ajudar a registrar sua participação com toda a segurança e praticidade.\n\n` +
    `Se você ainda possui dúvidas, entre em contato com a nossa consultora @LucianaMultiplicadora. Para envios *internacionais*, entre em contato diretamente com @juliadakila.\n\n` +
    `As participações são feitas apenas em *múltiplos de 100*, com valor mínimo de *R$100,00*.\n\n` +
    `Selecione abaixo a sua participação (se desejar, poderá selecionar mais de um token para distribuir os valores):`,
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

async function pedirProximoValor(ctx, selecionados, index, session = null) {
  const token = TOKENS_ATIVOS.find(t => t.id === selecionados[index]);
  await typing(ctx, 900);

  // Se já há algum valor preenchido (index > 0), mostra botão contextual completo
  const teclado = index > 0 && session
    ? btnCorrigirComExtra([])
    : btnCorrigir();

  await ctx.reply(
    `Qual o valor da sua participação em *${token.nome}*? 💰\n\n` +
    `_Digite somente o número. Ex: 500_\n` +
    `_(Mínimo R$100,00 | Somente múltiplos de R$100,00)_`,
    { parse_mode: 'Markdown', ...teclado }
  );
}

// ─── MENU DE CORREÇÃO (contextual) ──────────────────────────

async function mostrarMenuCorrigir(ctx, session) {
  const estado = session?.estado || '';
  const nValores = Object.keys(session?.valores_tokens || {}).length;
  const temNome  = !!session?.nome;
  const temEmail = !!session?.email_bdm;
  const botoes   = [];

  // Sempre disponível
  botoes.push([Markup.button.callback('🔄 Recomeçar do início', 'corrigir_inicio')]);

  // Alterar tokens: a partir de coletando_valores
  if (['coletando_valores','coletando_nome','coletando_email','aguardando_comprovantes','aguardando_confirmacao_valor'].includes(estado)) {
    botoes.push([Markup.button.callback('☑️ Alterar tokens selecionados', 'corrigir_tokens')]);
  }

  // Alterar valores: apenas se já foi digitado ao menos 1 valor
  if (nValores > 0 && ['coletando_valores','coletando_nome','coletando_email','aguardando_comprovantes','aguardando_confirmacao_valor'].includes(estado)) {
    botoes.push([Markup.button.callback('💰 Alterar valores', 'corrigir_valores')]);
  }

  // Alterar dados: apenas se nome ou email já foram preenchidos
  if ((temNome || temEmail) && ['coletando_email','aguardando_comprovantes','aguardando_confirmacao_valor'].includes(estado)) {
    botoes.push([Markup.button.callback('👤 Alterar meus dados (nome/e-mail)', 'corrigir_dados')]);
  }

  botoes.push([Markup.button.callback('↩️ Continuar de onde estava', 'corrigir_cancelar')]);

  await ctx.reply('Tudo bem! O que você gostaria de corrigir? 😊', Markup.inlineKeyboard(botoes));
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
    `Pode ficar tranquilo(a)! Agora tudo está sendo encaminhado. O envio dos tokens ocorre em até 3 dias úteis.\n` +
    `Se precisar de qualquer coisa, basta entrar em contato com qualquer um de nossos consultores.\n\n` +
    `Um grande abraço da equipe Allyance! 💜`,
    { parse_mode: 'Markdown' }
  );

  try {
    await enviarEmailConfirmacao(session);
  } catch (e) {
    console.error('Erro ao enviar email:', e.message);
  }

  try {
    await enviarRelatorioGrupo(bot, session);
  } catch (e) {
    console.error('Erro ao enviar pro grupo:', e.message);
  }
}

// ─── CALLBACKS ───────────────────────────────────────────────

bot.on('callback_query', async (ctx) => {
  const telegramId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  // ── Menu de correção ──
  if (data === 'menu_corrigir') {
    await ctx.answerCbQuery();
    const session = await getSession(telegramId);
    await mostrarMenuCorrigir(ctx, session);
    return;
  }

  if (data === 'corrigir_cancelar') {
    await ctx.answerCbQuery();
    await ctx.reply('Ok! Pode continuar de onde estava. 😊');
    return;
  }

  if (data === 'corrigir_inicio') {
    await ctx.answerCbQuery();
    await enviarBoasVindas(ctx, telegramId);
    return;
  }

  if (data === 'corrigir_tokens') {
    await ctx.answerCbQuery();
    const session = await getSession(telegramId);
    await saveSession(telegramId, {
      estado: 'selecionando_tokens',
      tokens_selecionados: [],
      token_valor_index: 0,
      valores_tokens: {},
    });
    await typing(ctx, 600);
    await ctx.reply(
      `Sem problema! Selecione novamente as modalidades desejadas: 👇`,
      { parse_mode: 'Markdown', ...buildTokenKeyboard([]) }
    );
    return;
  }

  if (data === 'corrigir_valores') {
    await ctx.answerCbQuery();
    const session = await getSession(telegramId);
    if (!session?.tokens_selecionados?.length) {
      await ctx.reply('Você ainda não selecionou tokens. Vamos começar pela seleção:', { ...buildTokenKeyboard([]) });
      return;
    }
    await saveSession(telegramId, {
      estado: 'coletando_valores',
      token_valor_index: 0,
      valores_tokens: {},
    });
    await pedirProximoValor(ctx, session.tokens_selecionados, 0, null);
    return;
  }

  if (data === 'corrigir_dados') {
    await ctx.answerCbQuery();
    await saveSession(telegramId, { estado: 'coletando_nome' });
    await typing(ctx, 600);
    await ctx.reply(
      `Claro! Vamos corrigir seus dados.\n\nQual é o seu *nome completo*?`,
      { parse_mode: 'Markdown', ...btnCorrigir() }
    );
    return;
  }

  // ── Toggle de token ──
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

  // ── Confirmar tokens ──
  if (data === 'confirmar_tokens') {
    const session = await getSession(telegramId);
    const selecionados = session?.tokens_selecionados || [];
    if (selecionados.length === 0) {
      await ctx.answerCbQuery('⚠️ Selecione pelo menos uma modalidade!', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery();
    await saveSession(telegramId, { estado: 'coletando_valores', token_valor_index: 0 });
    await pedirProximoValor(ctx, selecionados, 0, null);
    return;
  }

  // ── Finalizar comprovantes ──
  if (data === 'finalizar_comprovantes') {
    await ctx.answerCbQuery();
    const session = await getSession(telegramId);

    if (!session?.comprovantes?.length) {
      await ctx.reply('⚠️ Por favor, envie ao menos um comprovante antes de finalizar.');
      return;
    }

    await typing(ctx, 2000);
    await ctx.reply('🔍 Verificando os comprovantes, aguarde um instante...');

    const somaComprovantes = session.comprovantes.reduce(
      (acc, c) => acc + (parseFloat(c.dados?.valor) || 0), 0
    );
    const valorDeclarado = session.valor_total_declarado;
    const diferenca = somaComprovantes - valorDeclarado;

    // Soma maior que o declarado
    if (somaComprovantes > 0 && diferenca > 0) {
      await typing(ctx, 1000);
      await ctx.reply(
        `⚠️ *A soma dos comprovantes está ACIMA do valor declarado!*\n\n` +
        `💬 *Valor declarado:* ${formatarValor(valorDeclarado)}\n` +
        `📄 *Soma dos comprovantes:* ${formatarValor(somaComprovantes)}\n` +
        `📈 *Diferença:* ${formatarValor(diferenca)} a mais\n\n` +
        `Por favor, verifique os comprovantes enviados ou corrija o valor da participação.`,
        { parse_mode: 'Markdown', ...btnCorrigirComExtra([]) }
      );
      await saveSession(telegramId, { estado: 'aguardando_comprovantes' });
      return;
    }

    // Soma menor que o declarado
    if (somaComprovantes > 0 && diferenca < 0) {
      const faltando = Math.abs(diferenca);
      await typing(ctx, 1000);
      await ctx.reply(
        `⚠️ *A soma dos comprovantes ainda não fecha o valor declarado.*\n\n` +
        `*Valor declarado:* ${formatarValor(valorDeclarado)}\n` +
        `*Soma até agora:* ${formatarValor(somaComprovantes)}\n` +
        `*Faltam:* ${formatarValor(faltando)}\n\n` +
        `Você tem mais algum comprovante para enviar?`,
        {
          parse_mode: 'Markdown',
          ...btnCorrigirComExtra([[
            Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
          ]])
        }
      );
      await saveSession(telegramId, { estado: 'aguardando_comprovantes' });
      return;
    }

    await concluirProcesso(ctx, telegramId, session);
    return;
  }

  await ctx.answerCbQuery();
});

// ─── HANDLER DE TEXTO ────────────────────────────────────────

bot.on('text', async (ctx) => {
  if (ctx.chat.type !== 'private') return;

  const telegramId = ctx.from.id;
  const texto = ctx.message.text.trim();

  if (texto === '/start') {
    await enviarBoasVindas(ctx, telegramId);
    return;
  }

  const session = await getSession(telegramId);

  if (!session || session.estado === 'finalizado' || session.estado === 'inicio') {
    await enviarBoasVindas(ctx, telegramId);
    return;
  }

  // ── Coletando valores ──
  if (session.estado === 'coletando_valores') {
    const valor = parseFloat(texto.replace(',', '.').replace(/[^\d.]/g, ''));

    if (isNaN(valor) || valor <= 0) {
      await ctx.reply('⚠️ Valor inválido. Digite apenas o número. Ex: _500_', { parse_mode: 'Markdown', ...btnCorrigir() });
      return;
    }
    if (valor < 100) {
      await ctx.reply('⚠️ O valor mínimo de participação é *R$100,00*. Tente novamente:', { parse_mode: 'Markdown', ...btnCorrigir() });
      return;
    }
    if (valor % 100 !== 0) {
      await ctx.reply('⚠️ O valor precisa ser *múltiplo de R$100,00*.\nExemplos válidos: 100, 200, 500, 1000...\n\nDigite novamente:', { parse_mode: 'Markdown', ...btnCorrigir() });
      return;
    }

    const index = session.token_valor_index;
    const selecionados = session.tokens_selecionados;
    const novosValores = { ...session.valores_tokens, [selecionados[index]]: valor };
    const novoIndex = index + 1;

    await saveSession(telegramId, { valores_tokens: novosValores, token_valor_index: novoIndex });

    if (novoIndex < selecionados.length) {
      await pedirProximoValor(ctx, selecionados, novoIndex, { valores_tokens: novosValores });
    } else {
      const totalDeclarado = Object.values(novosValores).reduce((a, b) => a + b, 0);
      await saveSession(telegramId, { estado: 'coletando_nome', valor_total_declarado: totalDeclarado });
      await typing(ctx, 1200);
      await ctx.reply(
        `Ótimo! 🙌\n\n*Valor total da participação: ${formatarValor(totalDeclarado)}*\n\n` +
        `Agora preciso de alguns dados seus para finalizar o registro.\n\n📝 Qual é o seu *nome completo*?`,
        { parse_mode: 'Markdown', ...btnCorrigir() }
      );
    }
    return;
  }

  // ── Coletando nome ──
  if (session.estado === 'coletando_nome') {
    if (texto.split(' ').length < 2 || texto.length < 6) {
      await ctx.reply('Por favor, informe seu *nome completo* (nome e sobrenome):', { parse_mode: 'Markdown', ...btnCorrigir() });
      return;
    }
    const nomeFmt = texto.replace(/\b\w/g, c => c.toUpperCase());
    await saveSession(telegramId, { nome: nomeFmt, estado: 'coletando_email' });
    await typing(ctx, 1000);
    await ctx.reply(
      `Prazer, *${nomeFmt.split(' ')[0]}*! 😊\n\nQual é o *e-mail da sua conta BDM Digital*?`,
      { parse_mode: 'Markdown', ...btnCorrigir() }
    );
    return;
  }

  // ── Coletando email ──
  if (session.estado === 'coletando_email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(texto)) {
      await ctx.reply('⚠️ E-mail inválido. Por favor, informe um e-mail válido:', { ...btnCorrigir() });
      return;
    }
    await saveSession(telegramId, { email_bdm: texto.toLowerCase(), estado: 'aguardando_comprovantes' });

    const { empresa, banco, agencia, conta, chave_pix } = DADOS_PAGAMENTO;
    await typing(ctx, 1500);
    await ctx.reply(
      `Perfeito! ✅\n\nAgora envie o(s) *comprovante(s) de pagamento*. 📄\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🟠 *${empresa}*\n${banco}\n` +
      `Agência: \`${agencia}\`\nConta Corrente: \`${conta}\`\n` +
      `*Chave PIX (CNPJ):* \`${chave_pix}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `_Pode enviar mais de um comprovante caso tenha feito transferências em dias diferentes._\n\n` +
      `Quando terminar de enviar todos os comprovantes, clique no botão abaixo 👇`,
      {
        parse_mode: 'Markdown',
        ...btnCorrigirComExtra([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]])
      }
    );
    return;
  }

  // ── Confirmação de valor divergente ──
  if (session.estado === 'aguardando_confirmacao_valor') {
    if (texto.toLowerCase() === 'confirmar') {
      await concluirProcesso(ctx, telegramId, session);
    } else {
      await saveSession(telegramId, { estado: 'aguardando_comprovantes' });
      await ctx.reply(
        'Ok! Pode enviar o(s) comprovante(s). Quando terminar, clique no botão ✅.',
        btnCorrigirComExtra([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]])
      );
    }
    return;
  }

  await ctx.reply('Para iniciar ou reiniciar o processo, digite /start 😊');
});

// ─── HANDLER DE FOTOS ────────────────────────────────────────

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
    const foto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(foto.file_id);

    // ── Baixar imagem para verificação de duplicata ──
    const axios = require('axios');
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const hashImagem = hashBuffer(buffer);

    // ── Leitura OCR ──
    const dadosOCR = await lerComprovante(fileLink.href);

    const comprovantesExistentes = session.comprovantes || [];

    // ── VERIFICAÇÃO: comprovante foi enviado para a conta correta ──
    const nomeBenef  = (dadosOCR.nome_beneficiario || '').toUpperCase();
    const cnpjBenef  = (dadosOCR.cnpj_beneficiario || '').replace(/\D/g, '');
    const chaveDest  = (dadosOCR.chave_pix_destino  || '').replace(/\D/g, '');
    const cnpjCorreto = DADOS_PAGAMENTO.cnpj.replace(/\D/g, '');

    const contaCorreta =
      nomeBenef.includes('BDM') ||
      cnpjBenef === cnpjCorreto  ||
      chaveDest === cnpjCorreto;

    // Se beneficiário não foi identificado OU conta está errada → bloqueia
    if (!dadosOCR.nome_beneficiario) {
      await typing(ctx, 800);
      await ctx.reply(
        `⚠️ *Não consegui identificar o beneficiário neste comprovante.*

` +
        `Para garantir que o pagamento foi feito para a conta correta da BDM, ` +
        `preciso que o comprovante mostre claramente o nome ou CNPJ de quem recebeu.

` +
        `Por favor, tire um *screenshot direto do aplicativo do banco* onde apareça o destinatário do pagamento. 🙏`,
        { parse_mode: 'Markdown', ...btnCorrigirComExtra([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]]) }
      );
      return;
    }

    if (!contaCorreta) {
      await typing(ctx, 800);
      await ctx.reply(
        `⚠️ *Este comprovante não é para a conta da BDM!*

` +
        `Identifiquei que o pagamento foi destinado a:
` +
        `*${dadosOCR.nome_beneficiario}*

` +
        `O pagamento deve ser feito para:
` +
        `*BDM SOLUCOES DIGITAIS LTDA*
` +
        `Chave PIX (CNPJ): \`43.007.754/0001-86\`

` +
        `Por favor, envie o comprovante correto. 🙏`,
        { parse_mode: 'Markdown', ...btnCorrigirComExtra([[
          Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
        ]]) }
      );
      return;
    }

    // ── VERIFICAÇÃO DE DUPLICATA — 3 camadas ──────────────
    for (const comp of comprovantesExistentes) {
      const d = comp.dados || {};

      // Camada 1: hash da imagem (foto idêntica)
      if (comp.hash_imagem && comp.hash_imagem === hashImagem) {
        await typing(ctx, 600);
        await ctx.reply(
          `⚠️ *Esse comprovante já foi enviado antes!*\n\n` +
          `Identifiquei que é a mesma imagem enviada anteriormente. Por favor, envie um comprovante diferente. 🙏`,
          { parse_mode: 'Markdown', ...btnCorrigirComExtra([[
            Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
          ]]) }
        );
        return;
      }

      // Camada 2: código da transação
      if (
        dadosOCR.codigo_transacao &&
        d.codigo_transacao &&
        dadosOCR.codigo_transacao === d.codigo_transacao
      ) {
        await typing(ctx, 600);
        await ctx.reply(
          `⚠️ *Comprovante duplicado detectado!*\n\n` +
          `O código de transação \`${dadosOCR.codigo_transacao}\` já foi registrado.\n` +
          `Por favor, envie um comprovante de outra transferência. 🙏`,
          { parse_mode: 'Markdown', ...btnCorrigirComExtra([[
            Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
          ]]) }
        );
        return;
      }

      // Camada 3: valor + data + hora
      if (
        dadosOCR.valor && d.valor && dadosOCR.data && d.data &&
        dadosOCR.hora && d.hora &&
        parseFloat(dadosOCR.valor) === parseFloat(d.valor) &&
        dadosOCR.data === d.data &&
        dadosOCR.hora === d.hora
      ) {
        await typing(ctx, 600);
        await ctx.reply(
          `⚠️ *Comprovante duplicado detectado!*\n\n` +
          `Já existe um comprovante com o mesmo valor, data e horário registrado.\n` +
          `Por favor, envie um comprovante de outra transferência. 🙏`,
          { parse_mode: 'Markdown', ...btnCorrigirComExtra([[
            Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
          ]]) }
        );
        return;
      }
    }

    // ── VALIDAÇÃO: valor do comprovante deve ser múltiplo de 100 ──
    const valorOCR = parseFloat(dadosOCR.valor) || 0;
    if (valorOCR > 0 && Math.round(valorOCR * 100) % 10000 !== 0) {
      // Calcula quanto falta ou sobra para o múltiplo mais próximo
      const multiplo100abaixo = Math.floor(valorOCR / 100) * 100;
      const multiplo100acima  = Math.ceil(valorOCR / 100) * 100;
      const complemento       = multiplo100acima - valorOCR;

      await typing(ctx, 800);
      await ctx.reply(
        `⚠️ *Valor do comprovante não é múltiplo de R$100,00*\n\n` +
        `Identifiquei o valor de *${formatarValor(valorOCR)}* nesse comprovante.\n\n` +
        `As participações só podem ser em valores exatos de R$100,00 em R$100,00.\n` +
        `O valor mais próximo seria *${formatarValor(multiplo100acima)}*.\n\n` +
        `Você tem duas opções:\n` +
        `   • Enviar um *complemento de ${formatarValor(complemento)}* e mandar o comprovante desse complemento\n` +
        `   • Ou enviar um novo comprovante no valor correto, se tiver errado no envio\n\n` +
        `O que prefere fazer?`,
        {
          parse_mode: 'Markdown',
          ...btnCorrigirComExtra([[
            Markup.button.callback('✅ Finalizei o envio dos comprovantes', 'finalizar_comprovantes')
          ]])
        }
      );
      return;
    }

    // ── Comprovante válido — salvar ──
    const novosComprovantes = [
      ...comprovantesExistentes,
      { file_id: foto.file_id, file_url: fileLink.href, hash_imagem: hashImagem, dados: dadosOCR }
    ];
    await saveSession(telegramId, { comprovantes: novosComprovantes, estado: 'aguardando_comprovantes' });

    // ── Soma parcial ──
    const somaAtual = novosComprovantes.reduce((acc, c) => acc + (parseFloat(c.dados?.valor) || 0), 0);
    const valorDeclarado = session.valor_total_declarado;
    const faltando = valorDeclarado - somaAtual;

    const tipo  = dadosOCR.tipo_pagamento || 'Não identificado';
    const valor = dadosOCR.valor ? formatarValor(dadosOCR.valor) : 'Não identificado';
    const data  = dadosOCR.data  || 'Não identificada';
    const nComp = novosComprovantes.length;

    await typing(ctx, 800);

    // ── Valor bateu → finaliza direto ──
    if (faltando === 0) {
      await ctx.reply(
        `✅ *Comprovante ${nComp} recebido e verificado!*\n\n` +
        `O que identifiquei:\n• Tipo: *${tipo}*\n• Valor: *${valor}*\n• Data: ${data}\n\n` +
        `✅ *Valor total confirmado!* (${formatarValor(valorDeclarado)})\n\n` +
        `Perfeito! Tudo certo por aqui. Finalizando seu registro... 🎉`,
        { parse_mode: 'Markdown' }
      );
      // Busca sessão atualizada e finaliza
      const sessionAtualizada = await getSession(telegramId);
      await concluirProcesso(ctx, telegramId, sessionAtualizada);
      return;
    }

    // ── Valor ainda não bateu → aguarda mais comprovantes ──
    await ctx.reply(
      `✅ *Comprovante ${nComp} recebido e verificado!*\n\n` +
      `O que identifiquei:\n• Tipo: *${tipo}*\n• Valor: *${valor}*\n• Data: ${data}\n\n` +
      `*Soma até agora:* ${formatarValor(somaAtual)} de ${formatarValor(valorDeclarado)}\n` +
      `Ainda faltam *${formatarValor(faltando)}* em comprovantes.\n\n` +
      `Por favor, envie o(s) comprovante(s) restante(s). 👇`,
      {
        parse_mode: 'Markdown',
        ...btnCorrigirComExtra([[
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
  .then(() => console.log('🤖 Julia Bot está online e pronto para atender!'))
  .catch(err => console.error('Erro ao iniciar o bot:', err));

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
