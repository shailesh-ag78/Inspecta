// Theme definitions for the INSPECTA Dashboard
export interface Theme {
  name: string;
  id: string;
  header: {
    bg: string;
    text: string;
  };
  primary: {
    from: string;
    to: string;
  };
  secondary: {
    from: string;
    to: string;
  };
  logo: {
    from: string;
    to: string;
  };
  cardBorder: string;
  background: {
    gradient: string;
    section: string;
  };
  status: {
    urgent: string;
    medium: string;
    success: string;
  };
  filters: {
    border: string;
    focus: string;
  };
}

export const themes: Record<string, Theme> = {
  premiumBlue: {
    name: "Premium Gradient Blue",
    id: "premiumBlue",
    header: {
      bg: "bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-600",
      text: "text-white",
    },
    primary: {
      from: "from-blue-600",
      to: "to-cyan-600",
    },
    secondary: {
      from: "from-blue-900",
      to: "to-cyan-600",
    },
    logo: {
      from: "from-blue-400",
      to: "to-cyan-400",
    },
    cardBorder: "border-blue-300/40",
    background: {
      gradient: "bg-[var(--bg)]",
      section: "bg-[var(--bg)]",
    },
    status: {
      urgent: "bg-gradient-to-r from-rose-600 to-red-700",
      medium: "from-amber-500 to-orange-600",
      success: "from-cyan-500 to-blue-500",
    },
    filters: {
      border: "border-blue-200",
      focus: "border-blue-500 ring-blue-500/20",
    },
  },

  indigoSlate: {
    name: "Indigo Slate",
    id: "indigoSlate",
    header: {
      bg: "bg-gradient-to-r from-slate-900 via-slate-indigo-600 to-indigo-500 to-purple-900",
      text: "text-white",
    },
    primary: {
      from: "from-indigo-600",
      to: "to-purple-500",
    },
    secondary: {
      from: "from-indigo-600",
      to: "to-purple-500",
    },
    logo: {
      from: "from-indigo-600",
      to: "to-purple-500",
    },
    cardBorder: "border-indigo-200/40",
    background: {
      gradient: "bg-[var(--bg)]",
      section: "bg-[var(--bg)]",
    },
    status: {
      urgent: "bg-gradient-to-r from-red-600 to-rose-700",
      medium: "from-orange-500 to-amber-600",
      success: "from-purple-500 to-indigo-600",
    },
    filters: {
      border: "border-indigo-200",
      focus: "border-indigo-500 ring-indigo-500/20",
    },
  },
};

export const defaultTheme = themes.premiumBlue;
