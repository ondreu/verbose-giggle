---
type: encounter
id: mill-ambush
name: Ambush at the Old Mill
location: stary-mlyn
grid: { w: 12, h: 10, cell_ft: 5 }
battle_map_image: maps/mill-interior.webp
terrain:
  - { x: 5, y: 2, kind: wall }
  - { x: 6, y: 4, kind: difficult }
spawns:
  - { ref: goblin-1, faction: hostile, at: { x: 7, y: 2 } }
  - { ref: goblin-2, faction: hostile, at: { x: 8, y: 2 } }
  - { ref: goblin-boss, faction: hostile, at: { x: 7, y: 3 } }
party_start:
  - { x: 2, y: 7 }
  - { x: 1, y: 8 }
---
# Ambush

Goblini čekají schovaní za pytli mouky. Boss zaútočí, až se družina dostane
doprostřed mlýnice. V truhle pod schody leží 40 zl a lektvar léčení.
