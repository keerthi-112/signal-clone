import { SignalMark } from "../ui/Controls";

/** Shown when no chat is selected (Signal Desktop's welcome pane). */
export function EmptyConversation() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <SignalMark size={96} />
      <h2 className="mt-6 text-[20px] font-semibold">Welcome to Signal</h2>
      <p className="mt-2 max-w-xs text-[13px] text-secondary">
        Select a chat to start messaging, or press the compose button to start a new one.
      </p>
    </div>
  );
}
