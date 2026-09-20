export class AmbiguousInstagramIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousInstagramIntegrationError';
  }
}
