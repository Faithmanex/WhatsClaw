import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGO = 'aes-256-gcm';
const MASTER_KEY_FILE = path.resolve('config-master.key');
const ENC_PREFIX = 'enc:';
const SECRET_KEY_RE = /(_KEY|_TOKEN|_SECRET)$/;

export function isSecretKey(key: string): boolean {
    return SECRET_KEY_RE.test(key);
}

export function isEncrypted(value: string): boolean {
    return value.startsWith(ENC_PREFIX);
}

function deriveKey(seed: string): Buffer {
    return crypto.createHash('sha256').update(seed, 'utf8').digest();
}

/**
 * Master key resolution order:
 *   1. CONFIG_MASTER_KEY env var (set this to keep config portable across deploys)
 *   2. config-master.key file (auto-generated on first boot, gitignored)
 */
export function getOrCreateMasterKey(): Buffer {
    const envKey = process.env.CONFIG_MASTER_KEY;
    if (envKey) return deriveKey(envKey);

    if (fs.existsSync(MASTER_KEY_FILE)) {
        const raw = fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim();
        if (raw) return deriveKey(raw);
    }

    const generated = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(MASTER_KEY_FILE, generated, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(MASTER_KEY_FILE, 0o600); } catch (_) {}
    return deriveKey(generated);
}

export function encryptSecret(plain: string, key: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string, key: Buffer): string {
    if (!isEncrypted(value)) return value;
    const parts = value.split(':');
    if (parts.length !== 4) return value;
    try {
        const iv = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const ciphertext = Buffer.from(parts[3], 'base64');
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error(`[secrets] Failed to decrypt a secret (wrong CONFIG_MASTER_KEY?): ${err instanceof Error ? err.message : String(err)}`);
        return '';
    }
}

export function encryptConfigSecrets(config: Record<string, string>, key: Buffer): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
        if (isSecretKey(k) && v && v !== 'your_key_here' && !isEncrypted(v)) {
            out[k] = encryptSecret(v, key);
        } else {
            out[k] = v;
        }
    }
    return out;
}

export function decryptConfigSecrets(config: Record<string, string>, key: Buffer): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
        out[k] = isSecretKey(k) && isEncrypted(v) ? decryptSecret(v, key) : v;
    }
    return out;
}