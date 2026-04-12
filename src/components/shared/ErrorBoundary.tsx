"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary 에러 감지:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center py-12">
          <Card className="w-full max-w-sm text-center">
            <CardContent className="flex flex-col items-center gap-4 pt-6">
              <AlertTriangle className="text-destructive h-10 w-10" />
              <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
              <p className="text-muted-foreground text-sm">
                {this.state.error?.message ?? "알 수 없는 오류가 발생했습니다."}
              </p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
