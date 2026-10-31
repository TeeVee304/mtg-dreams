import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SAVED_IMAGE_SCHEME } from '@shared/images'
import { cacheEntries, cacheFilesFrozen, removeCacheEntries } from './cacheFiles'
import { reachedService } from './connectivity'
import { env } from './environment'

/**
 * Small card images of the Cards the files use, kept in `userData/images` so lists show them offline.
 * The renderer asks for them as `card-image://scryfall/small/{face}/{a}/{b}/{id}.jpg`
 * ({@link savedCardImage}): a saved image is served from disk, any other is downloaded from Scryfall
 * and saved. An image stays while its Card stays in the Scryfall cache, or its token in the token
 * cache ({@link sweepCardImages}); the browser's own cache, which drops images when full, is not relied on.
 *
 * @packageDocumentation
 */

/** Folder of the saved images, under userData. */
export const IMAGES_FOLDER = 'images'
/** Timeout for one image download. */
const DOWNLOAD_TIMEOUT_MS = 15_000
/** Least time between sweeps. */
const SWEEP_EVERY_MS = 60 * 60 * 1000

/** A saved image's address, with its face and id. */
const ADDRESS = new RegExp(`^${SAVED_IMAGE_SCHEME}://scryfall/small/(front|back)/([0-9a-f])/([0-9a-f])/([0-9a-f-]{36})\\.jpg$`)

/** What an address names: the file it is saved as and where Scryfall has it. */
interface SavedImage {
  /** Scryfall id of the card or token. */
  id: string
  /** File name in {@link IMAGES_FOLDER}. */
  file: string
  /** Scryfall's address of the image. */
  remote: string
}

/** @returns What a `card-image:` address names; null if it is not one. */
export function parseSavedImage(url: string): SavedImage | null {
  const match = ADDRESS.exec(url)
  if (!match) return null
  const [, face, a, b, id] = match
  if (a !== id[0] || b !== id[1]) return null
  return { id, file: face === 'front' ? `${id}.jpg` : `${id}-back.jpg`, remote: `${env().cardImagesUrl}/small/${face}/${a}/${b}/${id}.jpg` }
}

/** Downloads in flight, by file name, so an image shown twice at once downloads once. */
const downloads = new Map<string, Promise<Uint8Array | null>>()

/** @returns The image's bytes, saved; null if Scryfall can't be reached or has none. */
function download(image: SavedImage): Promise<Uint8Array | null> {
  let pending = downloads.get(image.file)
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(image.remote, { headers: { 'User-Agent': env().userAgent }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
        reachedService()
        if (!res.ok) return null
        const bytes = new Uint8Array(await res.arrayBuffer())
        await save(image.file, bytes)
        return bytes
      } catch {
        return null
      }
    })().finally(() => downloads.delete(image.file))
    downloads.set(image.file, pending)
  }
  return pending
}

/** Writes an image atomically (temp file + rename). Errors are ignored: it downloads again next time. */
async function save(file: string, bytes: Uint8Array): Promise<void> {
  const dir = join(env().userData, IMAGES_FOLDER)
  if (cacheFilesFrozen()) return
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${file}.tmp`), bytes)
    await rename(join(dir, `${file}.tmp`), join(dir, file))
  } catch {}
}

/**
 * Answers a `card-image:` request: from disk if saved, otherwise downloaded and saved.
 * @returns The JPEG; 404 for addresses that are not card images, 504 if it is not saved and Scryfall can't be reached.
 */
export async function serveCardImage(request: Request): Promise<Response> {
  const image = parseSavedImage(request.url)
  if (!image) return new Response(null, { status: 404 })
  const headers = { 'Content-Type': 'image/jpeg' }
  try {
    return new Response(await readFile(join(env().userData, IMAGES_FOLDER, image.file)), { headers })
  } catch {}
  const bytes = await download(image)
  return bytes ? new Response(bytes, { headers }) : new Response(null, { status: 504 })
}

/** When the images were last swept; 0 before the first sweep. */
let sweptAt = 0

/**
 * Deletes the saved images of cards and tokens no cache holds any more. At most once every
 * {@link SWEEP_EVERY_MS}, unless `force`.
 * @param kept - Scryfall ids whose images stay.
 */
export async function sweepCardImages(kept: Set<string>, force = false): Promise<void> {
  if (!force && Date.now() - sweptAt < SWEEP_EVERY_MS) return
  sweptAt = Date.now()
  const files = await cacheEntries(IMAGES_FOLDER)
  const gone = files.filter((file) => !kept.has(file.replace(/(?:-back)?\.jpg(?:\.tmp)?$/, '')))
  await removeCacheEntries(gone.map((file) => `${IMAGES_FOLDER}/${file}`))
}
