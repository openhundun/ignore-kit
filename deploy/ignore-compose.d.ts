export type OverrideItem = { from: string, into: string, };

export type Entry = { upstream: Array<string>; override?: Array<OverrideItem>; };

export type Config = { $schema?: string; [path: string]: Array<Entry> | string | undefined; };
