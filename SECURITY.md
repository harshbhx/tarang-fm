# Security policy

## Reporting a vulnerability

Please report privately through GitHub: [Report a vulnerability](https://github.com/harshbhx/tarang-fm/security/advisories/new). Do not open a public issue for security problems.

Include what you found, how to reproduce it and the impact. You will get a reply within a few days.

## In scope

- Ways to bypass the rate limits, voice allowlist or admin tokens, or otherwise spend the owner's Sarvam credits
- Exposure of secrets, caller data or phone numbers
- Injection through typed names or caller speech into scripts, captions or the live room

## Out of scope

- Load tests or automated traffic against the live site
- Findings that need physical access or a compromised device
- Issues in third-party services (Sarvam, Cloudflare)

## Handling

Secrets live only in the Worker. Caller audio is sent to Sarvam for transcription and is never stored; phone numbers are masked. Please give a reasonable time to fix an issue before disclosing it.
