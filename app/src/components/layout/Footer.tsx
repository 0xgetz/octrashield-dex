/**
 * Footer — Minimal footer with links and privacy branding.
 */

export function Footer() {
  return (
    <footer className="border-t border-surface-500/10 bg-surface-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: branding */}
          <div className="flex items-center gap-2 text-surface-400 text-xs">
            <svg className="w-4 h-4 text-shield-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
            </svg>
            <span>OctraShield DEX</span>
            <span className="text-surface-500">|</span>
            <span>Privacy-First DeFi</span>
          </div>

          {/* Center: links */}
          <nav className="flex items-center gap-4 text-xs">
            <a href="#" className="text-surface-400 hover:text-surface-200 transition-colors">Docs</a>
            <a href="#" className="text-surface-400 hover:text-surface-200 transition-colors">GitHub</a>
            <a href="#" className="text-surface-400 hover:text-surface-200 transition-colors">Audit</a>
            <a href="#" className="text-surface-400 hover:text-surface-200 transition-colors">Discord</a>
          </nav>

          {/* Right: status */}
          <div className="flex items-center gap-2 text-2xs text-surface-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
