import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { Network } from "@aptos-labs/ts-sdk";

export const shelbyClient = new ShelbyClient({ 
  network: Network.TESTNET,
  apiKey: import.meta.env.VITE_SHELBY_API_KEY
});
