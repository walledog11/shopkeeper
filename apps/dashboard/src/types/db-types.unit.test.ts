import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ChannelType as DbChannelTypeRuntime,
  SenderType as DbSenderTypeRuntime,
  ThreadFilterFeedback as DbThreadFilterFeedbackRuntime,
  ThreadFilterStatus as DbThreadFilterStatusRuntime,
  ThreadStatus as DbThreadStatusRuntime,
} from "@clerk/db";
import type {
  ChannelType as DbChannelType,
  SenderType as DbSenderType,
  ThreadFilterFeedback as DbThreadFilterFeedback,
  ThreadFilterStatus as DbThreadFilterStatus,
  ThreadStatus as DbThreadStatus,
  VoiceProposal as DbVoiceProposal,
} from "@clerk/db";
import type {
  ActionLogEntry,
  ChannelType,
  Integration,
  Message,
  Organization,
  SenderType,
  Thread,
  ThreadFilterFeedback,
  ThreadFilterStatus,
  ThreadStatus,
  Ticket,
  VoiceProposal,
} from "./index";

describe("dashboard DB type boundaries", () => {
  it("aliases Prisma enum value types from @clerk/db", () => {
    expectTypeOf<ChannelType>().toEqualTypeOf<DbChannelType>();
    expectTypeOf<ThreadStatus>().toEqualTypeOf<DbThreadStatus>();
    expectTypeOf<SenderType>().toEqualTypeOf<DbSenderType>();
    expectTypeOf<ThreadFilterStatus>().toEqualTypeOf<DbThreadFilterStatus>();
    expectTypeOf<ThreadFilterFeedback>().toEqualTypeOf<DbThreadFilterFeedback>();
    expectTypeOf<VoiceProposal>().toEqualTypeOf<DbVoiceProposal>();
  });

  it("keeps DTO fields explicit while using DB enum contracts", () => {
    expectTypeOf<Integration["platform"]>().toEqualTypeOf<DbChannelType>();
    expectTypeOf<Message["senderType"]>().toEqualTypeOf<DbSenderType>();
    expectTypeOf<ActionLogEntry["channelType"]>().toEqualTypeOf<DbChannelType | null>();
    expectTypeOf<Thread["status"]>().toEqualTypeOf<DbThreadStatus>();
    expectTypeOf<Thread["filterStatus"]>().toEqualTypeOf<DbThreadFilterStatus>();
    expectTypeOf<Thread["filterFeedback"]>().toEqualTypeOf<DbThreadFilterFeedback>();
    expectTypeOf<Ticket["status"]>().toEqualTypeOf<DbThreadStatus>();
    expectTypeOf<Ticket["filterStatus"]>().toEqualTypeOf<DbThreadFilterStatus>();
    expectTypeOf<Organization["createdAt"]>().toEqualTypeOf<string>();
    expectTypeOf<Thread["createdAt"]>().toEqualTypeOf<string>();
    expectTypeOf<Message["sentAt"]>().toEqualTypeOf<string>();
  });

  it("exposes the Prisma enum runtimes from the DB package root", () => {
    expect(DbChannelTypeRuntime.email).toBe("email");
    expect(DbThreadStatusRuntime.open).toBe("open");
    expect(DbSenderTypeRuntime.customer).toBe("customer");
    expect(DbThreadFilterStatusRuntime.filtered).toBe("filtered");
    expect(DbThreadFilterFeedbackRuntime.confirmed_genuine).toBe("confirmed_genuine");
  });
});
