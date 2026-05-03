import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      'src/lib/agent/api/action-log.test.ts',
      'src/lib/agent/api/validation.test.ts',
      'src/lib/agent/prompting.test.ts',
      'src/lib/agent/run-policy.test.ts',
      'src/app/dashboard/tickets/_hooks/useConversationAgentFlow.test.ts',
      'src/app/dashboard/tickets/_hooks/useTicketActions.test.ts',
      'src/app/dashboard/tickets/_components/conversation/utils/conversationViewUtils.test.ts',
      'src/app/dashboard/tickets/_components/conversation/useVisualKeyboard.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
