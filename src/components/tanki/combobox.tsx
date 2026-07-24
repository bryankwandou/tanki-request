"use client";

import { useMemo, useState } from "react";

export type ComboOption = { value: string; label: string };

/**
 * Autocomplete sederhana: ketik untuk memfilter, pilih untuk mengisi.
 * Nilai terpilih disimpan di hidden input `name` agar ikut ter-submit ke form.
 */
export function Combobox({
  name,
  options,
  placeholder,
  emptyText = "Tidak ada hasil",
}: {
  name: string;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ComboOption | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [options, query]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.value ?? ""} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        value={selected ? selected.label : query}
        placeholder={placeholder}
        onChange={(e) => {
          setSelected(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 outline-none focus:border-primary dark:border-dark-3"
      />

      {selected && (
        <button
          type="button"
          aria-label="Hapus pilihan"
          onClick={() => {
            setSelected(null);
            setQuery("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-5 hover:text-dark dark:text-dark-6"
        >
          ✕
        </button>
      )}

      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stroke bg-white py-1 shadow-lg dark:border-dark-3 dark:bg-gray-dark">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-dark-5 dark:text-dark-6">{emptyText}</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  // onMouseDown agar terpilih sebelum input blur menutup daftar
                  onMouseDown={() => {
                    setSelected(o);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-dark hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
