export const DERIVATION_MSG = "Authorize Castra Privacy Encryption Key";

export async function deriveKey(signature: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(signature.slice(0, 32)); // Use part of signature as seed
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rawKey,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("castra-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data as BufferSource
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted as ArrayBuffer), iv.length);
  return combined;
}

export async function decryptData(combined: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data as BufferSource
  );
  
  return new Uint8Array(decrypted as ArrayBuffer);
}

export async function deriveStaticKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(secret.padEnd(32, '0').slice(0, 32));
  
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
