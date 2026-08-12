import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Thanarah brand palette
        thanarah: {
          50: '#f0f9f4',
          100: '#dcf0e4',
          200: '#bce1cc',
          300: '#8ecaaa',
          400: '#5dac83',
          500: '#3a8f63',
          600: '#2d8a5e', // main green
          700: '#1a5f3f', // dark green
          800: '#175038',
          900: '#14422f',
          950: '#0a2419',
        },
        sage: {
          100: '#e8f0ec',
          200: '#c9dcd2',
          300: '#9dbfad', // light green from logo
          400: '#7aa994',
          500: '#5e9279',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Noto Sans Arabic', 'Tahoma', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 1.5s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseSubtle: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
    },
  },
  plugins: [],
};

export default config;
