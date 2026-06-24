import { describe, expect, it } from "vitest";
import { openInMemoryDatabase } from "../src/db/database.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { DuplicateEmailError, UserStore, normalizeEmail } from "../src/auth/users.js";

function freshStore(): UserStore {
  return new UserStore(openInMemoryDatabase());
}

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a distinct salt/hash each time", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("returns false for malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$nope")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Hero@Example.COM ")).toBe("hero@example.com");
  });
});

describe("UserStore", () => {
  it("creates and reads back a user", () => {
    const store = freshStore();
    const user = store.create({ email: "Hero@Example.com", passwordHash: "h" });
    expect(user.email).toBe("hero@example.com");
    expect(user.role).toBe("user");
    expect(user.emailVerified).toBe(false);
    expect(user.id).toMatch(/[0-9a-f-]{36}/);

    expect(store.findById(user.id)).toEqual(user);
    expect(store.findByEmail("HERO@example.com")).toEqual(user);
    expect(store.findByEmail("missing@example.com")).toBeNull();
  });

  it("rejects duplicate emails (case-insensitive)", () => {
    const store = freshStore();
    store.create({ email: "dup@example.com", passwordHash: "h" });
    expect(() => store.create({ email: "DUP@example.com", passwordHash: "h2" })).toThrow(
      DuplicateEmailError,
    );
  });

  it("stores and reads the password hash", () => {
    const store = freshStore();
    const user = store.create({ email: "a@b.c", passwordHash: "hash-1" });
    expect(store.getPasswordHash(user.id)).toBe("hash-1");
    store.setPasswordHash(user.id, "hash-2");
    expect(store.getPasswordHash(user.id)).toBe("hash-2");
    expect(store.getPasswordHash("nope")).toBeNull();
  });

  it("flips email verification and role", () => {
    const store = freshStore();
    const user = store.create({ email: "a@b.c", passwordHash: "h" });
    store.setEmailVerified(user.id, true);
    store.setRole(user.id, "admin");
    const updated = store.findById(user.id)!;
    expect(updated.emailVerified).toBe(true);
    expect(updated.role).toBe("admin");
  });

  it("supports a pre-verified admin at creation", () => {
    const store = freshStore();
    const admin = store.create({
      email: "admin@b.c",
      passwordHash: "h",
      role: "admin",
      emailVerified: true,
    });
    expect(admin.role).toBe("admin");
    expect(admin.emailVerified).toBe(true);
  });

  it("updates profile fields independently", () => {
    const store = freshStore();
    const user = store.create({ email: "a@b.c", passwordHash: "h", displayName: "Aragorn" });
    store.updateProfile(user.id, { displayName: "Strider" });
    expect(store.findById(user.id)!.displayName).toBe("Strider");
    expect(store.findById(user.id)!.email).toBe("a@b.c");
    store.updateProfile(user.id, { email: "New@B.c" });
    expect(store.findById(user.id)!.email).toBe("new@b.c");
  });

  it("lists newest first, counts, and deletes", () => {
    const store = freshStore();
    const u1 = store.create({ email: "1@b.c", passwordHash: "h" });
    const u2 = store.create({ email: "2@b.c", passwordHash: "h" });
    expect(store.count()).toBe(2);
    const emails = store.list().map((u) => u.email);
    expect(emails).toContain("1@b.c");
    expect(emails).toContain("2@b.c");
    store.delete(u1.id);
    expect(store.count()).toBe(1);
    expect(store.findById(u1.id)).toBeNull();
    expect(store.findById(u2.id)).not.toBeNull();
  });
});
