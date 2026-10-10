import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: references get read aloud over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newReference(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `LM-${code}`;
}

export function isReference(value: string): boolean {
  return new RegExp(`^LM-[${ALPHABET}]{5}$`).test(value);
}
