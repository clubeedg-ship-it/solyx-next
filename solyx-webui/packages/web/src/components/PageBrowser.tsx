import { useEffect, useState } from "react";

/**
 * Card navigation over everything published on the site.
 *
 * Two levels, because 73 items in one grid is a scroll and not a navigation:
 * pick a kind, then pick a page. Each page card carries a rendered picture of
 * the page itself — WordPress has no images to offer here (0 of 27 pages and
 * 0 of 43 posts have a featured image), so the server renders them and this
 * just points at /api/thumb.
 *
 * The pictures are built in the background as soon as the list is read, so a
 * card that has not been rendered yet shows its own placeholder rather than a
 * broken image. On a cold cache that is most of them for the first while.
 */
export interface ContentItem {
  id: number;
  type: "page" | "post" | "product";
  title: string;
  slug: string;
  link: string;
}

/** Dutch, and in the site's own words — these are the labels WordPress uses. */
const KINDS: { type: ContentItem["type"]; label: string; blurb: string }[] = [
  { type: "page", label: "Pagina's", blurb: "De vaste pagina's van de site" },
  { type: "post", label: "Berichten", blurb: "Blog en nieuws" },
  { type: "product", label: "Producten", blurb: "De shop" },
];

export function PageBrowser({ onSelect }: { onSelect: (item: ContentItem) => void }) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<ContentItem["type"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/content");
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { items?: ContentItem[] };
        if (!cancelled) setItems(Array.isArray(body.items) ? body.items : []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="browse-empty">De lijst met pagina&apos;s kon niet worden geladen.</p>;
  }
  if (!items) {
    return (
      <div className="browse-empty" role="status" aria-label="Laden">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    );
  }

  if (kind === null) {
    return (
      <div className="browse-grid browse-grid-kinds">
        {KINDS.map(({ type, label, blurb }) => {
          const count = items.filter((item) => item.type === type).length;
          return (
            <button key={type} type="button" className="browse-card browse-card-kind" onClick={() => setKind(type)}>
              <span className="browse-card-count">{count}</span>
              <span className="browse-card-title">{label}</span>
              <span className="browse-card-blurb">{blurb}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const shown = items.filter((item) => item.type === kind);
  return (
    <>
      <button type="button" className="browse-back" onClick={() => setKind(null)}>
        <BackIcon /> Alle categorieën
      </button>
      <div className="browse-grid">
        {shown.map((item) => (
          <button key={`${item.type}-${item.id}`} type="button" className="browse-card" onClick={() => onSelect(item)}>
            <span className="browse-thumb">
              <img src={`/api/thumb/${item.type}/${item.id}`} alt="" loading="lazy" />
            </span>
            <span className="browse-card-title">{item.title}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function BackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
