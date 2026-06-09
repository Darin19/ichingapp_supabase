import { FormEvent, useState } from "react";
import { Lock, LogIn, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase, isSupabaseConfigured } from "../supabaseClient";
import { APP_LOGIN_EMAIL, isValidLoginIdentifier } from "../lib/appAuth";

export default function LoginGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (!supabase || !isSupabaseConfigured) {
        setError("Supabase Authentication is not available.");
        return;
      }

      if (!isValidLoginIdentifier(username)) {
        setError("Username or password is incorrect.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: APP_LOGIN_EMAIL,
        password,
      });
      if (signInError) throw signInError;
    } catch (err) {
      console.error("Login failed:", err);
      setError("Username or password is incorrect.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4 text-[#0f172a]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#166db0] text-white shadow-lg shadow-[#166db0]/25">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[18px] font-black leading-tight">
              Quantum iChing Manifestor
            </h1>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-widest text-[#64748b]">
              Secure Login
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
              Username or Email
            </span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-11 rounded-xl border-[#e2e8f0] bg-[#f8fafc] pl-10 font-semibold focus:border-[#166db0]"
                autoFocus
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
              Password
            </span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-11 rounded-xl border-[#e2e8f0] bg-[#f8fafc] pl-10 font-semibold focus:border-[#166db0]"
                required
              />
            </div>
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="mt-5 h-11 w-full rounded-xl bg-[#166db0] text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-[#166db0]/20 hover:bg-[#0e4a77]"
          disabled={isSubmitting}
        >
          <LogIn className="h-4 w-4" />
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
