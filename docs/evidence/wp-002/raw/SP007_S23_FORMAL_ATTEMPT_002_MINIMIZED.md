# SP-007 S23 formal attempt 002 — minimized evidence

- Date: 2026-09-11
- Human audit disposition: performance/warm evidence accepted; zero-crash evidence insufficient
- Runner classification: `FORMAL_RUN_EVIDENCE_CANDIDATE`
- Formal validation: false
- Raw artifact: external human custody; not versioned
- Raw artifact name: `sp007-s23-formal-attempt-002.json`
- Raw artifact size: 7674836 bytes
- Raw artifact SHA-256: `a9ecc61f10aff94a978a253b717cf01c60ad34e5e6ece01f148967a86fcb7041`
- Harness head: `7e5017bf801f872ee6d53f653890e91a2cd71a7e`
- CI artifact: `10265024441`
- Fallback authorized: false

## Accepted physical evidence for the S23 line

| Field | Accepted value |
|---|---:|
| Cold validity | 30/30 `COLD / MEASURED` |
| Warm validity | 30/30 `WARM / MEASURED` |
| Cold startup `TotalTime` p95 | 173 ms <= 600 ms |
| Warm startup `TotalTime` p95 | 112 ms <= 200 ms |
| Cold `TOTAL PSS` p95 | 110087 KB <= 133120 KB |
| Warm preflight | `WARM / MEASURED` |
| Artifact/runtime/provenance | verified |

This accepted evidence is not reopened by the crash-evidence correction. The approved budget record, 30+30 sample protocol, nearest-rank p95, PSS measurement, warm preparation, APK, and provenance chain remain unchanged.

## Zero-crash evidence blocker

The Attempt 002 report contained empty `expectedProtocolRecords` and `abnormalRecords` because the parser expected one `key=value` field per line. Physical Android 16 output places multiple fields on one line, including the sanitized shape preserved in [`application-exit-info-s23.txt`](../../../../tests/fixtures/wp-002/application-exit-info-s23.txt):

`process=com.fit.wp002probe reason=10 (...) subreason=21 (...) status=0`

Independent reanalysis of the immutable raw artifact found 16 retained new records, all `reason=10 / FORCE STOP`, and no abnormal exit among those retained records. The bounded `ApplicationExitInfo` history cannot prove the absence of an earlier crash across the full 30+30 sequence because older entries may have been evicted by later protocol force-stops. Therefore:

- performance/warm evidence: accepted for this S23 line;
- zero-crash criterion: `INSUFFICIENT-FOR-GATE`;
- formal validation: false;
- SP-007: `IN-PROGRESS`;
- no stack failure or fallback is established.

The 7.6 MB JSON is deliberately not committed because its Activity dumps contain unrelated-application information. This record stores only the externally verified hash/size, accepted measurements, audit result, and minimized sanitized parser fixture needed to reproduce the defect.
