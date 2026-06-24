---
type: world_event
id: spojenectvi-klu-a-kultu
name: Krvavé kly se spojily s kultem
trigger: "Nargash přijal nabídku kultu (krvave-kly.progress >= 0.5 a nikdo to nezmařil)"
consequences:
  - faction.krvave-kly.relation.kult-marakathe: allied
  - faction.krvave-kly.resources: high
  - location.velen.danger: high
  - faction.hajnici-velenu.progress: -0.1
---
# Krvavé kly se spojily s kultem

Pokud nikdo nezmaří jednání ve Vlčí rokli, Nargash přijme nabídku z Vraního
hradu: temná přízeň a zbraně výměnou za to, že Krvavé kly zaplaví Velen jako
úderná pěst kultu. Z rozdrobených tlup se stává spojené vojsko, posílené poutníky
tmy — a hajníci, kterých je beztak málo, jsou rázem v defenzivě.

Atmosféra: hořící statky na obzoru, gobliní totemy s havraním peřím kultu,
uprchlíci proudící do Dlouhého Luhu. Zastavit toto spojenectví *dřív, než se
stvrdí*, je jedna z nejnaléhavějších příležitostí, jaké Velen nabízí.
