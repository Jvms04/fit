# Governança do repositório — WP-001

## Autoridade e escopo

Este repositório segue, nesta ordem, Produto → Arquitetura → Arquitetura Técnica → Stack → Plano de Implementação → artefatos operacionais da Fase 7. As cinco baselines aprovadas são somente leitura; o manifesto registra seus hashes, mas não as incorpora nem as substitui.

WP-001 cria apenas governança, ownership, documentação, templates e checks estáticos. Domínio, UI, dados, migrations, backend, mobile, cloud e funcionalidade de Produto permanecem proibidos neste WP.

## Ownership e branches

- Owner e CODEOWNERS central: `@Jvms04`.
- Branch principal: `main`.
- Branches de execução: curtas, no formato `wp-###-slug`.
- Cada PR deve cobrir um WP ou um recorte revisável explicitamente autorizado.
- A proteção de `main` deve exigir PR, aprovação humana e o check `wp001-governance`. A configuração remota permanece pendente até o owner aplicá-la; um documento operacional não equivale a proteção ativa.

## Nascimento de áreas

O monorepo lógico aprovado será criado de forma incremental. WP-001 não antecipa diretórios vazios:

| Área | Primeiro WP autorizado |
|---|---|
| `apps/mobile` | WP-003 |
| `services/api` | WP-004/WP-009 |
| `packages/domain`, `application`, `contracts`, `schemas`, `observability` | WP-003 |
| `packages/temporal` | WP-011 |
| `database/*` | WP-005/WP-007/WP-009 |
| `tests` | WP-002/WP-003 |
| `infra` | WP-028 |

`shared` é proibido como boundary genérico. Código futuro deve pertencer a um módulo com responsabilidade explícita e dependências na direção autorizada.

## Schema drift

WP-001 prepara a regra, mas não cria schemas. A partir do nascimento de `packages/schemas` em WP-003, contratos canônicos devem ser consumidos por geração ou checks de equivalência. Contratos manuscritos paralelos que possam divergir são proibidos. A política e o check devem evoluir no mesmo WP que introduzir um consumidor real.

## Segredos e conteúdo sensível

Secrets, chaves, certificados, dados reais e conteúdo sensível não entram no Git, fixtures, logs, screenshots ou documentação. O check atual rejeita nomes de arquivos sensíveis e o `.gitignore` bloqueia formatos comuns; scanners integrais da Stack serão ativados nos WPs correspondentes.

## VAL-025

WP-001 apenas prepara controles de supply chain: hashes imutáveis, ownership, permissões mínimas no workflow, actions fixadas por commit, lockfile e rejeição de caminhos sensíveis. `VAL-025` permanece `NOT-EXECUTED`; este WP não produz `PASS` nem `SUFFICIENT-FOR-GATE`.
