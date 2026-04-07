// ============================================================
// ✅  ARQUIVO DE CONFIGURAÇÃO — EDITE AQUI SEMPRE QUE PRECISAR
// ============================================================
//
// Para DESATIVAR um token:  comente a linha com //
// Para ADICIONAR um token:  adicione um novo objeto no array
// Para RENOMEAR:            altere o campo "nome"
//
// ============================================================

const TOKENS_ATIVOS = [
  { id: 'staking6',    nome: 'STAKING 6' },
  { id: 'staking9',    nome: 'STAKING 9' },
  { id: 'staking12',   nome: 'STAKING 12' },
  { id: 'staking18',   nome: 'STAKING 18' },
  { id: 'staking_t48', nome: 'STAKING TESOURO 48/4' },
  { id: 'staking_t60', nome: 'STAKING TESOURO 60/4' },
];

// ─── Dados bancários para pagamento ─────────────────────────
const DADOS_PAGAMENTO = {
  empresa: 'BDM SOLUCOES DIGITAIS LTDA',
  banco:   'Banco do Brasil',
  agencia: '4421-0',
  conta:   '40.931-6',
  cnpj:    '43.007.754/0001-86',
  chave_pix: '43.007.754/0001-86', // Chave PIX = CNPJ
};

module.exports = { TOKENS_ATIVOS, DADOS_PAGAMENTO };
