const env = import.meta.env || {}

export const API_BASE_URL = env.VITE_API_BASE_URL || 'https://api.eitherway.ai'
export const BIRDEYE_API_KEY = env.VITE_API_KEY_BIRDEYE || process.env.BIRDEYE_API_KEY || ''
export const AGENT_URL = env.VITE_AGENT_URL || '/agent'

export const PROXY_API = (url) =>
  `${API_BASE_URL}/api/proxy-api?url=${encodeURIComponent(url)}`

export const QN_SOLANA_RPC = `${API_BASE_URL}/api/quicknode/rpc/solana`

// Well-known Solana token mint addresses
export const TOKENS = {
  SOL: {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  USDC: {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  RAY: {
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    symbol: 'RAY',
    name: 'Raydium',
    decimals: 6,
    logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
  },
  BONK: {
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logo: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q89nRDGiqEIE',
  },
  JTO: {
    address: 'jtojtomepa8beP8AuQc6eL9H4dGZYR5dTYFQpHUBEPR',
    symbol: 'JTO',
    name: 'Jito',
    decimals: 9,
    logo: 'https://static.jito.network/website/jto.svg',
  },
  JUP: {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logo: 'https://static.jup.ag/jup/icon.png',
  },
  WIF: {
    address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    decimals: 6,
    logo: 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link',
  },
}

export const TOKEN_LIST = Object.values(TOKENS)

export const DEVNET_EXPLORER = 'https://explorer.solana.com'
