-- Execute esse SQL no Supabase > SQL Editor
-- Cria a tabela de sessões do bot

create table if not exists bot_sessions (
  id                    uuid primary key default gen_random_uuid(),
  telegram_id           bigint unique not null,
  estado                text default 'inicio',

  -- Dados do cliente
  nome                  text,
  email_bdm             text,

  -- Seleção de tokens e valores
  tokens_selecionados   jsonb default '[]',    -- ex: ["staking6", "staking12"]
  token_valor_index     int default 0,
  valores_tokens        jsonb default '{}',    -- ex: {"staking6": 500, "staking12": 1000}
  valor_total_declarado numeric default 0,

  -- Comprovantes recebidos
  comprovantes          jsonb default '[]',    -- [{file_id, file_url, dados:{...ocr...}}]

  -- Timestamps
  criado_em             timestamp with time zone default now(),
  atualizado_em         timestamp with time zone default now(),
  finalizado_em         timestamp with time zone
);

-- Índice para busca rápida por telegram_id
create index if not exists idx_bot_sessions_telegram_id on bot_sessions(telegram_id);
