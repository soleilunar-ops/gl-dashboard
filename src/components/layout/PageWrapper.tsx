import type { ReactNode } from "react";

interface PageWrapperProps {
  title: string;
  children: ReactNode;
}

export default function PageWrapper({ title, children }: PageWrapperProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {children}
    </div>
  );
}
