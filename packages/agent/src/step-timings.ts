import { db } from "@shopkeeper/db";
import logger from "./logger.js";

/**
 * The steps between a customer's message and the reply that are timed. Agent
 * turns are already timed in `agent_turn_usage`; these are the hops around them.
 */
export type TimedStep =
  /** Webhook received → the message is saved on its ticket. */
  | "instagram_ingest"
  /** SocialAPI's display-name read, part of the ingest. */
  | "customer_name_lookup"
  /** Message saved → the job that reads it starts. */
  | "read_queue_wait"
  /** The model call that reads the customer's message (signals and summary). */
  | "read_message"
  /** Comparing an email or zip the customer sent with Shopify. */
  | "order_check"
  /** Loading the thread, order and store before planning. */
  | "plan_context"
  /** One model call inside a planning, execution or operator turn. */
  | "model_call"
  /** A queued agent task waiting for a worker. */
  | "task_queue_wait"
  /** Gateway → dashboard → provider and back, for one customer send. */
  | "send_via_dashboard"
  /**
   * The dashboard's ownership checks for one send, timed from when the request
   * reaches its code. The detail says whether the function started cold for it.
   */
  | "send_route"
  /** The dashboard's SocialAPI call for one Instagram message. */
  | "instagram_send"
  /** Building a card for the merchant's phone and delivering it. */
  | "phone_card"
  /** The provider call that delivers one message to a phone. */
  | "phone_send";

interface StepTimingInput {
  organizationId: string;
  threadId: string | null;
  step: TimedStep;
  /** A model or operation name. Never message content. */
  detail?: string | null;
}

/**
 * Records one step's timing. A timing is diagnostics: losing one is logged and
 * never fails the step it measured.
 */
export async function recordStepTiming(input: StepTimingInput & { startedAt: Date; durationMs: number }): Promise<void> {
  try {
    await db.stepTiming.create({
      data: {
        organizationId: input.organizationId,
        threadId: input.threadId,
        step: input.step,
        detail: input.detail?.slice(0, 120) ?? null,
        startedAt: input.startedAt,
        durationMs: Math.max(0, Math.round(input.durationMs)),
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, step: input.step }, "[step-timing] not recorded");
  }
}

/** Runs `run` and records how long it took, whether it succeeded or threw. */
export async function timeStep<T>(input: StepTimingInput, run: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  try {
    return await run();
  } finally {
    await recordStepTiming({ ...input, startedAt, durationMs: Date.now() - startedAt.getTime() });
  }
}
