import Link from "next/link";
import type { PropsWithChildren, ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-heading-6 font-bold text-dark dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  href,
  accent = "text-primary",
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: string;
}) {
  const body = (
    <div className="rounded-[10px] bg-white p-5 shadow-1 transition hover:shadow-2 dark:bg-gray-dark">
      <dt className="text-sm font-medium text-dark-5 dark:text-dark-6">
        {label}
      </dt>
      <dd className={`mt-2 text-heading-4 font-bold ${accent}`}>{value}</dd>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function StubNotice({ children }: PropsWithChildren) {
  return (
    <div className="rounded-lg border border-dashed border-stroke p-4 text-sm text-dark-5 dark:border-dark-3 dark:text-dark-6">
      {children}
    </div>
  );
}
