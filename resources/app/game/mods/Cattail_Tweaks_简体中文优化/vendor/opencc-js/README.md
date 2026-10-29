# opencc-js 1.4.2

Source: https://github.com/nk2028/opencc-js
Package: https://registry.npmjs.org/opencc-js/-/opencc-js-1.4.2.tgz
Upstream dist/umd/cn2t.js SHA-256: d66d920069ab526db08c6f2bc15fcf6feb7d07de3cf98e7e27c0aaf7d136baee
Package integrity: sha512-EdcspgdROiCCZDM+jZR6Pa670xW+EW2QhctPBQ8gRjg6lrx4IHEl+2s+kt5izk/TkxVRgdWuFgaGkaEdIUfdaw==

The upstream UMD payload is unchanged. A local prefix/suffix wraps CommonJS exports
in a private scope and exposes only __cattailChineseOpenCC. This avoids overwriting
Electron module.exports, global OpenCC or another Mod AMD loader.

The converter uses cn -> tw (s2tw), with Taiwan character forms and no Taiwan
vocabulary conversion (not twp). Runtime is offline; no CDN or package manager needed.
Code: MIT (LICENSE). Bundled dictionary data: Apache-2.0 (Apache-2.0.txt and THIRD_PARTY_LICENSES.md).
