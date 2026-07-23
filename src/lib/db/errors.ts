/** Typed data-access errors. Messages carry ids/numbers only — never payloads. */

export class DbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DbError {}

/** Optimistic-concurrency rejection (handoff §30). Client must rebase onto currentHead. */
export class RevisionConflictError extends DbError {
  constructor(public readonly currentHead: number) {
    super(`revision conflict: head is ${currentHead}`);
  }
}

/** Key-rotation commit rejected: stale base generation or inconsistent envelope set. */
export class RotationConflictError extends DbError {}

/** Invitation is not in a state that allows the attempted transition. */
export class InvitationStateError extends DbError {}
