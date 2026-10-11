// SEC-02 : primitives du chiffrement enveloppe.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalKeyProvider, deriveKey, open, seal } from "../src/lib/crypto.js";

const k = () => randomBytes(32);
const b64 = () => randomBytes(32).toString("base64");

describe("seal / open", () => {
  it("chiffre puis déchiffre", () => {
    const key = k();
    const sealed = seal(key, Buffer.from("0034567890"), Buffer.from("aad"));
    expect(sealed.includes(Buffer.from("0034567890"))).toBe(false);
    expect(open(key, sealed, Buffer.from("aad")).toString()).toBe("0034567890");
  });

  it("deux chiffrements du même numéro diffèrent (IV aléatoire)", () => {
    const key = k();
    expect(seal(key, Buffer.from("x"), Buffer.alloc(0)).equals(seal(key, Buffer.from("x"), Buffer.alloc(0)))).toBe(
      false,
    );
  });

  it("refuse une autre clé, une autre AAD ou un chiffré modifié", () => {
    const key = k();
    const sealed = seal(key, Buffer.from("secret"), Buffer.from("membre-1"));
    expect(() => open(k(), sealed, Buffer.from("membre-1"))).toThrow();
    expect(() => open(key, sealed, Buffer.from("membre-2"))).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => open(key, tampered, Buffer.from("membre-1"))).toThrow();
  });

  it("dérive des sous-clés distinctes par usage", () => {
    const dek = k();
    expect(deriveKey(dek, "identity-enc").equals(deriveKey(dek, "identity-hmac"))).toBe(false);
    expect(deriveKey(dek, "identity-enc").equals(deriveKey(dek, "identity-enc"))).toBe(true);
  });
});

describe("LocalKeyProvider", () => {
  it("enveloppe et désenveloppe une clé de parti", async () => {
    const p = new LocalKeyProvider([{ id: 1, base64: b64() }]);
    const dek = k();
    const wrapped = await p.wrap(dek);
    expect(wrapped.includes(dek)).toBe(false);
    expect((await p.unwrap(wrapped)).equals(dek)).toBe(true);
  });

  it("lit encore les clés enveloppées par l'ancienne clé maîtresse après rotation", async () => {
    const oldKey = b64();
    const before = new LocalKeyProvider([{ id: 1, base64: oldKey }]);
    const dek = k();
    const wrapped = await before.wrap(dek);
    const after = new LocalKeyProvider([
      { id: 2, base64: b64() },
      { id: 1, base64: oldKey },
    ]);
    expect((await after.unwrap(wrapped)).equals(dek)).toBe(true);
    expect((await after.wrap(dek))[0]).toBe(2);
  });

  it("refuse une clé maîtresse absente ou de mauvaise taille", () => {
    expect(() => LocalKeyProvider.fromEnv({})).toThrow();
    expect(() => new LocalKeyProvider([{ id: 1, base64: Buffer.alloc(16).toString("base64") }])).toThrow();
  });

  it("refuse une clé enveloppée par une clé maîtresse inconnue", async () => {
    const wrapped = await new LocalKeyProvider([{ id: 7, base64: b64() }]).wrap(k());
    await expect(new LocalKeyProvider([{ id: 1, base64: b64() }]).unwrap(wrapped)).rejects.toThrow();
  });
});
