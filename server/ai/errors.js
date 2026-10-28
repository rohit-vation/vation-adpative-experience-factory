/** An error whose message is safe to show in the browser. */
export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
