/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Tema SOFT: biru kurang jenuh, bayangan tipis menyebar, sudut lebih bulat ──
      // Kelas yang sudah dipakai di komponen (blue-600, shadow-lg, rounded-xl, ...)
      // otomatis ikut melembut tanpa mengubah satu per satu.
      colors: {
        blue: {
          50: '#f3f6fd', 100: '#e6ecfa', 200: '#cfdaf5', 300: '#aebfee', 400: '#869fe4',
          500: '#6784d8', 600: '#4f6fc7', 700: '#4059ad', 800: '#364b8c', 900: '#2e3d6e',
        },
        primary: { DEFAULT: '#4f6fc7', 50: '#f3f6fd', 100: '#e6ecfa', 500: '#6784d8', 600: '#4f6fc7', 700: '#4059ad' },
        success: { DEFAULT: '#3fae8a', 50: '#f0faf6', 100: '#d9f2e8', 500: '#3fae8a', 600: '#2f9474' },
        danger:  { DEFAULT: '#e06a6a', 50: '#fdf3f3', 100: '#fbe2e2', 500: '#e06a6a', 600: '#cc5454' },
        warning: { DEFAULT: '#e8a23a', 50: '#fdf8ee', 100: '#faecc9', 500: '#e8a23a', 600: '#cf8a22' },
        // border abu-abu lebih terang & sedikit kebiruan
        gray: { 100: '#f1f4f9', 200: '#e6eaf2', 300: '#d5dbe8' },
      },
      borderColor: { DEFAULT: '#e6eaf2' },
      boxShadow: {
        sm:    '0 1px 2px rgba(48,63,120,0.04)',
        DEFAULT: '0 2px 8px rgba(48,63,120,0.05)',
        md:    '0 4px 16px rgba(48,63,120,0.06)',
        lg:    '0 8px 28px rgba(48,63,120,0.08)',
        xl:    '0 14px 40px rgba(48,63,120,0.10)',
        '2xl': '0 20px 56px rgba(48,63,120,0.12)',
      },
      borderRadius: { lg: '0.75rem', xl: '1rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
