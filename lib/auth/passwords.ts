import "server-only";

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(
    password,
    salt,
    HASH_ITERATIONS,
    HASH_KEY_LENGTH,
    HASH_ALGORITHM,
  ).toString("base64url");

  return `${PASSWORD_HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, encodedHash?: string) {
  if (!encodedHash) {
    return false;
  }

  const [prefix, rawIterations, salt, expectedHash] = encodedHash.split("$");
  const iterations = Number(rawIterations);

  if (
    prefix !== PASSWORD_HASH_PREFIX ||
    !Number.isInteger(iterations) ||
    iterations < 10000 ||
    !salt ||
    !expectedHash
  ) {
    return false;
  }

  const actualHash = pbkdf2Sync(
    password,
    salt,
    iterations,
    HASH_KEY_LENGTH,
    HASH_ALGORITHM,
  ).toString("base64url");
  const actualBuffer = Buffer.from(actualHash);
  const expectedBuffer = Buffer.from(expectedHash);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
