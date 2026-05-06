/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sinergy: {
          bg: '#080B14',
          surface: '#0D1120',
          card: '#111827',
          border: '#1E2D45',
          accent: '#9945FF',
          green: '#14F195',
          cyan: '#00D4FF',
          amber: '#F5A623',
          red: '#FF4D4D',
          muted: '#6B7280',
          text: '#E2E8F0',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-sinergy': 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
        'gradient-card': 'linear-gradient(180deg, #111827 0%, #0D1120 100%)',
      },
      boxShadow: {
        accent: '0 0 20px rgba(153,69,255,0.3)',
        green: '0 0 20px rgba(20,241,149,0.25)',
        cyan: '0 0 20px rgba(0,212,255,0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(153,69,255,0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(153,69,255,0.7)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
