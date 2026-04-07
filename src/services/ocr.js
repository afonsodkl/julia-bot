const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function lerComprovante(fileUrl) {
  // Baixa a imagem e converte para base64
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const base64 = Buffer.from(response.data).toString('base64');
  const contentType = response.headers['content-type'] || 'image/jpeg';

  const result = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: contentType, data: base64 }
        },
        {
          type: 'text',
          text: `Analise este comprovante de pagamento/transferência e extraia as informações abaixo em JSON.

Campos:
- tipo_pagamento: "PIX", "TED", "DOC" ou "SAQUE INTERNO" — identifique pelo conteúdo do comprovante
- valor: número decimal (ex: 1500.00) — sem R$, sem pontos de milhar
- data: string no formato DD/MM/AAAA
- hora: string HH:MM ou null se não visível
- nome_pagador: string ou null
- banco_origem: nome do banco de onde saiu o dinheiro, ou null
- codigo_transacao: código/ID da transação, ou null

Retorne APENAS o JSON válido. Sem texto, sem explicação, sem markdown.`
        }
      ]
    }]
  });

  const raw = result.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    // Tenta extrair JSON caso tenha texto ao redor
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Não foi possível interpretar o retorno do OCR.');
  }
}

module.exports = { lerComprovante };
