import argon2 from "argon2";
import type { PasswordHasher } from "../application/AuthRepository.js";

export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHashPromise: Promise<string> | undefined;

  public hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  public verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  public async verifyDummy(password: string): Promise<void> {
    this.dummyHashPromise ??= this.hash(`dummy-${crypto.randomUUID()}`);
    await this.verify(await this.dummyHashPromise, password);
  }
}
