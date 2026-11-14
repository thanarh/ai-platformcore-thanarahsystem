import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

export function whatsappEncryptionKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters to encrypt WhatsApp data');
  }
  return createHmac('sha256', secret).update('thanarah-whatsapp-storage-v1').digest();
}

export function encryptWhatsappData(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptWhatsappData(value: string, key: Buffer): string {
  const [version, ivText, tagText, ciphertextText] = String(value).split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) {
    throw new Error('Unsupported encrypted WhatsApp data format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
