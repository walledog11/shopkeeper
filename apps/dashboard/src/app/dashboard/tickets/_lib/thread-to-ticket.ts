import { getChannelInfo } from "@/lib/messaging/channels";
import { getCustomerName } from "@/lib/messaging/customer-name";
import { formatTime } from "@/lib/format/date";
import { isAgentTurnContent } from "@/lib/agent/turn-content";
import { AGENT_NOTE_PREFIX, SENDER_TYPE } from "@/lib/messaging/thread-constants";
import type { Thread, Ticket } from "@/types";

export function threadToTicket(thread: Thread, agentName?: string): Ticket {
  const channel = getChannelInfo(thread.channelType);
  const lastMsg = thread.messages.filter((message) => message.senderType !== SENDER_TYPE.NOTE).at(-1);

  return {
    id: thread.id,
    channelType: thread.channelType,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    time: lastMsg ? formatTime(lastMsg.sentAt) : "New",
    subject: thread.tag || "New Inquiry",
    preview: lastMsg?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: thread.aiSummary || "Clerk is analyzing this conversation...",
    status: thread.status,
    lastCustomerMessageAt:
      thread.messages.filter((message) => message.senderType === SENDER_TYPE.CUSTOMER).at(-1)?.sentAt ?? null,
    messages: thread.messages
      .filter((message) => !(message.senderType === SENDER_TYPE.NOTE && isAgentTurnContent(message.contentText)))
      .map((message) => {
        const isAgentNote =
          message.senderType === SENDER_TYPE.NOTE &&
          message.contentText?.startsWith(AGENT_NOTE_PREFIX);

        return {
          id: message.id,
          sender: message.senderType,
          text: isAgentNote ? message.contentText!.slice(AGENT_NOTE_PREFIX.length) : message.contentText,
          time: formatTime(message.sentAt),
          author:
            message.senderType === SENDER_TYPE.NOTE
              ? isAgentNote
                ? (agentName ?? "Agent")
                : "You"
              : undefined,
          isAgentNote,
          attachments: message.attachments ?? [],
        };
      }),
  };
}
