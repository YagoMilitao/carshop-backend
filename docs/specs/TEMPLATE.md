# [Nome da funcionalidade]

## Objetivo

Descreva em poucas frases qual resultado deve existir para o usuário ou para o sistema.

## Contexto

Explique o problema atual, quem usa a funcionalidade e referências relevantes dentro do projeto.

## Escopo

- Comportamento que deve ser implementado.
- Fluxos que precisam ser alterados.
- Dados que precisam ser armazenados ou retornados.

## Fora de escopo

- Comportamentos relacionados que não devem ser implementados nesta tarefa.
- Refactors ou migrações que devem ficar para outra mudança.

## Contrato HTTP

### `[MÉTODO] /caminho`

Autenticação: pública ou administrativa.

Request:

```json
{}
```

Resposta de sucesso:

```json
{}
```

Erros esperados:

- `400`: condição de entrada inválida.
- `401/403`: condição de autenticação ou autorização, se aplicável.
- `404`: recurso não encontrado, se aplicável.
- `409`: conflito de regra de negócio, se aplicável.

## Regras de negócio

1. Descreva regras de forma verificável.
2. Informe normalizações, limites, unicidade e transições de estado.
3. Informe como recursos inexistentes ou duplicados devem ser tratados.

## Persistência

- Campos novos ou alterados.
- Valores obrigatórios, defaults, índices e relacionamentos.
- Comportamento de soft delete ou hard delete.
- Migração necessária, se houver.

## Segurança

- Requisitos de autenticação e autorização.
- CSRF, cookies, rate limiting, upload ou dados sensíveis envolvidos.

## Critérios de aceite

- [ ] O cenário principal produz o resultado esperado.
- [ ] Entradas inválidas são rejeitadas com o contrato definido.
- [ ] Usuários não autorizados não acessam operações protegidas.
- [ ] A persistência mantém as invariantes descritas.
- [ ] Swagger representa o comportamento implementado.
- [ ] Testes unitários e E2E relevantes passam.
- [ ] `npm run build` passa.

## Casos de teste obrigatórios

- Caminho feliz.
- Validação de entrada.
- Recurso inexistente ou conflito.
- Autenticação/autorização, quando aplicável.
- Regressão específica que motivou a tarefa, quando aplicável.

## Restrições e decisões

- Compatibilidade que deve ser preservada.
- Dependências que podem ou não ser adicionadas.
- Decisões já tomadas e alternativas que não devem ser usadas.

## Referências

- Arquivos, issues, documentação ou exemplos relacionados.
