---
type: quest
id: pecet-pod-hradem
title: Pečeť pod hradem
giver: velmistr-aldric
status: active
objectives:
  - id: vysetri-mizeni
    text: Vyšetři mizení lidí v Novigradu a Velenu (stopy vedou ke kultu)
    done: false
  - id: najdi-cestu
    text: Získej od přeživšího Radomila cestu do Vraního hradu
    done: false
  - id: prerus-obrad
    text: Pronikni do hrobky a přeruš Vethisův obřad u pečeti
    done: false
  - id: zajisti-pecet
    text: Zajisti pečeť (obnov ji obřadem Řádu, nebo ji nadobro zlom)
    done: false
---
# Pečeť pod hradem

Velmistr **Aldric** vysílá družinu vyšetřit, proč kolem Velenu mizí lidé — a tuší,
že odpověď leží tam, kde ji nejvíc nechce mít: pod **Vraním hradem**, kde kult
Marakáthé dovršuje, co kdysi začal markrabě Korvin. Pokud kult zlomí pečeť,
probudí se starobožstvo a Velen padne (světová událost `probuzeni-marakathe`).

Oblouk kampaně:

1. **Vyšetřování** (Novigrad) — mizení lidí, stopy kultu, neochotní svědci;
   Kira může vytáhnout z podsvětí, co Šedé kápě o kultu vědí.
2. **Cesta** (Velen) — k hradu se nelze dostat přímo; přes Mlžné blato vede jen
   cesta, kterou zná bylinkářka **Jaga**, a dovnitř jen ta, kterou zná uprchlík
   **Radomil** ve Vřesovišti.
3. **Klimax** (Vraní hrad) — proniknout nádvořím (`svatyne-kultu`) do hrobky a
   přerušit obřad u pečeti (`pecet-finale`).
4. **Rozuzlení** — pečeť obnovit obřadem Řádu (potřebný `pecetni-kamen` +
   Bramova víra), nebo ji zlomit a riskovat. Úspěch spustí `vrani-hrad-padl`.

Odměna: vděk Řádu, **Kahanec Saraen**, a Velen, který se poprvé po letech nadechne.
