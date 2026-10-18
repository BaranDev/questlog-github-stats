//! Embeds every file under art/ and static/ into the binary, so the binary is the whole deployable and adding a scene needs
//! only files. Also stamps RENDER_VERSION, a hash of everything a card is drawn from (art, fonts, code), so cards
//! saved on disk by one build are never served by another.
use std::hash::{DefaultHasher, Hash, Hasher};
use std::{env, fs, path::Path};

fn hash_tree(dir: &Path, h: &mut DefaultHasher) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut paths: Vec<_> = entries.map(|e| e.unwrap().path()).collect();
    paths.sort();
    for p in paths {
        if p.is_dir() {
            hash_tree(&p, h);
        } else {
            p.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/").hash(h);
            fs::read(&p).unwrap_or_default().hash(h);
        }
    }
}

fn walk(dir: &Path, root: &Path, base: &str, out: &mut Vec<String>) {
    // static/ is the site build output; a fresh clone without it still compiles (the pages then 404).
    let Ok(dir_entries) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = dir_entries.map(|e| e.unwrap().path()).collect();
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
    let mut h = DefaultHasher::new();
    for dir in ["art", "fonts", "src", "tests/fixtures"] {
        println!("cargo:rerun-if-changed={dir}");
        hash_tree(Path::new(dir), &mut h);
    }
    println!("cargo:rustc-env=RENDER_VERSION={:016x}", h.finish());
}
