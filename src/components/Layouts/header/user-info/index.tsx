"use client";

import { ChevronUpIcon } from "@/assets/icons";
import {
  Dropdown,
  DropdownContent,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { LogOutIcon, UserIcon } from "./icons";

export function UserInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session, status } = useSession();

  async function handleLogout() {
    setIsOpen(false);
    const loadingId = toast.loading("Keluar...");
    try {
      await signOut({ callbackUrl: "/auth/sign-in" });
    } finally {
      toast.dismiss(loadingId);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3" role="presentation">
        <span className="inline-block size-12 animate-pulse rounded-full bg-gray-200" />
        <div className="relative h-7 w-fit">
          <span className="flex h-7 w-30 animate-pulse items-center justify-end rounded-full bg-gray-200 pr-2" />
        </div>
      </div>
    );
  }

  const roles = session?.user?.roles ?? [];
  const user = {
    name: (session?.user?.name as string) || "Operator",
    email: (session?.user?.email as string) || "",
    role: roles.find((r) => r.startsWith("tanki-")) ?? "app-tanki",
  };

  return (
    <Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
      <DropdownTrigger className="ring-primary cursor-pointer rounded align-middle ring-offset-2 outline-none focus-visible:ring-1 dark:ring-offset-gray-dark">
        <span className="sr-only">Akun Saya</span>

        <figure className="flex items-center gap-3">
          <UserAvatar />
          <figcaption className="flex items-center gap-1 font-medium text-dark max-[1024px]:sr-only dark:text-dark-6">
            <span className="max-w-24 truncate">{user.name}</span>
            <ChevronUpIcon
              aria-hidden
              className={cn(
                "rotate-180 transition-transform",
                isOpen && "rotate-0",
              )}
              strokeWidth={1.5}
            />
          </figcaption>
        </figure>
      </DropdownTrigger>

      <DropdownContent
        className="border border-stroke bg-white shadow-md min-[230px]:min-w-70 dark:border-dark-3 dark:bg-gray-dark"
        align="end"
      >
        <h2 className="sr-only">Informasi pengguna</h2>

        <figure className="flex items-center gap-2.5 px-5 py-3.5">
          <UserAvatar />
          <figcaption className="space-y-1 text-base font-medium">
            <div className="mb-1 leading-none text-dark dark:text-white">
              {user.name}
            </div>
            <div className="w-full max-w-47.5 truncate leading-none text-gray-6">
              {user.email}
            </div>
            <div className="text-xs leading-none text-primary">{user.role}</div>
          </figcaption>
        </figure>

        <hr className="border-[#E8E8E8] dark:border-dark-3" />

        <div className="p-2 text-base text-[#4B5563] dark:text-dark-6">
          <button
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.25 ring-primary outline-0 hover:bg-gray-2 hover:text-dark focus-visible:ring-1 dark:hover:bg-dark-3 dark:hover:text-white"
            onClick={handleLogout}
          >
            <LogOutIcon />
            <span className="text-base font-medium">Keluar</span>
          </button>
        </div>
      </DropdownContent>
    </Dropdown>
  );
}

function UserAvatar() {
  return (
    <span className="flex size-12 items-center justify-center rounded-full border bg-gray-2 text-dark outline-none dark:border-dark-4 dark:bg-dark-2 dark:text-white">
      <UserIcon />
    </span>
  );
}
