/**
 * src/components/notes/NoteBreadcrumbs.tsx
 * Arca — Notes パンくずナビゲーション (Apple HIG × Arca デザインシステム準拠)
 *
 * 準拠:
 * - references/apple_hig_master.md
 * - Core/Rules.md
 * - src/lib/designSystem.ts
 */

import React from "react";
import type { NoteBreadcrumb } from "../../types";
import { C } from "../../lib/designSystem";

const ChevronRightIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, opacity: 0.45, margin: "0 0.35rem" }}
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export interface NoteBreadcrumbsProps {
  breadcrumbs: NoteBreadcrumb[];
  onSelectBreadcrumb: (id: string | null) => void;
}

export function NoteBreadcrumbs({
  breadcrumbs,
  onSelectBreadcrumb,
}: NoteBreadcrumbsProps) {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="階層ナビゲーション"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        width: "100%",
        maxWidth: "100%",
        marginBottom: "1.2rem",
        padding: "0.2rem 0.1rem",
        fontSize: "0.82rem",
        lineHeight: 1.4,
      }}
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={crumb.id ?? "root-crumb"}>
            {index > 0 && <ChevronRightIcon />}

            {isLast ? (
              <span
                aria-current="page"
                style={{
                  fontWeight: 650,
                  color: C.charcoal,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  maxWidth: "240px",
                  display: "inline-block",
                  flexShrink: 0,
                  letterSpacing: "-0.01em",
                }}
                title={crumb.title}
              >
                {crumb.title}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSelectBreadcrumb(crumb.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.25rem 0.4rem",
                  margin: "-0.25rem 0",
                  borderRadius: "6px",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  maxWidth: "180px",
                  display: "inline-flex",
                  alignItems: "center",
                  flexShrink: 0,
                  transition: "color 0.15s ease, background 0.15s ease",
                  fontSize: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = C.goldDark;
                  e.currentTarget.style.background = C.goldFaint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = C.charcoalLight;
                  e.currentTarget.style.background = "transparent";
                }}
                title={`${crumb.title} へ移動`}
              >
                {crumb.title}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
