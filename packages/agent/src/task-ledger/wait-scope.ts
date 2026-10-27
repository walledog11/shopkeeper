// Who may end a recorded wait: the answerer of a question, the approver of
// a proposal.

import type { AgentActorKind } from "@prisma/client";

export interface TaskAnswerer {
  kind: AgentActorKind;
  key: string;
}

/**
 * The answerer scope for a question nobody in particular was asked. A support
 * question is pushed to every bound operator at once, so any member of the
 * organization may answer it, and naming one of them would record a scope the
 * product does not have. It can never collide with a real member key, which is
 * `member:<uuid>`.
 *
 * `actorMayEndWait` is what matches it, for the approval a parked proposal
 * records and the answer a parked question waits on alike.
 */
export const ANY_MEMBER_ACTOR_KEY = "member:*";

/**
 * The recorded wait scopes an authenticated actor satisfies.
 *
 * Both the predicate below and the query that finds the task an answer
 * continues are written from this one list, so the check and the lookup cannot
 * drift into different answers about who may end a wait.
 */
export function endsWaitScopeKeys(actor: { kind: AgentActorKind; key: string }): string[] {
  if (actor.kind === "member") return [actor.key, ANY_MEMBER_ACTOR_KEY];
  // The sentinel is a member-only widening, never a literal key. A non-member
  // actor whose key happened to be it would otherwise match a scope carrying it
  // by exact comparison, which is a wait it was never in scope for.
  return actor.key === ANY_MEMBER_ACTOR_KEY ? [] : [actor.key];
}

/**
 * Whether an authenticated actor is within the scope recorded for a wait.
 *
 * One predicate so approval and question continuation agree on what a recorded
 * scope means. `ANY_MEMBER_ACTOR_KEY` widens to every member of the
 * organization and to nothing else — the caller has already proven the actor
 * belongs to this tenant, and the sentinel cannot collide with a real
 * `member:<uuid>`.
 */
export function actorMayEndWait(
  scope: { kind: AgentActorKind; key: string },
  actor: { kind: AgentActorKind; key: string },
): boolean {
  return scope.kind === actor.kind && endsWaitScopeKeys(actor).includes(scope.key);
}
