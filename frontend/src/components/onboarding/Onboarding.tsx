"use client";

import { ArrowLeft, Camera } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { avatarColors, initials } from "@/lib/avatar";
import { formatPhone } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { SignalMark, Spinner } from "../ui/Controls";

const COUNTRIES = [
  { code: "+1", name: "United States" },
  { code: "+91", name: "India" },
  { code: "+44", name: "United Kingdom" },
  { code: "+49", name: "Germany" },
  { code: "+33", name: "France" },
  { code: "+61", name: "Australia" },
  { code: "+81", name: "Japan" },
  { code: "+55", name: "Brazil" },
  { code: "+34", name: "Spain" },
  { code: "+971", name: "United Arab Emirates" },
  { code: "+65", name: "Singapore" },
];

const DEMO_ACCOUNTS = [
  { phone: "5550100001", name: "Alex Rivera" },
  { phone: "5550100002", name: "Priya Sharma" },
  { phone: "5550100003", name: "Jordan Lee" },
  { phone: "5550100004", name: "Maya Chen" },
];

type Step = "phone" | "code" | "profile";

export function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, me, signIn } = useAuth();
  const [chosenStep, setStep] = useState<Step>(params.get("step") === "profile" ? "profile" : "phone");
  const [phone, setPhone] = useState("");
  // A signed-in user without a name always lands on profile setup.
  const step: Step = status === "authenticated" && me && !me.is_profile_complete ? "profile" : chosenStep;

  // Already signed in with a complete profile: nothing to do here.
  useEffect(() => {
    if (status === "authenticated" && me?.is_profile_complete) router.replace("/");
  }, [status, me, router]);

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-app px-4 py-10">
      <div className="w-full max-w-[400px]">
        {step === "phone" && (
          <PhoneStep
            onDone={(p) => {
              setPhone(p);
              setStep("code");
            }}
          />
        )}
        {step === "code" && (
          <CodeStep
            phone={phone}
            onBack={() => setStep("phone")}
            onDone={(auth) => {
              signIn(auth);
              if (auth.user.is_profile_complete) router.replace("/");
              else setStep("profile");
            }}
          />
        )}
        {step === "profile" && <ProfileStep onDone={() => router.replace("/")} />}
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children, onBack }: { title: string; subtitle: ReactNode; children: ReactNode; onBack?: () => void }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      {onBack && (
        <button
          onClick={onBack}
          className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-icon hover:bg-hover"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <SignalMark size={56} />
      <h1 className="mt-6 text-[24px] font-semibold leading-8">{title}</h1>
      <p className="mt-2 text-[14px] text-secondary">{subtitle}</p>
      <div className="mt-8 w-full text-left">{children}</div>
    </div>
  );
}

function PrimaryButton({ busy, children, disabled }: { busy?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="mt-8 flex h-10 w-full items-center justify-center rounded-full bg-accent text-[14px] font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-40"
    >
      {busy ? <Spinner size={18} className="text-white" /> : children}
    </button>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="mt-3 text-[13px] text-danger" role="alert">{children}</p> : null;
}

const fieldClass =
  "h-11 w-full rounded-lg border border-line bg-transparent px-3 text-[15px] outline-none transition-colors focus:border-accent";

function PhoneStep({ onDone }: { onDone: (phone: string) => void }) {
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.requestCode(`${country}${number}`);
      onDone(res.phone);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell title="Phone number" subtitle="Enter your phone number to get started.">
      <form onSubmit={submit}>
        <label className="mb-1.5 block text-[13px] text-secondary" htmlFor="country">
          Country
        </label>
        <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className={`${fieldClass} bg-app`}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
        <label className="mb-1.5 mt-4 block text-[13px] text-secondary" htmlFor="phone">
          Phone number
        </label>
        <div className="flex gap-2">
          <div className="flex h-11 w-20 shrink-0 items-center justify-center rounded-lg border border-line text-[15px] text-secondary">
            {country}
          </div>
          <input
            id="phone"
            autoFocus
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Phone number"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d\s()-]/g, ""))}
            className={`${fieldClass} min-w-0`}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton busy={busy} disabled={number.replace(/\D/g, "").length < 6}>
          Next
        </PrimaryButton>
      </form>

      <div className="mt-8 rounded-lg bg-chip p-3">
        <p className="text-[12px] font-semibold text-secondary">Demo accounts (United States +1)</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.phone}
              type="button"
              onClick={() => {
                setCountry("+1");
                setNumber(a.phone);
              }}
              className="rounded-md px-2 py-1 text-left text-[12px] hover:bg-hover"
            >
              <span className="block font-medium">{a.name}</span>
              <span className="text-tertiary">{formatPhone(`+1${a.phone}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

function CodeStep({
  phone,
  onBack,
  onDone,
}: {
  phone: string;
  onBack: () => void;
  onDone: (auth: Awaited<ReturnType<typeof api.verifyCode>>) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const verify = async (code: string) => {
    setBusy(true);
    setError("");
    try {
      onDone(await api.verifyCode(phone, code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, value: string) => {
    const chars = value.replace(/\D/g, "").split("");
    if (!chars.length) {
      setDigits((d) => d.map((x, j) => (j === i ? "" : x)));
      return;
    }
    const next = digits.slice();
    chars.slice(0, 6 - i).forEach((c, k) => (next[i + k] = c));
    setDigits(next);
    const focusIdx = Math.min(i + chars.length, 5);
    inputs.current[focusIdx]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  };

  return (
    <StepShell
      onBack={onBack}
      title="Verification code"
      subtitle={
        <>
          Enter the code we sent to <span className="font-medium text-primary">{formatPhone(phone)}</span>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify(digits.join(""));
        }}
      >
        <div className="flex justify-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              autoFocus={i === 0}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              value={d}
              maxLength={6}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
              }}
              className="h-12 w-11 rounded-lg border border-line bg-transparent text-center text-[20px] outline-none focus:border-accent"
            />
          ))}
        </div>
        <ErrorText>{error}</ErrorText>
        <p className="mt-4 text-center text-[13px] text-tertiary">
          Phone verification is simulated. Use code <span className="font-semibold text-secondary">123456</span>.
        </p>
        <PrimaryButton busy={busy} disabled={!digits.every(Boolean)}>
          Continue
        </PrimaryButton>
        <button type="button" onClick={onBack} className="mt-3 w-full text-center text-[13px] text-link hover:underline">
          Wrong number?
        </button>
      </form>
    </StepShell>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const { me, setMe } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const name = `${first.trim()} ${last.trim()}`.trim();
  const colors = avatarColors(me?.avatar_color);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!first.trim()) return;
    setBusy(true);
    setError("");
    try {
      let updated = await api.updateMe({ display_name: name });
      if (file) updated = await api.uploadAvatar(file);
      setMe(updated);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell title="Set up your profile" subtitle="Profiles are only visible to people you message, contacts and groups.">
      <form onSubmit={submit}>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-20 w-20 rounded-full"
            aria-label="Choose profile photo"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center rounded-full text-[28px] font-medium"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {initials(name) || <Camera size={30} />}
              </span>
            )}
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--bg-app)] bg-chip text-icon">
              <Camera size={14} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFile(f);
              setPreview(URL.createObjectURL(f));
            }}
          />
        </div>
        <input
          autoFocus
          placeholder="First name (required)"
          value={first}
          maxLength={32}
          onChange={(e) => setFirst(e.target.value)}
          className={`${fieldClass} mt-8`}
        />
        <input
          placeholder="Last name (optional)"
          value={last}
          maxLength={31}
          onChange={(e) => setLast(e.target.value)}
          className={`${fieldClass} mt-3`}
        />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton busy={busy} disabled={!first.trim()}>
          Next
        </PrimaryButton>
      </form>
    </StepShell>
  );
}
