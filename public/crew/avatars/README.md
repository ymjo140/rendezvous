# Rendezvous crew avatar pack

The active assets live in `v2/` and are used by the crew village and crew profile.

- Transparent PNGs with a shared pixel-art visual language and a stable full-body baseline
- Hair palette: black, brown, yellow
- Hair variants: short, perm, long
- Gender is read from the member profile API before choosing a fallback appearance. It is not inferred from a name or member order.
- The avatars are stationary identification assets, not 3D movement/game sprites.

The TypeScript metadata lives in `lib/crew-avatars.ts`. Legacy SVG IDs are normalized for compatibility, but new rendering uses the `v2/` PNG assets.
