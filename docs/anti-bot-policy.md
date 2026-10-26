# Política anti-automação (CARSHOP-140)

Este documento descreve a proteção anti-automação aplicada às rotas
públicas de escrita do backend. Ele não contém valores de configuração nem
segredos.

## Endpoints cobertos

| Endpoint | Coberto | Justificativa |
|---|---|---|
| `POST /works/{workId}/comments` | Sim | Única rota pública anônima de escrita. |
| `POST /auth/login` | Não | Uso exclusivo do administrador; já protegida pelo rate limit dedicado de login (5 tentativas por IP + hash do e-mail em 5 minutos) e pela política de senha forte em produção. Um campo de controle exigiria alterar o formulário administrativo sem ganho real contra força bruta. |
| `POST /auth/refresh`, `POST /auth/logout` | Não | Exigem cookies de sessão e proteção CSRF (double-submit). |
| Rotas administrativas | Não | Exigem autenticação; fora de escopo. |

## Mecanismo

A criação pública de comentários aceita um campo de controle opcional no
body JSON, `website`, que deve vir **ausente ou vazio**. Um visitante
legítimo nunca vê nem preenche esse campo; clientes automatizados que
preenchem todos os campos de um formulário o enviam com valor e são
rejeitados.

- A decisão é tomada no servidor por `commentAntiBotMiddleware`
  (`src/infra/presentation/middleware/anti-bot.middleware.ts`).
- A decisão **não lê nenhum header**, inclusive `User-Agent`: um
  `User-Agent` de navegador não garante aceitação, e a ausência dele (ou um
  `User-Agent` não-navegador) não causa rejeição.
- O schema de validação (`createCommentSchema`) também aceita o campo apenas
  ausente ou vazio, como defesa em profundidade.
- O campo nunca é repassado ao caso de uso nem persistido.

## Ordem em relação aos limitadores

```text
globalRateLimitMiddleware (global, inalterado)
    ↓
commentRateLimitMiddleware (comentários, inalterado)
    ↓
commentAntiBotMiddleware (novo)
    ↓
CommentController.create
```

Os limitadores existentes (`globalRateLimitMiddleware`,
`commentRateLimitMiddleware` e `loginRateLimitMiddleware`) permanecem
ativos, com os mesmos limites e comportamento. A proteção anti-automação
não é um limitador de volume e não os substitui nem duplica. Como roda
depois do limitador de comentários, rejeições anti-automação continuam
contando na janela dele: um cliente insistente recebe `429`.

## Política de falha

Determinística e fail-closed para entrada malformada:

| Situação | Resultado |
|---|---|
| `body` não-objeto (`undefined`, `null`, array, string) | Segue adiante; a validação de payload existente responde `400` com o contrato atual. |
| `website` ausente, ou presente só via protótipo | Aceito pela proteção. |
| `website === ""` (comparação exata, sem `trim`) | Aceito pela proteção. |
| Qualquer outro valor (string não vazia, inclusive só espaços, número, `null`, boolean, objeto, array) | Rejeitado com `400` genérico. |
| Exceção inesperada no middleware | Encaminhada ao error handler central: `500` genérico, sem stack. |

- Não há provedor externo, chamada de rede, timeout nem configuração: os
  modos "provedor indisponível" e "configuração ausente" não se aplicam.
- A checagem é síncrona e de custo constante.
- O middleware não registra o body nem o valor do campo.

## Resposta de rejeição

```json
{ "message": "Payload inválido." }
```

- Status `400`, com o mesmo status e a mesma `message` de um payload
  inválido comum, sem `details` e sem revelar o nome do campo.
- Sem campo `details`, sem stack, sem nome do campo e sem menção ao
  mecanismo.
- `429` não é usado para não ser confundido com rate limit (o frontend
  reenvia automaticamente em `429`/`5xx`, mas não em `400`).

## Configuração

Nenhuma variável de ambiente ou segredo é necessária. Não existe flag para
ligar/desligar a proteção; `src/infra/config/env.ts` e `.env.example` não
foram alterados.

## Proporcionalidade e alternativas rejeitadas

O volume já é limitado por IP (limitador global e de comentários) e todo
comentário nasce `PENDING`, passando por moderação administrativa antes de
ser publicado. O risco residual é carga de moderação, não publicação de
spam. Por isso foi escolhida a alternativa mais simples, sem dependência,
sem segredo e com falso positivo praticamente nulo.

Alternativas avaliadas e rejeitadas:

- Provedor externo de desafio (Turnstile, hCaptcha, reCAPTCHA):
  desproporcional — nova dependência e integração HTTP, novo segredo, widget
  obrigatório no frontend, impacto de privacidade/acessibilidade e
  disponibilidade de terceiro.
- Token assinado de tempo mínimo: exigiria endpoint novo, segredo novo e
  mudança obrigatória no frontend.
- Heurística de conteúdo (ex.: contagem de links): alteraria a regra de
  aceitação de conteúdo legítimo e traria risco real de falso positivo.

## Limitação conhecida e endurecimento futuro

O campo é opcional para não quebrar o frontend atual, que envia apenas
`authorName` e `content`. Até o frontend renderizar o campo oculto, a
proteção só bloqueia clientes que enviam o campo preenchido; clientes que
chamam a API diretamente apenas com os dois campos continuam limitados pelos
rate limiters e pela moderação.

Endurecimento futuro (fora de escopo desta tarefa): depois que o frontend
passar a enviar sempre `website: ""`, avaliar em outra tarefa tornar o campo
obrigatório.

## Frontend, UX e acessibilidade

**O usuário legítimo não interage com nada**: não há desafio, captcha nem
etapa adicional. A mudança abaixo é apenas recomendada ao frontend (não
implementada neste repositório):

- Renderizar um input `name="website"` visualmente oculto, posicionado fora
  da tela (não usar `display: none`, que alguns bots detectam).
- `tabIndex={-1}` para que não receba foco via teclado.
- `autoComplete="off"` para evitar autopreenchimento do navegador.
- `aria-hidden="true"` no wrapper e um rótulo como "Deixe este campo em
  branco" para tecnologias assistivas que eventualmente o alcancem.
- Enviar o valor como está (normalmente `""`) através do `/api-proxy`.
- Não reenviar automaticamente em caso de `400`.
