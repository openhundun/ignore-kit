// Generated from Rust types; do not edit.

export type OverrideItem = { from: string; into: string };

export type Entry = { upstream: string; override?: Array<OverrideItem> };

export type Config = { $schema?: string; [path: string]: Array<Entry> | string | undefined };
