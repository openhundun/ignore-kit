fn main() {
    let code = match Cli::run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("error: {error}");
            1
        }
    };
    std::process::exit(code);
}

struct Options {
    config: Option<std::path::PathBuf>,
    check: bool,
    write: bool,
    verbose: bool,
}

enum Invocation {
    Gen(Options),
    Schema,
    Dts,
    Done,
}

struct Cli;

impl Cli {
    fn run() -> Result<i32, String> {
        match Self::parse_args()? {
            Invocation::Done => Ok(0),
            Invocation::Schema => Printer::text(&Contract::schema()?).map(|()| 0),
            Invocation::Dts => Printer::text(&Contract::typescript()).map(|()| 0),
            Invocation::Gen(options) => Self::execute(options),
        }
    }

    fn execute(options: Options) -> Result<i32, String> {
        let config_path = match options.config {
            Some(path) => path,
            None => Self::find_config()?,
        };
        let config_path = std::fs::canonicalize(&config_path).map_err(|error| format!("cannot resolve {}: {error}", config_path.display()))?;
        let config_dir = config_path.parent().map(std::path::Path::to_path_buf).unwrap_or_else(|| std::path::PathBuf::from("."));
        let text = std::fs::read_to_string(&config_path).map_err(|error| format!("cannot read {}: {error}", config_path.display()))?;
        let config = ignore_compose_lib::Composer::parse(&text).map_err(|error| format!("{}: {error}", config_path.display()))?;
        let source_map = ignore_compose_lib::Composer::upstreams(&config)
            .into_iter()
            .map(|upstream| {
                (options.verbose).then(|| eprintln!("fetch {upstream}"));
                Upstream::fetch(&upstream, &config_dir).map(|text| (upstream, text))
            })
            .collect::<Result<std::collections::BTreeMap<String, String>, String>>()?;
        let output_list = ignore_compose_lib::Composer::config(&config, &source_map)?;
        if options.check || options.write {
            output_list
                .iter()
                .filter(|output| Guard::is_gitignore(&output.path))
                .try_for_each(|output| Guard::verify(&config_dir, output, options.verbose))?;
        }
        match (options.check, options.write) {
            (true, _) => Ok(Checker::check(&config_dir, &output_list)),
            (false, true) => output_list.iter().try_for_each(|output| Writer::write(&config_dir, output)).map(|()| 0),
            (false, false) => Printer::outputs(&output_list).map(|()| 0),
        }
    }

    fn parse_args() -> Result<Invocation, String> {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.iter().any(|arg| arg == "-v" || arg == "-V" || arg == "--version") {
            println!("ignore-compose {}", env!("CARGO_PKG_VERSION"));
            return Ok(Invocation::Done);
        }
        let Some(command) = args.first() else {
            return Err("missing command (gen, schema, dts)".to_string());
        };
        match command.as_str() {
            "gen" => Self::parse_options(&args[1..]).map(Invocation::Gen),
            "schema" => {
                if let Some(argument) = args.get(1) {
                    return Err(format!("schema takes no arguments: {argument}"));
                }
                Ok(Invocation::Schema)
            }
            "dts" => {
                if let Some(argument) = args.get(1) {
                    return Err(format!("dts takes no arguments: {argument}"));
                }
                Ok(Invocation::Dts)
            }
            other => Err(format!("unknown command: {other}")),
        }
    }

    fn parse_options(args: &[String]) -> Result<Options, String> {
        let mut options = Options { config: None, check: false, write: false, verbose: false };
        let mut iterator = args.iter();
        while let Some(arg) = iterator.next() {
            match arg.as_str() {
                "--check" => options.check = true,
                "-w" | "--write" => options.write = true,
                "--verbose" => options.verbose = true,
                "-f" | "--config" => {
                    let value = iterator.next().ok_or("--config requires a path")?;
                    options.config = Some(std::path::PathBuf::from(value));
                }
                other => Err(format!("unknown argument: {other}"))?,
            }
        }
        if options.check && options.write {
            return Err("--check and --write are mutually exclusive".to_string());
        }
        Ok(options)
    }

    fn find_config() -> Result<std::path::PathBuf, String> {
        let directory = std::env::current_dir().map_err(|error| format!("cannot read working directory: {error}"))?;
        directory
            .ancestors()
            .map(|candidate| candidate.join("ignore-compose.json"))
            .find(|candidate| candidate.is_file())
            .ok_or_else(|| "cannot find ignore-compose.json (use --config)".to_string())
    }
}

struct Upstream;

impl Upstream {
    fn fetch(upstream: &str, config_dir: &std::path::Path) -> Result<String, String> {
        if let Some(path) = upstream.strip_prefix("file://") {
            std::fs::read_to_string(path).map_err(|error| format!("cannot read {path}: {error}"))
        } else if upstream.starts_with("http://") || upstream.starts_with("https://") {
            let response = ureq::get(upstream)
                .timeout(std::time::Duration::from_secs(30))
                .call()
                .map_err(|error| format!("GET {upstream}: {error}"))?;
            response.into_string().map_err(|error| format!("GET {upstream}: cannot read body: {error}"))
        } else if upstream.contains("://") {
            Err(format!("unsupported upstream scheme: {upstream}"))
        } else {
            let path = config_dir.join(upstream);
            std::fs::read_to_string(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))
        }
    }
}

struct Guard;

impl Guard {
    fn is_gitignore(path: &str) -> bool {
        std::path::Path::new(path).file_name().and_then(|name| name.to_str()) == Some(".gitignore")
    }

    fn verify(config_dir: &std::path::Path, output: &ignore_compose_lib::Output, verbose: bool) -> Result<(), String> {
        let shadowed_list = Self::shadowed_paths(config_dir, output, verbose)?;
        let mut message = format!("{} would ignore {} tracked path(s):", output.path, shadowed_list.len());
        shadowed_list.iter().take(20).for_each(|path| {
            message.push_str("\n  ");
            message.push_str(path);
        });
        ignore_compose_lib::CheckUtil::ensure(shadowed_list.is_empty(), || message)
    }

    fn shadowed_paths(config_dir: &std::path::Path, output: &ignore_compose_lib::Output, verbose: bool) -> Result<Vec<String>, String> {
        let repository = std::process::Command::new("git")
            .arg("-C")
            .arg(config_dir)
            .args(["rev-parse", "--show-toplevel"])
            .output()
            .map_err(|error| format!("cannot run git: {error}"))?;
        let inside_repository = repository.status.success();
        if verbose && !inside_repository {
            eprintln!("skip guard {}: not inside a git repository", output.path);
        }
        inside_repository.then(|| Self::listed_paths(config_dir, output)).transpose().map(|value| value.unwrap_or_default())
    }

    fn listed_paths(config_dir: &std::path::Path, output: &ignore_compose_lib::Output) -> Result<Vec<String>, String> {
        use std::io::Write;
        use std::process::Stdio;
        let tracked = std::process::Command::new("git")
            .arg("-C")
            .arg(config_dir)
            .args(["-c", "core.quotepath=false", "ls-files"])
            .output()
            .map_err(|error| format!("cannot run git ls-files: {error}"))?;
        let tracked_stdout = tracked
            .status
            .success()
            .then_some(tracked.stdout)
            .ok_or_else(|| format!("git ls-files failed: {}", String::from_utf8_lossy(&tracked.stderr).trim()))?;
        let probe = tempfile::tempdir().map_err(|error| format!("cannot create probe directory: {error}"))?;
        let initialized = std::process::Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(probe.path())
            .output()
            .map_err(|error| format!("cannot run git init: {error}"))?;
        ignore_compose_lib::CheckUtil::ensure(initialized.status.success(), || format!("git init failed: {}", String::from_utf8_lossy(&initialized.stderr).trim()))?;
        let target = probe.path().join(&output.path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
        }
        std::fs::write(&target, &output.content).map_err(|error| format!("cannot write {}: {error}", target.display()))?;
        let mut child = std::process::Command::new("git")
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
            .write_all(&tracked_stdout)
            .map_err(|error| format!("cannot feed git check-ignore: {error}"))?;
        let result = child.wait_with_output().map_err(|error| format!("cannot wait for git check-ignore: {error}"))?;
        match result.status.code() {
            Some(1) => Ok(Vec::new()),
            Some(0) => Ok(String::from_utf8_lossy(&result.stdout).lines().filter(|line| !line.is_empty()).map(str::to_string).collect()),
            _ => Err(format!("git check-ignore failed: {}", String::from_utf8_lossy(&result.stderr).trim())),
        }
    }
}

struct Writer;

impl Writer {
    fn write(config_dir: &std::path::Path, output: &ignore_compose_lib::Output) -> Result<(), String> {
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
        eprintln!("wrote {} ({} rules)", output.path, TextUtil::rule_count(&output.content));
        Ok(())
    }
}

struct Printer;

impl Printer {
    fn text(text: &str) -> Result<(), String> {
        use std::io::Write;
        let mut stdout = std::io::stdout().lock();
        stdout.write_all(text.as_bytes()).map_err(|error| format!("cannot write stdout: {error}"))?;
        stdout.flush().map_err(|error| format!("cannot flush stdout: {error}"))
    }

    fn outputs(output_list: &[ignore_compose_lib::Output]) -> Result<(), String> {
        use std::io::Write;
        let stdout = std::io::stdout();
        let mut writer = stdout.lock();
        let multiple = output_list.len() > 1;
        output_list.iter().try_for_each(|output| {
            if multiple {
                writeln!(writer, "==> {}", output.path).map_err(|error| format!("cannot write stdout: {error}"))?;
            }
            writer.write_all(output.content.as_bytes()).map_err(|error| format!("cannot write stdout: {error}"))?;
            if !output.content.ends_with('\n') {
                writeln!(writer).map_err(|error| format!("cannot write stdout: {error}"))?;
            }
            Ok::<(), String>(())
        })?;
        writer.flush().map_err(|error| format!("cannot flush stdout: {error}"))
    }
}

struct Checker;

impl Checker {
    fn check(config_dir: &std::path::Path, output_list: &[ignore_compose_lib::Output]) -> i32 {
        let mut drift = false;
        output_list.iter().for_each(|output| {
            let current = std::fs::read_to_string(config_dir.join(&output.path)).ok();
            let up_to_date = current.as_deref() == Some(output.content.as_str());
            drift |= !up_to_date;
            let status = match (&current, up_to_date) {
                (_, true) => format!("ok {}", output.path),
                (None, false) => format!("drift {} (missing)", output.path),
                (Some(current), false) => format!("drift {} ({})", output.path, TextUtil::first_difference(&output.content, current)),
            };
            eprintln!("{status}");
        });
        match drift {
            true => 1,
            false => 0,
        }
    }
}

struct TextUtil;

impl TextUtil {
    fn rule_count(content: &str) -> usize {
        content.lines().filter(|line| !line.is_empty()).count()
    }

    fn first_difference(expected: &str, actual: &str) -> String {
        let expected_lines: Vec<&str> = expected.lines().collect();
        let actual_lines: Vec<&str> = actual.lines().collect();
        (0..expected_lines.len().max(actual_lines.len()))
            .map(|index| {
                (
                    index,
                    expected_lines.get(index).copied().unwrap_or("<missing>"),
                    actual_lines.get(index).copied().unwrap_or("<missing>"),
                )
            })
            .find(|(_, left, right)| left != right)
            .map_or_else(
                || "content differs".to_string(),
                |(index, left, right)| format!("line {}: expected {:?}, found {:?}", index + 1, left, right),
            )
    }
}

struct Contract;

impl Contract {
    fn schema() -> Result<String, String> {
        let mut value = serde_json::to_value(schemars::schema_for!(ignore_compose_lib::Config)).map_err(|error| format!("cannot serialize schema: {error}"))?;
        let object = value.as_object_mut().ok_or_else(|| "schema is not an object".to_string())?;
        object.insert(
            "$id".to_string(),
            serde_json::Value::String("https://raw.githubusercontent.com/openhundun/ignore-kit/main/deploy/ignore-compose.schema.json".to_string()),
        );
        let mut content = serde_json::to_string_pretty(&value).map_err(|error| format!("cannot format schema: {error}"))?;
        content.push('\n');
        Ok(content)
    }

    fn typescript() -> String {
        let config = ts_rs::Config::default();
        let declaration_list = [
            format!("export {}", <ignore_compose_lib::OverrideItem as ts_rs::TS>::decl(&config)),
            format!("export {}", <ignore_compose_lib::Entry as ts_rs::TS>::decl(&config)),
            format!("export {}", <ignore_compose_lib::Config as ts_rs::TS>::decl(&config)),
        ];
        format!("{}\n", declaration_list.join("\n\n"))
    }
}
