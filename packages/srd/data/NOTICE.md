# Attribution & licenses for the bundled SRD data

The JSON files in this directory are a redistributed copy of D&D 5e SRD 5.1
content, compiled by the [`5e-bits/5e-database`](https://github.com/5e-bits/5e-database)
project. Two licenses apply and both attributions must travel with these files.

## 1. Rules content — D&D 5e SRD 5.1 (CC-BY-4.0)

This data includes material from the **System Reference Document 5.1
("SRD 5.1")** by Wizards of the Coast LLC, used under the **Creative Commons
Attribution 4.0 International License (CC-BY-4.0)**. The required attribution:

> This work includes material taken from the System Reference Document 5.1
> ("SRD 5.1") by Wizards of the Coast LLC and available at
> <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1
> is licensed under the Creative Commons Attribution 4.0 International License,
> available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

**Modifications:** this is a *subset* of the SRD selected and reformatted for
this project (see `apps/server/src/srd/load.ts`); the data may be filtered,
renamed, or restructured relative to the original SRD.

> Note: WotC dual-released SRD 5.1 under both the OGL 1.0a and CC-BY-4.0. This
> project relies on **CC-BY-4.0** (simpler, no OGL Section 15 chain). The upstream
> `5e-bits/5e-database` README cites OGL 1.0a; either path covers the same content.

## 2. Compiled dataset — `5e-bits/5e-database` (MIT)

The compilation/formatting of the JSON is from `5e-bits/5e-database`, MIT-licensed:

```
MIT License

Copyright (c) 2018-2020 Adrian Padua, Christopher Ward

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
