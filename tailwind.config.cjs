/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        'portal-canvas':
          'linear-gradient(165deg, rgb(236 253 245 / 0.85) 0%, rgb(255 251 235 / 0.45) 42%, rgb(240 249 255 / 0.7) 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
