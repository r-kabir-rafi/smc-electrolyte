"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import styles from "./AppShell.module.css";
import {
  AlertTriangleIcon,
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  FlameIcon,
  FlaskIcon,
  GlobeIcon,
  LayersIcon,
  MapIcon,
  PanelLeftIcon,
  TrendingUpIcon,
  UserIcon,
  ZapIcon,
} from "./icons";
import { DataFreshness, type FreshnessItem } from "./ui/DataFreshness";
import { Button } from "./ui/Button";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: GlobeIcon },
  { href: "/map", label: "District Map", icon: MapIcon },
  { href: "/forecasts", label: "Forecasts", icon: TrendingUpIcon },
  { href: "/incidents", label: "Incidents", icon: AlertTriangleIcon },
  { href: "/triggers", label: "Trigger Builder", icon: ZapIcon },
  { href: "/heat-population", label: "Heat x Population", icon: LayersIcon },
  { href: "/experiments", label: "Experiments", icon: FlaskIcon },
] as const;

const freshnessItems: FreshnessItem[] = [
  { source: "ERA5-Land", lastRun: "4m ago", status: "ok" },
  { source: "GFS Forecast", lastRun: "12m ago", status: "ok" },
  { source: "GEFS Ensemble", lastRun: "38m ago", status: "warning" },
  { source: "Incident Feed", lastRun: "2h ago", status: "ok" },
];

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/dashboard": "Overview",
  "/map": "District Map",
  "/forecasts": "Forecasts",
  "/history": "Forecasts",
  "/incidents": "Incidents",
  "/triggers": "Trigger Builder",
  "/heat-population": "Heat x Population",
  "/experiments": "Experiments",
};

function prettifySegment(segment: string): string {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesPath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/forecasts" && pathname === "/history") return true;
  if (href === "/dashboard" && pathname === "/") return true;
  return false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const currentPath = pathname || "/";

  const pageTitle =
    pageTitles[currentPath] ||
    prettifySegment(currentPath.split("/").filter(Boolean).slice(-1)[0] || "Dashboard");
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length === 0) return ["Overview"];
    return parts.map((part) => prettifySegment(part));
  }, [currentPath]);

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`.trim()}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.sidebarHeader}>
            <Link href="/dashboard" className={styles.brand}>
              <span className={styles.brandGlyph}>
                <FlameIcon width={18} height={18} />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandTitle}>HeatOps</span>
                <span className={styles.brandMeta}>Precision Dark</span>
              </span>
            </Link>
            <Button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              iconOnly
              type="button"
              variant="ghost"
              onClick={() => setCollapsed((value) => !value)}
            >
              <PanelLeftIcon width={16} height={16} />
            </Button>
          </div>

          <nav className={styles.sidebarNav} aria-label="Primary navigation">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = matchesPath(currentPath, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? label : undefined}
                >
                  <Icon width={18} height={18} />
                  <span className={styles.navLabel}>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={styles.sidebarFooter}>
          <DataFreshness items={freshnessItems} compact={collapsed} />
          <div className={styles.userPanel}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.65rem" }}>
              <UserIcon width={18} height={18} />
              <div className={styles.userMeta}>
                <span className={styles.userName}>Ops Analyst</span>
                <span className={styles.userRole}>Campaign Ops</span>
              </div>
            </div>
            <Button aria-label="Open user menu" iconOnly type="button" variant="ghost">
              <ChevronRightIcon width={14} height={14} />
            </Button>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.topBarMeta}>
            <div className={styles.topBarTitle}>{pageTitle}</div>
            <div className={styles.breadcrumbs}>
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className={styles.crumb}>
                  {index > 0 ? <ChevronRightIcon width={12} height={12} /> : null}
                  <span>{crumb}</span>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.topBarSpacer} />

          <div className={styles.topBarControls}>
            <button className={styles.pillButton} type="button">
              <CalendarIcon width={14} height={14} />
              <span>Last 14 days</span>
            </button>
            <button className={styles.pillButton} type="button">
              <GlobeIcon width={14} height={14} />
              <span>BD</span>
            </button>
            <button className={styles.pillButton} type="button">
              <LayersIcon width={14} height={14} />
              <span>GEFS</span>
            </button>
            <Button aria-label="Notifications" iconOnly type="button" variant="ghost">
              <BellIcon width={16} height={16} />
            </Button>
          </div>
        </header>

        <main className={styles.content}>{children}</main>

        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = matchesPath(currentPath, href);
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.mobileNavItem} ${isActive ? styles.mobileNavItemActive : ""}`.trim()}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon width={16} height={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
