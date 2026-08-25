import {
  fetchConnectedInstagramAccount,
  fetchInstagramMessageSubscription as fetchInstagramMessageSubscriptionShared,
  fetchInstagramMessagingUserProfile,
  refreshInstagramAccessToken,
  type InstagramGraphResult,
  type InstagramMessageSubscription,
  type InstagramProviderError,
} from '@shopkeeper/integrations/instagram';

export {
  fetchConnectedInstagramAccount,
  fetchInstagramMessagingUserProfile,
  refreshInstagramAccessToken,
  type InstagramProviderError,
};

export function fetchInstagramMessageSubscription(
  instagramAccountId: string,
  accessToken: string,
): Promise<InstagramGraphResult<InstagramMessageSubscription>> {
  return fetchInstagramMessageSubscriptionShared({
    accountId: instagramAccountId,
    accessToken,
  });
}
