# Configuração do Claude Code

Esta pasta contém as instruções compartilhadas usadas pelo Claude Code neste repositório.

## Estrutura

- `../CLAUDE.md`: contexto essencial, comandos e fluxo obrigatório do projeto.
- `agents/`: subagentes especializados para arquitetura, desenvolvimento, testes e revisão.
- `rules/`: regras carregadas quando o Claude trabalha nos caminhos indicados no frontmatter de cada arquivo.
- `skills/implementar/SKILL.md`: workflow reutilizável para implementar uma especificação com `/implementar`.
- `settings.json`: permissões compartilhadas e versionáveis.
- `settings.local.json`: preferências e permissões pessoais deste clone. O arquivo é ignorado pelo Git.

## Uso no VS Code

1. Abra a raiz do repositório no VS Code.
2. Abra uma conversa na extensão oficial Claude Code.
3. Execute `/context` para confirmar que `CLAUDE.md` e as regras foram carregados.
4. Execute `/agents` e confirme os agentes `arquiteto`, `desenvolvedor`, `tester` e `reviewer` na Library.
5. Execute `/skills` para confirmar que `/implementar` está disponível.
6. Crie uma especificação a partir de `docs/specs/TEMPLATE.md`.
7. Inicie a implementação com `/implementar @docs/specs/<nome>.md`.

Use `/memory` para inspecionar os arquivos de instruções, `/permissions` para conferir as permissões resolvidas e `/doctor` para diagnosticar configurações inválidas.

## Escopos

- Regras da equipe devem ser versionadas em `CLAUDE.md`, `agents/`, `rules/`, `skills/` ou `settings.json`.
- Preferências pessoais devem ficar em `settings.local.json` ou em `~/.claude/`.
- Requisitos de uma única funcionalidade devem ficar em `docs/specs/`, não nas regras permanentes.
