# Proteção de `main` — ação humana pendente

Estado observado em 2026-09-09: `main` existe e não está protegida. O conector de execução não possui permissão administrativa para alterar branch protection/rulesets.

O owner `@Jvms04` deve configurar, antes de aceitar WP-001:

- exigir pull request antes de merge;
- exigir ao menos uma aprovação humana;
- dispensar aprovações antigas após novos commits;
- exigir resolução de conversas;
- exigir o status check `wp001-governance` atualizado;
- bloquear force push e exclusão da branch;
- aplicar as regras ao owner quando a configuração do plano GitHub permitir;
- manter `main` como branch padrão.

Após a configuração, a evidência deve registrar a URL ou captura textual do ruleset/protection e uma leitura remota confirmando o estado. Até lá, este item é `Blocked` para conclusão integral do gate, não um `PASS` implícito.
