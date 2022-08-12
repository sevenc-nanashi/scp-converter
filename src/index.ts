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
import * as Vue from "vue"
import * as VueI18n from "vue-i18n"

import messages from "./i18n"

const i18n = VueI18n.createI18n({
  locale: navigator.language,
  fallbackLocale: "en",
  messages,
})

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

Vue.createApp({
  data() {
    return {
      logtext: "",
      download: {
        url: "",
        active: false,
        name: "-",
      },
      formActive: true,
    }
  },
  methods: {
    log(text: string, breakline = true) {
      this.logtext += breakline ? `${text}\n` : text
      this.$refs.logTextarea.scrollTop = this.$refs.logTextarea.scrollHeight
    },
    async processFile(e: SubmitEvent) {
      e.preventDefault()
      this.logtext = ""
      this.formActive = false
      try {
        const startTime = performance.now()
        this.log("Started")
        this.download.active = false
        this.download.url = ""
        this.download.name = "-"

        const oldZip = new JSZip()
        this.log("Unzipping original SCP...")
        await oldZip.loadAsync(this.$refs.originalScp.files[0])
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
        this.log("\n== Processing files", false)
        for (const file of Object.values(oldZip.files)) {
          this.log(`\n- Processing ${file.name}`)
          const data = await file.async("uint8array")
          let name = file.name.split("/").pop()
          let dir = file.name.split("/").slice(0, -1).join("/")
          if (!dir.startsWith("repository")) {
            // General sonolus jsons
            dir = "sonolus/" + dir
          }
          if (dir.endsWith("EffectClip")) {
            // Don't bundle EffectClip
            this.log("is EffectClip, skipping")
            continue
          } else if (dir.endsWith("effects")) {
            // Defer effect processing
            deferredEffects.push({
              type: "effect",
              path: file.name,
            })
            this.log("is effect data, deferred")
            continue
          } else if (dir.endsWith("engines")) {
            // Defer engine processing
            deferredEffects.push({
              type: "engine",
              path: file.name,
            })
            this.log("is engine data, deferred")
            continue
          } else if (dir.endsWith("levels")) {
            // Defer engine processing
            deferredEffects.push({
              type: "level",
              path: file.name,
            })
            this.log("is level data, deferred")
            continue
          }
          let finalData: Uint8Array
          if (dir.endsWith("EffectData")) {
            this.log("is EffectData, converting")
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
            this.log(`Creating EffectAudio with ${newData.clips.length} clips`)
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
            this.log(
              `Writing EffectAudio to repository/EffectAudio/${effectAudioName}`
            )
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

          this.log(`Writing to ${path}`)
          newZip.file(path, finalData)
        }
        this.log("\n== Processing deferred effects", false)
        for (const { type, path } of deferredEffects) {
          this.log(`\n- Processing ${path}(${type})`)
          const oldData = JSON.parse(
            new TextDecoder().decode(
              await oldZip.file(path).async("uint8array")
            )
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
          this.log(`Writing to sonolus/${path}`)
          newZip.file(
            `sonolus/${path}`,
            new TextEncoder().encode(JSON.stringify(oldData))
          )
        }
        this.log("\n== Creating missing list...")
        for (const type of EntryType) {
          if (newZip.file(`sonolus/${type}/list`)) {
            this.log(`sonolus/${type}/list exists, skipping`)
            continue
          }
          this.log(`Creating sonolus/${type}/list`)
          newZip.file(
            `sonolus/${type}/list`,
            new TextEncoder().encode(
              JSON.stringify({
                pageCount: 1,
                items: [],
                search: { options: [] },
              })
            )
          )
        }
        this.log("\n== Creating info...")
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

        this.log("\n== Zipping new SCP...")
        const newData = await newZip.generateAsync({
          type: "uint8array",
        })
        this.download.url = URL.createObjectURL(
          new Blob([newData], { type: "application/octet-stream" })
        )
        this.download.name = this.$refs.originalScp.files[0].name.replace(
          ".scp",
          "_new.scp"
        )
        this.download.active = true
        this.log(`\n== Done! Took: ${performance.now() - startTime}ms`)
      } catch (e) {
        this.log("An error occurred:")
        this.log(e)
      } finally {
        this.formActive = true
      }
    },
  },
})
  .use(i18n)
  .mount("#main")
