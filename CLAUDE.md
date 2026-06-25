# Regras do projeto

## Planilha Google Sheets (BALANCO ESTOQUE)

**NUNCA modifique a planilha.** Não há autorização para criar, editar, mover ou excluir qualquer conteúdo da planilha de estoque (ID `1Q3PaZbBrCmq_MeXGdnnIOVf3JmwJXrqpAUx92qNWNto`) nem de qualquer outro arquivo no Google Drive do projeto.

O app apenas lê a planilha. Toda lógica de interpretação dos dados fica no código (`src/lib/services/estoque.ts`), nunca na planilha.

## Credenciais

Nunca hardcode credenciais de login no código-fonte (o repositório é público). Credenciais são configuradas via variáveis de ambiente no Vercel (`APP_USERNAME`, `APP_PASSWORD`).
