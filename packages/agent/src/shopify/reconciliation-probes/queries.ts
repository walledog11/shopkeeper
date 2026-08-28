export const GIFT_CARDS_BY_CODE_QUERY = `query GiftCardsByCode($query: String!) {
  giftCards(first: 2, query: $query) {
    nodes { id initialValue { amount } note }
  }
}`;

export const RECENT_GIFT_CARDS_QUERY = `query RecentGiftCards {
  giftCards(first: 50, sortKey: CREATED_AT, reverse: true) {
    nodes { id initialValue { amount } note lastCharacters }
  }
}`;

export const CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY = `query CustomerStoreCreditTransactions($id: ID!) {
  customer(id: $id) {
    storeCreditAccounts(first: 1) {
      nodes {
        transactions(first: 10, reverse: true) {
          nodes {
            __typename
            amount { amount }
          }
        }
      }
    }
  }
}`;

export const RETURN_RECONCILIATION_QUERY = `query ShopkeeperReturnReconciliation($id: ID!) {
  order(id: $id) {
    returns(first: 10) {
      edges {
        node {
          id
          name
          status
          reverseFulfillmentOrders(first: 5) {
            edges {
              node {
                reverseDeliveries(first: 10) {
                  edges {
                    node {
                      deliverable {
                        ... on ReverseDeliveryShippingDeliverable {
                          tracking { number }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;
