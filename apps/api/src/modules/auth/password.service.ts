import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';

const passwordHashRounds = 12;

@Injectable()
export class PasswordService {
  private readonly pepper: string;

  constructor(config: ConfigService) {
    this.pepper = config.getOrThrow<string>('PASSWORD_HASH_PEPPER');
  }

  hash(password: string): Promise<string> {
    return hash(this.prehash(password), passwordHashRounds);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(this.prehash(password), passwordHash);
  }

  private prehash(password: string): string {
    return createHash('sha256').update(password).update(this.pepper).digest('base64url');
  }
}
