use std::path::Path;

pub fn detect_language(project_path: &Path) -> Option<String> {
    // 優先度順にチェック
    if project_path.join("Cargo.toml").exists() {
        return Some("Rust".to_string());
    }
    if project_path.join("go.mod").exists() {
        return Some("Go".to_string());
    }
    if project_path.join("pom.xml").exists() || project_path.join("build.gradle").exists() {
        return Some("Java".to_string());
    }
    if project_path.join("package.json").exists() {
        return detect_js_or_ts(project_path);
    }
    if project_path.join("pyproject.toml").exists()
        || project_path.join("setup.py").exists()
        || project_path.join("requirements.txt").exists()
    {
        return Some("Python".to_string());
    }
    if has_only_extension(project_path, "sh") {
        return Some("Shell".to_string());
    }
    None
}

fn detect_js_or_ts(project_path: &Path) -> Option<String> {
    let pkg_path = project_path.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            // tsconfig.json の存在チェック
            if project_path.join("tsconfig.json").exists() {
                return Some("TypeScript".to_string());
            }
            // devDependencies / dependencies に typescript があるかチェック
            for key in &["dependencies", "devDependencies"] {
                if let Some(deps) = json.get(key).and_then(|v| v.as_object()) {
                    if deps.contains_key("typescript") {
                        return Some("TypeScript".to_string());
                    }
                }
            }
        }
    }
    Some("JavaScript".to_string())
}

fn has_only_extension(dir: &Path, ext: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    let mut found = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if path.extension().and_then(|e| e.to_str()) == Some(ext) {
                found = true;
            }
        }
    }
    found
}
