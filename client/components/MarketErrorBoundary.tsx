import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  market: string;
  fallback: ReactNode;
  resetKey?: unknown;
  children: ReactNode;
};

export class MarketErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Could not render market ${this.props.market}`, error, info);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
