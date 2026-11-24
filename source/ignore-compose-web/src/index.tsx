import { render } from "solid-js/web";
import "./app.css";
import { App } from "./App";

// 模块图加载成功即置位；index.html 的 watchdog 只在模块图本身失败时提示。
(window as unknown as { ignoreComposeBooted?: boolean }).ignoreComposeBooted = true;

const root = document.getElementById("root");
if (root === null) {
    throw new Error("Missing #root mount node");
}
render(() => <App />, root);
