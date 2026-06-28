/**
 * @vitest-environment jsdom
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPlan } from '@/types';
import ActionPlanCard from './ActionPlanCard';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(plan: AgentPlan, onApprove = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(React.createElement(ActionPlanCard, {
      plan,
      customerName: 'Alex',
      isExecuting: false,
      onApprove,
    }));
  });
  return { container, onApprove };
}

function click(element: Element | null) {
  if (!element) throw new Error('Expected clickable element');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('ActionPlanCard', () => {
  it('renders and sends the approved reply tool call', () => {
    const plan: AgentPlan = {
      instruction: 'Reply to the customer',
      steps: [{
        id: 'reply-1',
        tool: 'send_reply',
        label: 'Send reply',
        description: '"Your order ships today."',
        category: 'communication',
        enabled: true,
      }],
      rawToolCalls: [{
        id: 'reply-1',
        name: 'send_reply',
        input: { text: 'Your order ships today.' },
      }],
    };
    const view = render(plan);

    expect(view.container.textContent).toContain('drafted a reply to Alex');
    expect(view.container.textContent).toContain('Your order ships today.');
    click(view.container.querySelector('[data-testid="action-plan-run"]'));

    expect(view.onApprove).toHaveBeenCalledWith(plan.rawToolCalls);
  });

  it('requires confirmation before a consequential Shopify action', () => {
    const plan: AgentPlan = {
      instruction: 'Refund the order',
      steps: [{
        id: 'refund-1',
        tool: 'create_refund',
        label: 'Refund order',
        description: 'Refund order #1001',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [{
        id: 'refund-1',
        name: 'create_refund',
        input: { order_id: '1001' },
      }],
    };
    const view = render(plan);
    const runButton = () => view.container.querySelector('[data-testid="action-plan-run"]');

    click(runButton());
    expect(view.onApprove).not.toHaveBeenCalled();
    expect(runButton()?.textContent).toContain('Confirm');

    click(runButton());
    expect(view.onApprove).toHaveBeenCalledWith(plan.rawToolCalls);
  });

  it('allows a reviewed action step to be disabled', () => {
    const plan: AgentPlan = {
      instruction: 'Refund the order',
      steps: [{
        id: 'refund-1',
        tool: 'create_refund',
        label: 'Refund order',
        description: 'Refund order #1001',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [{
        id: 'refund-1',
        name: 'create_refund',
        input: { order_id: '1001' },
      }],
    };
    const view = render(plan);
    const toggle = view.container.querySelector('[data-testid="action-plan-step-toggle"]');

    click(toggle);

    expect(window.confirm).toHaveBeenCalled();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(
      (view.container.querySelector('[data-testid="action-plan-run"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

});
