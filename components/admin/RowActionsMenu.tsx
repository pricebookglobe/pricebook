"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";

export type MenuAction = { label: string; onClick: () => void; danger?: boolean };

export function RowActionsMenu({ actions, disabled }: { actions: MenuAction[]; disabled?: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (pos) {
      setPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Fixed positioning anchored to the button's actual screen position —
    // a table <td> is a poor containing block for an absolutely-positioned
    // dropdown (it gets visually clipped near the table's edge), so this
    // renders the menu completely outside the table's layout instead.
    setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) });
  }

  return (
    <>
      <button
        disabled={disabled}
        onClick={toggle}
        className="rounded-sm p-1 text-ash hover:bg-field hover:text-ink"
        aria-label="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-40 rounded border border-line bg-field-raised py-1 text-left shadow-lg"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  setPos(null);
                  a.onClick();
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-field ${a.danger ? "text-flag" : "text-ink"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
