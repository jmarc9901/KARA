# Security Policy

## Supported versions

KARA is pre-1.0. Only the latest release receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | ✅ (latest)        |
| < 0.3   | ❌                  |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Instead, report privately by emailing the maintainer (Juan Marcos Bravo Medina,
JMarc) at the address listed on the GitHub profile, or by creating a private
security advisory:

1. Go to **https://github.com/jmarc9901/KARA/security/advisories/new**
2. Describe the vulnerability, including:
   - Affected component (compiler, runtime, LSP, VS Code extension, Tauri shell, website)
   - Steps to reproduce
   - Impact and any suggested fix

You should receive an acknowledgement within **72 hours**, and a detailed
response (including a timeline for the fix) within **7 days**.

## Scope

KARA's runtime executes user-written `.kara` programs. The interpreter is a
learning-oriented sandbox, not a hardened VM: treat any `.kara` file from an
untrusted source as code. The VS Code extension and the browser playground do
not require special privileges.

## Security notes (v0.3)

- The runtime dev server binds to `127.0.0.1` by default and has no
  authentication; it is intended for local development only.
- The browser playground runs fully client-side; no code leaves your browser.
