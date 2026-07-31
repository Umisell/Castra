import { deriveStaticKey, encryptData, decryptData } from './src/utils/encryption';

async function test() {
  try {
    const key = await deriveStaticKey('test');
    const data = new TextEncoder().encode('Hello world!');
    const encrypted = await encryptData(data, key);
    const decrypted = await decryptData(encrypted, key);
    const text = new TextDecoder().decode(decrypted);
    console.log("Success! Decrypted text:", text);
  } catch (e) {
    console.error("Failed:", e);
  }
}

test();
