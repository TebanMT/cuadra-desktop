import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // ── Semantic tokens (shadcn) — resuelven a --primary/--success/etc.
        // Componentes que usan bg-primary / text-success / etc. heredan
        // automáticamente la paleta terracota desde globals.css.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          // Híbrido: contrato shadcn + escala numérica para spec
          // (bg-warning-100 / text-warning-700 etc.).
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
          100: "hsl(var(--warning-100))",
          500: "hsl(var(--warning-500))",
          700: "hsl(var(--warning-700))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },

        // ── Named scales — para shades específicos. Disciplina:
        //   ink/paper  → tipografía + superficies
        //   brick      → ACCIÓN POSITIVA (CTAs, links, nav activa)
        //   moss       → success (Activo, Pagado, Sincronizado)
        //   warning    → ámbar dorado (Por vencer)
        //   danger     → rojo profundo (Vencido) — alias de destructive
        ink: {
          900: "hsl(var(--ink-900))",
          700: "hsl(var(--ink-700))",
          500: "hsl(var(--ink-500))",
          400: "hsl(var(--ink-400))",
          300: "hsl(var(--ink-300))",
        },
        paper: {
          50:  "hsl(var(--paper-50))",
          100: "hsl(var(--paper-100))",
          200: "hsl(var(--paper-200))",
          300: "hsl(var(--paper-300))",
        },
        brick: {
          100: "hsl(var(--brick-100))",
          300: "hsl(var(--brick-300))",
          500: "hsl(var(--brick-500))",
          600: "hsl(var(--brick-600))",
          700: "hsl(var(--brick-700))",
        },
        moss: {
          100: "hsl(var(--moss-100))",
          500: "hsl(var(--moss-500))",
          700: "hsl(var(--moss-700))",
        },
        // `danger` es un alias semántico de destructive — los componentes
        // shadcn siguen leyendo destructive internamente, pero código de
        // app puede escribir bg-danger-100 / text-danger-500 / etc. para
        // aclarar la intención (vencidos, errores explícitos).
        danger: {
          100: "hsl(var(--danger-100))",
          500: "hsl(var(--danger-500))",
          700: "hsl(var(--danger-700))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        // Display — Fraunces. Aplicar SOLO en page headers grandes,
        // empty states amistosos y modales emocionales. NO usar en data
        // tables, KPI numbers, formularios, navegación o status pills.
        display: ["Fraunces", "Georgia", "serif"],
      },
      backgroundImage: {
        "paper-pattern":
          "radial-gradient(circle at 1px 1px, rgb(15 26 46 / 0.04) 1px, transparent 0)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
