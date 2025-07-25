import { NDK } from '@nostr-dev-kit/ndk';

const relays = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

export const initializeNDK = () => {
  const ndk = new NDK({
    explicitRelayUrls: relays,
    enableOutboxModel: true
  });
  
  ndk.connect().then(() => console.log('Connected to Nostr relays'));
  
  return ndk;
};

export const ndkInstance = initializeNDK();