# CARSHOP-43 — Checklist Manual do Operador (Render / Vercel)

## Aviso

Este é um checklist **manual**, de responsabilidade exclusiva do
**operador humano**. Nenhum item deste documento é executável, verificável
ou simulável por qualquer agente deste workflow (`task-reader`,
`spec-writer`, `architect`, `developer`, `tester`, `reviewer`,
`task-manager`, `knowledge-manager` ou qualquer outro). Nenhum agente
possui acesso aos dashboards do Render ou da Vercel. Este documento
satisfaz FR-006 e FR-007 e AC-006 de `specs/CARSHOP-43/spec.md`, servindo
como artefato derivado da especificação, e não deve conter nenhum valor
real de secret, apenas nomes de variáveis e instruções, conforme
`.claude/rules/spec-security.md`.

Este artefato não substitui `specs/CARSHOP-43/spec.md` e não altera seu
conteúdo.

## 0. Confirmar quais plataformas estão realmente ativas

De acordo com o `README.md` deste repositório (seção "Deploy no Render
(Web Service)"), o **Render é a única plataforma de deploy confirmada e
ativa** para este backend. Não há evidência no repositório de que a
Vercel hospede este serviço backend.

- [ ] **0.1** Antes de conferir qualquer variável de ambiente, o operador
      deve confirmar, junto ao provedor de hospedagem real em uso, quais
      plataformas estão efetivamente ativas para este backend (Render,
      Vercel ou outra). Não presumir que a Vercel hospeda este serviço
      apenas porque o nome consta no escopo original da tarefa; validar
      contra a topologia de deploy real e atual.
- [ ] **0.2** Caso a Vercel não hospede este backend (por exemplo, se for
      usada apenas para um frontend separado ou não for usada), registrar
      essa constatação e tratar a seção "Vercel" abaixo como não
      aplicável a este serviço, documentando o motivo.

## 1. Render — Variáveis de Ambiente

Conferir, no dashboard do Render, para o Web Service deste backend, cada
uma das variáveis abaixo (lista extraída de `.env.example` e da seção
"Deploy no Render" do `README.md`):

- [ ] **1.1** `NODE_ENV` está definida como `production`.
- [ ] **1.2** `PORT` está definida com um valor válido para o ambiente do
      Render.
- [ ] **1.3** `CORS_ORIGIN` está definida com uma URL `https://` absoluta
      e explícita da origem real do frontend em produção (sem curinga
      `*`, sem `http://`).
- [ ] **1.4** `MONGO_URI` está definida, aponta para o cluster de produção
      correto (não um cluster de desenvolvimento/staging) e não é um
      valor de exemplo/placeholder.
- [ ] **1.5** `ADMIN_EMAIL` está definida com o e-mail administrativo real
      de produção.
- [ ] **1.6** `ADMIN_PASSWORD` está definida com um valor forte real (não
      `123456`, não `password`, não `admin`, não `changeme` ou variação
      óbvia), atendendo aos critérios mínimos documentados no README
      (12+ caracteres, maiúscula, minúscula, dígito e símbolo).
- [ ] **1.7** `JWT_SECRET` está definida com um valor forte real, gerado
      aleatoriamente, com no mínimo 32 caracteres (não um valor de
      exemplo do `.env.example`).
- [ ] **1.8** `JWT_EXPIRES_IN` está definida e dentro do limite documentado
      (máx. 1h).
- [ ] **1.9** `JWT_REFRESH_EXPIRES_IN` está definida e dentro do limite
      documentado (máx. 30d).
- [ ] **1.10** `JWT_REFRESH_COOKIE_MAX_AGE_MS` está definida e consistente
      com `JWT_REFRESH_EXPIRES_IN`.
- [ ] **1.11** `ENABLE_SWAGGER` está definida deliberadamente (não deixada
      habilitada sem intenção); confirmar que, em produção, o valor
      reflete a decisão consciente do operador sobre expor ou não
      `/docs` e `/docs.json` publicamente. Caso o Swagger não deva ficar
      público em produção, confirmar que `ENABLE_SWAGGER=false` está
      explicitamente configurado (o padrão do código desabilita o Swagger
      quando `NODE_ENV=production`, mas o operador deve confirmar que
      nenhuma configuração manual sobrescreveu esse padrão
      inadvertidamente).
- [ ] **1.12** `CLOUDINARY_CLOUD_NAME` está definida com o valor real da
      conta Cloudinary de produção.
- [ ] **1.13** `CLOUDINARY_API_KEY` está definida com o valor real da
      conta Cloudinary de produção.
- [ ] **1.14** `CLOUDINARY_API_SECRET` está definida com o valor real da
      conta Cloudinary de produção.
- [ ] **1.15** `WORK_HARD_DELETE_AFTER_DAYS` está definida com um valor
      numérico condizente com a política de retenção de dados acordada
      para o produto.
- [ ] **1.16** `TRUST_PROXY_HOPS` está definida de forma condizente com a
      topologia real de proxy do Render (o README recomenda `1`, mas o
      operador deve confirmar contra a topologia real deste deploy
      específico, conforme observação já registrada no README).
- [ ] **1.17** Nenhuma das variáveis acima está com um valor de exemplo
      copiado diretamente de `.env.example` (ex.: `admin@carshop.com`,
      `123456`, `uma-chave-forte`) — todos os valores devem ser reais e
      específicos do ambiente de produção.

## 2. Render — Verificação de Secrets Vazados

- [ ] **2.1** Confirmar que nenhum valor atualmente configurado no Render
      (em especial `JWT_SECRET`, `ADMIN_PASSWORD`, `MONGO_URI`,
      `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) corresponde a um
      valor que já foi exposto em algum commit, log, mensagem de erro,
      documentação ou histórico do git deste repositório.
- [ ] **2.2** Caso qualquer valor configurado atualmente coincida com um
      valor já exposto publicamente (ou haja suspeita razoável disso),
      tratar como incidente de segurança imediatamente (ver item 4).

## 3. Vercel — Variáveis de Ambiente (condicional)

Aplicar esta seção **somente se** o item 0.1 confirmar que a Vercel
efetivamente hospeda algum componente relevante deste backend (por
exemplo, funções serverless que também leem estas variáveis). Caso a
Vercel não seja usada para este backend, marcar esta seção como "Não
aplicável" e registrar o motivo, em vez de executar os itens abaixo.

- [ ] **3.1** Repetir a conferência dos itens 1.1 a 1.17 (adaptados aos
      nomes de variáveis efetivamente usados na configuração da Vercel)
      para qualquer variável de ambiente equivalente configurada no
      dashboard da Vercel.
- [ ] **3.2** Confirmar que não existe divergência de valores entre o que
      está configurado na Vercel e o que está configurado no Render para
      a mesma variável lógica (por exemplo, `JWT_SECRET` diferente entre
      as duas plataformas pode quebrar validação de sessão, caso ambas
      sirvam a mesma aplicação).
- [ ] **3.3** Repetir a verificação de secrets vazados (itens 2.1 e 2.2)
      para os valores configurados na Vercel.

## 4. Rotação de Secrets Vazados

- [ ] **4.1** Qualquer secret identificado como vazado deve ser rotacionado
      imediatamente (conforme NFR-002 de `specs/CARSHOP-43/spec.md`). Isso
      inclui, no mínimo: gerar um novo valor forte, atualizá-lo na
      plataforma de hospedagem correspondente (Render e/ou Vercel,
      conforme aplicável), reiniciar/republicar o serviço para que o novo
      valor entre em vigor, e confirmar que o valor antigo exposto não é
      mais válido (ex.: revogar a chave antiga junto ao provedor externo,
      quando aplicável, como Cloudinary ou MongoDB Atlas).

## Registro de Execução

Este documento não é preenchido automaticamente. Ao concluir a
conferência manual, o operador deve registrar, fora deste repositório
(ex.: no sistema de gestão de tarefas, como comentário no Notion), a data
da execução e o resultado de cada seção, sem copiar nenhum valor real de
variável de ambiente para este arquivo ou para qualquer outro artefato
versionado.
