import { toAttachmentDisplayUrl } from "@/lib/attachments/blob-ref";
import { getChannelInfo } from "@/lib/messaging/channels";
import { getCustomerName } from "@/lib/messaging/customer-name";
import { formatTime, formatTicketAge } from "@/lib/format/date";
import { isAgentTurnContent } from "@shopkeeper/agent/tools";
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape";
import { isAgentNoteContent, stripAgentNotePrefix, SENDER_TYPE } from "@shopkeeper/agent/thread-constants";
import type { Thread, Ticket } from "@/types";

export function threadToTicket(thread: Thread, agentName?: string): Ticket {
  const channel = getChannelInfo(thread.channelType);
  const lastMsg = thread.messages.filter((message) => message.senderType !== SENDER_TYPE.NOTE).at(-1);
  const planIsForLastMessage = getCurrentPlanForThread(thread, thread.messages) !== null;

  return {
    id: thread.id,
    channelType: thread.channelType,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    customerRecord: thread.customer,
    time: formatTicketAge(thread.lastMessageAt),
    lastMessageAt: thread.lastMessageAt,
    subject: thread.subject || "New Inquiry",
    preview: lastMsg?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: thread.aiSummary || `${agentName ?? "Shopkeeper"} is reading this ticket…`,
    status: thread.status,
    lastCustomerMessageAt:
      thread.messages.filter((message) => message.senderType === SENDER_TYPE.CUSTOMER).at(-1)?.sentAt ?? null,
    hasPlan: planIsForLastMessage,
    cachedPlan: thread.cachedPlan,
    cachedPlanMessageId: thread.cachedPlanMessageId,
    shopifyCustomerId: thread.shopifyCustomerId,
    filterStatus: thread.filterStatus,
    filterReason: thread.filterReason,
    messages: thread.messages.flatMap((message) => {
        if (message.senderType === SENDER_TYPE.NOTE && isAgentTurnContent(message.contentText)) return [];
        const isAgentNote =
          message.senderType === SENDER_TYPE.NOTE &&
          isAgentNoteContent(message.contentText);

        return [{
          id: message.id,
          sender: message.senderType,
          text: isAgentNote ? stripAgentNotePrefix(message.contentText!) : message.contentText,
          time: formatTime(message.sentAt),
          author:
            message.senderType === SENDER_TYPE.NOTE
              ? isAgentNote
                ? (agentName ?? "Agent")
                : "You"
              : undefined,
          isAgentNote,
          attachments: (message.attachments ?? []).map(toAttachmentDisplayUrl),
          sendStatus: message.sendStatus,
        }];
      }),
  };
}
