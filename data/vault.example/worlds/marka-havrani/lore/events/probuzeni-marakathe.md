---
type: world_event
id: probuzeni-marakathe
name: Probuzení Marakáthé
trigger: "Kult zlomil pečeť pod Vraním hradem (kult-marakathe.progress >= 0.85)"
consequences:
  - location.vrani-hrad.danger: high
  - location.velen.danger: high
  - location.mlzne-blato.danger: high
  - faction.rad-stribrneho-plamene.progress: +0.1
---
# Probuzení Marakáthé

Nejtemnější možná událost marky: kult zlomí poslední pečeť a starobožstvo se
začne probouzet. Z Vraního hradu se rozlézá tlení a hlad — zvěř hyne, mlha houstne
a mrtví na Kostničním vrchu se hýbou. Celý Velen se stává smrtelně nebezpečným.

Jediné světlo: **Řád stříbrného plamene** konečně bere hrozbu vážně a mobilizuje
všechno, co má — velmistr Aldric svolává poslední křížovou výpravu k hradu. Je to
zoufalý protitah, ne vítězství. Tato událost mění tón celé kampaně z pohraničního
dobrodružství v boj o přežití marky.
