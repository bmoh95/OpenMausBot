# Install the phone web app

The browser UI can be added to your phone's Home Screen. It opens in its own
window and uses the same workspace, conversations and pairing as the browser.

1. Open your workspace's **HTTPS web link** in Safari on iPhone or Chrome on
   Android. Use an existing hosted address, Tailscale HTTPS address or your own
   HTTPS reverse proxy. A phone cannot reach the computer through a localhost
   link. See [self-hosting](self-hosting.md) for remote access and pairing.
2. Pair the browser with that workspace using its normal pairing flow.
3. On iPhone, open Safari's **Share** menu, choose **Add to Home Screen**, keep
   **Open as Web App** enabled if Safari offers it, then tap **Add**. On Android,
   open Chrome's menu and choose **Install app** or **Add to Home screen**.
4. Open **OpenMausBot** from the Home Screen. If that browser keeps Home Screen
   apps in separate storage, pair this new window too. Installation does not
   grant access to a workspace by itself.

The installed start address is the workspace root; pairing codes and URL tokens
are not saved in the manifest. Use a new pairing invitation if access expires
or the device is revoked.

Your server must be running and reachable. This web app does not add offline
chat or native phone computer control.

## Background push notifications (custom production)

On the HTTPS workspace, open Settings → Appearance → **백그라운드 푸시 알림**
and allow the browser's notification request. This registers this browser's
subscription against its paired session. Use **테스트 알림 보내기** to confirm
delivery, then send a task and close the app or lock the screen. Completion,
approval and question events use the same notification routing as the live app.
The completion and sound preferences also apply to push. On iOS, install and
open the Home Screen app before enabling notifications. OS notification and
battery settings can delay or block delivery.

The server encrypts payloads using Web Push and VAPID. No paid API key or
external account is required; delivery uses the browser vendor's push service.
The banner contains generic completion/attention text, not conversation text,
credentials, screenshots, or approval details. Tapping it opens the conversation;
it never approves an action. Focused app windows suppress duplicate banners.

Subscription and VAPID key material is stored owner-only in
`OMB_DATA_DIR/web-push.json`, survives restarts, and is excluded from portable
workspace exports. Operator backups must preserve this file with sessions.json
on the same deployment. Replacing VAPID keys requires browsers to resubscribe.
Revoked or expired paired sessions receive no new deliveries; already queued
vendor notifications may still arrive. Sessions are not kept alive by push.
404/410 push endpoints are removed automatically. Transient failures time out
without blocking bot work. No persistent retry queue is used.

This browser can disable push in the same setting. Revoking its paired session
also blocks subsequent delivery. The server accepts only HTTPS subscription
endpoints on the supported Chrome/Firefox/Apple/Windows push service domains.

## Verification

Automated isolated checks cover subscription ownership, permission filtering,
revoked sessions, VAPID persistence, encrypted request generation, stale endpoint
cleanup, Service Worker display, foreground suppression and notification-click
navigation. A physical Android/iOS push delivery still requires the user to
grant notification permission and confirm the test notification on that device.
