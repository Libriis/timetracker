// True inside the Tauri desktop shell, false in a plain browser (vite dev server, tests, Node).

export const IS_TAURI = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
