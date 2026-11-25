"use client";

import { useState } from "react";

// Copies a value; if the clipboard is refused, selects the text beside the button instead.
export function CopyButton({ value, label, targetId }: { value: string; label: string; targetId: string }) {
  const [text, setText] = useState(label);
  const selectTarget = () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setText("Selected: copy with Ctrl+C");
  };
  return (
    <button
      type="button"
      className="ac-copy"
      onClick={() => {
        if (!navigator.clipboard) return selectTarget();
        navigator.clipboard.writeText(value).then(() => {
          setText("Copied");
          setTimeout(() => setText(label), 1500);
        }, selectTarget);
      }}
    >
      {text}
    </button>
  );
}
