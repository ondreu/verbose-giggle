---
type: monster
id: vethis-boss
name: Prorok Vethis
controller: ai
faction: hostile
level: 5
xp: 0
abilities: { str: 11, dex: 12, con: 14, int: 13, wis: 17, cha: 16 }
proficiency_bonus: 3
hp: { max: 45, current: 45, temp: 0 }
ac: 13
speed: 30
spell_slots:
  '1': { max: 4, used: 0 }
  '2': { max: 3, used: 0 }
  '3': { max: 2, used: 0 }
spells_known: [sacred-flame, inflict-wounds, hold-person, spiritual-weapon, bestow-curse, animate-dead]
conditions: []
concentration: null
inventory: []
attunement: []
death_saves: { success: 0, fail: 0 }
position: null
srd_ref: priest
ai_profile: 'Vůdce kultu u zlomené pečeti. Drží koncentraci na hold-person, léčí se inflict/vampiric, žene kultisty kupředu. Zlomí-li se jeho vůle (správný argument o jeho minulosti), může zaváhat — háček pro nesmrtící rozuzlení.'
---

# Prorok Vethis

Bojová karta pro finální konfrontaci u pečeti. Vethis je nebezpečný kouzly i
slovem; viz jeho gazetteer karta ve světě (`npcs/prorok-vethis`) pro to, kdo je
a jak ho lze zlomit jinak než ocelí.
