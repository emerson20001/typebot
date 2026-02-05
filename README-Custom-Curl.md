# Integração Custom CURL – README Técnico

Data: 2026-02-05
Branch: typebot-clean-v3.15.2

## 1) Propósito e Motivação
A integração **Custom CURL** foi criada para permitir que usuários cole e convertam um comando `curl` bruto em uma requisição HTTP estruturada, utilizável dentro do fluxo do Typebot. Os objetivos principais foram:

- **Reduzir atrito de integração**: permitir copy/paste direto de documentação (Twilio, etc.).
- **Extrair variáveis dinâmicas**: detectar valores e mapear para variáveis do Typebot.
- **Manter o runtime determinístico**: sem efeitos colaterais durante o fluxo.
- **Habilitar ramificações Quick Reply**: mapear botões do template WhatsApp para caminhos do fluxo.

## 2) Comportamento em Runtime (por que foi alterado)
### 2.1 Sem execução de HTTP no fluxo
**Motivo:** executar requisições externas durante o fluxo pode gerar efeitos colaterais (mensagens duplicadas, cobrança indevida, risco de segurança). Por isso, a execução foi desabilitada no runtime.

**Comportamento atual:**
- Custom CURL **não executa** HTTP quando o fluxo chega ao bloco.
- Retorna apenas:
  - uma mensagem com o `curl` completo (texto), e
  - um `input` do tipo **choice** quando o template for **Quick Reply**.

### 2.2 Saída da API
Quando o fluxo atinge o Custom CURL:
- `messages[]` contém o comando curl em uma bolha de texto.
- `content.templateType` é enviado em `snake_case` (ex.: `quick_reply`).
- `input` é retornado somente se o template for Quick Reply.

Exemplo (simplificado):
```json
{
  "messages": [
    {
      "type": "text",
      "content": {
        "type": "richText",
        "templateType": "quick_reply",
        "richText": [
          { "type": "p", "children": [ { "text": "curl ..." } ] }
        ]
      }
    }
  ],
  "input": {
    "type": "choice input",
    "items": [
      { "content": "Sim", "value": "1", "outgoingEdgeId": "..." },
      { "content": "Nao", "value": "2", "outgoingEdgeId": "..." }
    ],
    "options": { "isMultipleChoice": false }
  }
}
```

## 3) Quick Reply e Ramificação
### 3.1 Items como fonte de verdade
Os botões Quick Reply são representados como **items** dentro do bloco Custom CURL (o mesmo modelo usado em Choice Input). Isso permite reutilizar toda a lógica de validação e roteamento.

Cada item suporta:
- `content` (texto do botão)
- `value` (id interno)
- `outgoingEdgeId` (caminho da ramificação)

### 3.2 Fluxos separados por botão
Cada botão **segue um fluxo separado**, pois cada item tem seu próprio `outgoingEdgeId`. Isso significa:
- Botão **Sim** pode ir para um grupo específico.
- Botão **Não** pode ir para outro grupo.
- **Default** é um terceiro caminho para respostas inesperadas.

**Importante:** o conector padrão do bloco principal é ocultado quando `templateType = Quick Reply`. A navegação do fluxo acontece somente pelos botões + Default.

### 3.3 Default
Se o usuário responder algo que não corresponde a nenhum botão, o fluxo segue pelo **Default**.

## 4) Ajustes de Conectores por Template (detalhado)
### 4.1 Por que controlar conectores por template
A integração foi pensada para trabalhar com **templates que possuem botões nativos (Quick Reply)**. Para esses templates, a saída correta do fluxo deve acontecer **somente via botões**, não via conector principal do bloco. Se o conector principal existisse, o usuário poderia conectar o bloco diretamente e **burlar a ramificação pelos botões**, gerando comportamento incorreto.

### 4.2 Como foi implementado (Builder)
Foram feitos dois ajustes principais:

1) **Default continua existindo** (fallback obrigatório):
- O `ItemNodesList` ainda desenha o item "Default".
- Ele serve como fallback para respostas inesperadas.

2) **Conector principal do bloco é removido apenas para Quick Reply**:
- A função `hasDefaultConnector` foi ajustada para retornar `false` quando:
  - `block.type === IntegrationBlockType.CUSTOM_CURL`
  - `block.options.templateType === "Quick Reply"`
- Assim, no canvas, o bloco não exibe a saída principal, apenas botões e Default.

**Arquivos envolvidos:**
- `apps/builder/src/features/typebot/helpers/hasDefaultConnector.ts`
- `apps/builder/src/features/graph/components/nodes/block/BlockNode.tsx`
- `apps/builder/src/features/graph/components/nodes/item/ItemNodesList.tsx`

### 4.3 Resultado esperado
- Template **Quick Reply**:
  - **Sem saída do bloco principal**
  - **Saídas apenas nos botões + Default**

- Outros templates (Text, Media, etc.):
  - **Conector principal existe normalmente**

## 5) Integração no JSON de resposta (etapas do fluxo)
### 5.1 Como o JSON é montado
A inclusão das etapas ocorre no **runtime engine** quando o fluxo encontra o bloco Custom CURL:

1. O engine executa `executeHttpRequestBlock`.
2. Se o bloco é `Custom CURL`, ele **não executa HTTP**.
3. Ele cria e retorna:
   - `messages[]` com o curl completo (bolha de texto)
   - `input` quando Quick Reply estiver ativo
4. O `walkFlowForward` detecta esse `input` e **interrompe o fluxo** aguardando resposta.

### 5.2 Arquivos responsáveis
- `packages/bot-engine/src/blocks/integrations/httpRequest/executeHttpRequestBlock.ts`
  - Gera mensagem com o curl.
  - Monta `input` do tipo choice com os botões.

- `packages/bot-engine/src/walkFlowForward.ts`
  - Se houver `input`, retorna para o front e pausa o fluxo.

- `packages/bot-engine/src/continueBotFlow.ts`
  - Interpreta a resposta do usuário.
  - Usa `outgoingEdgeId` do botão escolhido para seguir a próxima etapa.

### 5.3 Resultado no JSON
O JSON de resposta terá:
- `messages` com o curl
- `input` com botões e caminhos

Isso permite que o front (viewer) mostre os botões e siga o caminho correto após a resposta.

## 6) Persistência de Templates
### 6.1 O que é salvo
- `name`
- `curlCommand`
- `templateType`
- `templateBodyPreview`
- `templateImageUrl` (base64 data URL)
- `quickReplyButtons`
- `isExecutedOnClient`
- `timeout`

**Importante:** ao salvar no banco, `templateType` precisa ser o **enum do Prisma** (`CustomCurlTemplateType`).  
No backend, os labels amigáveis ("Quick Reply", "List Picker" etc.) são convertidos para os valores do enum
(`QuickReply`, `ListPicker`, etc.) antes do `create/update`.

### 6.2 Save / Load
- Ao **salvar**, os botões são derivados de `block.items` quando existem.
- Ao **importar**, `quickReplyButtons` são restaurados e sincronizados com `items`.

## 7) Banco de Dados (Schema)
### 7.1 Nova tabela: `CustomCurlTemplate`
PostgreSQL e MySQL foram estendidos com o modelo `CustomCurlTemplate`. O relacionamento é **User 1 → N CustomCurlTemplate**.

#### PostgreSQL (packages/prisma/postgresql/schema.prisma)
```prisma
model CustomCurlTemplate {
  id                  String   @id @default(cuid())
  createdAt           DateTime @default(now())
  updatedAt           DateTime @default(now()) @updatedAt
  name                String
  curlCommand         String
  type                CustomCurlTemplateType @default(Text)
  quickReplyButtons   Json?
  templateBodyPreview String?
  templateImageUrl    String?
  isExecutedOnClient  Boolean?
  timeout             Int?
  userId              String
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum CustomCurlTemplateType {
  Text
  Media
  ListPicker
  CallToAction
  QuickReply
  Card
  Catalog
  Carousel
  WhatsAppCard
  Authentication
  Flows
}
```

#### MySQL (packages/prisma/mysql/schema.prisma)
Mesmo modelo e enum.

### 7.2 Relacionamentos
- `User` possui muitos `CustomCurlTemplate` (1:N).
- Templates são por usuário (não compartilhados por workspace).

## 8) Como criar novos templates (passo técnico)
1. Abra o bloco **Custom CURL** no builder.
2. Cole o comando `curl` completo.
3. Clique em **Parse CURL** para preencher headers/body/variáveis.
4. Preencha:
   - **Template type** (ex.: Quick Reply)
   - **Template Body (preview)**
   - **Template image** (opcional)
   - **Quick reply buttons** (texto + id)
5. Clique em **Save template** e atribua um nome.
6. Para reutilizar: selecione o template na lista e ele já preenche tudo.

## 9) Como pedir para o Codex criar/alterar templates
Para solicitar alterações ao Codex (assistente):

### Exemplo de pedido
```
Quero criar um template Custom CURL chamado "Confirmar Consulta".
- Template type: Quick Reply
- Body preview: "Olá {{1}} ..."
- Botões: ["Sim" id=1], ["Não" id=2]
- Imagem: [base64 ou URL]
- CURL: <cole aqui>
```

### O que o Codex precisa
- CURL completo
- Tipo do template
- Texto de preview
- Lista de botões (texto + id)
- Se precisa de imagem

## 10) Arquivos Alterados (principais)
### Builder
- `apps/builder/src/features/blocks/integrations/customCurl/components/CustomCurlSettings.tsx`
- `apps/builder/src/features/blocks/integrations/customCurl/components/CustomCurlBlockNode.tsx`
- `apps/builder/src/features/blocks/integrations/customCurl/components/CustomCurlNodeContent.tsx`
- `apps/builder/src/features/blocks/integrations/customCurl/api/saveCustomCurlTemplate.ts`
- `apps/builder/src/features/blocks/integrations/customCurl/api/listCustomCurlTemplates.ts`
- `apps/builder/src/features/graph/components/nodes/item/ItemNodeContent.tsx`
- `apps/builder/src/features/graph/components/nodes/item/ItemNodesList.tsx`
- `apps/builder/src/features/graph/components/nodes/item/getItemName.tsx`
- `apps/builder/src/features/typebot/helpers/parseNewBlock.ts`
- `apps/builder/src/features/typebot/helpers/hasDefaultConnector.ts`
- `apps/builder/src/features/editor/providers/typebotActions/items.ts`

### Runtime / Core
- `packages/blocks/integrations/src/customCurl/schema.ts`
- `packages/blocks/integrations/src/customCurl/parseCurlCommand.ts`
- `packages/blocks/core/src/helpers.ts`
- `packages/bot-engine/src/blocks/integrations/httpRequest/executeHttpRequestBlock.ts`
- `packages/bot-engine/src/blocks/integrations/httpRequest/saveDataInResponseVariableMapping.ts`
- `packages/bot-engine/src/continueBotFlow.ts`
- `packages/bot-engine/src/walkFlowForward.ts`
- `packages/bot-engine/src/types.ts`
- `packages/chat-api/src/schemas.ts`

### Testes
- `packages/lib/src/ssrf/validateHttpReqUrl.test.ts` (localhost permitido em dev)

## 11) Notas de Migração
- Alterações exigem migração Prisma ou `db:push` dependendo do ambiente.
- Templates antigos sem `items` serão sincronizados no import.

## 12) Próximos Passos
- Adicionar toggle para execução em runtime (atualmente desativado).
- Validar limites por template (número de botões, campos obrigatórios).
- Suporte a templates compartilhados por workspace.
- Melhorar renderização de preview (texto + botões).
