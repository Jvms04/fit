# Governança de `main` — modo compensatório ativo

Autoridade: `IPD-014` e §7/§7.1 de `ENVIRONMENT_DELIVERY_AND_OPERATIONS_PLAN.md` da Approved Implementation Plan Baseline 1.2.

## Evidência de elegibilidade — 2026-09-09

- contexto de entrega: Alpha privada;
- único owner/desenvolvedor e autoridade de integração: `Jvms04`;
- repositório: `Jvms04/fit`, privado, com `main` como branch principal;
- plano: GitHub Free, confirmado pela decisão humana;
- estado remoto observado: `main` possui `protected: false` e proteção desabilitada;
- consulta remota de rulesets: `403 — Upgrade to GitHub Pro or make this repository public to enable this feature`;
- tornar o repositório público ou contratar GitHub Pro não está autorizado.

As quatro condições cumulativas do §7.1 estão satisfeitas. O modo compensatório está documentalmente ativo para o WP-001 e não constitui proteção remota.

## Processo autorizado

1. `main` permanece principal e sempre integrável.
2. Cada mudança planejada nasce em branch curta por WP.
3. A integração acontece somente pelo PR correspondente.
4. O CI aplicável deve estar verde no head exato que será integrado; resultado anterior, parcial ou de outro commit não satisfaz o controle.
5. Depois do CI verde e antes do merge, `Jvms04` registra no PR revisão humana explícita do diff, dos checks e das evidências referentes ao mesmo head.
6. O PR mantém a rastreabilidade entre commit, WP, testes, baseline e evidence package.

## Proibições e incidentes

Push direto, force-push e exclusão de `main` são processualmente proibidos. Qualquer tentativa ou ocorrência deve ser registrada como incidente operacional com causa, impacto, commits afetados, verificação de integridade, ação corretiva e prevenção de recorrência. Incidente não tratado impede o gate afetado.

## Risco residual

Não existe enforcement remoto. O owner continua tecnicamente capaz de contornar PR, CI e revisão, fazer push direto, force-push ou excluir `main`. Os controles reduzem, mas não eliminam, erro humano, bypass processual ou comprometimento de supply chain. Nenhum documento, check ou decisão pode apresentar este modo como branch protection/ruleset ou equivalente técnico.

A elegibilidade deve ser reavaliada antes de cada release candidate e sempre que equipe, plano, provedor, visibilidade ou disponibilidade de proteção remota mudar.
