# Changelog

## Unreleased

- feat: dstate -- agent-owned self-evolving DAG+FSM state store. Why: give one LLM
  agent a single durable structure that is its memory, policy, and intuition at
  once, and that it can keep reshaping while it works.
- chore: untrack churny plugkit runtime (.gm/prd.yml, .gm/mutables.yml). Why: the
  plan watcher rewrites them every dispatch; tracking them would keep the tree
  perpetually dirty.
- test: root integration witness (bun test.js). Why: prove the whole stack on a
  real on-disk store -- build, enforce, reward, evolve, checkpoint, crash-recover,
  port -- not just isolated units.
- feat(enforce): auto-demote a hard edge back to soft after clean runs. Why: an
  edge that hardened on a rough patch should relax once the agent uses it cleanly
  again, so policy tracks current behavior instead of ratcheting one way.
