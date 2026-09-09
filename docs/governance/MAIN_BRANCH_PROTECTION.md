# Proteção de `main` — restrição externa do ambiente

Estado observado em 2026-09-09: `main` existe com `protected: false`. A conta usa GitHub Free e o repositório `Jvms04/fit` deve permanecer privado; branch protection/rulesets para repositório privado não estão disponíveis nesse plano. Tornar o repositório público exclusivamente para obter essa funcionalidade não está autorizado.

A baseline exige proteção remota em `IPD-014` e em §7 de `ENVIRONMENT_DELIVERY_AND_OPERATIONS_PLAN.md`, sem fallback ou waiver operacional. Portanto, WP-001 permanece `Blocked`.

Enquanto a restrição existir, aplicam-se os seguintes controles compensatórios:

- usar obrigatoriamente branch curta + pull request;
- não realizar push direto intencional em `main`;
- exigir `wp001-governance` verde antes de merge;
- exigir revisão humana explícita antes de merge;
- não realizar force-push intencional em `main`;
- não excluir intencionalmente `main`;
- manter `main` como branch padrão.

Esses controles são processuais e não equivalem tecnicamente a branch protection/ruleset. Eles não satisfazem `IPD-014` e não autorizam marcar WP-001 como `Verified` ou `Done`.

O bloqueio só pode ser removido por enforcement remoto compatível com repositório privado ou por mudança formal da baseline pela governança competente.
