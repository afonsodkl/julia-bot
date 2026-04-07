const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function getSession(telegramId) {
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') console.error('getSession error:', error);
  return data || null;
}

async function saveSession(telegramId, updates) {
  const { data: existing } = await supabase
    .from('bot_sessions')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('bot_sessions')
      .update({ ...updates, atualizado_em: new Date().toISOString() })
      .eq('telegram_id', telegramId);
    if (error) console.error('saveSession update error:', error);
  } else {
    const { error } = await supabase
      .from('bot_sessions')
      .insert({ telegram_id: telegramId, ...updates, criado_em: new Date().toISOString() });
    if (error) console.error('saveSession insert error:', error);
  }
}

module.exports = { getSession, saveSession };
