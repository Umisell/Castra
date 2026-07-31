import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import type { CastItem } from "./types";

/**
 * Konfigurasi Aptos Client (SDK v6+)
 * Digunakan untuk query data blockchain dan menunggu konfirmasi transaksi.
 */
const config = new AptosConfig({ 
  network: Network.TESTNET 
});

export const aptos = new Aptos(config);

/**
 * Alamat Smart Contract Castra
 */
export const CASTRA_CONTRACT_ADDRESS = "0x3cd4d9c55fe7ccb4117a879a9f68576a58bc6aeb327a805a38f5a76e70254a4b";
export const CASTRA_CONTRACT_MODULE = "castra_pro";

export const CASTRA_VISIBILITY = {
  public: 0,
  premium: 1,
  private: 2,
  allowlist: 3,
  timelock: 4,
  purchasable: 5,
} as const;

let contractDeploymentCache: boolean | null = null;

/**
 * Mengecek apakah module Castra benar-benar sudah publish di network aktif.
 */
export const isCastraContractDeployed = async () => {
  if (contractDeploymentCache !== null) return contractDeploymentCache;

  try {
    await aptos.getAccountModule({
      accountAddress: CASTRA_CONTRACT_ADDRESS,
      moduleName: CASTRA_CONTRACT_MODULE,
    });
    contractDeploymentCache = true;
    return true;
  } catch {
    contractDeploymentCache = false;
    return false;
  }
};

const shortenAddress = (address: string) => {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)} / ${address.slice(-4)}`;
};

const describeActivity = (action: string) => {
  switch (action) {
    case "REGISTER_USER":
    case "REGISTER":
      return "registered a Castra identity on Aptos Testnet";
    case "MINT_SOCIAL_TOKEN":
      return "minted social CAST on Aptos Testnet";
    case "LIKE_CAST":
      return "sent an on-chain like";
    case "UPGRADE_TO_PREMIUM":
    case "UPGRADE_PREMIUM":
      return "upgraded to premium on-chain";
    case "PROTOCOL_HEARTBEAT":
    case "HEARTBEAT":
      return "synced a protocol heartbeat";
    default:
      return `submitted ${action.toLowerCase().replaceAll("_", " ")}`;
  }
};

/**
 * Mengambil transaksi Castra dari Aptos Testnet indexer.
 * Ini membuat aktivitas wallet lain terlihat lintas browser, bukan hanya dari cache lokal.
 */
export const getCastraActivityCasts = async (): Promise<CastItem[]> => {
  try {
    if (!(await isCastraContractDeployed())) return [];

    const response = await aptos.queryIndexer<{
      user_transactions: Array<{
        entry_function_function_name: string;
        sender: string;
        timestamp: string;
        version: string | number;
      }>;
    }>({
      query: {
        query: `
          query CastraActivityTransactions($contract: String!, $module: String!) {
            user_transactions(
              where: {
                entry_function_contract_address: { _eq: $contract },
                entry_function_module_name: { _eq: $module }
              },
              order_by: [{ version: desc }],
              limit: 40
            ) {
              entry_function_function_name
              sender
              timestamp
              version
            }
          }
        `,
        variables: {
          contract: CASTRA_CONTRACT_ADDRESS,
          module: CASTRA_CONTRACT_MODULE,
        },
      },
    });

    return (response.user_transactions || []).map((transaction) => {
      const user = transaction.sender;
      const action = transaction.entry_function_function_name.toUpperCase();
      const transactionTime = Date.parse(transaction.timestamp);
      const version = String(transaction.version);

      return {
        id: `activity-${version}`,
        userId: user,
        time: Number.isFinite(transactionTime) ? transactionTime : Number(version),
        channel: "shelby",
        visibility: "public",
        body: `${shortenAddress(user)} ${describeActivity(action)}`,
        badges: [
          { t: "On-chain", d: "Castra contract transaction" },
          { t: "Testnet", d: "Indexed by Aptos GraphQL" },
        ],
        likes: 0,
        replies: 0,
        recasts: 0,
        quotes: 0,
        liked: false,
        recasted: false,
      };
    });
  } catch (e) {
    console.warn("Gagal mengambil activity event Castra:", e);
    return [];
  }
};

/**
 * Payload untuk interaksi protokol yang aman.
 * Digunakan untuk "pump" statistik blockchain dengan memanggil heartbeat di contract.
 */
export const getProtocolHeartbeatPayload = () => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::protocol_heartbeat` as any,
      functionArguments: [], 
    },
  };
};

export const getPublishCastPermissionPayload = ({
  castId,
  blobName,
  visibility,
  allowlist = [],
  unlockAt,
  priceOctas = 0,
}: {
  castId: string;
  blobName: string;
  visibility: keyof typeof CASTRA_VISIBILITY;
  allowlist?: string[];
  unlockAt?: number;
  priceOctas?: number;
}) => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::publish_cast_permission` as any,
      functionArguments: [
        castId,
        blobName,
        CASTRA_VISIBILITY[visibility],
        allowlist,
        unlockAt ? Math.floor(unlockAt / 1000) : 0,
        priceOctas,
      ],
    },
  };
};

export const getPublishCastPermissionsPayload = ({
  castId,
  blobNames,
  visibility,
  allowlist = [],
  unlockAt,
  priceOctas = 0,
}: {
  castId: string;
  blobNames: string[];
  visibility: keyof typeof CASTRA_VISIBILITY;
  allowlist?: string[];
  unlockAt?: number;
  priceOctas?: number;
}) => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::publish_cast_permissions` as any,
      functionArguments: [
        castId,
        blobNames,
        CASTRA_VISIBILITY[visibility],
        allowlist,
        unlockAt ? Math.floor(unlockAt / 1000) : 0,
        priceOctas,
      ],
    },
  };
};

export const canReadBlobOnChain = async ({
  owner,
  viewer,
  blobName,
}: {
  owner: string;
  viewer: string;
  blobName: string;
}) => {
  try {
    if (owner.toLowerCase() === viewer.toLowerCase()) return true;
    if (!(await isCastraContractDeployed())) return false;

    const [allowed] = await aptos.view<[boolean]>({
      payload: {
        function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::can_read_blob`,
        functionArguments: [owner, viewer, blobName],
      },
    });

    return Boolean(allowed);
  } catch (e) {
    console.warn("Gagal validasi permission blob on-chain:", e);
    return false;
  }
};

/**
 * Fungsi untuk mendapatkan data snapshot akun secara aman via SDK.
 */
export const getAccountSnapshot = async (address: string) => {
  try {
    return await aptos.getAccountInfo({ accountAddress: address });
  } catch (e) {
    console.error("Gagal mengambil snapshot akun:", e);
    return null;
  }
};

/**
 * Fungsi untuk mengecek saldo APT di Aptos Testnet (dalam unit Octas).
 */
export const getAccountBalance = async (address: string): Promise<number> => {
  try {
    const amount = await aptos.getAccountAPTAmount({ accountAddress: address });
    return Number(amount);
  } catch (aptAmountError) {
    try {
    const resources = await aptos.getAccountResources({ accountAddress: address });
    const accountResource = resources.find((r) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
    if (accountResource) {
      return Number((accountResource.data as any).coin.value);
    }
      console.warn("Gagal mengambil saldo APT via primary API dan CoinStore fallback:", aptAmountError);
    return 0;
  } catch (e) {
    console.error("Gagal mengambil saldo akun:", e);
    return 0;
  }
  }
};

/**
 * Fungsi untuk meminta dana dari Faucet di Aptos Testnet.
 */
export const fundAccount = async (address: string) => {
  try {
    // Meminta 1 APT (100,000,000 Octas)
    return await aptos.fundAccount({ accountAddress: address, amount: 100_000_000 });
  } catch (e) {
    console.error("Gagal meminta dana faucet:", e);
    throw e;
  }
};

/**
 * Memanggil fungsi 'register_user' di Smart Contract.
 * Ini akan menyumbang transaksi nyata dan event on-chain.
 */
export const getRegisterUserPayload = () => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::register_user` as any,
      functionArguments: [], 
    },
  };
};

/**
 * Memanggil fungsi 'like_cast' di Smart Contract.
 */
export const getLikeCastPayload = (castId: string) => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::like_cast` as any,
      functionArguments: [castId],
    },
  };
};
/**
 * Memanggil fungsi 'mint_social_token' di Smart Contract.
 */
export const getMintSocialTokenPayload = () => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::mint_social_token` as any,
      functionArguments: [],
    },
  };
};

/**
 * Mengambil data UserProfile dari blockchain.
 * Digunakan untuk mengecek status Premium dan Verifikasi.
 */
export const getUserProfile = async (address: string) => {
  try {
    if (!(await isCastraContractDeployed())) return null;
    const resourceType = `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::UserProfile`;
    const resource = await aptos.getAccountResource({
      accountAddress: address,
      resourceType,
    });
    return resource as any;
  } catch {
    // Jika resource tidak ditemukan, berarti user belum terdaftar
    return null;
  }
};

/**
 * Mengambil saldo Social Token dari blockchain.
 */
export const getSocialBalance = async (address: string) => {
  try {
    if (!(await isCastraContractDeployed())) return 0;
    const resourceType = `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::SocialBalance`;
    const resource = await aptos.getAccountResource({
      accountAddress: address,
      resourceType,
    });
    return (resource as any).amount as number;
  } catch {
    return 0;
  }
};
/**
 * Payload untuk Upgrade ke Premium (Biaya 0.1 APT)
 */
export const getUpgradePremiumPayload = () => {
  return {
    data: {
      function: `${CASTRA_CONTRACT_ADDRESS}::${CASTRA_CONTRACT_MODULE}::upgrade_to_premium` as any,
      functionArguments: [],
    },
  };
};
