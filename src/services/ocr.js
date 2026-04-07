const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detecta o tipo da imagem pelos magic bytes
function detectImageType(buffer) {
  const bytes = buffer.slice(0, 4);
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return 'image/jpeg'; // fallback
}

async function lerComprovante(fileUrl) {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  const base64 = buffer.toString('base64');
  const mediaType = detectImageType(buffer);

  // Detecta se é PDF pelos magic bytes (%PDF)
  const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;

  const contentBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const result = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        contentBlock,
        {
          type: 'text',
          text: `Analise este comprovante de pagamento/transferência e extraia as informações abaixo em JSON.

Campos:
- tipo_pagamento: "PIX", "TED", "DOC" ou "SAQUE INTERNO"
- valor: número decimal (ex: 1500.00) sem R$ ou pontos
- data: string DD/MM/AAAA
- hora: string HH:MM ou null
- nome_pagador: string ou null
- banco_origem: string ou null
- codigo_transacao: string ou null
- nome_beneficiario: nome de quem RECEBEU o pagamento, string ou null
- cnpj_beneficiario: CNPJ de quem recebeu (apenas números e pontuação), string ou null
- chave_pix_destino: chave PIX de destino se visível, string ou null

Retorne APENAS o JSON válido. Sem texto, sem markdown.`
        }
      ]
    }]
  });

  const raw = result.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Não foi possível interpretar o retorno do OCR.');
  }
}

module.exports = { lerComprovante };
