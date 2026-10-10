//! Embeds every file under art/ into the binary, so the binary is the whole deployable and adding a scene needs
//! only files.
use std::{env, fs, path::Path};

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            walk(&p, root, out);
        } else {
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
            out.push(format!("    ({rel:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/art/{rel}\"))),"));
        }
    }
}

fn main() {
    println!("cargo:rerun-if-changed=art");
    let mut lines = Vec::new();
    walk(Path::new("art"), Path::new("art"), &mut lines);
    let src = format!("pub static FILES: &[(&str, &[u8])] = &[\n{}\n];\n", lines.join("\n"));
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("art_files.rs"), src).unwrap();
}
