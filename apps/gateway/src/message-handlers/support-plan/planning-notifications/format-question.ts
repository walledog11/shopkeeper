import type { DbChannelType } from '@shopkeeper/db';
import { classifyPerson } from '@shopkeeper/agent/person-name';
import { formatHeaderLines } from './headers.js';
import type { ConversationStage } from './types.js';

export function formatQuestionMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string,
  question: string,
  stage: ConversationStage,
): string {
  return [
    ...formatHeaderLines(classifyPerson({ customerName, channelType }), channelType, summary, stage),
    '',
    `${question} I'll draft the reply once I know.`,
  ].join('\n');
}
