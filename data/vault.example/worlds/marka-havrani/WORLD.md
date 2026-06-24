# Havraní marka — sdílený svět (#49)

Toto je **svět**, ne kampaň. Existuje sám o sobě: frakce sledují vlastní cíle,
NPC obývají sdílené lokace, dějiny běží dál bez ohledu na to, jestli a jaká
družina právě prochází krajem. Kampaně jsou *příběhy, které se v tomto světě
odehrávají* — odkazují na svět přes pole `world: marka-havrani` v `campaign.yaml`
a jejich obsah se vrství NAD světový (kampaň přebíjí svět při shodě `id`).

## Co svět obsahuje

- `locations/` — kraje, města, vsi, divočina, ruiny a doupata. Souřadnice jsou
  poměry **0..1** na mapě světa (nezávislé na rozlišení). `connections` tvoří
  point-crawl síť cest. Lokace přežívají kampaně.
- `factions/` — cechy, řády, kulty, rody, tlupy a roty. Každá má `goal`,
  `progress` (0–1, jak blízko je svému cíli), `resources`, území a vztahy k
  ostatním frakcím. Živý stav (postup, vztahy) běží v session a mění se JEN
  engine nástroji (`faction_advance`, `faction_relation`) — DM nikdy nezapisuje
  stav světa jako prostý text (stejný princip jako u HP, #12).
- `npcs/` — lehké gazetteer karty obyvatel: kdo to je, kde bývá, ke které frakci
  patří, jak je naladěn. Bez bojových statů — když dojde na souboj, DM si stat
  block vyzvedne z `srd_ref` nebo z autorské bojové karty.
- `lore/` — dějiny, bohové, legendy a `lore/events/` se světovými událostmi.
  Událost má `trigger` (lidsky čitelná podmínka, kterou DM posoudí) a strukturo-
  vané `consequences`, jež engine aplikuje deterministicky, když ji `world_event
  _trigger` spustí.

## Premisa

**Havraní marka** je sporné pohraničí na okraji upadajícího Novigradského
knížectví — pás vřesovišť, mlžných blat a kamenitých vrchů mezi civilizací na
západě a divočinou na východě. Knížecí moc tu slábne každým rokem: cesty nejsou
bezpečné, staré rody chudnou, a ve zříceninách na východě se probouzí cosi, co
mělo zůstat pohřbené. Lidé se drží měst a vsí, obchod jde po řece Stříbřence, a
každý spolek — kupci, zloději, kněží i kult — tahá kraj svým směrem.

Znak marky je černý havran na stříbrném poli: pták, který přežije i tam, kde nic
jiného nepřežije.

## Kampaně v tomto světě

Ukázková kampaň **„The Velen Roads"** (`campaigns/velen-roads`) se odehrává v
kraji **Velen** na východě marky a vyrůstá z napětí mezi **Krvavými kly** a
**Kultem Marakáthé**. Další kampaně mohou sdílet stejný svět, navazovat na
důsledky té první a nést je dál — frakce, kterou jedna družina oslabí, začne
druhá kampaň slabší.
