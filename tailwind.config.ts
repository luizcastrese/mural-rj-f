import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201d",
        forest: "#173f35",
        mist: "#f3f5f1",
        line: "#dfe4df",
        gold: "#a77a33",
      },
      boxShadow: { card: "0 1px 2px rgba(20, 35, 29, .04)" },
    },
  },
  plugins: [],
} satisfies Config;
