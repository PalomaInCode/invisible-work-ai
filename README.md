<div align="center">

# invisiblework AI

**Discover. Understand. Automate.**

Uma plataforma de inteligência operacional que torna visíveis tarefas repetitivas, retrabalho e oportunidades de melhoria.

**React + Vite no frontend · Node.js + Express em JavaScript no backend**

![React](https://img.shields.io/badge/React-19-20253D?logo=react) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black) ![Express](https://img.shields.io/badge/Express-4-222222?logo=express) ![License](https://img.shields.io/badge/license-MIT-purple)

</div>

## Problema

As empresas acumulam milhares de pequenas tarefas operacionais que passam despercebidas. Conferências manuais, consultas a sistemas, correções de dados e processos de retrabalho consomem tempo sem necessariamente aparecer nos indicadores de gestão.

O **Invisible Work AI** explora registros de atividades para apresentar o tempo gasto, padrões repetitivos, prioridades de investigação e um exemplo de automação supervisionada.

## Funcionalidades implementadas

- **Dashboard responsivo em React:** indicadores, evolução das horas registradas, distribuição por processo e oportunidades priorizadas
- **Importação CSV:** envia arquivo ao backend; valida colunas, duração, datas e registra linhas inconsistentes
- **Discovery:** classificação heurística por frequência, tempo, retrabalho e predominância de trabalho manual
- **Detalhamento:** score, ocorrências, tempo, percentual manual e hipótese de potencial por atividade
- **AI Insights:** se `GEMINI_API_KEY` estiver configurada, faz interpretação por Gemini de métricas agregadas; sem chave, usa um modo explícito baseado em regras
- **Automation Studio:** prévia de conciliação pedidos × pagamentos, detecção de divergências, aprovação humana obrigatória e exportação de CSV com resultados
- **Base de dados:** pesquisa e paginação, download de modelos de CSV
- **Dados fictícios:** três arquivos de demonstração para navegar sem credenciais
- **Testes automatizados:** funções de parser, métricas, validação, conciliação, exportação e fallback da IA

> **Limites reais do MVP:** não conecta ERPs, não processa dados confidenciais, não publica workflows no n8n, não persiste análises em banco de dados e não comprova ganhos de horas em uma empresa. Nenhuma automação modifica um sistema externo. Os resultados de conciliação são arquivos CSV e o histórico recente fica somente na memória do processo Node.

## Arquitetura

```text
Browser / React + Vite (frontend:5173)
         │ fetch('/api/...')
         ▼
Node.js + Express (backend:3001)
    ├── GET  /api/demo                  → dataset sintético + métricas
    ├── POST /api/analyze               → parsing, validação e indicadores
    ├── POST /api/insights              → regras ou Gemini opcional
    ├── POST /api/automation/preview    → conciliação sem efeitos externos
    ├── POST /api/automation/execute    → exige aprovação + hash da prévia
    ├── GET  /api/automation/runs       → execuções da sessão
    └── GET  /api/demo/file/:name       → exemplos CSV
```

As métricas são calculadas em JavaScript puro no backend. Um LLM, quando configurado, interpreta um resumo dessas métricas; **não é utilizado para inventar números nem para decidir execuções**.

## Como rodar

**Requisitos:** Node.js 20+ e npm.

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001/api/health

Em produção, o Express serve automaticamente o build estático de React:

```bash
npm run build
npm start
# http://localhost:3001
```

O frontend em desenvolvimento utiliza proxy Vite para `/api`.

### IA generativa (opcional)

Defina a variável de ambiente `GEMINI_API_KEY` **no servidor**, nunca no frontend. Consulte `.env.example` e utilize, por exemplo:

```bash
GEMINI_API_KEY="sua_chave" GEMINI_MODEL="gemini-2.0-flash" npm run dev
```

O projeto **não carrega automaticamente** um arquivo `.env` (para evitar impressão de configuração ativa que não está instalada). Use variáveis do ambiente de hospedagem ou configure Node com `--env-file=.env` de forma explícita. Confirme disponibilidade e termos do modelo no Google AI Studio antes de usar a API.

**Sem chave:** o recurso AI Insights informa que usa análise **baseada em regras**, não IA generativa. Falhas da API também acionam fallback explícito.

## Dados CSV

Use os arquivos disponíveis em `backend/data/`, ou importe outro arquivo com cabeçalho:

```csv
case_id,processo,atividade,data,duracao_min,retrabalho,execucao,status
CASE-1,Pedidos,Validar pagamento,2026-11-01,14,Sim,Manual,Concluído
CASE-2,Estoque,Conferir cadastro,2026-11-02,8,Não,Manual,Concluído
```

- **`data`:** formato ISO `AAAA-MM-DD`
- **`duracao_min`:** número de minutos por evento, não negativo
- **`retrabalho`:** Sim/Não
- **`execucao`:** Manual/Automática
- **Separador:** vírgula. Use aspas em campos que contenham vírgulas.
- **Tamanho:** máximo de 2 MB por importação; máximo de 10.000 linhas válidas por análise (todas as linhas retornadas para visualização com paginação)

### Modelo de score

O MVP adota um **score heurístico transparente (0–100)**:

| Fator | Peso máximo |
|---|---:|
| Frequência normalizada (até 45 eventos) | 25 pontos |
| Tempo acumulado normalizado (até 600 min) | 30 pontos |
| Proporção com retrabalho | 20 pontos |
| Proporção de execução manual | 25 pontos |

As oportunidades de score ≥ 55 aparecem no indicador principal. A hipótese de potencial utiliza 55% do tempo para atividades majoritariamente manuais ou 25% caso contrário. Essas porcentagens são **hipóteses para comparação**, não resultados reais e não uma previsão de ML. O período é o período coberto pelo arquivo.

## Demo em 90 segundos

1. **0–15 s:** abra o dashboard, apresente os indicadores calculados dos dados fictícios.
2. **15–35 s:** acesse Discovery, abra uma atividade e mostre a regra transparente de priorização.
3. **35–55 s:** vá para AI Insights e faça uma pergunta. Identifique corretamente se a resposta veio do Gemini ou de regras.
4. **55–80 s:** abra Automações, gere uma prévia, autorize e execute a conciliação de pedidos e pagamentos.
5. **80–90 s:** baixe o CSV com resultados e explique que a solução preserva a aprovação humana e não altera sistemas externos.

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev` | API + frontend com hot reload |
| `npm run test` | Testes unitários do backend |
| `npm run build` | Build React |
| `npm start` | Servidor Express com build React |
| `npm run check` | Teste e build |

## Estrutura

```text
invisible-work-ai/
├── frontend/
│   ├── src/App.jsx         # UI com páginas React
│   ├── src/styles.css      # Design system responsivo
│   ├── src/main.jsx
│   └── vite.config.js
├── backend/
│   ├── src/analytics.js    # Métricas e conciliação
│   ├── src/insights.js     # Gemini ou regras
│   ├── src/server.js       # API Express
│   ├── data/               # CSVs fictícios
│   └── tests/
├── .env.example
├── package.json
└── README.md
```

## Privacidade e limitações

Este projeto é um MVP educacional com dados **inteiramente sintéticos**, não utiliza dados de clientes reais da Stefanini, SAP ou iFood. A versão demo não tem autenticação nem armazenamento persistente e não deve receber dados confidenciais. A função AI Insights envia métricas agregadas para o provedor configurado, quando uma chave for fornecida. Hospede apenas com controles adequados se for expandi-lo para usuários reais.

## Roadmap (não implementado)

- Autenticação e workspaces multiusuário
- Persistência de análises em banco de dados
- Workflow Builder com templates n8n
- Análise visual de jornada de casos (process replay)
- Integração com ferramentas reais, sempre mediante autorização
- Avaliação quantitativa com métricas de antes/depois

---

Projeto independente para portfólio AI Builder, desenvolvido por **[Paloma Santos Dias](https://github.com/PalomaInCode)**.
