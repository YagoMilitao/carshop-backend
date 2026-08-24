---
paths:
  - 'src/data/models/**/*.ts'
  - 'src/infra/repositories/**/*.ts'
  - 'src/infra/gateway/**/*.ts'
---

# Persistência e integrações

- Mantenha detalhes de Mongoose e Cloudinary nos adapters de infraestrutura.
- Converta documentos de persistência para tipos do domínio em funções de mapeamento explícitas. Datas expostas pelo domínio/API devem seguir o formato já usado pelo projeto.
- Consultas de entidades ativas devem considerar `deletedAt: null` quando o modelo usa soft delete.
- Preserve unicidade, índices, validações e normalizações declaradas nos schemas ao adicionar campos.
- Use `.lean()` em leituras quando não for necessário comportamento de documento Mongoose e mantenha a ordenação definida pelos requisitos.
- Operações destrutivas e cascatas precisam ser explícitas, limitadas ao identificador solicitado e cobertas por teste.
- Não exponha credenciais ou respostas brutas do provider. Traduza erros externos para o contrato de erro da aplicação quando necessário.
- Ao alterar schema ou mapeamento, atualize tipos, ports, testes de repository e documentação de ambiente/contrato relacionados.
