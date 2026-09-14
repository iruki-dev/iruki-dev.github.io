---
title: "forge3d"
description: "A 3D physics and game engine written from scratch in Python. Dynamics, collision, and contact are all solved by its own code — no MuJoCo, no PyBullet, no Bullet."
pubDate: 2026-06-03
updatedDate: 2026-06-15
tags: ["Python", "NumPy", "JAX", "Rust", "OpenGL"]
github: "https://github.com/iruki-dev/forge3d"
demo: "https://iruki.dev/forge3d"
featured: true
---

## The constraint is the project

forge3d is a 3D physics and game engine written in Python. The interesting part isn't that it
simulates rigid bodies — plenty of libraries do that. It's that **nothing else is allowed to do the
simulating**. No MuJoCo, no PyBullet, no Bullet, no ODE. Every integration step, every collision
test, every contact impulse is solved by code in this repository.

That rule exists because wrapping someone else's solver teaches you nothing about why contacts
jitter or why energy quietly leaks out of a simulation. Writing the solver teaches you both.

External engines appear in exactly one place: a `validation/` directory that runs the same scenario
through PyBullet and diffs the numbers. They are the grader, never the engine.

## What's in it

| Layer | What it does |
|---|---|
| Dynamics | Rigid-body dynamics via RNEA / CRBA / ABA, semi-implicit Euler integration |
| Collision | 15-axis SAT for box-box, spheres, capsules, GJK/EPA for convex meshes, AABB broad-phase, BVH |
| Contact | Impulse-based projected Gauss-Seidel solver, Coulomb friction, Baumgarte stabilization |
| Joints | Hinge, ball, prismatic, fixed, distance, spring, plus kinematic weld/release |
| Terrain | Heightfield collision and rendering, 32x32 up to 512x512 |
| Rendering | Real-time OpenGL PBR, a deferred renderer with SSAO and shadow maps, and a software ray-tracer |
| Game layer | Entity-component world, skeletal animation with blend trees, audio, particles, scenes, an editor |
| Learning | Gymnasium-compatible environments, JAX batched rollouts, PPO and SHAC training runs |

The public API stays deliberately small. Six concepts — `World`, `Body`, `Joint`, `Shape`,
`Viewer`, `Recorder` — are enough to drop a box on the ground in about a dozen lines, and that
15-line entry example is treated as a test: if it stops working without touching engine internals,
the abstraction has failed.

## Physics never sees the renderer

The physics core doesn't import the rendering layer at all. The only thing that crosses between
them is a `SceneSnapshot` — a plain data structure describing where everything is this frame.

That single contract is why the same simulation code can drive a 60 FPS OpenGL preview or a
1080p ray-traced video file with nothing changed but which renderer consumes the snapshot.

## Proving it, not claiming it

Physics code fails quietly. A simulation that looks plausible can still be wrong, so the project
leans on checks that don't care how things look:

| Check | Result |
|---|---|
| Acceleration vs. PyBullet, 50 body pairs | max absolute difference below 2e-11 |
| Energy conservation, torque-free and undamped | drift under 0.1% |
| Pendulum period vs. the closed-form solution | error under 0.01% |
| Restitution coefficient vs. theory | error under 1.5% |
| NumPy backend vs. JAX backend | agreement to floating-point noise |

The whole engine runs under two interchangeable backends — NumPy for clarity, JAX for speed — and
both must produce the same numbers. Keeping that true forces the entire core to stay functional
and free of in-place mutation, which turns out to be good for the NumPy path too.

## Going fast without cheating

Speed came from two places that don't touch the "solve it yourself" rule. JAX compiles the whole
loop and vectorizes hundreds of environments at once, worth roughly a 2,000x throughput gain for
reinforcement learning rollouts. The hottest inner loops — the contact solver, GJK/EPA, BVH
traversal — also have a Rust implementation behind PyO3. Rust is an optimization, not a
dependency: if the extension isn't built, everything falls back to Python and the full test suite
still passes.

## Where it stands

Version 2.2.1, 545 automated tests, fully type-annotated, published on PyPI as `pyforge3d`.
Thirty-five development phases are complete, each gated on its own verification criteria before
the next one could start. Three sample applications ship with it, including a first-person
battle-royale prototype built entirely on the public API.
