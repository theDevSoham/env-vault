"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "../lib/client/flows";
import { Logo } from "./Logo";
import { useSession } from "./useSession";
import { Button, cn } from "./ui";

/** Top navigation + page container for authenticated pages. */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    { href: "/vaults", label: "Vaults" },
    { href: "/devices", label: "Devices" },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-6">
            <Link href="/vaults" aria-label="Env Vault home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-sm px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-surface-2 text-text"
                        : "text-muted hover:text-text"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {session.email && (
              <span className="hidden text-xs text-muted sm:inline">{session.email}</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-text"
        >
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-text">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
