const { Resend } = require('resend');
const { TOKENS_ATIVOS } = require('../config/tokens');

const resend = new Resend(process.env.RESEND_API_KEY);

function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

async function enviarEmailConfirmacao(session) {
  const modalidadesHTML = session.tokens_selecionados.map(id => {
    const token = TOKENS_ATIVOS.find(t => t.id === id);
    return `<tr>
      <td style="padding:8px 16px;border-bottom:1px solid #eee;">${token.nome}</td>
      <td style="padding:8px 16px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${formatarValor(session.valores_tokens[id])}</td>
    </tr>`;
  }).join('');

  const primeiroNome = session.nome.split(' ')[0];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    
    <div style="background:#0a2463;padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">BDM Digital</h1>
      <p style="color:#8ab4f8;margin:8px 0 0;">Confirmação de Participação</p>
    </div>

    <div style="padding:32px;">
      <p style="font-size:16px;color:#333;">Olá, <strong>${primeiroNome}</strong>! 👋</p>
      <p style="color:#555;line-height:1.6;">
        Sua participação foi registrada com sucesso e nossa equipe já foi notificada. 
        Fique tranquilo(a) — você está em boas mãos! 🙏
      </p>

      <h3 style="color:#0a2463;margin-top:28px;">📋 Resumo da sua participação</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f0f4ff;">
            <th style="padding:10px 16px;text-align:left;color:#0a2463;">Modalidade</th>
            <th style="padding:10px 16px;text-align:right;color:#0a2463;">Valor</th>
          </tr>
        </thead>
        <tbody>${modalidadesHTML}</tbody>
        <tfoot>
          <tr style="background:#f0f4ff;">
            <td style="padding:10px 16px;font-weight:bold;color:#0a2463;">TOTAL</td>
            <td style="padding:10px 16px;font-weight:bold;text-align:right;color:#0a2463;">${formatarValor(session.valor_total_declarado)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:24px;padding:16px;background:#f0f9ff;border-left:4px solid #0a2463;border-radius:4px;">
        <p style="margin:0;color:#555;font-size:14px;">
          <strong>E-mail BDM:</strong> ${session.email_bdm}<br>
          <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <p style="color:#555;line-height:1.6;margin-top:24px;">
        Em caso de dúvidas, entre em contato com nossa equipe pelo Telegram: <strong>@juliadakila</strong>
      </p>
    </div>

    <div style="background:#f5f5f5;padding:20px;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">BDM Digital &bull; Este é um e-mail automático.</p>
    </div>

  </div>
</body>
</html>`;

  await resend.emails.send({
    from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
    to: session.email_bdm,
    subject: '✅ Participação registrada — BDM Digital',
    html,
  });
}

module.exports = { enviarEmailConfirmacao };
