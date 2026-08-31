/* Verschlüsselung auf Basis der Web Crypto API (AES-256-GCM, Schlüssel via PBKDF2 aus Passwort). */
const AppCrypto = (() => {
  const PBKDF2_ITERATIONS = 200000;

  function toB64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromB64(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Leitet aus einem Passwort (und optional einem vorhandenen Salt) einen AES-Schlüssel ab.
  async function deriveKey(password, saltB64) {
    const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    return { key, saltB64: toB64(salt) };
  }

  async function encrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    return { iv: toB64(iv), data: toB64(new Uint8Array(ciphertext)) };
  }

  // Wirft bei falschem Schlüssel/Passwort (AES-GCM Authentifizierung schlägt fehl).
  async function decrypt(key, ivB64, dataB64) {
    const iv = fromB64(ivB64);
    const data = fromB64(dataB64);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plainBuf);
  }

  async function exportRawKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    return toB64(new Uint8Array(raw));
  }

  async function importRawKey(rawB64) {
    return crypto.subtle.importKey('raw', fromB64(rawB64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  return { deriveKey, encrypt, decrypt, exportRawKey, importRawKey };
})();
