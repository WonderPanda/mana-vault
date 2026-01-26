import { forwardRef } from "react";

import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

interface PageHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
}

export function PageLayout({ children, className }: PageLayoutProps) {
  return <div className={cn("flex h-full flex-col", className)}>{children}</div>;
}

export function PageHeader({ children, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-center justify-between p-4 md:p-6", className)}>
      {children}
    </header>
  );
}

export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h1 className={cn("text-2xl font-bold text-primary", className)}>{children}</h1>;
}

export const PageContent = forwardRef<HTMLDivElement, PageContentProps>(
  ({ children, className }, ref) => {
    return (
      <div ref={ref} className={cn("flex-1 overflow-auto p-4 md:p-6", className)}>
        {children}
      </div>
    );
  },
);

PageContent.displayName = "PageContent";
