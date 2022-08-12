import JSZip from "jszip"
import {
  EffectData,
  EffectItem,
  EngineItem,
  LevelItem,
  Section,
  ServerInfo,
} from "sonolus-core"
import {
  EffectData as EffectDataOld,
  EffectItem as EffectItemOld,
  EngineItem as EngineItemOld,
  LevelItem as LevelItemOld,
} from "sonolus-core-old"

import "bootstrap/dist/css/bootstrap.min.css"
import "./styles/index.scss"

const EntryType = [
  "levels",
  "skins",
  "backgrounds",
  "effects",
  "particles",
  "engines",
]

const logTextArea = document.getElementById("log") as HTMLTextAreaElement
const log = (text: string, breakline = true) => {
  logTextArea.value += breakline ? `${text}\n` : text
  logTextArea.scrollTop = logTextArea.scrollHeight
}
const form = document.getElementById("form") as HTMLFormElement
const fieldset = document.getElementById("fieldset") as HTMLFieldSetElement
const originalInput = document.getElementById("scp") as HTMLInputElement
const downloadButton = document.getElementById("download") as HTMLAnchorElement
const commitLink = document.getElementById("commit-link") as HTMLAnchorElement
const commitBadge = document.getElementById("commit-badge") as HTMLImageElement
commitLink.href = commitLink.href.replace("~SHA~", COMMIT_SHA.substring(0, 7))
commitBadge.src = commitBadge.src.replace("~SHA~", COMMIT_SHA.substring(0, 7))
form.addEventListener("submit", async (e) => {
  e.preventDefault()
  logTextArea.value = ""
  try {
    const startTime = performance.now()
    log("Started")
    downloadButton.classList.add("disabled")
    downloadButton.href = ""
    downloadButton.innerHTML = "Download: -"
    fieldset.setAttribute("disabled", "disabled")

    const oldZip = new JSZip()
    log("Unzipping original SCP...")
    await oldZip.loadAsync(originalInput.files[0])
    const newZip = new JSZip()
    const deferredEffects: {
      type: "effect" | "engine" | "level"
      path: string
    }[] = []
    const newEffectDataMap: Map<string, string> = new Map()
    const newEffectAudioMap: Map<string, string> = new Map()
    // const gunzip = new Zlib.Gunzip(await zip.file("scp.gz").async("uint8array"))
    // const oldData = JSON.parse(new TextDecoder().decode(gunzip.decompress()))
    // console.log(oldData)
    log("\n== Processing files", false)
    for (const file of Object.values(oldZip.files)) {
      log(`\n- Processing ${file.name}`)
      const data = await file.async("uint8array")
      let name = file.name.split("/").pop()
      let dir = file.name.split("/").slice(0, -1).join("/")
      if (!dir.startsWith("repository")) {
        // General sonolus jsons
        dir = "sonolus/" + dir
      }
      if (dir.endsWith("EffectClip")) {
        // Don't bundle EffectClip
        log("is EffectClip, skipping")
        continue
      } else if (dir.endsWith("effects")) {
        // Defer effect processing
        deferredEffects.push({
          type: "effect",
          path: file.name,
        })
        log("is effect data, deferred")
        continue
      } else if (dir.endsWith("engines")) {
        // Defer engine processing
        deferredEffects.push({
          type: "engine",
          path: file.name,
        })
        log("is engine data, deferred")
        continue
      } else if (dir.endsWith("levels")) {
        // Defer engine processing
        deferredEffects.push({
          type: "level",
          path: file.name,
        })
        log("is level data, deferred")
        continue
      }
      let finalData: Uint8Array
      if (dir.endsWith("EffectData")) {
        log("is EffectData, converting")
        // Use hash as filename
        const jsonData: EffectDataOld = JSON.parse(
          new TextDecoder().decode(new Zlib.Gunzip(data).decompress())
        )
        const newData: EffectData = {
          clips: jsonData.clips.map((clip) => ({
            id: clip.id,
            filename: clip.clip.hash,
          })),
        }
        log(`Creating EffectAudio with ${newData.clips.length} clips`)
        const effectAudioZip = new JSZip()
        for (const clip of newData.clips) {
          effectAudioZip.file(
            clip.filename,
            await oldZip
              .file(`repository/EffectClip/${clip.filename}`)
              .async("uint8array")
          )
        }
        const effectAudioData = await effectAudioZip.generateAsync({
          type: "uint8array",
        })
        const effectAudioName = [
          ...new Uint8Array(
            await crypto.subtle.digest("SHA-1", effectAudioData)
          ),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
        log(`Writing EffectAudio to repository/EffectAudio/${effectAudioName}`)
        newZip.file(
          `repository/EffectAudio/${effectAudioName}`,
          effectAudioData
        )

        finalData = new Zlib.Gzip(
          new TextEncoder().encode(JSON.stringify(newData))
        ).compress()
        const oldName = name
        name = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-1", finalData)),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
        newEffectDataMap.set(oldName, name)
        newEffectAudioMap.set(oldName, effectAudioName)
      } else {
        finalData = await file.async("uint8array")
      }
      const path = dir + "/" + name

      log(`Writing to ${path}`)
      newZip.file(path, finalData)
    }
    log("\n== Processing deferred effects", false)
    for (const { type, path } of deferredEffects) {
      log(`\n- Processing ${path}(${type})`)
      const oldData = JSON.parse(
        new TextDecoder().decode(await oldZip.file(path).async("uint8array"))
      )
      const upgradeEffect = (effect: EffectItemOld): EffectItem => {
        const newEffectDataName = newEffectDataMap.get(effect.data.hash)
        const newEffectAudioName = newEffectAudioMap.get(effect.data.hash)
        return {
          ...effect,
          version: 3,
          data: {
            type: "EffectData",
            hash: newEffectDataName,
            url: `/repository/EffectData/${newEffectDataName}`,
          },
          audio: {
            type: "EffectAudio",
            hash: newEffectAudioName,
            url: `/repository/EffectAudio/${newEffectAudioName}`,
          },
        }
      }

      const upgradeEngine = (engine: EngineItemOld): EngineItem => ({
        ...engine,
        version: 6,
        effect: upgradeEffect(engine.effect),
      })

      const upgradeLevel = (level: LevelItemOld): LevelItem => ({
        ...level,
        engine: upgradeEngine(level.engine),
        useEffect: level.useEffect.useDefault
          ? {
              useDefault: true,
              item: undefined,
            }
          : {
              useDefault: false,
              item: upgradeEffect(level.useEffect.item),
            },
      })

      switch (type) {
        case "engine":
          if (path.endsWith("list")) {
            oldData.items = oldData.items.map(upgradeEngine)
          } else {
            oldData.item = upgradeEngine(oldData.item)
          }
          break
        case "effect":
          if (path.endsWith("list")) {
            oldData.items = oldData.items.map(upgradeEffect)
          } else {
            oldData.item = upgradeEffect(oldData.item)
          }
          break
        case "level":
          if (path.endsWith("list")) {
            oldData.items = oldData.items.map(upgradeLevel)
          } else {
            oldData.item = upgradeLevel(oldData.item)
          }
          break
      }
      log(`Writing to sonolus/${path}`)
      newZip.file(
        `sonolus/${path}`,
        new TextEncoder().encode(JSON.stringify(oldData))
      )
    }
    log("\n== Creating missing list...")
    for (const type of EntryType) {
      if (newZip.file(`sonolus/${type}/list`)) {
        log(`sonolus/${type}/list exists, skipping`)
        continue
      }
      log(`Creating sonolus/${type}/list`)
      newZip.file(
        `sonolus/${type}/list`,
        new TextEncoder().encode(
          JSON.stringify({ pageCount: 1, items: [], search: { options: [] } })
        )
      )
    }
    log("\n== Creating info...")
    newZip.file(
      "sonolus/info",
      new TextEncoder().encode(
        JSON.stringify(
          Object.fromEntries(
            await Promise.all(
              EntryType.map(async (type) => [
                type,
                {
                  items: JSON.parse(
                    new TextDecoder().decode(
                      await newZip
                        .file(`sonolus/${type}/list`)
                        .async("uint8array")
                    )
                  ).items,
                } as Section<never>,
              ])
            )
          ) as ServerInfo
        )
      )
    )

    log("\n== Zipping new SCP...")
    console.log(newEffectDataMap, newEffectAudioMap)
    const newData = await newZip.generateAsync({
      type: "uint8array",
    })
    downloadButton.href = URL.createObjectURL(
      new Blob([newData], { type: "application/octet-stream" })
    )
    downloadButton.download = originalInput.files[0].name.replace(
      ".scp",
      "_new.scp"
    )
    downloadButton.innerHTML = `Download: ${downloadButton.download}`
    downloadButton.classList.remove("disabled")
    log(`\n== Done! Took: ${performance.now() - startTime}ms`)
  } catch (e) {
    log("An error occurred:")
    log(e)
  } finally {
    fieldset.removeAttribute("disabled")
  }
})
