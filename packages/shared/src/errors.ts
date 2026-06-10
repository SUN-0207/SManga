export class CrawlerError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class FetchError extends CrawlerError {
  /** HTTP status when the failure was an HTTP response (>= 400). Undefined
   * for network errors / timeouts — the classifier treats undefined as
   * transient. */
  readonly statusCode?: number;
  constructor(message: string, opts?: { cause?: unknown; statusCode?: number }) {
    super(message, opts?.cause);
    this.statusCode = opts?.statusCode;
  }
}
export class RateLimitError extends CrawlerError {}
export class ParserError extends CrawlerError {}
export class AdapterNotFoundError extends CrawlerError {}
