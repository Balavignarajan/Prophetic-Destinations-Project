import { Component, type ReactNode } from 'react';

interface Props {
  /** Identifies the published version shown: a block that failed is drawn again when a different publication replaces it. */
  resetKey: string;
  /** Shown in place of the block while it cannot be drawn. */
  fallback: ReactNode;
  /** Told once per failure, with the error: the lesson uses it for its development diagnostics. */
  onError: (error: unknown) => void;
  children: ReactNode;
}

/**
 * Keeps a failure inside one lesson block (content that the block's renderer cannot draw) inside that block: the fallback is shown in its place and every other block of the
 * lesson, the reading position and the completion controls carry on as before. It adds no view of its own, so it changes no layout. Nothing is logged here: `onError` decides.
 */
export class BlockBoundary extends Component<Props, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; resetKey: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
