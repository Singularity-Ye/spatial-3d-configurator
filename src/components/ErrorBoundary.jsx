import React from 'react';

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: '2rem',
    textAlign: 'center',
    color: '#f5efe3',
    fontFamily: '"Microsoft YaHei","PingFang SC",Inter,system-ui,sans-serif',
  },
  icon: { fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.6 },
  title: { fontSize: '1.3rem', fontWeight: 700, color: '#fff7df', marginBottom: '0.5rem' },
  message: { fontSize: '0.85rem', color: 'rgba(245,239,227,0.55)', maxWidth: '420px', lineHeight: 1.7 },
  retry: {
    marginTop: '1.5rem',
    padding: '0.55rem 1.4rem',
    border: '1px solid rgba(231,199,126,0.3)',
    borderRadius: '20px',
    background: 'rgba(231,199,126,0.08)',
    color: '#e7c77e',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  detail: {
    marginTop: '1.5rem',
    padding: '0.8rem 1rem',
    background: 'rgba(9,19,17,0.7)',
    border: '1px solid rgba(231,199,126,0.12)',
    borderRadius: '8px',
    fontSize: '0.72rem',
    color: 'rgba(245,239,227,0.45)',
    maxWidth: '600px',
    overflow: 'auto',
    fontFamily: '"IBM Plex Mono","Fira Code",monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    const isChunkError = error && (
      error.name === 'ChunkLoadError' || 
      (error.message && error.message.includes('Loading chunk'))
    );
    
    if (isChunkError) {
      try {
        const hasRetried = window.sessionStorage.getItem('chunk-retry-failed');
        if (!hasRetried) {
          window.sessionStorage.setItem('chunk-retry-failed', 'true');
          window.location.reload();
          return { hasError: false, error: null };
        }
      } catch (e) {
        console.error('SessionStorage access failed:', e);
      }
    }
    
    return { hasError: true, error };
  }

  componentDidMount() {
    try {
      window.sessionStorage.removeItem('chunk-retry-failed');
    } catch (e) {}
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    try {
      window.sessionStorage.removeItem('chunk-retry-failed');
    } catch (e) {}
  }

  handleRetry = () => {
    try {
      window.sessionStorage.removeItem('chunk-retry-failed');
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.wrapper}>
          <div style={styles.icon}>⚗️</div>
          <div style={styles.title}>炼金术阵出现波动</div>
          <div style={styles.message}>
            这个区域的魔法回路暂时中断了。可能是某个组件在渲染时发生了意外。
          </div>
          <button
            style={styles.retry}
            onClick={this.handleRetry}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(231,199,126,0.16)';
              e.target.style.borderColor = '#e7c77e';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(231,199,126,0.08)';
              e.target.style.borderColor = 'rgba(231,199,126,0.3)';
            }}
          >
            重新尝试
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div style={styles.detail}>
              {this.state.error.toString()}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
