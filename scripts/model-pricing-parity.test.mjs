import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LLM_PRICING,
  LLM_PRICING_AS_OF,
  NANO_DOLLARS_PER_USD,
  usageToNanoDollars,
} from '@shopkeeper/db';
import {
  estimateModelUsageCostUsd,
  MODEL_PRICING_AS_OF,
} from '@shopkeeper/agent/model-cost';

const representativeUsage = {
  inputTokens: 101,
  outputTokens: 37,
  cacheCreationInputTokens: 53,
  cacheCreation1hInputTokens: 29,
  cacheReadInputTokens: 211,
};

test('production and paid-eval model pricing stay in parity', () => {
  assert.equal(MODEL_PRICING_AS_OF, LLM_PRICING_AS_OF);

  for (const model of Object.keys(LLM_PRICING)) {
    // Production counts whole nano-dollars; the eval path's float math on
    // sub-dollar rates ($0.10, $0.01 per MTok) differs only below one.
    const productionNano = usageToNanoDollars(representativeUsage, model);
    const evalNano = Math.round(estimateModelUsageCostUsd(model, representativeUsage) * NANO_DOLLARS_PER_USD);
    assert.equal(evalNano, productionNano, `${model} pricing diverged`);
  }
});

test('production and paid-eval accounting both reject an unpriced model', () => {
  const unknownModel = 'claude-unpriced-future-model';
  assert.throws(
    () => usageToNanoDollars(representativeUsage, unknownModel),
    /No committed API price/,
  );
  assert.throws(
    () => estimateModelUsageCostUsd(unknownModel, representativeUsage),
    /No committed API price/,
  );
});
