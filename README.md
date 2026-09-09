# Fit

Repositório privado do Fit, atualmente no bloco `G0 → WP-001` da Fase 7.

Neste WP existem somente governança, documentação operacional e checks estáticos. O código de Produto ainda não nasceu.

## Verificação de WP-001

Requer Node.js 24:

```sh
npm ci --ignore-scripts
npm run verify:wp001
```

Consulte `docs/governance/REPOSITORY_GOVERNANCE.md` para boundaries e `docs/evidence/INDEX.md` para o estado operacional. Nenhuma VAL é executada por esses comandos.
