dev:
    cd app && npm run tauri -- dev

build:
    cd app && npm run tauri -- build

test:
    cd app/src-tauri && cargo test
