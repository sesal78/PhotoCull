# PhotoCull - Lessons Learned

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: All agents
- Breaking Changes: No

---

## Lessons Log

| Date | Issue | Root Cause | Fix Applied | Prevention |
|------|-------|------------|-------------|------------|
| 2025-01-27 | No explicit error handling strategy in architecture | Oversight during initial design | Added typed error handling recommendation | Include error handling section in architecture template |
| 2025-01-27 | File watcher not specified for external changes | Edge case not considered | Added to QA failure modes; recommended for v2 | Include file system monitoring in requirements gathering |
| 2025-01-27 | LibRaw memory safety risk identified late | Security review found C++ dependency risk | Added validation layer before LibRaw | Security review earlier in process; audit native dependencies |

---

## Future Improvements

- Consider WASM sandbox for RAW decode (isolate native code)
- Add automated dependency vulnerability scanning to CI
- Create test corpus of edge-case images (corrupted, exotic formats)
