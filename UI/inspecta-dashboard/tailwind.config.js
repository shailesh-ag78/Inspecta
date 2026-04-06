/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        bank: {
          primary: '#0096D6',   // Vibrant Ocean Blue
          secondary: '#007AB8', // Darker Teal-Blue for gradients
          accent: '#70CFFF',    // Light Sky Blue (for borders/focus)
          background: '#F8F9FA', // Very Light Gray for the main area
          text: {
            main: '#333333',    // Dark Charcoal
            muted: '#666666',   // Medium Gray
          }
        },
      },
      borderRadius: {
        'bank': '14px', // The specific roundedness seen in the dropdown
      }
    },
  },
  plugins: [],
}
