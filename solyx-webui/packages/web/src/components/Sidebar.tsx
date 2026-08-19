import { ThreadListItemPrimitive, ThreadListPrimitive } from "@assistant-ui/react";
import { authMode } from "../env.js";
import { formatRelativeTime } from "../runtime/relativeTime.js";
import { isUntitledThread } from "../runtime/threadListFilter.js";
import { PanelToggleButton } from "./PanelToggleButton.js";

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Left column: session list + "new chat". Backed entirely by
 * RemoteThreadListRuntime (runtime/threadListAdapter.ts) — this component
 * only arranges assistant-ui's own ThreadList primitives, it holds no
 * session state itself.
 *
 * Collapses to a rail (see SidebarRail below) so the chat can have the
 * screen. The rail is a different tree rather than the same one hidden
 * with CSS: at 44px there is nothing left of a session list to show, and
 * an off-screen-but-present list would still be in the tab order.
 */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
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
            {({ threadListItem }) => {
              // A session with no messages is not a conversation (see
              // runtime/threadListFilter.ts) — never delete it, just don't
              // list it, unless it's the one actually open right now: the
              // conversation someone is looking at must not disappear from
              // the list underneath them just because it has no title yet.
              // No exemption for the active thread. It sounded right — don't
              // hide the conversation someone is looking at — but the id
              // comparison it depends on is unreliable here, and when it
              // fails every untitled thread reads as "active" and the list
              // fills with "New chat" rows. The open conversation is already
              // on screen in the centre pane; it does not also need a row.
              //
              // `custom` is an untyped bag (RemoteThreadMetadata.custom) —
              // `=== true` is what turns "definitely titled" apart from
              // "false, missing, or anything else" into the plain boolean
              // isUntitledThread expects, rather than leaking `unknown`
              // into it.
              if (isUntitledThread(threadListItem.custom?.hasTitle === true)) {
                return null;
              }
              return (
                <ThreadListItemPrimitive.Root key={threadListItem.id} className="thread-item">
                  <ThreadListItemPrimitive.Trigger className="thread-item-trigger">
                    <span className="thread-item-title">
                      <ThreadListItemPrimitive.Title fallback="New chat" />
                    </span>
                    {/* threadListAdapter.ts's toThreadMetadata always sets
                        lastMessageAt from the session's own updatedAt, so
                        this is really just a defensive guard against a
                        future adapter change rather than a case that's
                        expected to happen today. */}
                    {threadListItem.lastMessageAt && (
                      <span className="thread-item-time">{formatRelativeTime(threadListItem.lastMessageAt)}</span>
                    )}
                  </ThreadListItemPrimitive.Trigger>
                </ThreadListItemPrimitive.Root>
              );
            }}
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
