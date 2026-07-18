const { Resend } = require('resend');

function obterCliente() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY nao configurada — e-mail nao sera enviado.');
    return null;
  }
  return new Resend(apiKey);
}

async function enviarEmailRecuperacaoSenha(destinatario, nomeEstabelecimento, linkRedefinir) {
  const resend = obterCliente();
  if (!resend) return { enviado: false, motivo: 'sem_chave_configurada' };

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: destinatario,
      subject: 'Recuperacao de senha - Mimenu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Recuperacao de senha</h2>
          <p>Ola${nomeEstabelecimento ? ', ' + nomeEstabelecimento : ''}!</p>
          <p>Recebemos um pedido para redefinir a senha do seu painel Mimenu.</p>
          <p><a href="${linkRedefinir}" style="display:inline-block;background:#ff00d6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Redefinir minha senha</a></p>
          <p>Esse link expira em 1 hora. Se voce nao pediu essa alteracao, pode ignorar este e-mail.</p>
        </div>
      `
    });

    if (error) {
      console.error('Resend recusou o envio:', error.message || error);
      return { enviado: false, motivo: error.message || 'recusado_pela_resend' };
    }
    return { enviado: true };
  } catch (erro) {
    console.error('Erro ao enviar e-mail via Resend:', erro.message);
    return { enviado: false, motivo: 'falha_envio' };
  }
}

async function enviarEmailGenerico(destinatario, nomeEstabelecimento, assunto, mensagem) {
  const resend = obterCliente();
  if (!resend) return { enviado: false, motivo: 'sem_chave_configurada' };

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: destinatario,
      replyTo: process.env.RESEND_REPLY_TO || 'palatosoficial@gmail.com',
      subject: assunto,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <p>Ola${nomeEstabelecimento ? ', ' + nomeEstabelecimento : ''}!</p>
          <p style="white-space: pre-wrap;">${mensagem}</p>
          <p style="color:#888; font-size:12px; margin-top:24px;">Mensagem enviada pela equipe Mimenu.</p>
        </div>
      `
    });

    if (error) {
      console.error('Resend recusou o envio:', error.message || error);
      return { enviado: false, motivo: error.message || 'recusado_pela_resend' };
    }
    return { enviado: true };
  } catch (erro) {
    console.error('Erro ao enviar e-mail via Resend:', erro.message);
    return { enviado: false, motivo: 'falha_envio' };
  }
}

module.exports = { enviarEmailRecuperacaoSenha, enviarEmailGenerico };
