import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
  jti: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, 'jti'>,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const encoder = new TextEncoder();
  const jti = crypto.randomUUID();
  return new SignJWT({
    email: claims.email,
    role: claims.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(encoder.encode(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims> {
  const encoder = new TextEncoder();
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Invalid access token claims');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
    jti: typeof payload.jti === 'string' ? payload.jti : '',
  };
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(40).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
