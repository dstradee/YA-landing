import { createHash, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '../_lib/types.ts';

function hashSecret(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function requireAgentAuth(req: VercelRequest, res: VercelResponse): boolean {
  const configuredKey = process.env.MANAGER_AGENT_KEY;

  if (!configuredKey) {
    res.status(503).json({ error: 'Service Unavailable' });
    return false;
  }

  const authorization = req.headers.authorization;
  const candidate =
    typeof authorization === 'string' && /^Bearer\s+/i.test(authorization)
      ? authorization.replace(/^Bearer\s+/i, '').trim()
      : '';

  const expectedHash = hashSecret(configuredKey);
  const candidateHash = hashSecret(candidate);
  const valid = timingSafeEqual(candidateHash, expectedHash);

  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
