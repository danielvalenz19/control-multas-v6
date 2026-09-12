export type DomainErrorOptions = {
  code: string;
  message: string;
  details?: unknown;
  cause?: unknown;
};

export class DomainError extends Error {
  public readonly code: string;
  public readonly details: unknown;

  public constructor(options: DomainErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}
