"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Signal's default quick-reaction set. */
export const DEFAULT_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

const CATEGORIES: { name: string; emoji: string[] }[] = [
  {
    name: "Smileys & people",
    emoji: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 👍 👎 ✊ 👊 👏 🙌 👐 🤲 🙏 💪".split(" "),
  },
  {
    name: "Animals & nature",
    emoji: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐬 🐳 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🌸 🌼 🌻 🌞 🌙 ⭐ 🌈 ☀️ ⛅ 🌧️ ❄️ 🔥 🌊".split(" "),
  },
  {
    name: "Food & drink",
    emoji: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🥐 🍞 🧀 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🌮 🌯 🥗 🍝 🍜 🍣 🍱 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🧃 🥤 🍺 🍷 🥂 🍾".split(" "),
  },
  {
    name: "Activities & travel",
    emoji: "⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🏸 🥅 ⛳ 🏹 🎣 🥊 🎽 🛹 ⛷️ 🏂 🏋️ 🚴 🏆 🎉 🎊 🎁 🎈 🎮 🎲 🎯 🎵 🎶 🎸 🎹 🎤 🎧 🚗 🚕 🚌 🚲 ✈️ 🚀 🚁 ⛵ 🏔️ 🏕️ 🏖️ 🏠 🏙️ 🗺️ 📍".split(" "),
  },
  {
    name: "Objects & symbols",
    emoji: "💡 📱 💻 ⌨️ 🖥️ 📷 📚 📝 ✏️ 📌 📎 🔒 🔑 🧭 ⏰ ⌛ 💰 💳 📦 ✉️ 📅 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💞 💯 ✅ ❌ ❓ ❗ ⚠️ 🔔 💤 💬 👀 ✨ 🎯 ➕".split(" "),
  },
];

interface EmojiPickerProps {
  anchor: HTMLElement;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ anchor, onPick, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const r = ref.current!.getBoundingClientRect();
    let top = a.top - r.height - 6;
    if (top < 8) top = a.bottom + 6;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="animate-pop-in shadow-popup fixed z-[56] flex h-[340px] w-[316px] flex-col rounded-xl bg-elevated"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      role="dialog"
      aria-label="Emoji picker"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {CATEGORIES.map((cat) => (
          <section key={cat.name}>
            <h3 className="sticky top-0 bg-elevated px-1 pb-1 pt-2 text-[12px] font-semibold text-secondary">{cat.name}</h3>
            <div className="grid grid-cols-8">
              {cat.emoji.map((e) => (
                <button
                  key={e}
                  onClick={() => onPick(e)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[22px] hover:bg-hover"
                  aria-label={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
