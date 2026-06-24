# Stíny Vraního hradu — delší kampaň (3–5 sezení)

Hlavní dějová kampaň pro **Havraní marku** (`world: marka-havrani`). Vyšetřování,
které přeroste v boj o přežití celého kraje — a v rozhodnutí, jehož důsledky
zdědí svět.

## Oblouk

1. **Novigrad — vyšetřování.** Mizení lidí, stopa kultu, neochotní svědci. Kira
   může vytáhnout z podsvětí (Šedé kápě), co o kultu vědí; Bram má za zády Řád.
2. **Velen — cesta k hradu.** K Vraní hradu se nelze dostat přímo: přes Mlžné
   blato vede jen cesta, kterou zná bylinkářka **Jaga**, a dovnitř jen ta, kterou
   zná uprchlík **Radomil**. Vedlejší linka: zmařit spojenectví Krvavých klů a
   kultu (`posel-v-rokli`).
3. **Vraní hrad — klimax.** Nádvoří (`svatyne-kultu`) → hrobka (`pecet-finale`),
   konfrontace s prorokem **Vethisem** u pečeti.
4. **Rozuzlení.** Pečeť obnovit, nebo zlomit. Volba hráčů; důsledky se promítnou
   do světa přes `world_event_trigger` (`vrani-hrad-padl`).

## Jak kampaň využívá živý svět

- **Frakce v pohybu:** zmaření posla v rokli → `faction_advance` sníží
  `krvave-kly` i `kult-marakathe`; dovršení obřadu kultem → `probuzeni-marakathe`;
  očištění hradu → `vrani-hrad-padl` (kult se zlomí, Velen zbezpečí).
- **Světová NPC jako zadavatelé i spojenci:** Aldric, Rosava, Jaga, Serena —
  všichni žijí ve světě, kampaň je jen uvádí do děje.
- **Háček z krátké kampaně:** mosazná placka kultu z `konvoj-do-vresoviste`
  vede přímo sem.

## Co kampaň přidává nad svět

`characters/` (Bram, Kira) + `companions/` (Halbrecht), `bestiary/` (kultisté,
fanatik, stín, bojové karty Nargashe a Vethise), interiéry hradu v `locations/`,
`items/` (Kahanec Saraen, úlomek pečeti), `npcs/` (uprchlík Radomil), dva questy
a tři taktická střetnutí. Svět, jeho frakce a obyvatelé se vrství zespodu.
