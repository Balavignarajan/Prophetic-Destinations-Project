import { Component, type ReactNode } from 'react';

/**
 * Keeps a failure inside a video or Lottie player (a native module that is missing from this build, a file the player cannot handle, a chunk that did not load)
 * inside that one block: the fallback is shown in its place and the rest of the lesson renders normally. `reset` tries the block again. Nothing is logged or sent
 * anywhere.
 */
export class MediaErrorBoundary extends Component<{ fallback: (reset: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  private reset = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
