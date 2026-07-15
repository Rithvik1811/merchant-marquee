"use client";

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

// Relies on the --paper / --paper-deep / --hair-strong / --accent / --shadow / --ease
// custom properties, which both .pc-home and .pc-studio define identically —
// this renders the same everywhere those scopes are in effect.
export default function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "relative",
        width: 52,
        height: 28,
        borderRadius: 999,
        border: "1px solid var(--hair-strong)",
        background: "var(--paper-deep)",
        cursor: "pointer",
        padding: 0,
        flex: "0 0 auto",
        transition: "background-color .3s var(--ease)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "var(--paper)",
          boxShadow: "0 1px 3px var(--shadow)",
          transition: "transform .35s var(--ease)",
          transform: `translateX(${isDark ? "24px" : "0"})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isDark ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        )}
      </span>
    </button>
  );
}
