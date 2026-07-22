"use client";

import { Suspense, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

function AuthCallbackContent() {
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    async function complete() {
      try {
        const supabase = createBrowserClient();
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const otpType = type === "signup" ? "signup" : type === "email" ? "email" : type;
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as "signup" | "email",
          });
          if (error) throw error;
        } else if (window.location.hash.includes("access_token")) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          }
        }

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !sessionData.session?.access_token) {
          window.location.replace("/login?error=verification_failed");
          return;
        }

        const res = await fetch("/api/auth/verify-callback", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });
        const j = await res.json();
        if (!res.ok) {
          window.location.replace("/login?error=verification_failed");
          return;
        }

        const companyId = j.company_id ?? j.login_id;
        const q = new URLSearchParams();
        if (companyId) q.set("company_id", String(companyId));
        const verifiedPath = q.toString() ? `/auth/verified?${q.toString()}` : "/auth/verified";
        window.location.replace(verifiedPath);
      } catch {
        window.location.replace("/login?error=verification_failed");
      }
    }

    void complete();
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <p className="text-sm text-zinc-600">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-zinc-500">Loading…</p>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
