# Native-free integer compatibility adapter

This is an independent implementation of the four bigint-buffer exports used by Solana SPL layouts. It replaces the native addon affected by [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg); no native code or install hook is shipped. It is not an upstream release.

Unsigned values must fit the requested width. Overflow and negative values throw rather than truncate; writes are bounded to 1024 bytes. Tests include 64/128/256-bit boundaries and a 1024-byte decode. The root npm override applies to every transitive consumer, and Docker copies this package before installation.
