import { type PropsWithChildren } from "react";

export default function WithoutLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-dark">{children}</div>
  );
}
