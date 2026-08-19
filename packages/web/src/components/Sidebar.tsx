import { ThreadListItemPrimitive, ThreadListPrimitive } from "@assistant-ui/react";
import { authMode } from "../env.js";
import { PanelToggleButton } from "./PanelToggleButton.js";
import { threadRowLabel } from "../runtime/threadListFilter.js";

/**
 * Left column: session list + "new chat". Backed entirely by
 * RemoteThreadListRuntime (runtime/threadListAdapter.ts) — this component
 * holds no state of its own and makes no decisions: what a row says comes
 * from runtime/threadListFilter.ts. That split is deliberate — packages/web
 * runs vitest with environment "node" and no jsdom, so logic that lives here
 * cannot be tested at all.
 *
 * The sidebar is a selector and nothing else. It used to carry a per-row
 * delete behind a two-step "Zeker weten?" confirmation, a bulk "N lege
 * gesprekken verwijderen" action, and a "Gearchiveerd" section. All three are
 * gone, and two of them could never have worked: the archived list has no way
 * to be non-empty because nothing ever sets `archived` on a session, and the
 * bulk action could never appear because `messageCount` is not in the
 * Gateway's sessions.list projection, so every row reads as UNKNOWN rather
 * than empty. The per-row delete did work, but it reserved its width on every
 * row for a button that stayed invisible until hover, so it narrowed every
 * title to pay for a control nobody could see.
 */
export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  // The rail is a different tree, not a hidden one. At 44px there is nothing
  // left of a session list to show, and an off-screen-but-present list would
  // still be in the tab order.
  if (collapsed) return <SidebarRail onExpand={onToggleCollapsed} />;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Solyx</span>
        <PanelToggleButton
          direction="left"
          label="Collapse sidebar"
          className="panel-collapse-button"
          onClick={onToggleCollapsed}
        />
      </div>
      <ThreadListPrimitive.Root className="thread-list">
        <ThreadListPrimitive.New className="new-chat-button">
          <PlusIcon />
          New chat
        </ThreadListPrimitive.New>
        <div className="thread-items">
          <ThreadListPrimitive.Items>
            {({ threadListItem }) => <ThreadRow key={threadListItem.id} threadListItem={threadListItem} />}
          </ThreadListPrimitive.Items>
        </div>
      </ThreadListPrimitive.Root>
      {/* Only password mode has a session to log out of — Access mode has
          no client-visible login state, Clerk has its own account UI. A
          plain link, not a fetch()-driven button: /logout is a normal GET
          route (server/src/http/loginRoutes.ts) that clears the cookie and
          redirects, so it works even if the WS connection is down. */}
      {authMode === "password" && (
        <a className="sidebar-footer" href="/logout">
          <SignOutIcon />
          Sign out
        </a>
      )}
    </aside>
  );
}

/**
 * Only the fields the row actually renders. Not ThreadListItemState: the
 * package exports two different types under that name (the store scope and the
 * runtime binding) and the Items render callback hands over the store one, so
 * naming the type imports the wrong one.
 */
type ThreadRowItem = {
  readonly id: string;
  readonly title?: string | undefined;
  readonly lastMessageAt?: Date | undefined;
};

/** One session row: a label you click. Nothing else belongs on it. */
function ThreadRow({ threadListItem }: { threadListItem: ThreadRowItem }) {
  const label = threadRowLabel({
    title: threadListItem.title,
    lastMessageAt: threadListItem.lastMessageAt,
  });

  return (
    <ThreadListItemPrimitive.Root className="thread-item">
      {/* Plain text, not ThreadListItemPrimitive.Title: Title renders the
          store's own title verbatim and cannot show a derived label. */}
      <ThreadListItemPrimitive.Trigger className="thread-item-trigger">{label}</ThreadListItemPrimitive.Trigger>
    </ThreadListItemPrimitive.Root>
  );
}

/**
 * The collapsed sidebar: expand, start a new chat, sign out. Everything
 * else the sidebar does needs width to be worth anything, and all of it is
 * one click away again.
 *
 * `ThreadListPrimitive.New` is used outside a `ThreadListPrimitive.Root`
 * here — checked against the installed package: it reads the runtime
 * through `useThreadListNew()`, not through any context Root provides.
 */
function SidebarRail({ onExpand }: { onExpand: () => void }) {
  return (
    <aside className="sidebar sidebar-rail">
      <span className="brand-mark" aria-hidden="true" />
      <PanelToggleButton direction="right" label="Expand sidebar" className="rail-button" onClick={onExpand} />
      <ThreadListPrimitive.New className="rail-button" aria-label="New chat" title="New chat">
        <PlusIcon />
      </ThreadListPrimitive.New>
      <span className="rail-spacer" />
      {authMode === "password" && (
        <a className="rail-button" href="/logout" aria-label="Sign out" title="Sign out">
          <SignOutIcon />
        </a>
      )}
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5.5 1.75H2.75a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H5.5M9.5 10.25 12.75 7 9.5 3.75M4.5 7h8.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
