import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { common } from "@/strings/common";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-semibold">{common.errorTitle}</h1>
            <p className="text-muted-foreground">{common.errorBody}</p>
            <pre className="text-left text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.reset}>{common.retry}</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reiniciar
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
