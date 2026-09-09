# WP-002 disposable mobile harness

This directory is a G0 validation probe for Expo SDK 57 / React Native 0.86.3. It is not the Fit mobile scaffold and must not be promoted into `apps/mobile` by assumption.

The screen and data are synthetic. The harness enables SQLCipher through Expo prebuild, creates 1,000 deterministic non-personal rows, reports SQLite/SQLCipher versions and timing markers, and exposes a long list for device characterization.

`Expo Go` is not valid evidence. Use a release prebuild on an explicitly selected physical device. The generated `android/` and `ios/` trees are disposable build outputs and remain ignored.

No numeric result is a budget until a human approves and preregisters that budget. The initial runner deliberately rejects the 30-run sample count reserved for the formal `VAL-001` protocol.
