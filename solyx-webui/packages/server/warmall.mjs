import { loadConfig } from "./dist/config.js";
import { fetchContentList } from "./dist/content/contentList.js";
import { ThumbnailStore } from "./dist/content/thumbnails.js";
import { readdir, stat } from "node:fs/promises";

const config = loadConfig();
const items = await fetchContentList(config);
const store = new ThumbnailStore({
  cacheDir: config.thumbnailCacheDir,
  allowedOrigin: config.wordpressOrigin,
  chromiumPath: config.chromiumPath || undefined,
});

console.log(`rendering ${items.length} pages, 3 at a time…`);
const t0 = Date.now();
let done = 0, failed = 0;
await Promise.all(
  items.map((item) =>
    store
      .pathFor(item.link, {})
      .then(() => { done += 1; })
      .catch(() => { failed += 1; }),
  ),
);
const files = await readdir(config.thumbnailCacheDir).catch(() => []);
let bytes = 0;
for (const f of files) bytes += (await stat(`${config.thumbnailCacheDir}/${f}`)).size;
console.log(`done: ${done}  failed: ${failed}  in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
console.log(`cache: ${files.length} images, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
