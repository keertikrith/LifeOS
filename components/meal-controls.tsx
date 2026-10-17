"use client";

import { useState, useTransition } from "react";
import { deleteMeal, removeItem, setItemQuantity } from "@/app/app/actions";

export function ItemEditor({ id, quantity, label }: { id: string; quantity: number; label: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(quantity));
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="flex gap-3 text-xs">
          <button className="underline" onClick={() => setEditing(true)}>Edit</button>
          <button className="underline" disabled={pending} onClick={() => { if (confirm("Remove this item?")) start(() => removeItem(id)); }}>Remove</button>
        </span>
      </span>
    );
  }
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const q = Number(value); if (q > 0) start(async () => { await setItemQuantity(id, q); setEditing(false); }); }}>
      <input className="field !w-24 !py-1" type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Quantity" autoFocus />
      <span className="text-xs">{label.replace(/^[\d.]+\s*/, "")}</span>
      <button className="btn-primary !px-3 !py-1 text-xs" disabled={pending}>Save</button>
      <button type="button" className="text-xs underline" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

export function DeleteMeal({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="text-xs underline" disabled={pending} onClick={() => { if (confirm("Delete this whole meal?")) start(() => deleteMeal(id)); }}>Delete meal</button>;
}
