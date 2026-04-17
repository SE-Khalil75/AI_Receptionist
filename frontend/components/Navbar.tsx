"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const links = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="9" y="1" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="1" y="9" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="9" y="9" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    href: "/appointments",
    label: "Appointments",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3" width="13" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5 1.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M11 1.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="5.5" cy="9.5" r="0.75" fill="currentColor"/>
        <circle cx="8" cy="9.5" r="0.75" fill="currentColor"/>
        <circle cx="10.5" cy="9.5" r="0.75" fill="currentColor"/>
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M8 1.5v1M8 13.5v1M1.5 8h-1M15.5 8h-1M3.4 3.4l-.7-.7M13.3 13.3l-.7-.7M3.4 12.6l-.7.7M13.3 2.7l-.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/test",
    label: "Test Agent",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2v-2H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [activeCalls, setActiveCalls] = useState(0);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.activeCalls();
        setActiveCalls((res.data ?? []).length);
      } catch {}
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col"
      style={{
        width: '240px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div className="px-6 pt-7 pb-6">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: '32px',
              height: '32px',
              background: 'var(--amber-dim)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--amber)' }}>
              <path d="M3 2.5c-.3 0-.5.2-.5.5v2c0 4.4 3.6 8 8 8h2c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5h-2.5l-1-1.5c-.1-.2-.4-.3-.6-.2L7 9.5C5.8 8.8 5 7.5 5 6c0-.2 0-.4.1-.5L6.5 4c.1-.2.1-.5-.1-.7L5 1.8c-.1-.2-.3-.3-.5-.3H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-syne)',
                fontSize: '14px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                lineHeight: '1.2',
              }}
            >
              AI Receptionist
            </div>
            <div
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '10px',
                color: 'var(--text-dim)',
                letterSpacing: '0.06em',
              }}
            >
              COMMAND CENTER
            </div>
          </div>
        </Link>
      </div>

      <hr className="divider" />

      {/* Active call banner */}
      {activeCalls > 0 && (
        <div
          className="mx-4 mt-4 px-3 py-2 flex items-center gap-2"
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '2px',
          }}
        >
          <span className="live-dot" style={{ flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '11px',
              color: 'var(--green)',
            }}
          >
            {activeCalls} call{activeCalls > 1 ? 's' : ''} live
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        <div
          className="px-3 pb-2"
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '10px',
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Navigation
        </div>
        {links.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-150",
              )}
              style={{
                background: active ? 'var(--amber-dim)' : 'transparent',
                color: active ? 'var(--amber)' : 'var(--text-secondary)',
                borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
                fontSize: '13px',
                fontWeight: active ? '500' : '400',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
              <span>{label}</span>
              {href === '/test' && activeCalls > 0 && (
                <span className="ml-auto live-dot-amber" style={{ width: '6px', height: '6px' }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-6 py-5"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '10px',
            color: 'var(--text-dim)',
            lineHeight: '1.8',
          }}
        >
          <div>SYS STATUS <span style={{ color: 'var(--green)' }}>● ONLINE</span></div>
          <div>BUILD v1.0.0</div>
        </div>
      </div>
    </aside>
  );
}
