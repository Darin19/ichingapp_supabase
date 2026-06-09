export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    provider: "supabase";
  };
}

export function handleSupabaseError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: SupabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      provider: "supabase",
    },
    operationType,
    path,
  };
  console.error("Supabase Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
