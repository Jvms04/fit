const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_AUTHORITIES = [
  "product",
  "architecture",
  "technicalArchitecture",
  "stack",
  "implementationPlan"
];
const REQUIRED_BASELINE_VERSIONS = {
  product: "1.0",
  architecture: "1.0",
  technicalArchitecture: "1.0",
  stack: "1.0",
  implementationPlan: "1.1"
};

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function validateRepositoryLayout(inputPaths, policy) {
  const paths = inputPaths.map(normalizePath);
  const errors = [];

  for (const requiredFile of policy.requiredFiles ?? []) {
    if (!paths.includes(requiredFile)) {
      errors.push(`required governance file is missing: ${requiredFile}`);
    }
  }

  for (const path of paths) {
    const segments = path.split("/");
    const topLevel = segments[0];

    if (!(policy.allowedTopLevel ?? []).includes(topLevel)) {
      const birthWp = policy.reservedTopLevelBirths?.[topLevel];
      errors.push(
        birthWp
          ? `top-level path '${topLevel}' is reserved for ${birthWp}; active WP is ${policy.activeWp}`
          : `top-level path '${topLevel}' is not allowlisted for ${policy.activeWp}`
      );
    }

    for (const forbiddenSegment of policy.forbiddenPathSegments ?? []) {
      if (segments.includes(forbiddenSegment)) {
        errors.push(`path '${path}' contains forbidden segment '${forbiddenSegment}'`);
      }
    }
  }

  return errors;
}

export function validateSensitivePaths(inputPaths) {
  const errors = [];
  const sensitiveNames = [
    /^\.env(?:\..+)?$/i,
    /(?:^|[-_.])(secret|credential|private[-_.]?key)(?:[-_.]|$)/i,
    /\.(?:key|pem|p12|pfx|jks|keystore)$/i
  ];

  for (const rawPath of inputPaths) {
    const path = normalizePath(rawPath);
    const fileName = path.split("/").at(-1);

    if (/\.example$/i.test(fileName)) {
      continue;
    }

    if (sensitiveNames.some((pattern) => pattern.test(fileName))) {
      errors.push(`sensitive file path must not be tracked: ${path}`);
    }
  }

  return errors;
}

export function validateCodeowners(content) {
  const effectiveLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return effectiveLines.length === 1 && effectiveLines[0] === "* @Jvms04"
    ? []
    : ["CODEOWNERS must define exactly one effective rule: * @Jvms04"];
}

export function validateBaselineManifest(manifest) {
  const errors = [];

  if (manifest?.schemaVersion !== 1) {
    errors.push("baseline manifest schemaVersion must be 1");
  }

  if (JSON.stringify(manifest?.authorityOrder) !== JSON.stringify(REQUIRED_AUTHORITIES)) {
    errors.push("baseline authority order does not match the frozen hierarchy");
  }

  if (!Array.isArray(manifest?.baselines) || manifest.baselines.length !== 5) {
    errors.push("baseline manifest must contain exactly five baselines");
    return errors;
  }

  const authorities = manifest.baselines.map((baseline) => baseline.authority);
  if (JSON.stringify(authorities) !== JSON.stringify(REQUIRED_AUTHORITIES)) {
    errors.push("baseline entries must follow the frozen authority order");
  }

  const archiveNames = new Set();
  let totalDocuments = 0;

  for (const baseline of manifest.baselines) {
    const label = baseline.archive ?? baseline.authority ?? "unknown";
    if (baseline.status !== "Approved") {
      errors.push(`${label} has non-authoritative status '${baseline.status}'`);
    }
    const requiredVersion = REQUIRED_BASELINE_VERSIONS[baseline.authority];
    if (baseline.version !== requiredVersion) {
      errors.push(`${label} must have version ${requiredVersion}`);
    }
    if (!SHA256_PATTERN.test(baseline.sha256 ?? "")) {
      errors.push(`${label} has an invalid sha256`);
    }
    if (archiveNames.has(baseline.archive)) {
      errors.push(`duplicate baseline archive: ${baseline.archive}`);
    }
    archiveNames.add(baseline.archive);

    if (!Array.isArray(baseline.documents)) {
      errors.push(`${label} must list its documents`);
      continue;
    }
    if (baseline.documentCount !== undefined && baseline.documentCount !== baseline.documents.length) {
      errors.push(`${label} documentCount does not match listed documents`);
    }

    totalDocuments += baseline.documents.length;
    const documentPaths = new Set();
    for (const document of baseline.documents) {
      if (!document.path || documentPaths.has(document.path)) {
        errors.push(`${label} contains a missing or duplicate document path`);
      }
      documentPaths.add(document.path);
      if (!SHA256_PATTERN.test(document.sha256 ?? "")) {
        errors.push(`${label}/${document.path ?? "unknown"} has an invalid sha256`);
      }
    }
  }

  if (manifest.documentCount !== undefined && manifest.documentCount !== totalDocuments) {
    errors.push("manifest documentCount does not match listed documents");
  }

  return errors;
}
