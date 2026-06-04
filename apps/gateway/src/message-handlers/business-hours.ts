// Gateway-facing re-export of the shared organization settings contract.
export {
  isWithinBusinessHours,
  resolveAgentSettings,
} from '@clerk/agent/settings';
export type { BusinessHoursSettings } from '@clerk/agent/settings';
