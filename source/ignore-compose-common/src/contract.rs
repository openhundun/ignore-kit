pub struct Artifact {
    path: std::path::PathBuf,
    content: String,
}

impl Artifact {
    pub fn write(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
        }
        std::fs::write(&self.path, &self.content).map_err(|error| format!("cannot write {}: {error}", self.path.display()))?;
        println!("wrote {}", self.path.display());
        Ok(())
    }
}

pub struct Contract {
    root: std::path::PathBuf,
}

impl Contract {
    pub fn new(root: std::path::PathBuf) -> Self {
        Self { root }
    }

    pub fn from_current() -> Result<Self, String> {
        std::env::current_dir().map(Self::new).map_err(|error| format!("cannot resolve working directory: {error}"))
    }

    pub fn schema(&self) -> Result<Artifact, String> {
        let mut value = serde_json::to_value(schemars::schema_for!(crate::Config)).map_err(|error| format!("cannot serialize schema: {error}"))?;
        let object = value.as_object_mut().ok_or_else(|| "schema is not an object".to_string())?;
        object.insert(
            "$id".to_string(),
            serde_json::Value::String("https://raw.githubusercontent.com/openhundun/ignore-kit/main/deploy/ignore-compose.schema.json".to_string()),
        );
        let mut content = serde_json::to_string_pretty(&value).map_err(|error| format!("cannot format schema: {error}"))?;
        content.push('\n');
        Ok(Artifact { path: self.root.join("deploy/ignore-compose.schema.json"), content })
    }

    pub fn typescript(&self) -> Artifact {
        let config = ts_rs::Config::default();
        let declaration_list = [
            format!("export {}", <crate::OverrideItem as ts_rs::TS>::decl(&config)),
            format!("export {}", <crate::Entry as ts_rs::TS>::decl(&config)),
            format!("export {}", <crate::Config as ts_rs::TS>::decl(&config)),
        ];
        let content = format!("// Generated from Rust types; do not edit.\n\n{}\n", declaration_list.join("\n\n"));
        Artifact { path: self.root.join("deploy/ignore-compose.d.ts"), content }
    }

    pub fn write(&self) -> Result<(), String> {
        self.schema()?.write()?;
        self.typescript().write()
    }
}
