"use client";

import { createElement, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { BoGridConfig, BoGridElement } from "bo-grid/element";

// Register the <bo-grid> custom element once, client-only (Svelte web component).
let elementReady: Promise<unknown> | null = null;
function registerElement(): Promise<unknown> {
  if (!elementReady) elementReady = import("bo-grid/element");
  return elementReady;
}

interface BoGridProps {
  config: Record<string, unknown>;
  style?: CSSProperties;
}

/**
 * React wrapper over the bo-grid web component (v1+). The whole grid API is passed
 * through the element's reactive `config` property; bo-grid v1 makes setting
 * `config` after attach safe, so the plain ref + effect pattern works.
 */
export default function BoGrid({ config, style }: BoGridProps) {
  const ref = useRef<BoGridElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    registerElement().then(() => {
      if (!cancelled && ref.current) ref.current.config = config as BoGridConfig;
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return createElement("bo-grid", {
    ref,
    style: { display: "block", width: "100%", ...style },
  });
}
