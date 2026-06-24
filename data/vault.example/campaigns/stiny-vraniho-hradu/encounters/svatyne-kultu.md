---
type: encounter
id: svatyne-kultu
name: Obřad na nádvoří
location: hrad-nadvori
grid: { w: 16, h: 12, cell_ft: 5 }
terrain:
  - { x: 8, y: 5, kind: difficult }
  - { x: 8, y: 6, kind: difficult }
  - { x: 4, y: 3, kind: cover-half }
  - { x: 12, y: 9, kind: cover-half }
spawns:
  - { ref: kultista, faction: hostile, at: { x: 9, y: 3 } }
  - { ref: kultista, faction: hostile, at: { x: 11, y: 4 } }
  - { ref: kult-fanatik, faction: hostile, at: { x: 12, y: 6 } }
  - { ref: stin-marakathe, faction: hostile, at: { x: 7, y: 9 } }
party_start:
  - { x: 2, y: 5 }
  - { x: 1, y: 6 }
  - { x: 2, y: 7 }
---
# Obřad na nádvoří

Modré ohně, kruh kultistů a fanatik vedoucí modlitbu k Marakáthé. Stíny se
odlepují od zdí, kde zhaslo světlo — **Kahanec Saraen** je tu k nezaplacení.
Přerušení obřadu rozzuří všechny naráz; schodiště dolů do hrobky je za oltářem.
