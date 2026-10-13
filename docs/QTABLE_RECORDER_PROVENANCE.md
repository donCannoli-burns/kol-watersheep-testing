# Q-Table Parity Lab recorder provenance

The v0.1 mock runtime treats the supplied Q-Table Parity Lab as **recorder inspiration/provenance only**.

Supplied artifact:

`Q-Table-Parity-Lab-upgraded(20261011-033905).tar`

SHA-256:

`cf02103c159f00dede0142070fb3f6644b6c2b71e9955059c5b7dec818d2d61e`

The Q-learning engine is **not activated or vendored into the runtime execution path** in v0.1. The lab contributes the state/action/transition/episode recording shape, while the runtime recorder deliberately omits reward and cannot choose actions, update a Q-table, change context, train online, or mutate the simulation.

This keeps the raw corpus useful for later Q/RL experiments without silently turning the recorder into a policy.
