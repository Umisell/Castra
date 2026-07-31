// src/utils/encryption.ts
async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return combined;
}
async function decryptData(combined, key) {
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return new Uint8Array(decrypted);
}
async function deriveStaticKey(secret) {
  const enc = new TextEncoder();
  const rawKey = enc.encode(secret.padEnd(32, "0").slice(0, 32));
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// test-enc.ts
async function test() {
  try {
    const key = await deriveStaticKey("test");
    const data = new TextEncoder().encode("Hello world!");
    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);
    const text = new TextDecoder().decode(decrypted);
    console.log("Success! Decrypted text:", text);
  } catch (e) {
    console.error("Failed:", e);
  }
}
test();
