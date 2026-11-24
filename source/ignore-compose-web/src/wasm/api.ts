import type { ComposeConfig, ComposeOutput, PlanResult } from "../types";
import { load } from "./index.js";

/** index.js 返回的 wasm 宿主 API（compose/plan 均为同步调用，加载本身是异步的）。 */
export interface ComposeApi {
    compose(config: ComposeConfig, sources: Record<string, string>): ComposeOutput[];
    composePreview(config: ComposeConfig, sources: Record<string, string>): ComposeOutput[];
    plan(config: ComposeConfig): PlanResult;
}

/**
 * 加载 dist 根目录下的 ignore_compose.wasm。
 * 相对 document.baseURI 解析，dev 与 dist 两种形态都以站点根为 wasm 位置。
 */
export async function loadComposeApi(): Promise<ComposeApi> {
    return (await load(new URL("ignore_compose.wasm", document.baseURI))) as ComposeApi;
}
