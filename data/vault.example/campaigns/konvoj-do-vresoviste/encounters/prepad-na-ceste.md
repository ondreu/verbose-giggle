---
type: encounter
id: prepad-na-ceste
name: Přepadení na velenské cestě
location: vresoviste
grid: { w: 14, h: 10, cell_ft: 5 }
terrain:
  - { x: 6, y: 1, kind: difficult }
  - { x: 7, y: 1, kind: difficult }
  - { x: 9, y: 6, kind: cover-half }
  - { x: 4, y: 8, kind: cover-half }
spawns:
  - { ref: goblin-1, faction: hostile, at: { x: 9, y: 2 } }
  - { ref: goblin-2, faction: hostile, at: { x: 10, y: 3 } }
  - { ref: goblin-boss, faction: hostile, at: { x: 11, y: 2 } }
party_start:
  - { x: 2, y: 5 }
  - { x: 1, y: 6 }
  - { x: 3, y: 6 }
---
# Přepadení na velenské cestě

Cesta se noří do úvozu lemovaného vřesem a balvany — ideální místo na léčku.
Krvavé kly číhají za kameny po pravé straně; **Goblin Boss** dá pokyn k útoku,
až povoz dojede doprostřed úvozu. Goblini střílejí z krytu a snaží se splašit
koně; boss se drží vzadu a žene své do boje.

Kdo prohledá padlé, najde u bosse **mosaznou placku s havraním znamením kultu** —
první tichý náznak, že Krvavé kly už nejednají samy za sebe (háček do
`stiny-vraniho-hradu`).
