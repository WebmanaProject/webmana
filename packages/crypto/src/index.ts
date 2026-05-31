import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
/** scrypt salt — fixed so the same env key always derives the same data key. */
const KEY_SALT = "webmana-connector-secrets-v1";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.WEBMANA_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "WEBMANA_SECRET_KEY is not set — cannot encrypt or decrypt connector secrets",
    );
  }
  cachedKey = crypto.scryptSync(secret, KEY_SALT, KEY_LENGTH);
  return cachedKey;
}

/**
 * Encrypt a map of secret values into a single opaque base64 blob suitable for
 * storage in `connector_instances.encrypted_secrets`. Output layout is
 * `iv (12) || authTag (16) || ciphertext`.
 */
export function encryptSecrets(secrets: Record<string, string>): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(secrets), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Decrypt a blob produced by {@link encryptSecrets} back into its secret map. */
export function decryptSecrets(blob: string): Record<string, string> {
  const key = deriveKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("encrypted secret blob is malformed (too short)");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}
