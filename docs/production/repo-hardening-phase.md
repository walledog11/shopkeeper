# Repo-Side Prelaunch Hardening Phase

Parallel phase for getting the repository back to a truthful, launch-ready state before external deployment/provider setup.

Status legend: `[x]` done, `[ ]` pending, `[~]` in progress or partially done.

## Phase Checklist

### CI and Dependency Safety

- [x] Fix stale `api/agent/actions` integration expectations.
- [x] Run the focused dashboard integration test for `api/agent/actions`.
- [x] Run `npm test`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Remediate `npm audit --audit-level=high` high/critical findings.
- [x] Add a CI `npm audit --audit-level=high` step after the audit is clean.

### Production Env and Docs Alignment

- [x] Update `scripts/check-production-env.mjs` for v1 scope: email + Shopify required; Meta/Twilio/USPS optional.
- [x] Require `SENTRY_DSN` and gateway `BLOB_READ_WRITE_TOKEN` in production preflight.
- [x] Align `docs/production/runbook.md` and `docs/production/deployment.md` with the same env contract.
- [x] Correct stale route/test counts in `docs/production/checklist.md`.

### Operational Guardrails

- [x] Decide whether the checklist marks alerting as "instrumentation complete" or waits for production Sentry rules.
- [x] Document BullMQ retry-exhausted job inspection and replay in the runbook.
- [x] Document Sentry alert rule setup and controlled-alert validation steps.

### Clerk Lifecycle Cleanup

- [ ] Implement signed Clerk lifecycle webhook handling or document why it is deferred.
- [ ] Cover org/user deletion handling with tests if implemented.

### Billing Enforcement

- [x] Add a shared billing write-gate for `past_due` and `canceled` orgs.
- [~] Apply the gate to write/mutation routes that create outbound or state-changing work. Covered outbound messaging, internal outbound messaging, auto-ack, agent plan/execution/chat/quick-approve/internal, and org settings; remaining dashboard mutation routes still need the route sweep.
- [ ] Add/adjust banners for `past_due` and `canceled` states.
- [~] Add route tests for blocked writes and allowed reads. Covered `/api/messages` blocked writes and `/api/org` read-vs-write behavior; broaden after the remaining route sweep.

### Onboarding Polish

- [ ] Refocus first-run flow around v1: connect Shopify, configure email forwarding, see first agent reply.
- [ ] De-emphasize post-launch channels during onboarding.
- [ ] Add a lightweight completion/progress state.

### Legal and Data Deletion

- [ ] Add published `/privacy` and `/terms` pages.
- [ ] Document data deletion request handling.
- [ ] Decide whether Shopify App Store GDPR webhooks are in this launch phase.

## Exit Criteria

- [ ] Checked items in `docs/production/checklist.md` are accurate against code and docs.
- [x] `npm audit --audit-level=high` passes.
- [x] `npm run lint`, `npm test`, and `npm run build` pass.
- [x] Production env preflight matches the actual v1 launch scope.
- [ ] Remaining unchecked production checklist items are truly external or intentionally deferred.
