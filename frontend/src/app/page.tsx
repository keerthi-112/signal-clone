"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SignalApp } from "@/components/SignalApp";
import { Button } from "@/components/ui/Modal";
import { SignalMark, Spinner } from "@/components/ui/Controls";
import { useAuth } from "@/store/auth";

export default function Home() {
  const router = useRouter();
  const { status, me, init } = useAuth();

  useEffect(() => {
    if (status === "anonymous") router.replace("/register");
    else if (status === "authenticated" && me && !me.is_profile_complete) router.replace("/register?step=profile");
  }, [status, me, router]);

  if (status === "authenticated" && me?.is_profile_complete) return <SignalApp />;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-app">
      <SignalMark size={72} />
      {status === "error" ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-secondary">Can&apos;t connect to Signal. Check your connection and try again.</p>
          <Button onClick={() => void init()}>Retry</Button>
        </div>
      ) : (
        <Spinner size={24} />
      )}
    </div>
  );
}
