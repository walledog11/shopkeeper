// The exchange capability's outcome and the evidence needed to describe any
// later store work. The registry, support/operator guidance and provider result
// share this text so recording a replacement never becomes a shipping promise.
export const EXCHANGE_EFFECT_DESCRIPTION =
  "It opens a return and records the replacement. It does not fulfill or ship the replacement, charge or refund the customer, or settle a price difference. Further return processing, fulfillment and financial adjustments remain with the merchant in Shopify; this action does not establish their timing.";

export const EXCHANGE_REPLY_GUIDANCE =
  "A successful exchange can be confirmed with its return number when the customer reply can be completed. This tool supplies no return label, return address or shipping instructions. Return instructions and promises about future shipment require current store policy or an explicit merchant instruction, not an inference from opening the exchange. If the customer needs return instructions that are unavailable, leave the reply with the outstanding merchant follow-up shown on the approval card instead of promising instructions or shipment after receipt.";

export const EXCHANGE_FINANCIAL_GUIDANCE =
  "Before explaining an exchange's price difference, use get_exchange_quote for the exact order, returned item, replacement and quantity. Describe presentmentMoney.difference as Shopify's current estimate in the customer's currency. It excludes other outstanding order balances and later merchant adjustments, and does not establish the final amount owed. If the quote is unavailable, say the balance is unconfirmed and needs merchant review. Equal catalog prices or an exchange receipt with no money movement cannot establish a zero balance.";
