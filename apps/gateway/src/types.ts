declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

export interface PlanStep {
  label: string;
  description: string;
  category: string;
  tool?: string;
  enabled: boolean;
}

export interface AgentPlan {
  steps: PlanStep[];
  rawToolCalls: Array<{ id: string; name: string; [key: string]: unknown }>;
}
