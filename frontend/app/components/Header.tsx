"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Header({ theme, onToggleTheme }: HeaderProps) {
  const isDark = theme === "dark";
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "18px 40px",
        borderBottom: "1px solid var(--line-strong)",
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--bg)",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none", color: "inherit" }}>
        <img
          src="/mm-logo.png"
          alt="Merchant Marquee"
          style={{ height: 32, width: "auto", flex: "0 0 auto" }}
        />
        <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
          <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 24, letterSpacing: "-0.3px" }}>
            Merchant Marquee
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            product ad studio
          </span>
        </div>
      </Link>
      <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
    </header>
  );
}
