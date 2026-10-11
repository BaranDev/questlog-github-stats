//! Embeds every file under art/ and static/ into the binary, so the binary is the whole deployable and adding a scene needs
//! only files.
use std::{env, fs, path::Path};

fn walk(dir: &Path, root: &Path, base: &str, out: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            walk(&p, root, base, out);
        } else {
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
            out.push(format!("    ({rel:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/{base}/{rel}\"))),"));
        }
    }
}

fn emit(dir: &str, table: &str, file: &str) {
    println!("cargo:rerun-if-changed={dir}");
    let mut lines = Vec::new();
    walk(Path::new(dir), Path::new(dir), dir, &mut lines);
    let src = format!("pub static {table}: &[(&str, &[u8])] = &[
{}
];
", lines.join("
"));
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join(file), src).unwrap();
}

fn main() {
    emit("art", "FILES", "art_files.rs");
    emit("static", "STATIC_FILES", "static_files.rs");
}
