import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;
export const AUTH_STORAGE_KEY = "iching-supabase-auth";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const getBrowserStorage = (type: "session" | "local") => {
  if (typeof window === "undefined") return null;

  try {
    return type === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

const authSessionStorage = {
  getItem: (key: string) => {
    try {
      return getBrowserStorage("session")?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      getBrowserStorage("session")?.setItem(key, value);
    } catch {
      // Ignore storage failures so auth errors surface through Supabase.
    }
  },
  removeItem: (key: string) => {
    try {
      getBrowserStorage("session")?.removeItem(key);
    } catch {
      // Ignore storage failures so sign-out can still clear React state.
    }
  },
};

const clearLegacyLocalAuthSession = () => {
  try {
    getBrowserStorage("local")?.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Best-effort cleanup for browsers that block localStorage.
  }
};

export const clearStoredAuthSession = () => {
  authSessionStorage.removeItem(AUTH_STORAGE_KEY);
  clearLegacyLocalAuthSession();
};

clearLegacyLocalAuthSession();

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: authSessionStorage,
        storageKey: AUTH_STORAGE_KEY,
      },
    })
  : null;
