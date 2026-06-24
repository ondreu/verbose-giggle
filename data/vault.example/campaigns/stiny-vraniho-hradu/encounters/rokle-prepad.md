---
type: encounter
id: rokle-prepad
name: Střet ve Vlčí rokli
location: vlci-rokle
grid: { w: 16, h: 12, cell_ft: 5 }
terrain:
  - { x: 7, y: 3, kind: difficult }
  - { x: 8, y: 3, kind: difficult }
  - { x: 10, y: 7, kind: cover-three-quarter }
  - { x: 5, y: 8, kind: cover-half }
spawns:
  - { ref: kultista, faction: hostile, at: { x: 12, y: 4 } }
  - { ref: nargash-boss, faction: hostile, at: { x: 13, y: 6 } }
  - { ref: stin-marakathe, faction: hostile, at: { x: 12, y: 8 } }
party_start:
  - { x: 3, y: 5 }
  - { x: 2, y: 6 }
  - { x: 3, y: 7 }
---
# Střet ve Vlčí rokli

Úzká skalní rokle, kde Nargash přijímá posla kultu. Goblinní hlídky shora, totem
z lebek uprostřed. Když hráči přepadnou jednání, Nargash i posel se obrátí proti
nim — ale dobratná družina může jednoho proti druhému poštvat dřív, než tasí.
