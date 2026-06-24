---
type: world_event
id: hlubina-prolomena
name: Hlubina prolomena
trigger: "Tiché kladivo prorazí zatlučenou chodbu do Stříbrných dolů (tiche-kladivo.progress >= 0.8), nebo někdo prkna strhne zvenčí"
consequences:
  - location.stribrne-doly.danger: high
  - location.kamenec.danger: high
  - location.hadi-sedlo.danger: high
  - faction.cech-haviru.progress: -0.25
  - faction.tiche-kladivo.progress: +0.15
---
# Hlubina prolomena

Prkna v osmém patře povolí a **Tiché kladivo** se vyvalí ze Žulové hlubiny do
Stříbrných dolů — šedý, mlčící houf, který nehledá stříbro, ale teplo a maso.
Stareta Bohdan svým tajením a Železná rota svými prkny dokázali jediné: oddálit
tuhle noc, ne ji odvrátit. Doly se stávají smrtelně nebezpečnými, hlubinní pronikají
do horních pater a první chalupy na okraji Kamence hoří dřív, než se ve městě
stačí pochopit, co se vlastně dere z hory.

**Cech havířů** přichází o to, na čem stál — tok stříbra se zastaví, tajemství je
venku a Bohdanova autorita padá s ním. Kamenec se ocitá v obležení zevnitř hory a
volá o pomoc, kterou marka stěží má. Pro **Tiché kladivo** je to první vítězství
po věcích: hora má konečně dveře dokořán a za nimi je svět plný tepla. Jestli
hlubinu nikdo nezažene zpět a chodbu znovu neuzavře, padne Kamenec stejně, jako
kdysi padl horní lid — pohlcený zezdola.
