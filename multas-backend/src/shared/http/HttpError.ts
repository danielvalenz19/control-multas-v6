import { DomainError, type DomainErrorOptions } from "../domain/DomainError.js";

export class HttpError extends DomainError {
  public readonly statusCode: number;

  public constructor(options: DomainErrorOptions & { statusCode: number }) {
    super(options);
    this.statusCode = options.statusCode;
  }
}
