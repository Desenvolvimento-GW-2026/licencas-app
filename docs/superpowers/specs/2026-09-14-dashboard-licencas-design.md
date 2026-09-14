# Design: Dashboard de Licenças de Poços — General Water

**Data:** 2026-09-14  
**Projeto:** AMBISIS / licencas.desenvolvimentogw.com.br

---

## Objetivo

Dashboard web para visualizar e monitorar licenças de poços (outorgas) extraídas automaticamente do Ambisis, com alertas visuais de prazo e filtros por cliente, status e período.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + API | Next.js 14 (App Router) |
| Banco de dados | SQLite via Prisma |
| Scraper | Playwright (Node.js, headless Chromium) |
| Agendamento | node-cron (todo dia às 06:00) |
| Autenticação | NextAuth.js (credentials — email/senha) |
| Reverse proxy | Nginx + Certbot (SSL Let's Encrypt) |
| Infra | Oracle Cloud Free Tier VM (Ubuntu) |
| DNS | Cloudflare → subdomínio `licencas.desenvolvimentogw.com.br` |
| Deploy | Docker Compose |

---

## Arquitetura

```
Cloudflare DNS
  licencas.desenvolvimentogw.com.br → Oracle VM (IP público)
                                            │
                                       Nginx :443
                                            │
                                      Next.js :3000
                                       ┌────┴────┐
                                    Pages      API Routes
                                       │            │
                                    SQLite ←── Scraper (Playwright)
                                                   │
                                          app.ambisis.com.br
                                     (headless, todo dia 06:00)
```

---

## Banco de Dados (SQLite)

### Tabela `licenses`

```sql
id                   INTEGER PRIMARY KEY AUTOINCREMENT
nome_empreendimento  TEXT NOT NULL
cnpj                 TEXT
cliente              TEXT
numero_poco          TEXT
requerimento_atual   TEXT
requerimento_anterior TEXT
portaria             TEXT
validade             DATE
status               TEXT  -- ver enum abaixo
data_protocolo       DATE
scraped_at           DATETIME DEFAULT CURRENT_TIMESTAMP
```

**Status válidos:**
- `vigente`
- `em_renovacao`
- `vencida`
- `autorizacao_perfuracao`
- `em_retificacao`
- `a_solicitar`
- `cancelada`

### Tabela `users`

```sql
id             INTEGER PRIMARY KEY AUTOINCREMENT
email          TEXT UNIQUE NOT NULL
password_hash  TEXT NOT NULL
name           TEXT
created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
```

---

## Scraper (Playwright headless)

**Arquivo:** `src/scraper/scrape-ambisis.ts`

**Fluxo:**
1. Inicia Chromium headless (`playwright.chromium.launch({ headless: true })`)
2. Login no Ambisis com credenciais de serviço (`gabriel.barbosa@generalwater.com.br`)
3. Navega até a seção de licenças/poços (a mapear durante implementação)
4. Extrai todas as linhas da tabela de licenças
5. Para cada linha: upsert no SQLite usando `(cnpj + numero_poco)` como chave única
6. Registra `scraped_at` com timestamp atual
7. Fecha browser

**Agendamento:** `node-cron` → `0 6 * * *` (06:00 todo dia)

**Nota:** O mapeamento exato das páginas e seletores do Ambisis será feito durante implementação com sessão autenticada real.

---

## Autenticação do Dashboard

- NextAuth.js com provider `credentials`
- Senha armazenada como bcrypt hash no SQLite
- Sessão JWT (cookie httpOnly)
- Todas as rotas exceto `/login` são protegidas por middleware Next.js
- Usuários criados via script de seed (não há cadastro público)

---

## Páginas

### `/login`
- Formulário email + senha
- Redirect para `/` após login
- Visual: fundo `#f4f5f9`, card central, logo General Water

### `/` (protegida — dashboard principal)

**Header** (idêntico ao SOE):
- Fundo: `linear-gradient(135deg, #3D397E 0%, #2e2a6e 100%)`
- Logo General Water (branco via `filter: brightness(0) invert(1)`)
- Título: "Licenças de Poços"
- Sub: "General Water — Monitoramento de Outorgas"
- Info bar: última sincronização (scraped_at), próxima sincronização (amanhã 06:00)
- Badge "Uso Interno"

**Cards de resumo (topo):**
- Total de licenças
- Vigentes
- Em renovação
- Vencendo em 180 dias (amarelo)
- Vencendo em 120 dias (vermelho)
- Vencidas

**Filtros:**
- Campo texto: busca por nome/CNPJ
- Select: Cliente
- Select: Status
- Select: Mês de vencimento (01–12)
- Select: Ano de vencimento
- Botão "Limpar filtros"

**Tabela principal:**

| Coluna | Largura |
|---|---|
| Nome Empreendimento | flex |
| CNPJ | 160px |
| Nº Poço | 100px |
| Req. Atual | 120px |
| Req. Anterior | 120px |
| Portaria | 120px |
| Validade | 110px |
| Status | 160px |
| Protocolo | 110px |

**Cor da linha por prazo (baseada na coluna Validade):**

| Condição | Cor da linha |
|---|---|
| Vencida (passado) | Fundo cinza escuro `#374151`, texto `#9CA3AF` |
| ≤ 120 dias | Fundo vermelho `#fef2f2`, borda esquerda `#dc2626` |
| ≤ 180 dias | Fundo amarelo `#fefce8`, borda esquerda `#eab308` |
| > 180 dias | Padrão (branco / `#fafbff` alternado) |

**Badge de status:**
- `vigente` → verde `#d1fae5 / #065f46`
- `em_renovacao` → azul `#dbeafe / #1d4ed8`
- `vencida` → cinza `#f5f5f5 / #757575`
- `autorizacao_perfuracao` → laranja `#ffedd5 / #c2410c`
- `em_retificacao` → amarelo `#fef9c3 / #92400e`
- `a_solicitar` → roxo `#ede9fe / #6b21a8`
- `cancelada` → vermelho escuro `#fee2e2 / #7f1d1d`

**Rodapé:**
- "General Water — Licenças de Poços | Desenvolvido pelo Setor de Desenvolvimento"

---

## Visual / Design System

Reutilizado diretamente do projeto SOE:

```css
--gw-purple: #3D397E
--gw-teal:   #47A5AE
--gw-teal-dark: #378d96
--gw-blue:   #2ea3f2
--bg:        #f4f5f9
```

- Font: Open Sans (Google Fonts)
- Cards: `border-radius: 12px`, `box-shadow: 0 1px 6px rgba(0,0,0,.07)`
- Header tabela: `background: #3D397E`, texto branco
- Hover linha: `background: #eef0fb`

---

## Estrutura de Arquivos

```
AMBISIS/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   └── page.tsx          ← dashboard principal
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── licenses/route.ts
│   │   └── layout.tsx
│   ├── scraper/
│   │   ├── scrape-ambisis.ts     ← Playwright scraper
│   │   └── scheduler.ts          ← node-cron 06:00
│   ├── lib/
│   │   ├── db.ts                 ← Prisma client
│   │   └── auth.ts               ← NextAuth config
│   └── components/
│       ├── LicenseTable.tsx
│       ├── Filters.tsx
│       └── SummaryCards.tsx
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

---

## Deploy

**Docker Compose** com dois serviços:
1. `app` — Next.js (porta 3000)
2. `nginx` — reverse proxy (443 → 3000, SSL via Certbot volume)

**Subdomínio Cloudflare:**
- `licencas.desenvolvimentogw.com.br` → A record → IP público Oracle VM
- Proxy: Cloudflare (orange cloud)

**SSL:** Certbot + Let's Encrypt, auto-renew via cron do sistema.

---

## Fora do escopo

- Edição de dados pelo dashboard (somente leitura)
- Cadastro de usuários via interface (seed script)
- Notificações por email/WhatsApp
- Relatórios PDF
