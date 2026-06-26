# Tinta Desktop — build automation.
#
# Asume que tinta-core vive en `../tinta-core` (estructura del monorepo
# folder-level, no submodule). Si no es así, override con:
#
#   make build-mac TINTA_CORE=/ruta/a/tinta-core

TINTA_CORE ?= ../tinta-core
# El sidecar se compila a la RAÍZ de src-tauri, no a binaries/. Tauri busca
# el external bin en `src-tauri/<externalBin>-<triple>` y la config usa
# `externalBin: ["tinta-sidecar"]` (plano, sin prefijo binaries/ — ver el
# comentario de src-tauri/src/sidecar.rs sobre el flattening de macOS). El CI
# (release.yml / build-desktop.yml) compila a esta misma ruta.
TAURI_BIN_DIR := src-tauri

.PHONY: help icons sidecar-arm64 sidecar-x86_64 sidecar-windows \
        build-mac build-mac-arm64 build-mac-x86_64 \
        dmg-mac-arm64 dmg-mac-x86_64 \
        clean check-core

help:
	@echo "Tinta Desktop — comandos:"
	@echo ""
	@echo "  make icons              Genera iconos placeholder desde 1024px PNG"
	@echo "  make sidecar-arm64      Compila sidecar Go para macOS arm64"
	@echo "  make sidecar-x86_64     Compila sidecar Go para macOS Intel"
	@echo "  make build-mac          Compila .app + .dmg para arm64 + x86_64"
	@echo "  make build-mac-arm64    Solo arm64 (más rápido — host nativo)"
	@echo "  make build-mac-x86_64   Solo Intel"
	@echo "  make clean              Limpia builds de Tauri y binarios"
	@echo ""
	@echo "Para Windows: usa GitHub Actions (.github/workflows/build-desktop.yml)."

check-core:
	@test -d $(TINTA_CORE) || { \
	  echo "✗ tinta-core no encontrado en $(TINTA_CORE)"; \
	  echo "  Override con: make build-mac TINTA_CORE=/ruta/a/tinta-core"; \
	  exit 1; \
	}

# ── Sidecar (Go) ─────────────────────────────────────────────────────

sidecar-arm64: check-core
	@mkdir -p $(TAURI_BIN_DIR)
	@echo "→ compilando tinta-sidecar para macOS arm64..."
	@cd $(TINTA_CORE) && \
	  CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 \
	  go build -tags sidecar \
	    -o $(CURDIR)/$(TAURI_BIN_DIR)/tinta-sidecar-aarch64-apple-darwin \
	    ./cmd/sidecar
	@file $(TAURI_BIN_DIR)/tinta-sidecar-aarch64-apple-darwin

sidecar-x86_64: check-core
	@mkdir -p $(TAURI_BIN_DIR)
	@echo "→ compilando tinta-sidecar para macOS Intel (cross-compile)..."
	@cd $(TINTA_CORE) && \
	  CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 \
	  SDKROOT=$$(xcrun -sdk macosx --show-sdk-path) \
	  go build -tags sidecar \
	    -o $(CURDIR)/$(TAURI_BIN_DIR)/tinta-sidecar-x86_64-apple-darwin \
	    ./cmd/sidecar
	@file $(TAURI_BIN_DIR)/tinta-sidecar-x86_64-apple-darwin

sidecar-windows:
	@echo "✗ Windows no se cross-compila desde Mac (CGO + mingw painful)."
	@echo "  Usa GitHub Actions: tag desktop-vX.Y.Z y push, o workflow_dispatch."
	@exit 1

# ── Iconos ───────────────────────────────────────────────────────────

icons:
	@echo "→ generando iconos placeholder brick desde PNG sintético..."
	@python3 -c "import zlib, struct; \
	  W=H=1024; R,G,B=214,89,60; \
	  sig=b'\x89PNG\r\n\x1a\n'; \
	  ihdr=struct.pack('>IIBBBBB',W,H,8,2,0,0,0); \
	  raw=b''.join(b'\x00'+bytes([R,G,B])*W for _ in range(H)); \
	  idat=zlib.compress(raw,9); \
	  c=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff); \
	  png=sig+c(b'IHDR',ihdr)+c(b'IDAT',idat)+c(b'IEND',b''); \
	  open('/tmp/tinta-icon-source.png','wb').write(png)"
	@pnpm tauri icon /tmp/tinta-icon-source.png

# ── Tauri build ──────────────────────────────────────────────────────

build-mac-arm64: sidecar-arm64
	@echo "→ Tauri build para macOS arm64 (host nativo)..."
	# `--bundles app` evita el DMG step que requiere AppleScript
	# Automation permission. Para DMG separado, usa `make dmg-mac-arm64`
	# después de este target.
	pnpm tauri build --target aarch64-apple-darwin --bundles app

build-mac-x86_64: sidecar-x86_64
	@echo "→ Tauri build para macOS Intel..."
	rustup target add x86_64-apple-darwin
	pnpm tauri build --target x86_64-apple-darwin --bundles app

build-mac: build-mac-arm64 build-mac-x86_64
	@echo ""
	@echo "✓ .app bundles en src-tauri/target/{aarch64,x86_64}-apple-darwin/release/bundle/macos/"
	@echo "  Para empaquetar como DMG: make dmg-mac-arm64 / make dmg-mac-x86_64"

# DMG via hdiutil (CLI puro, sin AppleScript). Más simple que la
# implementación de Tauri, pero también más feo (sin layout custom de
# iconos, sin background image). Suficiente para distribución beta.

dmg-mac-arm64:
	@APP=src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Tinta.app; \
	OUT=src-tauri/target/aarch64-apple-darwin/release/bundle/dmg; \
	mkdir -p $$OUT; \
	test -d $$APP || { echo "✗ $$APP no existe — corre make build-mac-arm64 primero"; exit 1; }; \
	rm -f $$OUT/Tinta-arm64.dmg; \
	hdiutil create -volname "Tinta" -srcfolder $$APP -ov -format UDZO $$OUT/Tinta-arm64.dmg
	@echo "✓ DMG en src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Tinta-arm64.dmg"

dmg-mac-x86_64:
	@APP=src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Tinta.app; \
	OUT=src-tauri/target/x86_64-apple-darwin/release/bundle/dmg; \
	mkdir -p $$OUT; \
	test -d $$APP || { echo "✗ $$APP no existe — corre make build-mac-x86_64 primero"; exit 1; }; \
	rm -f $$OUT/Tinta-x86_64.dmg; \
	hdiutil create -volname "Tinta" -srcfolder $$APP -ov -format UDZO $$OUT/Tinta-x86_64.dmg
	@echo "✓ DMG en src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Tinta-x86_64.dmg"

clean:
	rm -rf src-tauri/target dist
	# Outputs del sidecar en la ubicación actual (raíz) + restos del layout
	# viejo (binaries/) y del nombre pre-rename (cuadra-sidecar-*).
	rm -f src-tauri/tinta-sidecar-* src-tauri/cuadra-sidecar-*
	rm -f src-tauri/binaries/tinta-sidecar-* src-tauri/binaries/cuadra-sidecar-*
