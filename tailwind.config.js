/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#fafafa',
        surface: '#ffffff',
        line: '#e5e5e7',
        ink: '#171717',
        muted: '#71717a',
        accent: {
          DEFAULT: '#0071e3',
          dark: '#0062c4',
        },
        danger: '#d70015',
        success: {
          DEFAULT: '#1d9e5e',
          dark: '#137a47',
        },
      },
      boxShadow: {
        subtle: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        panel: '0 4px 24px rgb(0 0 0 / 0.06)',
        overlay: '0 12px 48px rgb(0 0 0 / 0.16)',
      },
      maxWidth: {
        content: '78rem',
      },
    },
  },
  plugins: [],
}
