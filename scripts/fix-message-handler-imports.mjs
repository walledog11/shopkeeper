import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const groups = {
  inbound: [
    "channels",
    "classification",
    "conversation-attribution",
    "conversation-burst",
    "email-bounce",
    "inbound-persistence",
    "inbound-processing",
    "intelligence",
    "ai-summary-flow",
    "resolve-inbound-episode",
  ],
  "support-plan": [
    "generate-thread-plan",
    "planning",
    "planning-types",
    "planning-notifications",
    "planning-dashboard-client",
    "plan-limit",
    "agent-thread-sink",
    "agent-plan-adapter",
    "digest-triage",
  ],
  operator: [
    "agent-turn-deps",
    "execute-operator-agent-turn",
    "operator-action-history-tools",
    "operator-answer-replan",
    "operator-dashboard-nav-tools",
    "operator-free-form-turn",
    "operator-inbox-tools",
    "operator-ledger",
    "operator-product-help-tools",
    "operator-session-tools",
    "operator-shop-tools",
    "pending-plan-actions",
  ],
  outbound: ["outbound-email"],
  shared: ["request-display", "strip-markdown"],
};

const moduleToGroup = new Map();
for (const [group, modules] of Object.entries(groups)) {
  for (const mod of modules) moduleToGroup.set(mod, group);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, files);
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function rewriteFile(content, filePath) {
  let next = content;
  for (const [mod, group] of moduleToGroup) {
    const patterns = [
      `message-handlers/${mod}.js`,
      `message-handlers/${mod}'`,
    ];
    for (const pattern of patterns) {
      const grouped = pattern.endsWith("'")
        ? `message-handlers/${group}/${mod}.js'`
        : `message-handlers/${group}/${mod}.js`;
      if (next.includes(pattern) && !next.includes(`message-handlers/${group}/${mod}`)) {
        next = next.split(pattern).join(grouped);
      }
    }
  }

  const subdir = filePath.includes("/message-handlers/")
    ? filePath.split("/message-handlers/")[1]?.split("/")[0]
    : null;

  if (subdir && groups[subdir]) {
    for (const [mod, group] of moduleToGroup) {
      if (group === subdir) continue;
      const local = `from './${mod}.js'`;
      const cross = `from '../${group}/${mod}.js'`;
      next = next.split(local).join(cross);
    }
  }

  return next;
}

const gatewayRoot = "apps/gateway/src";
let updated = 0;
for (const file of walk(gatewayRoot)) {
  const original = readFileSync(file, "utf8");
  const next = rewriteFile(original, file);
  if (next !== original) {
    writeFileSync(file, next);
    updated += 1;
  }
}

console.log(`Updated ${updated} files`);
