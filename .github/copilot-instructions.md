# Versioning

- Whenever you make a code change in this repository, automatically bump the project version by one patch release, unless the user explicitly requests a minor or major release.
- A patch release increments only the patch component (for example, `0.1.1` to `0.1.2`). A minor release increments the minor component and resets patch to zero (for example, `0.1.1` to `0.2.0`). A major release increments the major component and resets minor and patch to zero (for example, `0.1.1` to `1.0.0`).
- Only bump minor or major when the user explicitly says to update/bump the minor or major version. Otherwise, always use patch.
- Keep all project version declarations synchronized when bumping the version, including `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.