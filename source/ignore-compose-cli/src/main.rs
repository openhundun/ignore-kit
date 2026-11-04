const USAGE: &str = "\
ignore-compose: compose ignore files from upstream templates

USAGE:
    ignore-compose [OPTIONS]

OPTIONS:
    -f, --config <path>  Path to ignore-compose.json (default: nearest ancestor)
    --check              Verify outputs are up to date without writing
    --verbose            Print fetch progress
    -h, --help           Print this help
    -V, --version        Print version
";

struct Options {
    config: Option<std::path::PathBuf>,
    check: bool,
    verbose: bool,
}

fn main() {
    let code = match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("error: {error}");
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<i32, String> {
    let Some(options) = parse_args()? else {
        return Ok(0);
    };
    let config_path = match options.config {
        Some(path) => path,
        None => find_config()?,
    };
    let config_path = std::fs::canonicalize(&config_path).map_err(|error| format!("cannot resolve {}: {error}", config_path.display()))?;
    let config_dir = config_path.parent().map(std::path::Path::to_path_buf).unwrap_or_else(|| std::path::PathBuf::from("."));
    let text = std::fs::read_to_string(&config_path).map_err(|error| format!("cannot read {}: {error}", config_path.display()))?;
    let config = ignore_compose_lib::Composer::parse(&text).map_err(|error| format!("{}: {error}", config_path.display()))?;
    let source_map = ignore_compose_lib::Composer::upstreams(&config)
        .into_iter()
        .map(|upstream| {
            if options.verbose {
                eprintln!("fetch {upstream}");
            }
            fetch(&upstream, &config_dir).map(|text| (upstream, text))
        })
        .collect::<Result<std::collections::BTreeMap<String, String>, String>>()?;
    let output_list = ignore_compose_lib::Composer::config(&config, &source_map)?;
    output_list.iter().try_for_each(|output| {
        if !ignore_compose_lib::Composer::is_gitignore(&output.path) {
            return Ok(());
        }
        let shadowed_list = shadowed_paths(&config_dir, output, options.verbose)?;
        if shadowed_list.is_empty() {
            return Ok(());
        }
        let mut message = format!("{} would ignore {} tracked path(s):", output.path, shadowed_list.len());
        shadowed_list.iter().take(20).for_each(|path| {
            message.push_str("\n  ");
            message.push_str(path);
        });
        if shadowed_list.len() > 20 {
            message.push_str("\n  ...");
        }
        Err(message)
    })?;
    if options.check {
        return Ok(check_outputs(&config_dir, &output_list));
    }
    output_list.iter().try_for_each(|output| write_output(&config_dir, output))?;
    Ok(0)
}

fn parse_args() -> Result<Option<Options>, String> {
    let mut options = Options { config: None, check: false, verbose: false };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "-h" | "--help" => {
                print!("{USAGE}");
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("ignore-compose {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "--check" => options.check = true,
            "--verbose" => options.verbose = true,
            "-f" | "--config" => {
                index += 1;
                let value = args.get(index).ok_or("--config requires a path")?;
                options.config = Some(std::path::PathBuf::from(value));
            }
            other => return Err(format!("unknown argument: {other}\n\n{USAGE}")),
        }
        index += 1;
    }
    Ok(Some(options))
}

fn find_config() -> Result<std::path::PathBuf, String> {
    let mut directory = std::env::current_dir().map_err(|error| format!("cannot read working directory: {error}"))?;
    loop {
        let candidate = directory.join("ignore-compose.json");
        if candidate.is_file() {
            return Ok(candidate);
        }
        if !directory.pop() {
            break;
        }
    }
    Err("cannot find ignore-compose.json (use --config)".to_string())
}

fn fetch(upstream: &str, config_dir: &std::path::Path) -> Result<String, String> {
    if let Some(path) = upstream.strip_prefix("file://") {
        return std::fs::read_to_string(path).map_err(|error| format!("cannot read {path}: {error}"));
    }
    if upstream.starts_with("http://") || upstream.starts_with("https://") {
        let response = ureq::get(upstream)
            .timeout(std::time::Duration::from_secs(30))
            .call()
            .map_err(|error| format!("GET {upstream}: {error}"))?;
        return response.into_string().map_err(|error| format!("GET {upstream}: cannot read body: {error}"));
    }
    if upstream.contains("://") {
        return Err(format!("unsupported upstream scheme: {upstream}"));
    }
    let path = config_dir.join(upstream);
    std::fs::read_to_string(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))
}

fn shadowed_paths(config_dir: &std::path::Path, output: &ignore_compose_lib::Output, verbose: bool) -> Result<Vec<String>, String> {
    use std::io::Write;
    use std::process::Command;
    use std::process::Stdio;
    let repository = Command::new("git")
        .arg("-C")
        .arg(config_dir)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|error| format!("cannot run git: {error}"))?;
    if !repository.status.success() {
        if verbose {
            eprintln!("skip guard {}: not inside a git repository", output.path);
        }
        return Ok(Vec::new());
    }
    let tracked = Command::new("git")
        .arg("-C")
        .arg(config_dir)
        .args(["-c", "core.quotepath=false", "ls-files"])
        .output()
        .map_err(|error| format!("cannot run git ls-files: {error}"))?;
    if !tracked.status.success() {
        return Err(format!("git ls-files failed: {}", String::from_utf8_lossy(&tracked.stderr).trim()));
    }
    let probe = tempfile::tempdir().map_err(|error| format!("cannot create probe directory: {error}"))?;
    let initialized = Command::new("git")
        .arg("init")
        .arg("-q")
        .arg(probe.path())
        .output()
        .map_err(|error| format!("cannot run git init: {error}"))?;
    if !initialized.status.success() {
        return Err(format!("git init failed: {}", String::from_utf8_lossy(&initialized.stderr).trim()));
    }
    let target = probe.path().join(&output.path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    }
    std::fs::write(&target, &output.content).map_err(|error| format!("cannot write {}: {error}", target.display()))?;
    let mut child = Command::new("git")
        .arg("-C")
        .arg(probe.path())
        .args(["-c", "core.excludesFile=/dev/null", "check-ignore", "--stdin", "--no-index"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot run git check-ignore: {error}"))?;
    child
        .stdin
        .as_mut()
        .ok_or("cannot open git check-ignore stdin")?
        .write_all(&tracked.stdout)
        .map_err(|error| format!("cannot feed git check-ignore: {error}"))?;
    let result = child.wait_with_output().map_err(|error| format!("cannot wait for git check-ignore: {error}"))?;
    match result.status.code() {
        Some(1) => Ok(Vec::new()),
        Some(0) => Ok(String::from_utf8_lossy(&result.stdout).lines().filter(|line| !line.is_empty()).map(str::to_string).collect()),
        _ => Err(format!("git check-ignore failed: {}", String::from_utf8_lossy(&result.stderr).trim())),
    }
}

fn write_output(config_dir: &std::path::Path, output: &ignore_compose_lib::Output) -> Result<(), String> {
    use std::io::Write;
    let target = config_dir.join(&output.path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&target)
        .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
    file.write_all(output.content.as_bytes()).map_err(|error| format!("cannot write {}: {error}", target.display()))?;
    file.flush().map_err(|error| format!("cannot flush {}: {error}", target.display()))?;
    eprintln!("wrote {} ({} rules)", output.path, rule_count(&output.content));
    Ok(())
}

fn check_outputs(config_dir: &std::path::Path, output_list: &[ignore_compose_lib::Output]) -> i32 {
    let mut drift = false;
    output_list.iter().for_each(|output| {
        let target = config_dir.join(&output.path);
        let current = std::fs::read_to_string(&target).ok();
        if current.as_deref() == Some(output.content.as_str()) {
            eprintln!("ok {}", output.path);
            return;
        }
        drift = true;
        match current {
            Some(current) => eprintln!("drift {} ({})", output.path, first_difference(&output.content, &current)),
            None => eprintln!("drift {} (missing)", output.path),
        }
    });
    if drift { 1 } else { 0 }
}

fn rule_count(content: &str) -> usize {
    content.lines().filter(|line| !line.is_empty()).count()
}

fn first_difference(expected: &str, actual: &str) -> String {
    let expected_lines: Vec<&str> = expected.lines().collect();
    let actual_lines: Vec<&str> = actual.lines().collect();
    for index in 0..expected_lines.len().max(actual_lines.len()) {
        let left = expected_lines.get(index).copied().unwrap_or("<missing>");
        let right = actual_lines.get(index).copied().unwrap_or("<missing>");
        if left != right {
            return format!("line {}: expected {:?}, found {:?}", index + 1, left, right);
        }
    }
    "content differs".to_string()
}
