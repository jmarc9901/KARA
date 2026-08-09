---
name: Bug report
about: Something is not working as expected
title: "[bug] "
labels: bug
---

**Describe the problem**
A clear and concise description of the bug.

**Minimal .kara code that reproduces it**

```kara
App {
  title: "x"
  size: (1, 1)
  // ...
}
```

**Expected behavior**
What should happen.

**Actual behavior**
What actually happens (include the error message and its line/column if any).

**Environment**
- Node: `node --version`
- Rust: `cargo --version` (if it applies to `parser/`)
- OS:

**Additional context**
Anything else that helps diagnose the issue.
