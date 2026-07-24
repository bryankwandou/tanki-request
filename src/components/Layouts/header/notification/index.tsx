"use client";

import {
  Dropdown,
  DropdownContent,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellIcon } from "./icons";

type Notif = { id: string; noTiket: string; nama: string; createdAt: string };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function Notification() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [count, setCount] = useState(0);
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // poll tiap 30 detik
    return () => clearInterval(id);
  }, [load]);

  return (
    <Dropdown
      isOpen={isOpen}
      setIsOpen={(open) => {
        setIsOpen(open);
        if (open) load();
      }}
    >
      <DropdownTrigger
        className="grid size-12 cursor-pointer place-items-center rounded-full border bg-gray-2 text-dark outline-none hover:text-primary focus-visible:border-primary focus-visible:text-primary dark:border-dark-4 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3 dark:focus-visible:border-primary"
        aria-label="Lihat notifikasi permintaan baru"
      >
        <span className="relative">
          <BellIcon />
          {count > 0 && (
            <span className="absolute top-0 right-0 z-1 size-2 rounded-full bg-red-light ring-2 ring-gray-2 dark:ring-dark-3">
              <span className="absolute inset-0 -z-1 animate-ping rounded-full bg-red-light opacity-75" />
            </span>
          )}
        </span>
      </DropdownTrigger>

      <DropdownContent
        align={isMobile ? "end" : "center"}
        className="border border-stroke bg-white px-3.5 py-3 shadow-md min-[350px]:min-w-[20rem] dark:border-dark-3 dark:bg-gray-dark"
      >
        <div className="mb-1 flex items-center justify-between px-2 py-1.5">
          <span className="text-lg font-medium text-dark dark:text-white">
            Permintaan Baru
          </span>
          {count > 0 && (
            <span className="rounded-md bg-primary px-2.25 py-0.5 text-xs font-medium text-white">
              {count} baru
            </span>
          )}
        </div>

        <ul className="mb-3 max-h-92 space-y-1.5 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-dark-5 dark:text-dark-6">
              Belum ada permintaan baru.
            </li>
          ) : (
            items.map((item) => (
              <li key={item.id} role="menuitem">
                <Link
                  href={`/dashboard/permintaan/${item.id}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-4 rounded-lg px-2 py-2 outline-none hover:bg-gray-2 focus-visible:bg-gray-2 dark:hover:bg-dark-3 dark:focus-visible:bg-dark-3"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-light-5 text-primary dark:bg-dark-3">
                    <DropIcon />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-sm font-medium text-dark dark:text-white">
                      {item.noTiket}
                    </strong>
                    <span className="block truncate text-sm font-medium text-dark-5 dark:text-dark-6">
                      {item.nama} · {timeAgo(item.createdAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>

        <Link
          href="/dashboard/permintaan?status=DITERIMA"
          onClick={() => setIsOpen(false)}
          className="block rounded-lg border border-primary p-2 text-center text-sm font-medium tracking-wide text-primary transition-colors outline-none hover:bg-blue-light-5 focus:bg-blue-light-5 dark:border-dark-3 dark:text-dark-6 dark:hover:bg-dark-3"
        >
          Lihat semua permintaan
        </Link>
      </DropdownContent>
    </Dropdown>
  );
}

function DropIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
