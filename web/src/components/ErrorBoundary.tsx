import { Component, type ReactNode } from 'react';

/** Vangnet voor render-crashes: toon een nette herlaad-melding in plaats van
    een wit scherm, en log de fout naar de console voor het debuggen. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Op de Bank crashte tijdens het renderen:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div className="big">😵</div>
        <p><b>Er ging iets mis.</b></p>
        <p className="muted" style={{ fontSize: 13 }}>
          Vervelend! Herlaad de app — je gegevens staan veilig op de server.
        </p>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
          Herladen
        </button>
      </div>
    );
  }
}
