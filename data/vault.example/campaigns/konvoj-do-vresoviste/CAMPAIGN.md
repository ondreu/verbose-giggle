# Konvoj do Vřesoviště — ukázková kampaň (~30 min)

Krátká úvodní kampaň pro **Havraní marku** (`world: marka-havrani`). Jedno
sezení, které provede hráče všemi základními funkcemi aplikace:

1. **Rozhovor** — v Černém Brodě potkáte faktora **Radúna** (cech), který shání
   doprovod pro konvoj do odříznutého Vřesoviště.
2. **Smlouvání** — vyjednejte odměnu (zkouška přesvědčování); kdo uspěje, dostane
   víc zlata, lék na cestu, nebo slevu u kupce.
3. **Obchod** — nakupte výbavu u kočovného kupce **Salíma** (světové NPC v
   Brodě) před odjezdem.
4. **Cestování** — point-crawl z `cerny-brod` do `vresoviste` (2 dny přes
   vřesoviště); čas plyne, roste nebezpečí.
5. **Boj** — Krvavé kly přepadnou konvoj v úvozu (`prepad-na-ceste`).
6. **Rozuzlení** — doručte náklad starostovi **Gregorovi**, inkasujte a získejte
   stopu k větší hrozbě (mosazná placka kultu → háček do `stiny-vraniho-hradu`).

## Co kampaň přidává nad svět

Svět už dodává lokace (`cerny-brod`, `vresoviste`), frakce (`kupecky-cech`,
`krvave-kly`) i NPC (`kupec-salim`, `starosta-gregor`). Tato kampaň přidává jen:

- `characters/` — předpřipravení hrdinové Thorin a Elara, společník Shadowpaw.
- `bestiary/` — gobliní přepadová tlupa (Krvavé kly).
- `npcs/factor-radun.md` — zadavatel konvoje.
- `quests/dovez-konvoj.md` — třícílový úkol (smlouvání → boj → doručení).
- `encounters/prepad-na-ceste.md` — taktické přepadení.
- `items/cint-rodu.md` — Thorinova rodová čepel.

Všechno ostatní (svět, jeho frakce a obyvatelé) se vrství zespodu přes
`world: marka-havrani`.
