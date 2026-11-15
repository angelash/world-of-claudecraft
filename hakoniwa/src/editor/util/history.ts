// Snapshot undo/redo stack for immutable values (the map editor keeps one per map).
// A batch groups many updates (one brush stroke, one drag) into a single undo step.
// Pure: no DOM.

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private batching = false;
  private batchBase: T;

  constructor(
    initial: T,
    private readonly limit = 200,
  ) {
    this.current = initial;
    this.batchBase = initial;
  }

  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0 || (this.batching && this.current !== this.batchBase);
  }

  get canRedo(): boolean {
    return !this.batching && this.future.length > 0;
  }

  get inBatch(): boolean {
    return this.batching;
  }

  get undoDepth(): number {
    return this.past.length;
  }

  /** Record a new present. Inside a batch the step is merged into the batch. */
  commit(next: T): void {
    if (next === this.current) return;
    if (this.batching) {
      this.current = next;
      return;
    }
    this.pushPast(this.current);
    this.future = [];
    this.current = next;
  }

  begin(): void {
    if (this.batching) return;
    this.batching = true;
    this.batchBase = this.current;
  }

  /** Close the batch; it becomes one undo step when it changed anything. */
  end(): void {
    if (!this.batching) return;
    this.batching = false;
    if (this.current !== this.batchBase) {
      this.pushPast(this.batchBase);
      this.future = [];
    }
  }

  /** Abandon the batch and restore the value it started from. */
  cancel(): void {
    if (!this.batching) return;
    this.batching = false;
    this.current = this.batchBase;
  }

  undo(): T | undefined {
    this.end();
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(this.current);
    this.current = prev;
    return prev;
  }

  redo(): T | undefined {
    if (this.batching) return undefined;
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(this.current);
    this.current = next;
    return next;
  }

  /** Replace the present and forget all history (for example after an external edit). */
  reset(value: T): void {
    this.past = [];
    this.future = [];
    this.batching = false;
    this.current = value;
    this.batchBase = value;
  }

  private pushPast(value: T): void {
    this.past.push(value);
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
  }
}
