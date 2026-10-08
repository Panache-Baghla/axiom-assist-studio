import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OmniLogo } from "./OmniLogo";

export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-aurora opacity-20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <OmniLogo className="size-12" />
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === "in" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground">Sign in to OmniAI to save your chats.</p>
        </div>
        <Button variant="outline" className="h-11 w-full rounded-full" onClick={google}>
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c6.92 0 9.2-4.86 9.2-7.36 0-.5-.05-.87-.12-1.25z" />
          </svg>
          Continue with Google
        </Button>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
          )}
          <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
          <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-full">
            {mode === "in" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "in" ? "New to OmniAI?" : "Already have an account?"}{" "}
          <button className="text-foreground underline underline-offset-4" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
