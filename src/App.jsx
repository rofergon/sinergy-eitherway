import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { WalletProvider } from './lib/wallet-context'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import StrategyBuilder from './pages/StrategyBuilder'
import Backtest from './pages/Backtest'
import Receipts from './pages/Receipts'
import Markets from './pages/Markets'

export default function App() {
  return (
    <WalletProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/strategy" element={<StrategyBuilder />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </WalletProvider>
  )
}
