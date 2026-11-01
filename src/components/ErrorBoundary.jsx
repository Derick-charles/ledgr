import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[LEDGR] Uncaught error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0A0C16', color: '#EDEFFA', padding: 24, boxSizing: 'border-box', fontFamily: 'sans-serif',
        }}>
          <div style={{ maxWidth: 520, width: '100%' }}>
            <h2 style={{ color: '#FF6B7A', marginBottom: 12 }}>Something went wrong</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#8B90AC', marginBottom: 14 }}>
              The app hit an unexpected error and couldn't continue. This is usually either a
              Firebase configuration problem or a bug — check the browser console (F12) for the
              full error, or reload the page.
            </p>
            <pre style={{
              fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: 14, borderRadius: 8,
              overflowX: 'auto', color: '#FF6B7A', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
