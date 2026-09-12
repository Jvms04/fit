import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const implementation = await import("../../temporal/wp-002/lib/rule-base.mjs").catch(() => ({}));

test("identifies the immutable Moment Timezone 2026c bundle by its byte hash", async () => {
  assert.equal(typeof implementation.loadRuleBase, "function", "loadRuleBase must exist");

  const ruleBase = await implementation.loadRuleBase();
  const bytes = await readFile(ruleBase.bundlePath);
  const independentHash = createHash("sha256").update(bytes).digest("hex");

  assert.equal(ruleBase.packageVersion, "0.6.3");
  assert.equal(ruleBase.tzdbVersion, "2026c");
  assert.equal(ruleBase.bundleSha256, independentHash);
  assert.equal(
    ruleBase.ruleBaseId,
    `iana-2026c+moment-timezone-0.6.3+sha256:${independentHash}`
  );
});

test("resolves gap, overlap, half-hour and date rollover vectors with frozen semantics", async () => {
  assert.equal(typeof implementation.loadRuleBase, "function", "loadRuleBase must exist");
  const ruleBase = await implementation.loadRuleBase();

  const cases = [
    {
      id: "ny-gap-next-valid",
      input: { local: "2026-03-08T02:30:00", zone: "America/New_York" },
      want: {
        classification: "NONEXISTENT_ADJUSTED_TO_NEXT_VALID",
        requestedLocal: "2026-03-08T02:30:00",
        resolvedLocal: "2026-03-08T03:00:00",
        instant: "2026-03-08T07:00:00Z",
        offset: "-04:00"
      }
    },
    {
      id: "ny-overlap-first",
      input: { local: "2026-11-01T01:30:00", zone: "America/New_York" },
      want: {
        classification: "REPEATED_FIRST_OCCURRENCE",
        requestedLocal: "2026-11-01T01:30:00",
        resolvedLocal: "2026-11-01T01:30:00",
        instant: "2026-11-01T05:30:00Z",
        offset: "-04:00"
      }
    },
    {
      id: "lord-howe-half-hour-gap",
      input: { local: "2026-10-04T02:15:00", zone: "Australia/Lord_Howe" },
      want: {
        classification: "NONEXISTENT_ADJUSTED_TO_NEXT_VALID",
        requestedLocal: "2026-10-04T02:15:00",
        resolvedLocal: "2026-10-04T02:30:00",
        instant: "2026-10-03T15:30:00Z",
        offset: "+11:00"
      }
    },
    {
      id: "lord-howe-half-hour-overlap",
      input: { local: "2026-04-05T01:45:00", zone: "Australia/Lord_Howe" },
      want: {
        classification: "REPEATED_FIRST_OCCURRENCE",
        requestedLocal: "2026-04-05T01:45:00",
        resolvedLocal: "2026-04-05T01:45:00",
        instant: "2026-04-04T14:45:00Z",
        offset: "+11:00"
      }
    },
    {
      id: "kiritimati-year-rollover",
      input: { local: "2026-12-31T23:30:00", zone: "Pacific/Kiritimati" },
      want: {
        classification: "EXACT",
        requestedLocal: "2026-12-31T23:30:00",
        resolvedLocal: "2026-12-31T23:30:00",
        instant: "2026-12-31T09:30:00Z",
        offset: "+14:00"
      }
    }
  ];

  for (const vector of cases) {
    const actual = ruleBase.resolveLocal(vector.input);
    assert.deepEqual(
      {
        classification: actual.classification,
        requestedLocal: actual.requestedLocal,
        resolvedLocal: actual.resolvedLocal,
        instant: actual.instant,
        offset: actual.offset
      },
      vector.want,
      vector.id
    );
  }
});

test("the same rule-base produces byte-identical vector results offline", async () => {
  assert.equal(typeof implementation.runCorpus, "function", "runCorpus must exist");
  const first = await implementation.runCorpus();
  const second = await implementation.runCorpus();

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.networkRequired, false);
  assert.equal(first.vectors.every(({ matchesExpected }) => matchesExpected), true);
});
