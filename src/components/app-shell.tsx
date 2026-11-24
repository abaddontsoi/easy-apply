"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function AppShell({
  email,
  note = "",
  sidebar,
  children,
}: {
  email: string;
  note?: string;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-b border-border/80 md:max-h-none md:w-64 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <div
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-md bg-primary font-serif text-lg text-primary-foreground"
          >
            函
          </div>
          <p className="font-serif text-2xl leading-none tracking-tight">函箋</p>
        </div>
        <nav aria-label="主要" className="grid gap-1 px-3">
          <ShellLink href="/jobs" current={pathname === "/jobs"}>
            搜尋職缺
          </ShellLink>
          <ShellLink href="/" current={pathname === "/"}>
            寫作新信件
          </ShellLink>
          <ShellLink href="/settings" current={pathname === "/settings"}>
            設定
          </ShellLink>
        </nav>
        {sidebar ? <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">{sidebar}</div> : null}
        <div className="mt-auto shrink-0 border-t border-border/80 px-4 py-3 text-sm">
          <p className="truncate font-medium">{email}</p>
          {note ? <p className="mt-1 text-xs text-destructive">{note}</p> : null}
          <button type="button" className="mt-1 text-muted-foreground underline-offset-4 hover:underline" onClick={() => void logout()}>
            登出
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function ShellLink({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-2 text-sm hover:bg-muted",
        current ? "bg-muted font-medium" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}
