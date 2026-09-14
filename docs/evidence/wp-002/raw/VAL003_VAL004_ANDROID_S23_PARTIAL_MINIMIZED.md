# VAL-003 / VAL-004 — Android S23 accepted partial evidence

- Work package: `WP-002`
- Source head: `5b008e9b6782994359d399f5998c9ffd1bb2234e`
- Device: `SM-S911B`
- Android: 16 / API 36
- Classification: `PARTIAL`
- Error: none
- Raw report: human-side custody; not copied into this repository
- Raw report size: 24327 bytes
- Raw report SHA-256: `3B9A722C56F609707BD6B6DB624700E539B047B9320A6900A4CB85C9E3AFCA7A`
- APK SHA-256: `07412e3891090700f77b1f52a0cd1325c1243a1edda180c731c86240d33a06b6`

This is accepted partial evidence for the Android parcel only. It does not promote VAL-003 or VAL-004 to complete, does not alter baseline/fallback semantics, and does not satisfy G0 / INC-P0-01.

## Measured

- `create-db-wal-shm-canaries`
- `extract-db-wal-shm`
- `wrong-key`
- `rekey`
- `securestore-keystore`
- `csprng`
- `restart-process`
- `restart-recovery`
- `integrity-after-recovery`

## Inconclusive

- `rekey-interruption`
- `screen-lock-sealed-state`
- `biometric-change`

The rekey-interruption result remains `INCONCLUSIVE` because `completionObservedBeforeForceStop=true` and `completionObservedAfterForceStop=true`.

Account isolation is `NOT_EVALUATED_WITHOUT_AUTH_A_B`. iOS/Auth A-B and the remaining validation matrix are separate blockers. The flags remain `canonicalPromotion=false`, `formalValidation=false`, `automaticPromotion=false`, and `fallbackActivated=false`.

The S23 was not re-executed for this closeout.
