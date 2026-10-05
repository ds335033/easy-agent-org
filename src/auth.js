import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hash = (value) => createHash('sha256').update(value).digest();
export async function createAuth({ adminToken = '', usersFile = '', localDev = false } = {}) {
  const users = [];
  if (adminToken) {
    if (adminToken.length < 24) throw new Error('ADMIN_TOKEN must contain at least 24 characters');
    users.push({ id: 'founder', digest: hash(adminToken), admin: true });
  }
  if (usersFile) {
    const records = JSON.parse(await readFile(usersFile, 'utf8'));
    if (!Array.isArray(records)) throw new Error('AUTH_USERS_FILE must contain an array');
    for (const record of records) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(record.id) || !/^[a-f0-9]{64}$/.test(record.tokenHash)) throw new Error('Invalid authentication record');
      if (users.some((user) => user.id === record.id)) throw new Error('Duplicate authentication identity');
      users.push({ id: record.id, digest: Buffer.from(record.tokenHash, 'hex'), admin: false });
    }
  }
  if (!users.length && !localDev) throw new Error('Configure ADMIN_TOKEN or AUTH_USERS_FILE, or explicitly enable LOCAL_DEV=true on loopback');
  return {
    authenticate(req) {
      const header = req.headers.authorization || '';
      if (!header && localDev && !users.length) return { id: 'local-developer', admin: true };
      if (!header.startsWith('Bearer ') || header.length > 4096) return null;
      const digest = hash(header.slice(7));
      const user = users.find((candidate) => timingSafeEqual(candidate.digest, digest));
      return user ? { id: user.id, admin: user.admin } : null;
    }
  };
}
