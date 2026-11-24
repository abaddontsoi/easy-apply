export type MemoryLetter = {
  id: string;
  user_id: string;
} & Record<string, unknown>;

type QueryError = { code?: string; message?: string };

type QueryResult = {
  data: MemoryLetter | MemoryLetter[] | null;
  error: QueryError | null;
  count: number | null;
};

export function createMemoryDataClient(
  rows: MemoryLetter[],
  options?: { errorCode?: string; secrets?: MemoryLetter[]; secretsError?: string; resumes?: MemoryLetter[]; resumesError?: string },
) {
  const secrets = options?.secrets ?? [];
  const resumes = options?.resumes ?? [];
  return {
    from(table: string) {
      if (table === "user_secrets") return new LetterQuery(secrets, options?.secretsError);
      if (table === "resumes") return new LetterQuery(options?.resumes ?? resumes, options?.resumesError);
      const errorCode = table === "letters" ? options?.errorCode : "42P01";
      return new LetterQuery(rows, errorCode);
    },
  };
}

class LetterQuery implements PromiseLike<QueryResult> {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private readonly filters: { column: string; value: unknown }[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private head = false;
  private payload: Record<string, unknown> | null = null;
  private singleMode: "one" | "maybe" | null = null;

  constructor(
    private readonly rows: MemoryLetter[],
    private readonly errorCode: string | undefined,
  ) {}

  select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
    if (this.action === "select") this.head = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  insert(record: Record<string, unknown>) {
    this.action = "insert";
    this.payload = record;
    return this;
  }

  update(record: Record<string, unknown>) {
    this.action = "update";
    this.payload = record;
    return this;
  }

  delete(options?: { count?: "exact" }) {
    this.action = "delete";
    void options;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  single() {
    this.singleMode = "one";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run(): QueryResult {
    if (this.errorCode) {
      return { data: null, error: { code: this.errorCode, message: "memory store error" }, count: null };
    }
    if (this.action === "insert") return this.runInsert();
    if (this.action === "update") return this.runUpdate();
    if (this.action === "delete") return this.runDelete();
    return this.runSelect();
  }

  private visible(): MemoryLetter[] {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.column] === filter.value));
  }

  private runInsert(): QueryResult {
    const row = { ...(this.payload ?? {}), id: crypto.randomUUID() } as MemoryLetter;
    if (typeof row.user_id !== "string" || !row.user_id) {
      return { data: null, error: { code: "23502", message: "user_id required" }, count: null };
    }
    this.rows.push(row);
    return { data: { ...row }, error: null, count: 1 };
  }

  private runUpdate(): QueryResult {
    const matched = this.visible();
    for (const row of matched) Object.assign(row, this.payload ?? {});
    if (matched.length > 1) {
      return { data: null, error: { code: "PGRST116", message: "multiple rows" }, count: null };
    }
    if (matched.length === 0) return { data: null, error: null, count: 0 };
    return { data: { ...matched[0] }, error: null, count: 1 };
  }

  private runDelete(): QueryResult {
    const matched = new Set(this.visible());
    let count = 0;
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (!matched.has(this.rows[index])) continue;
      this.rows.splice(index, 1);
      count += 1;
    }
    return { data: null, error: null, count };
  }

  private runSelect(): QueryResult {
    let matched = this.visible();
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      matched = [...matched].sort((left, right) => {
        const leftValue = String(left[column] ?? "");
        const rightValue = String(right[column] ?? "");
        if (leftValue === rightValue) return 0;
        const order = leftValue < rightValue ? -1 : 1;
        return ascending ? order : -order;
      });
    }
    if (this.maxRows != null) matched = matched.slice(0, this.maxRows);
    if (this.head) return { data: null, error: null, count: matched.length };
    if (this.singleMode === "one" || this.singleMode === "maybe") {
      if (matched.length > 1) {
        return { data: null, error: { code: "PGRST116", message: "multiple rows" }, count: null };
      }
      if (matched.length === 0) {
        if (this.singleMode === "one") {
          return { data: null, error: { code: "PGRST116", message: "no rows" }, count: 0 };
        }
        return { data: null, error: null, count: 0 };
      }
      return { data: { ...matched[0] }, error: null, count: 1 };
    }
    return { data: matched.map((row) => ({ ...row })), error: null, count: matched.length };
  }
}
