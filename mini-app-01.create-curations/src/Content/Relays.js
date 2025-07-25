import { ndkInstance } from '../Helpers/NDKInstance';

export const addRelay = async (relayUrl) => {
  try {
    await ndkInstance.pool.addRelay(relayUrl);
    return true;
  } catch (error) {
    console.error('Error adding relay:', error);
    return false;
  }
};

export const removeRelay = (relayUrl) => {
  ndkInstance.pool.removeRelay(relayUrl);
};

export const getActiveRelays = () => {
  return Array.from(ndkInstance.pool.relays.values()).map(r => r.url);
};