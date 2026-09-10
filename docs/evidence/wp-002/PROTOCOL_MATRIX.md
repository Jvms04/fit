# WP-002 — Protocol matrix

This matrix is operational evidence. It does not change a baseline and does not turn partial work into canonical `PASS`.

| Protocol | Direct scope in WP-002 | Executable now | Physical Android | Physical iOS | Current state |
|---|---|---|---|---|---|
| SP-007 | initial device matrix and empirical characterization | initial S23 evidence reconciled; budget record preregistered; distinct 30+30 runner prepared | Galaxy S23 / Android 16 partial candidate; formal run prepared but not started | required for final matrix; unavailable | IN-PROGRESS |
| VAL-001 | Expo 57 / RN 0.86.3 structural gate | harness/typecheck/CI plus formal-run executable preparation only | S23 startup/PSS budgets approved; 30+30 run not started; other budgets remain unproposed | required; unavailable | NOT-EXECUTED |
| VAL-003 | SQLCipher files/key/rekey/crash/performance | harness preparation only | version presence observed; extraction/key/rekey/crash protocol not started | required; unavailable | NOT-EXECUTED |
| VAL-004 | Keystore/SecureStore A/B, lock, backup, CSPRNG | static preparation only | formal device lifecycle not started | required; unavailable | NOT-EXECUTED |
| VAL-006 | Temporal/TZDB Node and Hermes vectors | Node preparation is possible | Hermes run not started | Hermes iOS unavailable | NOT-EXECUTED |
| VAL-011 | Cloud Run ↔ PostgreSQL/Supavisor path | no durable external resource authorized | not a substitute for remote path | not device-dependent | BLOCKED |
| VAL-016@P0 | P0 Auth/session/custody checkpoint | two accounts and sandbox absent | device evidence later | iOS portion unavailable | INCONCLUSIVE |

`VAL-025` remains `NOT-EXECUTED`. No fallback is active. Emulator evidence, if later produced, is complementary only.
