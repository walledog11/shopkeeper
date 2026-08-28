import type {
  AttachReturnLabelInput,
  CreateExchangeInput,
  CreateReturnInput,
} from "../../../tools/index.js";
import { shopifyGraphql, type ShopifyContext } from "../../client.js";
import { OPEN_RETURN_STATUSES } from "../../return-labels.js";
import { fetchReturnableLineItems } from "../../returns.js";
import { optionalString, requireNumericId } from "../../validation.js";
import { RETURN_RECONCILIATION_QUERY } from "../queries.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

interface ProbeReturn {
  id: string;
  name: string | null;
  status: string | null;
  trackingNumbers: string[];
}

// The tool's own lookup selects the first open return and stops; the probe needs
// every one of them to tell "exactly ours" from "ours plus another". Same
// question, so `OPEN_RETURN_STATUSES` is shared - but a different shape, and the
// tool's query is not widened to carry reverse deliveries it never reads.
async function fetchProbeReturns(ctx: ShopifyContext, orderGid: string): Promise<ProbeReturn[]> {
  const data = await shopifyGraphql<{
    order?: {
      returns?: {
        edges: {
          node: {
            id: string;
            name?: string | null;
            status?: string | null;
            reverseFulfillmentOrders?: {
              edges: {
                node: {
                  reverseDeliveries?: {
                    edges: { node: { deliverable?: { tracking?: { number?: string | null } | null } | null } }[];
                  } | null;
                };
              }[];
            } | null;
          };
        }[];
      } | null;
    } | null;
  }>(ctx, RETURN_RECONCILIATION_QUERY, { id: orderGid }, { maxRetries: 1 });

  return (data.order?.returns?.edges ?? []).map((edge) => ({
    id: edge.node.id,
    name: edge.node.name ?? null,
    status: edge.node.status ?? null,
    trackingNumbers: (edge.node.reverseFulfillmentOrders?.edges ?? [])
      .flatMap((rfo) => rfo.node.reverseDeliveries?.edges ?? [])
      .map((delivery) => delivery.node.deliverable?.tracking?.number)
      .filter((number): number is string => Boolean(number)),
  }));
}

export async function probeReturn(
  input: CreateReturnInput | CreateExchangeInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const orderGid = `gid://shopify/Order/${orderId}`;
  const variantId = optionalString(input.variant_id);
  const variantGid = variantId
    ? `gid://shopify/ProductVariant/${requireNumericId(variantId, "variant_id")}`
    : null;

  // createReturn does not reach returnCreate unless these items were returnable
  // a moment earlier, so their state now is what says whether the mutation
  // landed - and it is read with the tool's own query rather than a second one.
  const returnable = await fetchReturnableLineItems(ctx, orderGid);
  if (returnable === null) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }
  const stillReturnable = variantGid
    ? returnable.filter((item) => item.variantId === variantGid)
    : returnable;
  const open = (await fetchProbeReturns(ctx, orderGid))
    .filter((entry) => OPEN_RETURN_STATUSES.has(entry.status ?? ""));

  if (stillReturnable.length === 0 && open.length > 0) {
    // An open return that pre-dated the call cannot produce this reading: it
    // would have made these items unreturnable before the tool ever mutated,
    // and the tool would have stopped at "no returnable items".
    const label = open.length === 1 ? ` ${open[0]!.name ?? open[0]!.id}` : "";
    return committed(`Reconciled return${label} on order ${orderId}.`);
  }
  if (stillReturnable.length > 0 && open.length === 0) {
    // The one negative in this file that rests on a *positive* observation -
    // the items are still there to be returned - rather than on something not
    // being found, which is why it may conclude where probeReturnLabel below
    // may not.
    return noEffect(`Order ${orderId} has no open return and its requested items are still returnable.`);
  }
  return stillUnknown(
    `Order ${orderId} cannot be reconciled against the requested return: ${stillReturnable.length} returnable item(s) remain alongside ${open.length} open return(s).`,
  );
}

export async function probeReturnLabel(
  input: AttachReturnLabelInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const trackingNumber = optionalString(input.tracking_number);
  // Shopify re-hosts the label it is handed, so `publicFileUrl` is never the
  // `label_url` that was requested and cannot identify this call's delivery. The
  // tracking number is the only field we send that comes back verbatim; without
  // one, a reverse delivery on the return is not attributable to this call.
  if (!trackingNumber) {
    return stillUnknown(
      `Return-label reconciliation for order ${orderId} needs a tracking number: Shopify does not echo the requested label URL back, so one reverse delivery cannot be told from another.`,
    );
  }

  const deliveries = (await fetchProbeReturns(ctx, `gid://shopify/Order/${orderId}`))
    .filter((entry) => OPEN_RETURN_STATUSES.has(entry.status ?? ""))
    .flatMap((entry) => entry.trackingNumbers);
  const matches = deliveries.filter((number) => number === trackingNumber);

  if (matches.length === 1) {
    return committed(`Reconciled return label with tracking ${trackingNumber} on order ${orderId}.`);
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple reverse deliveries on order ${orderId} carry tracking number ${trackingNumber}.`);
  }
  // Deliberately not no_effect. This is an absence, and every probe defect this
  // package has found was one: absence arrives through a read that may not yet
  // show the write, and clearing the action here invites a second label sent to
  // the customer. There is no positive counterpart to lean on the way probeReturn
  // has one, so it says so instead.
  return stillUnknown(
    `No reverse delivery carrying tracking number ${trackingNumber} was found on order ${orderId}. This does not prove the label was not attached — review the return before attaching another.`,
  );
}
