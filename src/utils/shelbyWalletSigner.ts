import { aptos } from '../aptosClient';

export const createShelbyWalletSigner = (wallet: any) => {
  const address = wallet.account?.address;
  if (!address) {
    throw new Error('Wallet account is required for Shelby upload.');
  }

  return {
    account: address,
    signAndSubmitTransaction: async (input: any) => {
      const { data, options } = input;
      const transaction = await aptos.transaction.build.simple({
        sender: address.toString(),
        data,
        options,
      });

      const signed = await wallet.signTransaction({
        transactionOrPayload: transaction,
      });

      const pending = await aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator: signed.authenticator,
      });

      return { hash: pending.hash };
    },
  };
};
