---
type: encounter
id: pecet-finale
name: Pečeť — poslední obřad
location: hrobka-pod-hradem
grid: { w: 14, h: 12, cell_ft: 5 }
terrain:
  - { x: 7, y: 6, kind: hazard }
  - { x: 6, y: 6, kind: difficult }
  - { x: 8, y: 6, kind: difficult }
  - { x: 3, y: 3, kind: cover-half }
  - { x: 11, y: 9, kind: cover-half }
spawns:
  - { ref: vethis-boss, faction: hostile, at: { x: 9, y: 6 } }
  - { ref: kult-fanatik, faction: hostile, at: { x: 11, y: 4 } }
  - { ref: stin-marakathe, faction: hostile, at: { x: 7, y: 9 } }
  - { ref: stin-marakathe, faction: hostile, at: { x: 11, y: 8 } }
party_start:
  - { x: 2, y: 5 }
  - { x: 1, y: 6 }
  - { x: 2, y: 7 }
---
# Pečeť — poslední obřad

Prorok **Vethis** stojí nad pulzující pečetí; každé kolo, co obřad běží, ji oslabí.
Kruhový sál, uprostřed hazard (trhlina, z níž prosakuje tma) a trůn z havraního
peří. Hráči musí Vethise zastavit — ocelí, nebo slovem o tom, čím býval. Pak se
rozhodnou: pečeť obnovit (`pecetni-kamen` + Bramův obřad), nebo ji zlomit nadobro.
