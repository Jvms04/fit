# WP-002 — Protocol matrix

This matrix is operational evidence. It does not change a baseline and does not turn partial work into canonical `PASS`.

| Protocol | Direct scope in WP-002 | Executable now | Physical Android | Physical iOS | Current state |
|---|---|---|---|---|---|
| SP-007 | initial device matrix and empirical characterization | S23 startup/PSS/warm/crash-free parcel accepted; remaining matrix/protocol evidence pending | Galaxy S23 / Android 16 line accepted for the preregistered release-harness scope; Attempt 004 prohibited | required for final matrix; unavailable | IN-PROGRESS |
| VAL-001 | Expo 57 / RN 0.86.3 structural gate | S23 startup/PSS/warm/crash-free parcel available; UI/query/scroll/kill and remaining device matrix still pending | S23 30+30 and zero-crash parcel accepted; not an integral VAL result | required; unavailable | NOT-EXECUTED |
| VAL-003 | SQLCipher files/key/rekey/crash/performance | harness preparation only | version presence observed; extraction/key/rekey/crash protocol not started | required; unavailable | NOT-EXECUTED |
| VAL-004 | Keystore/SecureStore A/B, lock, backup, CSPRNG | static preparation only | formal device lifecycle not started | required; unavailable | NOT-EXECUTED |
| VAL-006 | Temporal/TZDB Node and Hermes vectors | Node 24 parcel accepted as partial; Hermes Android release harness prepared with the same hashed bundle/corpus and runtime rejection guards | exact CI head/artifact still requires a human gate before S23 execution | Hermes iOS unavailable | PARTIAL |
| VAL-011 | Cloud Run ↔ PostgreSQL/Supavisor path | no durable external resource authorized | not a substitute for remote path | not device-dependent | BLOCKED |
| VAL-016@P0 | P0 Auth/session/custody checkpoint | two accounts and sandbox absent | device evidence later | iOS portion unavailable | INCONCLUSIVE |

`VAL-025` remains `NOT-EXECUTED`. No fallback is active. Emulator evidence, if later produced, is complementary only.
