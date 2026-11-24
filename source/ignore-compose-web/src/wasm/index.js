const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readBytes(source) {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`cannot fetch ${source}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
}

export async function load(source = new URL("./ignore_compose.wasm", import.meta.url)) {
    const { instance } = await WebAssembly.instantiate(await readBytes(source), {});
    const exports = instance.exports;

    function write(value) {
        const bytes = encoder.encode(typeof value === "string" ? value : JSON.stringify(value));
        const pointer = exports.ignore_compose_alloc(bytes.length);
        new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
        return { length: bytes.length, pointer };
    }

    function read(pointer, length) {
        return decoder.decode(new Uint8Array(exports.memory.buffer, pointer, length));
    }

    function call(name, inputs) {
        const written = inputs.map(write);
        const pointer = exports[name](...written.flatMap(input => [input.pointer, input.length]));
        const length = exports.ignore_compose_result_len();
        const text = read(pointer, length);
        exports.ignore_compose_free(pointer, length);
        written.forEach(input => exports.ignore_compose_dealloc(input.pointer, input.length));
        const result = JSON.parse(text);
        if (result.error) throw new Error(result.error);
        return result;
    }

    return {
        compose(config, sources) {
            return call("ignore_compose", [config, sources]).outputs;
        },
        composePreview(config, sources) {
            return call("ignore_compose_preview", [config, sources]).outputs;
        },
        plan(config) {
            return call("ignore_compose_plan", [config]);
        },
    };
}
