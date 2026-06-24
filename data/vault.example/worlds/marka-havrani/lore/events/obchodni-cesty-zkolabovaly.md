---
type: world_event
id: obchodni-cesty-zkolabovaly
name: Zkolabovaly obchodní cesty
trigger: "Kupecký cech ztratil kontrolu nad cestami (kupecky-cech.progress < 0.2) — nájezdy a mýta dusí obchod"
consequences:
  - location.cerny-brod.danger: high
  - faction.kupecky-cech.resources: low
  - faction.sede-kapuce.progress: +0.15
---
# Zkolabovaly obchodní cesty

Když nájezdy, výpalné a nejistota přeruší obchod natolik, že karavany přestanou
jezdit, marka se otřese. Kupecký cech ztrácí příjmy i vliv, Černý Brod — který
žije z mýta — zchudne a zdivočí, a do vzniklého vakua se vlije pašování a černý
trh **Šedých kápí**, jimž nejistota nahrává.

Atmosféra: zavřené krámy, prázdné sýpky, zdražené jídlo, víc ozbrojenců v ulicích
Brodu a šeptem nabízené „jiné cesty, jak dostat zboží na západ".
