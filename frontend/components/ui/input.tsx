"use client";

/**
 * Alias wrapper for Tailwind Input component
 *
 * This file exists to support imports like:
 *   import { Input } from "@/components/ui/input";
 * while keeping the canonical implementation inside:
 *   frontend/components/tailwind/ui/input.tsx
 *
 * It re-exports the component and its props/type so both named and default
 * imports will continue to function as expected.
 */

import { Input } from "@/components/tailwind/ui/input";
export type { InputProps } from "@/components/tailwind/ui/input";

export { Input };
export default Input;
