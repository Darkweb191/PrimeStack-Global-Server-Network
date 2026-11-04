import { describe, expect, it } from "vitest";
import { enhanceAdminHtml } from "./admin-ui.js";

describe("enhanceAdminHtml", () => {
  it("adds language, theme, and back controls to an admin HTML page", () => {
    const html = enhanceAdminHtml("<!doctype html><html><head></head><body><main>Dashboard</main></body></html>");
    const script = html.match(/<script id="ps-admin-ui-script">([\s\S]*?)<\/script>/);

    expect(html).toContain('class="ps-language"');
    expect(html).toContain('class="ps-theme"');
    expect(html).toContain('class="ps-back"');
    expect(html).toContain("--ps-ui-bg:#eef3f8");
    expect(html).toContain("--ps-ui-accent:#005ea2");
    expect(html).toContain("--ps-ui-success:#18743a");
    expect(html).toContain("--ps-ui-danger:#b50909");
    expect(html).toContain("family=Public+Sans");
    expect(html).toContain("family=Source+Serif+4");
    expect(html).toContain("family=JetBrains+Mono");
    expect(html).toContain("radial-gradient(140% 100% at 50% -20%,#fff 0%,#f0f5fa 30%,#e2ebf3 65%,#d4e0ec 100%)");
    expect(html).toContain("readPreference('ps-theme', 'light')");
    expect(html).toContain('font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important');
    expect(html).toContain("grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))!important");
    expect(html).toContain("grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important");
    expect(html).not.toContain("SECURE CHANNEL  /  OPERATOR AUTHENTICATION");
    expect(html).toContain("font-size:13px!important");
    expect(html).toContain(".card,html[data-ps-theme] .panel{padding:15px!important}");
    expect(html).toContain("table td{padding:7px 9px!important;font-size:12px!important}");
    expect(html).toContain("MutationObserver");
    expect(html).toContain('html[data-ps-theme] .page-heading h1');
    expect(html).toContain('html[data-ps-theme] nav a[aria-current="page"]');
    expect(html).toContain('.notice.warning{background:color-mix(in srgb,var(--ps-ui-warn) 9%,var(--ps-ui-panel))');
    expect(html).toContain('.notice.error{background:color-mix(in srgb,var(--ps-ui-danger) 9%,var(--ps-ui-panel))');
    expect(html).toContain("<main>Dashboard</main>");
    expect(script).not.toBeNull();
    if (!script) throw new Error("Admin controls script was not injected");
    expect(() => new Function(script[1])).not.toThrow();
  });

  it("translates text and applies shared language, theme, and back preferences", async () => {
    const html = enhanceAdminHtml("<html><head><title>Admin</title></head><body>Sign in</body></html>");
    const script = html.match(/<script id="ps-admin-ui-script">([\s\S]*?)<\/script>/);
    if (!script) throw new Error("Admin controls script was not injected");

    const createControl = (value = "") => {
      const handlers: Record<string, () => void> = {};
      const attributes: Record<string, string> = {};
      return {
        value,
        dataset: {} as Record<string, string>,
        addEventListener: (event: string, handler: () => void) => {
          handlers[event] = handler;
        },
        setAttribute: (name: string, attributeValue: string) => {
          attributes[name] = attributeValue;
        },
        click: () => handlers.click?.(),
        change: () => handlers.change?.(),
        attributes,
      };
    };

    const languageSelect = createControl("en");
    const themeButton = createControl();
    const backButton = createControl();
    const themeLabel = { textContent: "" };
    const themeIcon = { textContent: "" };
    let backLabelUpdates = 0;
    const backLabel = {
      value: "",
      get textContent() {
        return this.value;
      },
      set textContent(value: string) {
        this.value = value;
        backLabelUpdates += 1;
      },
    };
    const textNode = { nodeValue: "Sign in", parentElement: { closest: () => null } };
    const root = { dataset: {} as Record<string, string>, dir: "", lang: "" };
    const title = { textContent: "Admin" };
    const stored = new Map<string, string>();
    stored.set("ps-theme", "light");
    const assigned: string[] = [];
    const fetchCalls: Array<{ url: string; init?: { headers?: Headers } }> = [];
    const selectors: Record<string, unknown> = {
      ".ps-language": languageSelect,
      ".ps-theme": themeButton,
      ".ps-theme-label": themeLabel,
      ".ps-theme-icon": themeIcon,
      ".ps-back": backButton,
      ".ps-back-label": backLabel,
      ".ps-back>span:first-child": { textContent: "" },
      title,
      'meta[name="color-scheme"]': { setAttribute: () => undefined },
    };
    const document = {
      body: {},
      title: "Admin",
      referrer: "",
      documentElement: root,
      querySelector: (selector: string) => selectors[selector],
      querySelectorAll: () => [],
      createTreeWalker: () => {
        let visited = false;
        return { nextNode: () => (visited ? null : ((visited = true), textNode)) };
      },
    };
    const localStorage = {
      getItem: (key: string) => stored.get(key) || null,
      setItem: (key: string, value: string) => stored.set(key, value),
    };
    const window = {
      fetch: (input: string, init?: { headers?: Headers }) => {
        fetchCalls.push({ url: input, init });
        return Promise.resolve();
      },
    };
    let mutationCallback: (() => void) | undefined;
    class Observer {
      constructor(callback: () => void) {
        mutationCallback = callback;
      }
      observe() {}
    }

    new Function("document", "localStorage", "NodeFilter", "MutationObserver", "history", "location", "window", script[1])(
      document,
      localStorage,
      { SHOW_TEXT: 4 },
      Observer,
      { length: 1, back: () => undefined },
      { origin: "https://example.test", href: "https://example.test/admin/merchant-dashboard", pathname: "/admin/merchant-dashboard", assign: (path: string) => assigned.push(path) },
      window,
    );

    expect(textNode.nodeValue).toBe("Sign in");
    expect(backLabelUpdates).toBe(1);
    mutationCallback?.();
    mutationCallback?.();
    expect(backLabelUpdates).toBe(1);
    languageSelect.value = "fr";
    languageSelect.change();
    expect(textNode.nodeValue).toBe("Se connecter");
    expect(root.lang).toBe("fr");
    expect(themeLabel.textContent).toBe("Passer en mode sombre");

    themeButton.click();
    expect(root.dataset.psTheme).toBe("dark");
    expect(themeButton.attributes["aria-pressed"]).toBe("true");
    expect(themeLabel.textContent).toBe("Passer en mode clair");

    languageSelect.value = "es";
    languageSelect.change();
    expect(textNode.nodeValue).toBe("Iniciar sesión");
    expect(themeLabel.textContent).toBe("Cambiar al modo claro");
    await window.fetch("/admin/dashboard");
    expect(fetchCalls[0].init?.headers?.get("Accept-Language")).toBe("es");

    backButton.click();
    expect(assigned).toEqual(["/admin/dashboard"]);
    expect(stored.get("ps-language")).toBe("es");
    expect(stored.get("ps-theme")).toBe("dark");
  });

  it("does not inject the controls more than once", () => {
    const html = "<html><head></head><body>Dashboard</body></html>";
    const enhanced = enhanceAdminHtml(html);

    expect(enhanceAdminHtml(enhanced)).toBe(enhanced);
  });

  it("leaves non-page fragments unchanged", () => {
    expect(enhanceAdminHtml("<main>Dashboard</main>")).toBe("<main>Dashboard</main>");
  });
});
