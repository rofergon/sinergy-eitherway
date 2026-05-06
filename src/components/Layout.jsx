import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../lib/wallet-context'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: GridIcon },
  { path: '/markets', label: 'Markets', icon: ChartIcon },
  { path: '/strategy', label: 'Strategy', icon: BrainIcon },
  { path: '/backtest', label: 'Backtest', icon: TestIcon },
  { path: '/receipts', label: 'Receipts', icon: ReceiptIcon },
]

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
function BrainIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}
function TestIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  )
}
function ReceiptIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  )
}

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { address, balance, connecting, connected, connect, disconnect, hasSolflare } = useWallet()
  const [mobileOpen, setMobileOpen] = useState(false)

  const formatAddr = (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`
  const formatBal = (bal) => (bal === null ? '—' : `${bal.toFixed(3)} SOL`)

  return (
    <div className="min-h-screen bg-sinergy-bg grid-bg flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-sinergy-border bg-sinergy-bg/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-sinergy flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-sinergy-text text-sm tracking-wide">
              <span className="gradient-text">SINERGY</span>
              <span className="text-sinergy-muted font-normal ml-1">SOLANA</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active
                      ? 'bg-sinergy-accent/20 text-sinergy-accent'
                      : 'text-sinergy-muted hover:text-sinergy-text hover:bg-sinergy-surface'
                  }`}
                >
                  <item.icon />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-2">
            {connected ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] text-sinergy-muted font-mono">{formatAddr(address)}</span>
                  <span className="text-[10px] text-sinergy-green font-mono">{formatBal(balance)}</span>
                </div>
                <button
                  onClick={disconnect}
                  className="text-xs px-3 py-1.5 rounded-md border border-sinergy-border text-sinergy-muted hover:text-sinergy-text hover:border-sinergy-accent/50 transition-all"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                disabled={connecting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-sinergy-accent hover:bg-sinergy-accent/80 text-white text-xs font-medium transition-all disabled:opacity-50"
              >
                {connecting ? (
                  <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6m18 0V5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25V6" />
                  </svg>
                )}
                {connecting ? 'Connecting...' : !hasSolflare ? 'Install Solflare' : 'Connect Solflare'}
              </button>
            )}

            {/* Mobile menu button */}
            <button
              className="md:hidden text-sinergy-muted hover:text-sinergy-text p-1"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-sinergy-border bg-sinergy-surface">
            <nav className="flex flex-col p-3 gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      active
                        ? 'bg-sinergy-accent/20 text-sinergy-accent'
                        : 'text-sinergy-muted hover:text-sinergy-text'
                    }`}
                  >
                    <item.icon />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Devnet banner */}
      <div className="bg-sinergy-amber/10 border-b border-sinergy-amber/20 text-sinergy-amber text-[10px] text-center py-1 font-mono tracking-wider">
        ⚡ DEVNET MODE — All on-chain transactions use Solana Devnet. No real funds.
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-sinergy-border py-4 text-center text-sinergy-muted text-xs">
        Sinergy Solana v1.0 — DeFi Strategy Intelligence on Solana Devnet
      </footer>
    </div>
  )
}
