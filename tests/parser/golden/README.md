# Golden Parser Dataset

This folder contains anonymized synthetic bank statements for parser accuracy
benchmarking.

- 5 banks (`raiffeisen-bih`, `unicredit-bih`, `asa-bih`, `revolut`, `wise`)
- 5 statements per bank (`-01` through `-05`)
- each statement has:
  - `<statement-id>.pdf`
  - `<statement-id>.expected.json`

`*.expected.json` is the ground-truth reference used for precision/recall/F1.

To regenerate:

```bash
pnpm run parser:golden:generate
```
