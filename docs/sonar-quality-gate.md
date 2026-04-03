# SonarCloud e Quality Gate

## O que este repositório já faz

- Executa testes com cobertura no CI.
- Envia a análise para o SonarCloud.
- Falha o workflow se o Quality Gate reprovar.

## Como validar localmente

Antes de abrir PR, você pode conferir a cobertura com:

```bash
npm run test:coverage
```

Esse comando gera o arquivo `coverage/lcov.info`, que é o artefato lido pelo Sonar via `sonar.javascript.lcov.reportPaths=coverage/lcov.info`.

## Configuração necessária no GitHub

Crie os itens abaixo no repositório antes de usar o workflow:

- Secret `SONAR_TOKEN`
- Variable `SONAR_PROJECT_KEY`
- Variable `SONAR_ORGANIZATION`

## Configuração necessária no SonarCloud

No projeto do SonarCloud:

1. Vá em `Project Settings` -> `New Code`.
2. Configure `Reference branch` como `main` para avaliar somente código novo no gate.
3. Vá em `Quality Gates`.
4. Aplique o gate `Sonar way`, ou crie um gate custom com os thresholds abaixo.

## Threshold inicial recomendado

Use um gate inicial realista para evitar bloquear a evolução do legado:

- `New Bugs` = `0`
- `New Vulnerabilities` = `0`
- `New Security Hotspots Reviewed` = `100%`
- `New Code Smells` = manter sob controle pelo rating padrão do gate
- `Coverage on New Code` = `60%`
- `Duplicated Lines on New Code` = `<= 3%`

## Estratégia de evolução

- Comece cobrando cobertura apenas em `New Code`.
- Quando o time estabilizar, suba a cobertura em etapas: `60%` -> `70%` -> `80%`.
- Não use cobertura global alta no início, porque o projeto atual está com cobertura total abaixo disso.

## Observação sobre o estado atual

Hoje os testes passam e a cobertura total está perto de `69.68%` em linhas.
Como há arquivos sem teste no bootstrap e em middlewares, exigir cobertura global alta agora tende a bloquear merge sem melhorar a qualidade incremental.
