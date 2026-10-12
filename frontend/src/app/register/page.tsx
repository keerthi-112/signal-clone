"use client";

import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding/Onboarding";

export default function RegisterPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
