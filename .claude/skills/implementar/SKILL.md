---
name: implementar
description: Implementa uma funcionalidade completa neste backend a partir de uma descrição ou especificação, incluindo código, testes, documentação e validação. Use somente quando o usuário invocar /implementar.
disable-model-invocation: true
---

# Implementar funcionalidade

A entrada da tarefa é: `$ARGUMENTS`.

Se a entrada apontar para um arquivo, leia-o integralmente. Se estiver vazia ou não definir um objetivo verificável, solicite a descrição ou o caminho de uma especificação antes de editar.

## Coordenação dos agentes

Para toda funcionalidade que altere código de produção, a conversa principal atua como coordenadora e delega sequencialmente:

1. `arquiteto`: analisa o requisito e devolve o plano, riscos e estratégia de testes.
2. `desenvolvedor`: recebe a especificação e o plano e implementa a mudança completa.
3. `tester`: recebe a especificação, o plano, o resumo da implementação e o diff; complementa os testes e executa as validações.
4. `reviewer`: recebe todo o contexto anterior e faz a revisão independente final.

Não execute `desenvolvedor` e `tester` em paralelo no mesmo worktree. Se o `reviewer` encontrar um problema `BLOCKER` ou `HIGH`, delegue a correção específica ao `desenvolvedor`, repita a validação afetada com o `tester` e peça confirmação final ao `reviewer`. Após duas rodadas de correção sem resolução, pare e reporte o bloqueio com evidências.

Mudanças triviais apenas em documentação ou configuração podem ser realizadas diretamente quando os agentes não acrescentariam verificação útil.

## 1. Entender

- Leia `CLAUDE.md`, a especificação e os arquivos diretamente envolvidos.
- Inspecione `git status` e preserve alterações preexistentes.
- Transforme o pedido em objetivo, escopo, fora de escopo e critérios de aceite.
- Trace uma funcionalidade semelhante de ponta a ponta antes de escolher a estrutura.
- Faça uma suposição razoável quando ela não mudar materialmente o produto; registre-a. Pergunte apenas quando a decisão ausente mudar contrato, segurança, dados ou escopo.

## 2. Planejar

- Delegue a análise ao `arquiteto` e apresente ao usuário um plano curto com os arquivos/camadas afetados, riscos e validações previstas.
- Se o usuário pediu apenas um plano ou a sessão está em Plan Mode, pare antes das edições.
- Fora de Plan Mode, prossiga após o plano, exceto quando for necessária uma decisão material do usuário.

## 3. Implementar

- Delegue a implementação ao `desenvolvedor`, passando a especificação completa, o plano aprovado e qualquer decisão do usuário.
- Faça a menor alteração coerente que satisfaça todos os critérios.
- Para endpoints, cubra conforme necessário: tipos/ports, caso de uso, adapter/model, controller, validação, rota, composição, Swagger e testes.
- Preserve compatibilidade e alterações do usuário fora do escopo.
- Não leia arquivos de secrets, não faça commit/push e não execute ações destrutivas.

## 4. Validar

- Delegue a criação e execução aprofundada dos testes ao `tester`.
- Rode primeiro os testes diretamente relacionados.
- Para TypeScript, rode `npm test` e `npm run build` ao finalizar.
- Rode `npm run test:e2e` quando o contrato HTTP, middleware ou composição do servidor mudar.
- Revise `git diff` para detectar alterações acidentais, código incompleto e documentação ausente.
- Não esconda falhas. Diferencie claramente regressões introduzidas de problemas preexistentes.
- Após os testes, delegue a revisão independente ao `reviewer` e processe os achados conforme a severidade.

## 5. Entregar

Informe de forma objetiva:

- o resultado implementado;
- os arquivos ou áreas principais alterados;
- os comandos de validação e seus resultados;
- limitações, suposições ou próximos passos realmente necessários.

Para requisitos extensos, prefira receber um arquivo criado a partir de `docs/specs/TEMPLATE.md`.
