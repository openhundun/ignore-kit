pub fn plan_json(config_json: &str) -> String {
    let result = (|| -> Result<serde_json::Value, String> {
        let config = ignore_compose_lib::Composer::parse(config_json)?;
        Ok(serde_json::json!({ "upstreams": ignore_compose_lib::Composer::upstreams(&config), "outputs": config.outputs.keys().cloned().collect::<Vec<_>>() }))
    })();
    match result {
        Ok(value) => value.to_string(),
        Err(error) => serde_json::json!({ "error": error }).to_string(),
    }
}

pub fn compose_json(config_json: &str, sources_json: &str) -> String {
    let result = (|| -> Result<Vec<ignore_compose_lib::Output>, String> {
        let config = ignore_compose_lib::Composer::parse(config_json)?;
        let source_map: std::collections::BTreeMap<String, String> = serde_json::from_str(sources_json).map_err(|error| format!("invalid sources: {error}"))?;
        ignore_compose_lib::Composer::config(&config, &source_map)
    })();
    match result {
        Ok(output_list) => serde_json::json!({ "outputs": output_list }).to_string(),
        Err(error) => serde_json::json!({ "error": error }).to_string(),
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    static RESULT_LEN: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_alloc(len: usize) -> *mut u8 {
        if len == 0 {
            return std::ptr::null_mut();
        }
        unsafe { std::alloc::alloc(std::alloc::Layout::from_size_align_unchecked(len, 1)) }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_dealloc(ptr: *mut u8, len: usize) {
        if ptr.is_null() || len == 0 {
            return;
        }
        unsafe { std::alloc::dealloc(ptr, std::alloc::Layout::from_size_align_unchecked(len, 1)) }
    }

    pub fn read_input(ptr: *const u8, len: usize) -> &'static str {
        if ptr.is_null() || len == 0 {
            return "";
        }
        unsafe { std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or_default() }
    }

    pub fn response(value: String) -> *mut u8 {
        let boxed = value.into_bytes().into_boxed_slice();
        let len = boxed.len();
        let ptr = Box::into_raw(boxed) as *mut u8;
        RESULT_LEN.store(len, std::sync::atomic::Ordering::Relaxed);
        ptr
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_plan(config_ptr: *const u8, config_len: usize) -> *mut u8 {
        response(super::plan_json(read_input(config_ptr, config_len)))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose(config_ptr: *const u8, config_len: usize, sources_ptr: *const u8, sources_len: usize) -> *mut u8 {
        response(super::compose_json(read_input(config_ptr, config_len), read_input(sources_ptr, sources_len)))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_result_len() -> usize {
        RESULT_LEN.load(std::sync::atomic::Ordering::Relaxed)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ignore_compose_free(ptr: *mut u8, len: usize) {
        if ptr.is_null() || len == 0 {
            return;
        }
        unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) }
    }
}
