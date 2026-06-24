# Havraní marka — sdílený svět (#49)

Toto je **svět**, ne kampaň. Existuje sám o sobě: frakce sledují vlastní cíle,
NPC obývají sdílené lokace, dějiny běží dál bez ohledu na to, jestli a jaká
družina právě prochází krajem. Kampaně jsou *příběhy, které se v tomto světě
odehrávají* — odkazují na svět přes pole `world: marka-havrani` v `campaign.yaml`
a jejich obsah se vrství NAD světový (kampaň přebíjí svět při shodě `id`).

## Co svět obsahuje

Rozsah (aktuálně): **36 lokací**, **9 frakcí**, **61 NPC**, dějiny + 4 světové
události. Města mají vnitřní lokace (čtvrti a stavby s `parent`), divočina je
protkaná drobnými body zájmu (poustevna, mohyly, bludičkova tůň, potopená ves…)
a každé místo je zabydlené jmenovanými obyvateli.

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

## Místa a jejich obsah

- **Novigrad** (město, ~5000 duší) — hlavní město. Vnitřní lokace: *Přístavní
  čtvrť* (tržiště, clo, podsvětí), *Hostinec U Tří havranů* (najímání, zvěsti),
  *Věž stříbrného plamene* (Řád, špitál, archiv), *Cechovní dům* (Kupecký cech),
  *Stoky a Podhradí* (Šedé kápě), *Loděnice a lodní hřbitov* (pašování),
  *Katova bašta* (žalář, šibenice). Nejhustěji obydlené — purkmistr, cechmistr,
  velmistr, kněžna, Pavučina, kat, mastičkář a víc než tucet dalších.
- **Černý Brod** (město) — mýtný uzel na cestě do Velenu. *Vranovská tvrz* (rod
  Vranovský, rodinný archiv), *Mýtnice u brodu* (clo, převozníci, pašeráci),
  *Převoznický šenk U Vydry* (pašerácká „kancelář").
- **Kamenec** (hornické město) — *Dům Cechu havířů*, *Výčep U Sirné lampy*,
  *Stříbrná huť* (tavba, mizející stříbro); nad ním *Stříbrné doly* se zazděnou
  starou chodbou a Železnou rotou u vchodů.
- **Vřesoviště** (ves) — *Gregorův dvůr a modlitebna*, poslední bašta před blaty.
- **Rozcestí** (zájezdní hostinec) — křižovatka cest, kde se najímá doprovod a
  sbírají zprávy z celé marky.
- **Body zájmu v divočině** — *Vydří brod* (rybáři na dolní Stříbřence), *Stará
  hláska* (rozpadlá strážní věž se záhadným ohněm), *Sokolí skála* (vyhlídka a
  sokolník), *Poustevna u Studánky* (Silvanus, léčivý pramen), *Kamenný kruh*
  (menhiry staré víry spjaté s pečetí), *Oběšencův dub* (šibenice na hranici
  území Krvavých klů), *Bludičkova tůň* a *Potopená ves* (hrůzy Mlžného blata).
- **Velen, Dlouhý luh, Šípový hvozd, Vlčí rokle, Vraní hrad, Kostniční vrch** —
  kraje, lesy, doupata a ruiny s vlastními obyvateli a hrozbami.

Každé místo má jmenované obyvatele v `npcs/` (kdo to je, kde bývá, co chce, háček).

## Kampaně v tomto světě

Tento svět používají dvě ukázkové kampaně:

- **„Konvoj do Vřesoviště"** (`campaigns/konvoj-do-vresoviste`) — krátká úvodní
  kampaň (~30 min), která provede hráče rozhovorem, smlouváním, obchodem,
  cestou a bojem cestou z Černého Brodu do odříznutého Vřesoviště.
- **„Stíny Vraního hradu"** (`campaigns/stiny-vraniho-hradu`) — delší dějová
  kampaň (3–5 sezení) o kultu Marakáthé, která vrcholí u pečeti pod Vraním
  hradem a jejíž rozuzlení mění stav světa.

Obě sdílejí stejný svět: háček z krátké kampaně (placka kultu u goblinů) vede
přímo do té delší.

## Sdílený, nebo izolovaný stav světa (přepínač na kampaň)

Každá kampaň si v `campaign.yaml` volí `world_shared`:

- **`world_shared: false`** (výchozí) — kampaň má **vlastní izolovanou kopii**
  živého stavu světa (postup frakcí, události, nebezpečí) ve své `session`.
  Naseje se z autorských poznámek a nikoho jiného neovlivní.
- **`world_shared: true`** — kampaň **čte i zapisuje SDÍLENÝ** stav světa
  (`worlds/<name>/state/world.json`). Co jedna družina ve světě změní, zdědí
  další kampaně, které mají sdílení také zapnuté — jedna kampaň tak může ovlivnit
  druhou. Frakce, kterou jedna oslabí, začne další slabší.

Obě ukázkové kampaně jsou ve výchozím stavu **izolované**; sdílení zapni, až
budeš chtít, aby na sebe kampaně navazovaly důsledky.
