/**
 * Default fallback for the `@modal` parallel slot. Returns null so direct
 * URL navigation (refresh, hard reload, external link) renders the
 * underlying page full-screen as if no slot existed. Soft navigation
 * within the app triggers the matching intercepting route instead.
 */
export default function ModalDefault() {
  return null;
}
