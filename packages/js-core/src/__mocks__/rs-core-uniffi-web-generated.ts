export enum QueryStatus {
  Loading = 1,
  Success = 2,
  Error = 3,
}

class ListEvents {
  readonly inner: [unknown];
  constructor(args: unknown) {
    this.inner = [args];
  }
}

export const Query = { ListEvents };
