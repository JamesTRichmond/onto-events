# Private SDK54 image-size compatibility wrapper

This package restores the filename interface required by Metro in Expo SDK54 while delegating **every image format to the unmodified npm image-size 2.0.3 parser**, installed under the `image-size-parser` alias and integrity-pinned by the root lockfile. It is private, not an upstream release, and must never be published to npm. The version suffix identifies this wrapper; it does not stand in for a parser fix.

The maintainer's 2.0.3 release fixes the JXL/HEIF and ICNS infinite-loop issues documented in [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) and [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr). A blind override to 2.0.3 breaks Metro's synchronous filename calls, although buffer calls work. Metro's two actual asset paths are covered by the installed-consumer regression tests.

The callable CommonJS export, `.default` and `.imageSize` accept Uint8Array/Buffer or a filename. Synchronous file reads retain the 512 KiB prefix limit used by the old and current upstream filename readers, close the descriptor even on failure and pass only bytes actually read. The callback filename interface delegates to upstream's async reader and invokes the callback on the next tick. `types`, `disableTypes`, `disableFS` and positive-integer `setConcurrency` are retained. No legacy parser or patch to installed node_modules is used.

This is a build-tool compatibility boundary, not a guarantee of identical parsing for every historical malformed image or TIFF layout. Files requiring metadata beyond the prefix may fail, as with upstream's bounded file reader. Current committed PNG/SVG assets and Metro filename/buffer paths are tested, with web and native JavaScript exports before release. No native module, phone image loader or Expo SDK upgrade is added.

The wrapper has its own MIT license. The upstream parser remains a separately licensed MIT dependency with its original package files. Remove this wrapper when the SDK54-compatible Metro path can use the patched upstream filename API directly. Audit counts alone are not a release waiver or evidence of native acceptance.
