# 🤖 Júlia Bot — BDM Digital
### Bot de registro de participações em tokens

---

## 📁 Estrutura do projeto

```
julia-bot/
├── src/
│   ├── index.js              ← Cérebro do bot (fluxo completo)
│   ├── config/
│   │   └── tokens.js         ← ✅ EDITE AQUI para alterar tokens/dados bancários
│   └── services/
│       ├── supabase.js       ← Banco de dados (memória do bot)
│       ├── ocr.js            ← Leitura de comprovantes com IA
│       ├── email.js          ← E-mail de confirmação (Resend)
│       └── grupo.js          ← Relatório para o grupo Telegram
├── supabase_setup.sql        ← Rodar uma vez no Supabase
├── .env.example              ← Copiar para .env e preencher
└── package.json
```

---

## 🚀 Passo a passo para subir no servidor

### 1. Criar o bot no Telegram
1. Abra o Telegram e fale com **@BotFather**
2. Digite `/newbot`
3. Dê um nome: `Júlia BDM`
4. Dê um username: `juliabdm_bot` (ou similar disponível)
5. Copie o **token** gerado

### 2. Pegar o ID do grupo "Comprovantes"
1. Adicione o bot ao grupo
2. Adicione **@userinfobot** ao grupo também
3. O @userinfobot vai mostrar o **Chat ID** do grupo (número negativo, ex: -1001234567890)
4. Copie esse ID — vai no `.env` como `GRUPO_ID`
5. Pode remover o @userinfobot depois

### 3. Configurar privacidade do bot no grupo
No @BotFather:
- `/mybots` → selecione o bot → Bot Settings → Group Privacy → **Turn off**
- Isso permite o bot funcionar no grupo

### 4. Criar a tabela no Supabase
1. Acesse seu Supabase → **SQL Editor**
2. Cole o conteúdo do arquivo `supabase_setup.sql`
3. Clique em **Run**

### 5. Subir no servidor (VPS)
```bash
# Conectar no VPS
ssh usuario@ip-do-servidor

# Clonar ou transferir os arquivos
# (use git, scp, FileZilla, ou similar)

cd julia-bot

# Instalar dependências
npm install

# Copiar e preencher o .env
cp .env.example .env
nano .env
# Preencha: BOT_TOKEN, GRUPO_ID, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY, EMAIL_FROM

# Testar se funciona
node src/index.js

# Quando estiver OK, rodar com PM2 (igual ao Guaritas)
pm2 start src/index.js --name "julia-bot"
pm2 save
pm2 startup
```

### 6. Verificar se está rodando
```bash
pm2 status
pm2 logs julia-bot
```

---

## 🛠️ Como fazer manutenção

### Adicionar/remover token
Edite **`src/config/tokens.js`** e reinicie:
```bash
pm2 restart julia-bot
```

### Ver logs em tempo real
```bash
pm2 logs julia-bot --lines 50
```

### Reiniciar o bot
```bash
pm2 restart julia-bot
```

---

## 📌 Variáveis de ambiente (.env)

| Variável | O que é |
|---|---|
| `BOT_TOKEN` | Token do @BotFather |
| `GRUPO_ID` | ID do grupo "Comprovantes" (número negativo) |
| `ANTHROPIC_API_KEY` | Chave da API Claude (leitura de comprovantes) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Service Role Key do Supabase |
| `RESEND_API_KEY` | Chave da API Resend (emails) |
| `EMAIL_FROM` | E-mail remetente (ex: noreply@bdmdigital.com) |
| `EMAIL_FROM_NAME` | Nome remetente (ex: BDM Digital) |
