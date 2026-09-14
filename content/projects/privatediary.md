---
title: "PrivateDiary"
description: "A zero-knowledge encrypted diary. The server never holds plaintext or a decryption key at any point — not during writing, not during recovery, not ever."
pubDate: 2026-09-11
updatedDate: 2026-09-12
tags: ["Next.js", "TypeScript", "Firebase", "Cryptography"]
github: "https://github.com/iruki-dev/PrivateDiary"
featured: true
---

## The premise

A diary is only useful if you're willing to be honest in it, and you're only honest if nobody else
can read it. So PrivateDiary starts from a hard requirement: **the server must never be able to
read an entry**, even if someone walks away with the entire database.

Everything is encrypted in the browser before it leaves. Firebase stores ciphertext. The one piece
of server code that exists handles a login check and never sees a key, a seed, or a word of
plaintext.

## How the keys work

Every account has a master seed generated in the browser. From that seed, a hybrid key pair is
derived deterministically — classical X25519 combined with ML-KEM-768, the post-quantum key
encapsulation standard. Entries are encrypted with AES-GCM under a per-entry content key, and that
content key is wrapped to the hybrid public key.

The hybrid part matters for a diary specifically. Encrypted data written today may still be sitting
in a database when quantum computers can break X25519, so both mechanisms have to fail before
anything opens — which means the post-quantum half can only help, never hurt.

All of it lives in one directory with a single entry point, and that module imports no network code
and no Firebase code at all. Any cryptography question has exactly one place to look.

## Two keys to the same door

The seed is wrapped by your passphrase. But a passphrase you never write down is a passphrase you
will eventually forget, and "your diary is gone forever" is a bad answer.

So there's a second, opt-in credential: **backup codes**, built on Shamir secret sharing. You get N
codes, any K of which reconstruct access. The two credentials are deliberately equal in standing —
with either one you can read your entries, reset the passphrase, or reissue the backup codes.
Neither one reveals the other.

The design detail that took the most thought is that **the codes don't split the seed directly**.
They split a randomly generated AES wrapping key, and that key wraps the seed. The reason is
revocation: if the codes split the seed itself, reissuing them would be theater — the old codes
still reconstruct the same secret, forever. Splitting a wrapping key instead means reissuing
replaces the wrapped seed in storage, and the old codes are left holding a key with nothing to
open.

Whether a reconstruction succeeded is decided by the AES-GCM authentication tag failing or passing,
so no separate verification value is ever stored. A wrong passphrase and a wrong set of codes fail
through the exact same mechanism.

Lose both and there's only a reset — a brand new seed, with every old entry permanently unreadable.
That's not a gap in the design; it's what zero-knowledge actually costs, and the interface says so
plainly.

## Authenticator codes, honestly labeled

Optional TOTP is supported, and it is described as what it is: an **access gate, not an encryption
factor**. A rotating six-digit code has nowhere near enough entropy to be key material, and
demanding the original secret on every unlock would throw away everything convenient about an
authenticator app. So the vault stays fully zero-knowledge and the code check sits on top of it,
verified by a Cloud Function that stamps a short-lived claim — the same pattern other
zero-knowledge services use, named accurately instead of marketed as extra encryption.

One consequence needed handling. If the code gate blocked reading entries unconditionally, then
losing your phone would also block the backup-code recovery path — the one path that has to survive
losing things. Backup codes therefore clear the gate through a separate route, using a one-way proof
derived from the reconstructed wrapping key. Only genuinely holding K codes produces that proof, so
a stolen passphrase gains nothing from it.

## Reading over your shoulder

One small feature turned out to be the one worth having. Private writing mode blurs the text area
while you type, so someone beside you on a train can't read along. Confirming your own text is
hold-to-reveal rather than a toggle, and a second setting removes the reveal control entirely — at
which point not even you can unblur it until you leave the page.

It's a CSS blur over a `<textarea>`, and the docs say exactly that: it stops a glance, not a
determined person with developer tools open. Encryption protects the content; this only protects the
moment of writing it.

## Stack

Next.js with the App Router and React 19, TypeScript throughout, Firebase for authentication and
storage, and audited primitives from the `@noble` family for the cryptography. Security headers are
set at the edge with a per-request CSP nonce. Tests cover the crypto module directly and run the
Firestore security rules against a local emulator, because a rule that looks right and a rule that
is right are different things.
