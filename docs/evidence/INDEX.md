# Evidence index — Fase 7

Este índice é operacional e não altera as baselines. `Done` e `Accepted` exigem evidência e revisão humana.

| Incremento | WP | Status | Evidência | VAL/checkpoint | Blockers | Data |
|---|---|---|---|---|---|---|
| G0 / INC-P0-01 | WP-001 | Done | [WP-001](WP-001.md); [PR #2](https://github.com/Jvms04/fit/pull/2) integrado | VAL-025: NOT-EXECUTED (preparação somente) | Nenhum blocker do WP; risco residual do modo compensatório permanece sem enforcement remoto | 2026-09-09 |
| G0 / INC-P0-01 | WP-002 | Done | [WP-002](WP-002.md); [PR #4](https://github.com/Jvms04/fit/pull/4) integrado; [matrix](wp-002/PROTOCOL_MATRIX.md); [SP-007](wp-002/SP-007.md); [VAL-006](wp-002/VAL-006.md); [VAL-003/004](wp-002/VAL-003-004.md); [Android partial closeout](wp-002/raw/VAL003_VAL004_ANDROID_S23_PARTIAL_MINIMIZED.md); [Attempt formal 003 minimizada](wp-002/raw/SP007_S23_FORMAL_ATTEMPT_003_MINIMIZED.md); [budgets pré-registrados](wp-002/SP007_S23_BUDGETS.json); S23 startup/PSS/warm/crash-free aceita; parcela Android de VAL-003/004 aceita como PARTIAL; Node 24 e OS-oracle temporal parciais; Hermes Android autorizado/preparado, mas sem canal ADB; readiness criptográfica estática reproduzida | SP-007: PARTIAL; VAL-001/003/004/006: PARTIAL; VAL-011: BLOCKED; VAL-016@P0: INCONCLUSIVE; VAL-025: NOT-EXECUTED | protocolo/matriz restantes; rekey-interruption, screen-lock-sealed-state e biometric-change inconclusivos; Auth A-B/duas contas ausentes; iOS/macOS/Xcode ausentes; Docker/PG/cloud ausentes | 2026-09-14 |
| GATE-ANDROID-FIRST-WP-003 | WP-003 | ELIGIBLE | [avaliação formal abaixo](#gate-android-first-wp-003); base `eeeeb580504a9322a202c9190707efbf15306d0c`; Implementation Plan Baseline 1.2 | G0 / INC-P0-01: NOT Accepted; VAL-011: BLOCKED; VAL-016@P0: INCONCLUSIVE; iOS: BLOCKED | Nenhum incidente bloqueador vigente; elegibilidade restrita ao lane Android-first/local-first e limites abaixo | 2026-09-17 |

WP-003 não foi iniciado. G0 / INC-P0-01 permanece `NOT Accepted`; a elegibilidade deste gate não o promove.

## GATE-ANDROID-FIRST-WP-003

- Resultado: `ELIGIBLE` para entrada condicional Android-first/local-first do WP-003.
- Data da avaliação: 2026-09-17.
- Base avaliada: `main@eeeeb580504a9322a202c9190707efbf15306d0c`.
- Autoridade: Approved Implementation Plan Baseline 1.2, vigente no manifesto; SHA-256 do pacote `ac78472e56cac30a3d1671b63253e0b225396e861d081412185d74ed0edaddd2`.
- Efeito: registra somente elegibilidade de entrada. WP-003 continua não iniciado; G0 / INC-P0-01 permanece `NOT Accepted`; nenhum estado de VAL/SP, fallback ou gate técnico é promovido.

| # | Condição de entrada | Estado | Evidência e limite preservado |
|---|---|---|---|
| 1 | Baseline 1.2 aprovada, congelada e vigente | PASS | `BASELINE_MANIFEST.json` registra a autoridade Implementation Plan 1.2 como Approved; `IMPLEMENTATION_PLAN_OVERVIEW.md` declara a baseline aprovada/congelada. |
| 2 | G0 / INC-P0-01 explicitamente não Accepted | PASS | [WP-002](WP-002.md) e seu estado preservam G0 / INC-P0-01 como não aceito; este registro mantém `NOT Accepted`. |
| 3 | WP-001 concluído com evidência preservada | PASS | [WP-001](WP-001.md) registra `Done`, PR #2 integrada e evidência do pacote preservada. |
| 4 | WP-002 concluído com evidência preservada | PASS | [WP-002](WP-002.md) registra `Done`, PR #4 integrada e resultados/proveniência; estados parciais, bloqueados e inconclusivos permanecem intactos. A conclusão de ineligibilidade registrada sob Baseline 1.1 é histórica; esta avaliação aplica os critérios condicionais revistos da Baseline 1.2. |
| 5 | Ausência de incidente bloqueador vigente | PASS | Revisão de 2026-09-17 das evidências preservadas de WP-001/WP-002 não identificou incidente vigente de segurança, integridade, perda, corrupção, exposição entre contas ou contradição da baseline que impeça o scaffold. |
| 6 | Entrada limitada a Android-first/local-first | PASS | Baseline 1.2, §5.1 e seção do GATE: somente scaffold privado local-first Android do WP-003. A autorização humana de UX/UI abaixo é ainda mais restrita. |
| 7 | Somente fixtures/seeds sintéticos | PASS | Baseline 1.2, §5.1: fixtures/seeds sintéticos somente. |
| 8 | Sem dados reais | PASS | Baseline 1.2, §5.1 e GATE proíbem dados reais nesta entrada. |
| 9 | Sem backend remoto | PASS | Baseline 1.2, §5.1 e GATE proíbem backend remoto nesta entrada. |
| 10 | Sem sync | PASS | Baseline 1.2, §5.1 e GATE proíbem sync nesta entrada. |
| 11 | Sem dogfooding | PASS | Baseline 1.2, §5.1 e GATE proíbem dogfooding/Alpha nesta entrada. |
| 12 | Primeiro checkpoint de segurança identificado | PASS | Baseline 1.2, §5.1/GATE identifica `VAL-016@P0` para login, sessão, autorização, isolamento A/B e custódia Fit assim que essas superfícies existirem. O checkpoint é hard stop para aceitar a fatia correspondente e para dados reais; permanece inconclusivo no estado atual. |
| 13 | Limites de VAL-011 registrados | PASS | WP-002 preserva `VAL-011: BLOCKED`; Baseline 1.2 limita esse bloqueio à capacidade do caminho remoto Cloud Run↔Supavisor/Postgres. Não bloqueia o scaffold Android local. |
| 14 | Limites de iOS registrados | PASS | WP-002 preserva iOS como bloqueado por ausência do ambiente Apple; Baseline 1.2 mantém essa obrigação para iOS/cross-platform/Alpha, sem bloquear esta entrada Android-first. |
| 15 | `apps/mobile` inexistente e reservado ao WP-003 | PASS | `apps/mobile` não existe na base avaliada; `REPOSITORY_GOVERNANCE.md` atribui seu primeiro nascimento ao WP-003. |
| 16 | Harness de WP-002 continua descartável e proibido como scaffold | PASS | [WP-002](WP-002.md) o define como harness G0 descartável, sem scaffold produtivo; seus arquivos não são promovidos para `apps/mobile`. |

### Autorização humana de UX/UI — limite desta entrada

Está autorizado **somente**:

1. intro da lontrinha;
2. transição para Welcome;
3. Welcome aprovada;
4. CTA “Começar”.

Esta autorização não libera outras telas, outros fluxos, backend remoto, sync, dados reais, dogfooding ou navegação posterior não aprovada. Ela não altera os limites técnicos/documentais da Baseline 1.2 nem os estados de G0, VAL-011, VAL-016 ou iOS.
