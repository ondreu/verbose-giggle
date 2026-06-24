---
type: quest
id: posel-v-rokli
title: Posel ve Vlčí rokli
giver: hajna-rosava
status: active
objectives:
  - id: zachyt-posla
    text: Zachyť posla kultu dřív, než stvrdí spojenectví s Krvavými kly
    done: false
  - id: rozhodni-rokli
    text: Zlom Nargashovu tlupu, nebo posla zdiskredituj — zabraň spojenectví
    done: false
---
# Posel ve Vlčí rokli

Vedlejší úkol od hajné **Rosavy**: její zvěd Falk viděl posla z Vraního hradu
vejít do Vlčí rokle. Pokud **Nargash** přijme nabídku kultu, Krvavé kly a poutníci
tmy spojí síly a Velen zaplaví (světová událost `spojenectvi-klu-a-kultu`).

Hráči mohou jednat silou (přepad v rokli, `rokle-prepad`), nebo lstí (Kira
zdiskredituje posla, naruší křehkou důvěru mezi goblinem a knězem). Zmaření
spojenectví oslabí kult ještě dřív, než družina dojde k hradu — `faction_advance`
sníží `krvave-kly` i `kult-marakathe`.
