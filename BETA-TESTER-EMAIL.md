# Email template — invitar testers para a beta

Não é um documento de site. É só um template que copias para o teu cliente
de email cada vez que enviares a beta a alguém. Substitui os `{{slots}}` antes
de enviar.

## Antes de enviar

1. Gera a license key do tester:
   ```bash
   cd C:\Users\jspdo\Desktop\BlockBuilderStudio\keygen
   node sign-license.js --email tester@example.com --name "Nome do Tester"
   ```
2. Copia a `BBS2....` que o script imprime
3. Cola no `{{LICENCE_KEY}}` do email abaixo
4. Substitui o `{{NOME_DO_TESTER}}` e envia

## Assunto

```
You're in — BlockBuilder Studio private beta
```

## Corpo

```
Hi {{NOME_DO_TESTER}},

You're one of the first people to test BlockBuilder Studio — thanks for
helping shake out the bugs before launch.

What it is
----------
A drag-and-drop 3D editor for makers. Tinkercad-style direct modelling,
fully offline, no accounts. Built specifically for the kind of work 3D
printers do most: brackets, jigs, organisers, props.

How to install (Windows only for now)
-------------------------------------
1. Download the zip (106 MB):
   https://github.com/josedasilva11/blockbuilder-studio/releases/download/v0.5.0-beta1/BlockBuilderStudio-v0.5.0-beta1-portable-win-x64.zip

2. Right-click the file → Extract All. Pick any folder.

3. Open the extracted BlockBuilderStudio folder → double-click
   BlockBuilder Studio.exe

4. Windows SmartScreen will warn you ("Windows protected your PC"). This
   is normal — the binary is not yet code-signed (a €120/year certificate
   that only makes sense after the first batch of sales). Click
   "More info" → "Run anyway". The warning disappears after the first run.

How to activate (your license)
------------------------------
1. In the app, click the gear icon (top right)
2. Scroll to the Licence section, click "I have a key"
3. Your name (must match exactly):
   {{NOME_DO_TESTER}}
4. Paste this key:
   {{LICENCE_KEY}}
5. Click Activate

The activation is fully offline — the key never leaves your machine.

What I'd love you to try
------------------------
- The 13 primitive shapes (left toolbar) — drag them in, scale, combine
- CSG: drop a sphere onto a box, mark it "Hole", group both, see the
  subtraction. Reversible until you bake it.
- Import an STL you already have. Drag it onto the viewport.
- Try the Sketch tools (Extrude, Scribble, Revolve)
- Export STL and try to print one of your models

What I'd love you to break
--------------------------
- Anything that crashes the app or hangs the viewport
- Imports that fail (especially big STLs >100k tris)
- CSG operations that produce wrong / corrupted output
- Anything that feels confusing in the UI

How to report
-------------
Just reply to this email with:
- What you were doing
- For crashes: please zip and attach the folder at
  %APPDATA%\BlockBuilder Studio\ (open Run, paste, hit Enter, then
  zip the folder). It contains the autosave + logs and tells us
  exactly what state the app was in.
- The other expected fields:
- What you expected to happen
- What actually happened
- Screenshot if visual
- The saved .json project file if the bug is reproducible (File → Save)

I read every report. Reply window: 48h.

About the project
-----------------
Built solo by Marjers (José Pedro Silva) on evenings and weekends. The
site lives at https://blockbuilder.studio. After the beta wraps and the
last big bugs are out, it'll go on sale for €12 one-time, no subscription.
Personal use stays free forever.

Thanks again for testing.

— José Pedro
geral@marjers.com
```

## Notas operacionais

- **Não publiques o link beta1 publicamente** — fica no GitHub como
  pre-release (não aparece no banner "latest"), mas qualquer pessoa com
  o URL consegue descarregar. Por isso a chave é a single source of trust:
  só testers convidados têm uma chave válida.
- **Não distribuas a private key** (`keygen/private-key.pem`). Está em
  .gitignore e nunca vai sair da tua máquina.
- **Cada chave é única por tester** — assina email + nome, então se um
  tester partilhar a chave dele, fica visível quem foi (não bloqueia
  partilha mas dá rastreabilidade).
- **Se um tester perder a chave**, gera nova com o mesmo email e nome —
  o resultado é determinístico (mesma key se issued no mesmo instante,
  mas timestamp muda). Manda-lhe a nova.
