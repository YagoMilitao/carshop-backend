# Especificações para implementação

Use esta pasta para requisitos de uma funcionalidade específica. Regras permanentes do projeto pertencem ao `CLAUDE.md` ou a `.claude/rules/`; decisões exclusivas de uma tarefa pertencem aqui.

## Fluxo recomendado

1. Copie `TEMPLATE.md` para um nome descritivo, por exemplo `create-category-endpoint.md`.
2. Preencha objetivo, escopo, contrato, regras e critérios de aceite. Remova seções que não se aplicam.
3. No Claude Code, selecione Plan Mode se quiser aprovar o plano antes das edições.
4. Execute `/implementar @docs/specs/create-category-endpoint.md`.
5. Revise o plano, o diff e os resultados dos testes apresentados pelo agente.

Uma boa especificação descreve o comportamento esperado e as restrições, sem tentar adivinhar todos os arquivos que precisam mudar. O agente deve descobrir a implementação compatível com a arquitetura existente.
